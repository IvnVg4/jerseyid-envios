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
import type { Order, OrderInput, OrderLine, Product, ProductVariant } from "../types";

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
            size: line.size ?? "",
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

function lineKey(line: OrderLine): string {
  return `${line.productId}::${line.size ?? ""}`;
}

function splitKey(key: string): [productId: string, size: string] {
  const sep = key.indexOf("::");
  return [key.slice(0, sep), key.slice(sep + 2)];
}

/** Encuentra la variante (talla) correspondiente; si la línea no trae talla (pedidos
 * viejos) y el producto solo tiene una variante, cae en esa por default. */
function findVariantIndex(variants: ProductVariant[], size: string): number {
  const idx = variants.findIndex((v) => v.size === size);
  if (idx !== -1) return idx;
  if (variants.length === 1) return 0;
  return -1;
}

/** Cambio neto de cantidad por (producto, talla) entre dos listas de líneas (solo cuenta líneas "Vendida"). */
function computeSoldDelta(oldLines: OrderLine[], newLines: OrderLine[]) {
  const delta = new Map<string, number>();
  const add = (key: string, n: number) => delta.set(key, (delta.get(key) ?? 0) + n);
  for (const line of oldLines) {
    if (line.status === "Vendida") add(lineKey(line), line.quantity);
  }
  for (const line of newLines) {
    if (line.status === "Vendida") add(lineKey(line), -line.quantity);
  }
  return delta;
}

/** Cambio neto de `incoming.reserved` por (producto, talla) entre dos listas de líneas (solo cuenta líneas "Bajo pedido"). */
function computeReservedDelta(oldLines: OrderLine[], newLines: OrderLine[]) {
  const delta = new Map<string, number>();
  const add = (key: string, n: number) => delta.set(key, (delta.get(key) ?? 0) + n);
  for (const line of oldLines) {
    if (line.status === "Bajo pedido") add(lineKey(line), -line.quantity);
  }
  for (const line of newLines) {
    if (line.status === "Bajo pedido") add(lineKey(line), line.quantity);
  }
  return delta;
}

function applyProductDeltas(
  batch: ReturnType<typeof writeBatch>,
  products: Product[],
  soldDelta: Map<string, number>,
  reservedDelta: Map<string, number>
) {
  const perProduct = new Map<string, Map<string, { sold: number; reserved: number }>>();
  const collect = (map: Map<string, number>, field: "sold" | "reserved") => {
    for (const [key, value] of map) {
      if (value === 0) continue;
      const [productId, size] = splitKey(key);
      if (!perProduct.has(productId)) perProduct.set(productId, new Map());
      const sizes = perProduct.get(productId)!;
      const entry = sizes.get(size) ?? { sold: 0, reserved: 0 };
      entry[field] += value;
      sizes.set(size, entry);
    }
  };
  collect(soldDelta, "sold");
  collect(reservedDelta, "reserved");

  for (const [productId, sizeDeltas] of perProduct) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue; // producto eliminado: no hay nada que ajustar

    const variants = product.variants.map((v) => ({ ...v }));
    for (const [size, { sold, reserved }] of sizeDeltas) {
      const idx = findVariantIndex(variants, size);
      if (idx === -1) {
        throw new Error(`"${product.name}" ya no tiene la talla "${size || "única"}".`);
      }
      const variant = variants[idx];

      if (sold !== 0) {
        const newQuantity = variant.quantity + sold;
        if (newQuantity < 0) {
          throw new Error(
            `Stock insuficiente de "${product.name}"${size ? ` talla ${size}` : ""}.`
          );
        }
        variant.quantity = newQuantity;
        variant.stockStatus = newQuantity > 0 ? "En stock" : "Agotado";
      }

      if (reserved !== 0) {
        if (!variant.incoming) {
          throw new Error(
            `"${product.name}"${size ? ` talla ${size}` : ""} ya no tiene un lote en camino.`
          );
        }
        const newReserved = variant.incoming.reserved + reserved;
        if (newReserved < 0 || newReserved > variant.incoming.quantity) {
          throw new Error(
            `No quedan piezas disponibles del lote en camino de "${product.name}"${
              size ? ` talla ${size}` : ""
            }.`
          );
        }
        variant.incoming = { ...variant.incoming, reserved: newReserved };
      }
    }

    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
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
