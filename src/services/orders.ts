import {
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
import type {
  IncomingBatch,
  Order,
  OrderInput,
  OrderLine,
  Product,
  ProductSize,
  ProductVariant,
  Provider,
  Shipment
} from "../types";
import { resolveUnitCost } from "./costing";

const ORDERS = "orders";
const PRODUCTS = "products";

/** Un lote "En fábrica" que hay que crear de cero porque la talla pedida no
 * tenía suficiente stock ni lotes existentes (ver `allocateSources` en
 * OrderForm) — se pide automáticamente al proveedor en vez de bloquear el
 * pedido. */
export interface NewBatchRequest {
  productId: string;
  size: ProductSize | "";
  batchId: string;
  quantity: number;
}

/** Agrega, sobre una copia de `products`, los lotes nuevos que todavía no
 * existen en Firestore (creando la variante de esa talla si hace falta) — así
 * `applyProductDeltas` los encuentra igual que si ya existieran y les aplica la
 * reserva de la línea que los originó en el mismo movimiento. */
function injectNewBatches(products: Product[], newBatches: NewBatchRequest[]): Product[] {
  if (newBatches.length === 0) return products;
  const byProduct = new Map<string, NewBatchRequest[]>();
  for (const nb of newBatches) {
    if (!byProduct.has(nb.productId)) byProduct.set(nb.productId, []);
    byProduct.get(nb.productId)!.push(nb);
  }
  return products.map((p) => {
    const additions = byProduct.get(p.id);
    if (!additions) return p;
    let variants = p.variants.map((v) => ({ ...v, incoming: [...v.incoming] }));
    for (const nb of additions) {
      const newBatch: IncomingBatch = {
        id: nb.batchId,
        quantity: nb.quantity,
        reserved: 0,
        purchaseOrderId: null,
        shipmentId: null,
        destination: "Tienda"
      };
      const idx = variants.findIndex((v) => v.size === nb.size);
      if (idx === -1) {
        variants = [...variants, { size: nb.size, quantity: 0, incoming: [newBatch] }];
      } else {
        variants[idx] = { ...variants[idx], incoming: [...variants[idx].incoming, newBatch] };
      }
    }
    return { ...p, variants };
  });
}

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
            customNumber: line.customNumber ?? "",
            sourceBatchId: line.sourceBatchId ?? null,
            // Pedidos guardados antes de "Vendida"/"Bajo pedido" caen a "En preparación";
            // "Listo para entregar"/"Entregado" se conservan igual.
            status:
              (line.status as string) === "Vendida" || (line.status as string) === "Bajo pedido"
                ? "En preparación"
                : line.status
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

/** Cambio neto de `quantity` (stock físico) por (producto, talla): solo cuenta
 * líneas sin `sourceBatchId` (salieron directo del stock, no de un lote). */
function computeStockDelta(oldLines: OrderLine[], newLines: OrderLine[]) {
  const delta = new Map<string, number>();
  const add = (key: string, n: number) => delta.set(key, (delta.get(key) ?? 0) + n);
  for (const line of oldLines) {
    if (!line.sourceBatchId) add(lineKey(line), line.quantity);
  }
  for (const line of newLines) {
    if (!line.sourceBatchId) add(lineKey(line), -line.quantity);
  }
  return delta;
}

/** Cambio neto de `reserved` por (producto, talla, lote): solo cuenta líneas con
 * `sourceBatchId` (reservaron un lote en fábrica/camino, no stock físico). */
function computeBatchReservedDelta(oldLines: OrderLine[], newLines: OrderLine[]) {
  const delta = new Map<string, number>();
  const add = (key: string, n: number) => delta.set(key, (delta.get(key) ?? 0) + n);
  for (const line of oldLines) {
    if (line.sourceBatchId) add(`${lineKey(line)}::${line.sourceBatchId}`, -line.quantity);
  }
  for (const line of newLines) {
    if (line.sourceBatchId) add(`${lineKey(line)}::${line.sourceBatchId}`, line.quantity);
  }
  return delta;
}

function applyProductDeltas(
  batch: ReturnType<typeof writeBatch>,
  products: Product[],
  stockDelta: Map<string, number>,
  batchReservedDelta: Map<string, number>
) {
  const perProduct = new Map<
    string,
    Map<string, { stock: number; batchReserved: Map<string, number> }>
  >();

  for (const [key, value] of stockDelta) {
    if (value === 0) continue;
    const [productId, size] = splitKey(key);
    if (!perProduct.has(productId)) perProduct.set(productId, new Map());
    const sizes = perProduct.get(productId)!;
    const entry = sizes.get(size) ?? { stock: 0, batchReserved: new Map<string, number>() };
    entry.stock += value;
    sizes.set(size, entry);
  }

  for (const [key, value] of batchReservedDelta) {
    if (value === 0) continue;
    const sep2 = key.lastIndexOf("::");
    const [productAndSize, batchId] = [key.slice(0, sep2), key.slice(sep2 + 2)];
    const [productId, size] = splitKey(productAndSize);
    if (!perProduct.has(productId)) perProduct.set(productId, new Map());
    const sizes = perProduct.get(productId)!;
    const entry = sizes.get(size) ?? { stock: 0, batchReserved: new Map<string, number>() };
    entry.batchReserved.set(batchId, (entry.batchReserved.get(batchId) ?? 0) + value);
    sizes.set(size, entry);
  }

  for (const [productId, sizeDeltas] of perProduct) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue; // producto eliminado: no hay nada que ajustar

    const variants = product.variants.map((v) => ({ ...v, incoming: v.incoming.map((b) => ({ ...b })) }));
    for (const [size, { stock, batchReserved }] of sizeDeltas) {
      const idx = findVariantIndex(variants, size);
      if (idx === -1) {
        throw new Error(`"${product.name}" ya no tiene la talla "${size || "única"}".`);
      }
      const variant = variants[idx];

      if (stock !== 0) {
        const newQuantity = variant.quantity + stock;
        if (newQuantity < 0) {
          throw new Error(
            `Stock insuficiente de "${product.name}"${size ? ` talla ${size}` : ""}.`
          );
        }
        variant.quantity = newQuantity;
      }

      for (const [batchId, delta] of batchReserved) {
        if (delta === 0) continue;
        const batchIdx = variant.incoming.findIndex((b) => b.id === batchId);
        if (batchIdx === -1) {
          throw new Error(
            `"${product.name}"${size ? ` talla ${size}` : ""} ya no tiene ese lote en camino.`
          );
        }
        const incomingBatch = variant.incoming[batchIdx];
        const newReserved = incomingBatch.reserved + delta;
        if (newReserved < 0 || newReserved > incomingBatch.quantity) {
          throw new Error(
            `No quedan piezas disponibles de ese lote de "${product.name}"${
              size ? ` talla ${size}` : ""
            }.`
          );
        }
        variant.incoming[batchIdx] = { ...incomingBatch, reserved: newReserved };
      }
    }

    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
  }
}

