import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import type { Order, OrderInput, OrderLine, Product } from "../types";

const ORDERS = "orders";
const PRODUCTS = "products";

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
}

export function subscribeToOrders(
  onChange: (orders: Order[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, ORDERS), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const orders: Order[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          customerName: data.customerName ?? "",
          customerPhone: data.customerPhone ?? "",
          hasDeposit: data.hasDeposit ?? false,
          depositAmount: data.depositAmount ?? 0,
          fulfillmentType: data.fulfillmentType ?? "Cliente de Mérida",
          shippingAddress: data.shippingAddress ?? null,
          lines: (data.lines ?? []).map((line: OrderLine) => ({
            ...line,
            unitPrice: line.unitPrice ?? 0,
            customName: line.customName ?? "",
            customNumber: line.customNumber ?? ""
          })),
          notes: data.notes ?? "",
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onChange(orders);
    },
    onError
  );
}

/** Cambio neto de `quantity` por producto entre dos listas de líneas (solo cuenta líneas "Vendida"). */
function computeSoldDelta(oldLines: OrderLine[], newLines: OrderLine[]) {
  const delta = new Map<string, number>();
  const add = (productId: string, n: number) => delta.set(productId, (delta.get(productId) ?? 0) + n);
  for (const line of oldLines) {
    if (line.status === "Vendida") add(line.productId, line.quantity);
  }
  for (const line of newLines) {
    if (line.status === "Vendida") add(line.productId, -line.quantity);
  }
  return delta;
}

/** Cambio neto de `incoming.reserved` por producto entre dos listas de líneas (solo cuenta líneas "Bajo pedido"). */
function computeReservedDelta(oldLines: OrderLine[], newLines: OrderLine[]) {
  const delta = new Map<string, number>();
  const add = (productId: string, n: number) => delta.set(productId, (delta.get(productId) ?? 0) + n);
  for (const line of oldLines) {
    if (line.status === "Bajo pedido") add(line.productId, -line.quantity);
  }
  for (const line of newLines) {
    if (line.status === "Bajo pedido") add(line.productId, line.quantity);
  }
  return delta;
}

function applyProductDeltas(
  batch: ReturnType<typeof writeBatch>,
  products: Product[],
  soldDelta: Map<string, number>,
  reservedDelta: Map<string, number>
) {
  const productIds = new Set([...soldDelta.keys(), ...reservedDelta.keys()]);
  for (const productId of productIds) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue; // producto eliminado: no hay nada que ajustar

    const soldChange = soldDelta.get(productId) ?? 0;
    const reservedChange = reservedDelta.get(productId) ?? 0;
    const update: Record<string, unknown> = { updatedAt: serverTimestamp() };

    if (soldChange !== 0) {
      const newQuantity = product.quantity + soldChange;
      if (newQuantity < 0) {
        throw new Error(`Stock insuficiente de "${product.name}".`);
      }
      update.quantity = newQuantity;
      update.stockStatus = newQuantity > 0 ? "En stock" : "Agotado";
    }

    if (reservedChange !== 0) {
      if (!product.incoming) {
        throw new Error(`"${product.name}" ya no tiene un lote en camino.`);
      }
      const newReserved = product.incoming.reserved + reservedChange;
      if (newReserved < 0 || newReserved > product.incoming.quantity) {
        throw new Error(`No quedan piezas disponibles del lote en camino de "${product.name}".`);
      }
      update.incoming = { ...product.incoming, reserved: newReserved };
    }

    batch.update(doc(db, PRODUCTS, productId), update);
  }
}

export async function createOrder(input: OrderInput, products: Product[]) {
  const batch = writeBatch(db);
  const soldDelta = computeSoldDelta([], input.lines);
  const reservedDelta = computeReservedDelta([], input.lines);
  applyProductDeltas(batch, products, soldDelta, reservedDelta);

  const orderRef = doc(collection(db, ORDERS));
  batch.set(orderRef, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export async function updateOrder(
  id: string,
  oldOrder: Order,
  input: OrderInput,
  products: Product[]
) {
  const batch = writeBatch(db);
  const soldDelta = computeSoldDelta(oldOrder.lines, input.lines);
  const reservedDelta = computeReservedDelta(oldOrder.lines, input.lines);
  applyProductDeltas(batch, products, soldDelta, reservedDelta);

  batch.update(doc(db, ORDERS, id), {
    ...input,
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export async function deleteOrder(order: Order, products: Product[]) {
  const batch = writeBatch(db);
  // Revertir como si todas las líneas pasaran a "no existir": libera lo vendido
  // ("Vendida") o lo reservado de un lote en camino ("Bajo pedido"). Las líneas
  // "Listo para entregar"/"Entregado" no se tocan a propósito: para esas la
  // pieza ya se resolvió al llegar el envío (o se entregó en mano) y salió del
  // conteo general — si un pedido así se cancela, el stock se ajusta a mano.
  const soldDelta = computeSoldDelta(order.lines, []);
  const reservedDelta = computeReservedDelta(order.lines, []);
  applyProductDeltas(batch, products, soldDelta, reservedDelta);

  batch.delete(doc(db, ORDERS, order.id));
  await batch.commit();
}

export async function markOrderLineDelivered(order: Order, lineIndex: number) {
  const lines = order.lines.map((line, i) =>
    i === lineIndex ? { ...line, status: "Entregado" as const } : line
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}

export async function markAllOrderLinesDelivered(order: Order) {
  const lines = order.lines.map((line) =>
    line.status === "Entregado" ? line : { ...line, status: "Entregado" as const }
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}

/** Quita una línea del pedido (ej. "quitar apartado" de una línea "Bajo pedido") y libera el stock/reserva que tenía. */
export async function removeOrderLine(order: Order, lineIndex: number, products: Product[]) {
  const line = order.lines[lineIndex];
  const newLines = order.lines.filter((_, i) => i !== lineIndex);

  const batch = writeBatch(db);
  const soldDelta = computeSoldDelta([line], []);
  const reservedDelta = computeReservedDelta([line], []);
  applyProductDeltas(batch, products, soldDelta, reservedDelta);

  batch.update(doc(db, ORDERS, order.id), { lines: newLines, updatedAt: serverTimestamp() });
  await batch.commit();
}