export async function createOrder(
  input: OrderInput,
  products: Product[],
  newBatches: NewBatchRequest[] = []
) {
  const batch = writeBatch(db);
  const workingProducts = injectNewBatches(products, newBatches);
  const stockDelta = computeStockDelta([], input.lines);
  const batchReservedDelta = computeBatchReservedDelta([], input.lines);
  applyProductDeltas(batch, workingProducts, stockDelta, batchReservedDelta);

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
  products: Product[],
  newBatches: NewBatchRequest[] = []
) {
  const batch = writeBatch(db);
  const workingProducts = injectNewBatches(products, newBatches);
  const stockDelta = computeStockDelta(oldOrder.lines, input.lines);
  const batchReservedDelta = computeBatchReservedDelta(oldOrder.lines, input.lines);
  applyProductDeltas(batch, workingProducts, stockDelta, batchReservedDelta);

  batch.update(doc(db, ORDERS, id), {
    ...input,
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export async function deleteOrder(order: Order, products: Product[]) {
  const batch = writeBatch(db);
  // Revertir como si todas las líneas pasaran a "no existir": libera lo vendido de
  // stock o lo reservado de un lote. Las líneas "Listo para entregar"/"Entregado"
  // no se tocan a propósito: para esas la pieza ya se resolvió al llegar el envío
  // (o se entregó en mano) y salió del conteo general — si un pedido así se
  // cancela, el stock se ajusta a mano.
  const stockDelta = computeStockDelta(order.lines, []);
  const batchReservedDelta = computeBatchReservedDelta(order.lines, []);
  applyProductDeltas(batch, products, stockDelta, batchReservedDelta);

  batch.delete(doc(db, ORDERS, order.id));
  await batch.commit();
}

export async function markOrderLineDelivered(
  order: Order,
  lineIndex: number,
  products: Product[],
  providers: Provider[],
  shipments: Shipment[]
) {
  const lines = order.lines.map((line, i) =>
    i === lineIndex
      ? {
          ...line,
          status: "Entregado" as const,
          unitCost: resolveUnitCost(line, products, providers, shipments)
        }
      : line
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}

export async function markAllOrderLinesDelivered(
  order: Order,
  products: Product[],
  providers: Provider[],
  shipments: Shipment[]
) {
  const lines = order.lines.map((line) =>
    line.status === "Entregado"
      ? line
      : {
          ...line,
          status: "Entregado" as const,
          unitCost: resolveUnitCost(line, products, providers, shipments)
        }
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}

/** A qué status vuelve una línea al quitarle "Entregado": si ya tiene un envío
 * enlazado, regresa a "Listo para entregar" (esperando entrega en mano); si no,
 * regresa a "En preparación". Ninguno de los dos casos mueve inventario: ambos
 * extremos ya están fuera del conteo general (ver computeStockDelta/computeBatchReservedDelta). */
function undeliveredStatus(line: OrderLine): OrderLine["status"] {
  return line.shipmentId ? "Listo para entregar" : "En preparación";
}

export async function revertOrderLineDelivered(order: Order, lineIndex: number) {
  const lines = order.lines.map((line, i) =>
    i === lineIndex && line.status === "Entregado" ? { ...line, status: undeliveredStatus(line) } : line
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}

export async function revertAllOrderLinesDelivered(order: Order) {
  const lines = order.lines.map((line) =>
    line.status === "Entregado" ? { ...line, status: undeliveredStatus(line) } : line
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}

/** Quita una línea del pedido (ej. "quitar apartado" de una línea que reservó un
 * lote) y libera el stock/reserva que tenía. */
export async function removeOrderLine(order: Order, lineIndex: number, products: Product[]) {
  const line = order.lines[lineIndex];
  const newLines = order.lines.filter((_, i) => i !== lineIndex);

  const batch = writeBatch(db);
  const stockDelta = computeStockDelta([line], []);
  const batchReservedDelta = computeBatchReservedDelta([line], []);
  applyProductDeltas(batch, products, stockDelta, batchReservedDelta);

  batch.update(doc(db, ORDERS, order.id), { lines: newLines, updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * Asigna (o corrige) el envío que lleva una línea a su destino final — se puede
 * usar en cualquier línea no entregada, venga de stock o de un lote de fábrica.
 * Si la línea seguía "En preparación", pasa a "Enviado"; si ya estaba más
 * avanzada (ej. corrigiendo el envío equivocado), solo actualiza el enlace.
 */
export async function assignOrderLineShipment(order: Order, lineIndex: number, shipmentId: string) {
  const lines = order.lines.map((line, i) =>
    i === lineIndex
      ? {
          ...line,
          shipmentId,
          status: line.status === "En preparación" ? ("Enviado" as const) : line.status
        }
      : line
  );
  await updateDoc(doc(db, ORDERS, order.id), {
    lines,
    updatedAt: serverTimestamp()
  });
}
