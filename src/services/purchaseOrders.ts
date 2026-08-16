import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  IncomingBatch,
  Order,
  OrderLine,
  Product,
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderLine
} from "../types";

const PURCHASE_ORDERS = "purchaseOrders";
const PRODUCTS = "products";
const ORDERS = "orders";

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
}

export function subscribeToPurchaseOrders(
  onChange: (purchaseOrders: PurchaseOrder[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, PURCHASE_ORDERS), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const purchaseOrders: PurchaseOrder[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          providerId: data.providerId ?? "",
          hasDeposit: data.hasDeposit ?? false,
          depositAmount: data.depositAmount ?? 0,
          lines: (Array.isArray(data.lines) ? data.lines : []).map((raw: Record<string, unknown> | null) => {
            const l = raw ?? {};
            return {
              productId: l.productId ?? "",
              productName: l.productName ?? "",
              size: l.size ?? "",
              quantity: l.quantity ?? 0,
              batchId: l.batchId ?? "",
              purpose: l.purpose === "Pedido" ? "Pedido" : "Stock",
              linkedOrderId: l.linkedOrderId ?? null
            } as PurchaseOrderLine;
          }),
          notes: data.notes ?? "",
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onChange(purchaseOrders);
    },
    onError
  );
}

function newOrderLineFor(product: Product, size: string, quantity: number, batchId: string): OrderLine {
  return {
    productId: product.id,
    productName: product.name,
    size: size as OrderLine["size"],
    quantity,
    status: "En preparación",
    sourceBatchId: batchId,
    shipmentId: null,
    unitPrice: product.price,
    customName: "",
    customNumber: ""
  };
}

/**
 * Crea el pedido a proveedor y, en el mismo batch, agrega un `IncomingBatch`
 * nuevo a cada producto/talla de sus líneas (creando la variante si hace
 * falta). Cada línea decide por separado su `purpose`: "Stock" queda como
 * restock general (sin envío todavía — se enlaza después desde este mismo
 * pedido a proveedor), "Pedido" nace ya apartada para un cliente — si además
 * trae `linkedOrderId`, se reserva de una vez y se agrega la línea
 * correspondiente a ese pedido de cliente; si no, queda sin vincular para
 * decidirse después (ver `linkPurchaseOrderLineToOrder`).
 */
export async function createPurchaseOrder(input: PurchaseOrderInput, products: Product[], orders: Order[]) {
  const batch = writeBatch(db);
  const poRef = doc(collection(db, PURCHASE_ORDERS));

  const productUpdates = new Map<string, Product["variants"]>();
  const orderLineAdditions = new Map<string, OrderLine[]>();

  const lines = input.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) throw new Error(`"${line.productName}" ya no existe en el inventario.`);

    const variants = (productUpdates.get(product.id) ?? product.variants).map((v) => ({
      ...v,
      incoming: v.incoming.map((b) => ({ ...b }))
    }));
    const batchId = crypto.randomUUID();
    const linkedNow = line.purpose === "Pedido" ? line.linkedOrderId : null;
    const newBatch: IncomingBatch = {
      id: batchId,
      quantity: line.quantity,
      reserved: linkedNow ? line.quantity : 0,
      purchaseOrderId: poRef.id,
      shipmentId: null,
      purpose: line.purpose,
      linkedOrderId: linkedNow
    };
    const idx = variants.findIndex((v) => v.size === line.size);
    if (idx === -1) {
      variants.push({ size: line.size, quantity: 0, incoming: [newBatch] });
    } else {
      variants[idx] = { ...variants[idx], incoming: [...variants[idx].incoming, newBatch] };
    }
    productUpdates.set(product.id, variants);

    if (linkedNow) {
      const additions = orderLineAdditions.get(linkedNow) ?? [];
      additions.push(newOrderLineFor(product, line.size, line.quantity, batchId));
      orderLineAdditions.set(linkedNow, additions);
    }

    return { ...line, batchId };
  });

  for (const [productId, variants] of productUpdates) {
    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
  }

  for (const [orderId, additions] of orderLineAdditions) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error("El pedido de cliente vinculado ya no existe.");
    batch.update(doc(db, ORDERS, orderId), {
      lines: [...order.lines, ...additions],
      updatedAt: serverTimestamp()
    });
  }

  batch.set(poRef, {
    ...input,
    lines,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

/** Quita el lote de una línea de la lista `incoming` del producto (registra el
 * cambio en `productUpdates`, sin escribir todavía) — comparte la misma regla
 * de seguridad para borrar una línea suelta o el pedido a proveedor completo:
 * si el lote ya llegó a stock no hay nada que revertir, y si ya tiene piezas
 * apartadas por un cliente hay que soltarlas primero desde Pedidos. */
function releaseLineBatch(
  line: PurchaseOrderLine,
  products: Product[],
  productUpdates: Map<string, Product["variants"]>
) {
  const product = products.find((p) => p.id === line.productId);
  if (!product) return;
  const variants = productUpdates.get(product.id) ?? product.variants;
  const variant = variants.find((v) => v.size === line.size);
  const incomingBatch = variant?.incoming.find((b) => b.id === line.batchId);
  if (!incomingBatch) return; // ya se movió a stock (el envío llegó): nada que revertir aquí
  if (incomingBatch.reserved > 0) {
    throw new Error(
      `"${line.productName}"${line.size ? ` talla ${line.size}` : ""} ya tiene piezas apartadas por un pedido de cliente — quítalas antes desde Pedidos.`
    );
  }
  const nextVariants = variants.map((v) =>
    v !== variant ? v : { ...v, incoming: v.incoming.filter((b) => b.id !== line.batchId) }
  );
  productUpdates.set(product.id, nextVariants);
}

/** Solo se puede borrar si ninguno de sus lotes ya se movió a stock (llegó el
 * envío) o tiene piezas reservadas por un pedido de cliente — si no, el pedido a
 * proveedor ya no refleja la realidad del inventario y borrarlo lo desincroniza. */
export async function deletePurchaseOrder(purchaseOrder: PurchaseOrder, products: Product[]) {
  const batch = writeBatch(db);
  const productUpdates = new Map<string, Product["variants"]>();

  for (const line of purchaseOrder.lines) {
    releaseLineBatch(line, products, productUpdates);
  }

  for (const [productId, variants] of productUpdates) {
    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
  }

  batch.delete(doc(db, PURCHASE_ORDERS, purchaseOrder.id));
  await batch.commit();
}

/** Quita un solo producto de un pedido a proveedor ya guardado — misma regla
 * de seguridad que borrar el pedido completo (ver `releaseLineBatch`), pero
 * sin tocar el resto de sus líneas. */
export async function removePurchaseOrderLine(purchaseOrder: PurchaseOrder, lineIndex: number, products: Product[]) {
  const line = purchaseOrder.lines[lineIndex];
  const batch = writeBatch(db);
  const productUpdates = new Map<string, Product["variants"]>();

  releaseLineBatch(line, products, productUpdates);

  for (const [productId, variants] of productUpdates) {
    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
  }

  const lines = purchaseOrder.lines.filter((_, i) => i !== lineIndex);
  batch.update(doc(db, PURCHASE_ORDERS, purchaseOrder.id), { lines, updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * Enlaza el envío de fábrica a una línea "Stock" (restock general) — nunca a
 * una línea "Pedido": esas se enlazan desde Pedidos de clientes (ver
 * `assignOrderLineShipment` en services/orders.ts), no se mezclan.
 */
export async function assignPurchaseOrderLineShipment(
  purchaseOrder: PurchaseOrder,
  lineIndex: number,
  shipmentId: string,
  products: Product[]
) {
  const line = purchaseOrder.lines[lineIndex];
  if (line.purpose !== "Stock") {
    throw new Error('Esta pieza es "Pedido" — su envío se asigna desde Pedidos de clientes.');
  }
  const product = products.find((p) => p.id === line.productId);
  if (!product) throw new Error(`"${line.productName}" ya no existe en el inventario.`);

  const variants = product.variants.map((v) => ({
    ...v,
    incoming: v.incoming.map((b) => (b.id === line.batchId ? { ...b, shipmentId } : b))
  }));

  await writeBatch(db)
    .update(doc(db, PRODUCTS, product.id), { variants, updatedAt: serverTimestamp() })
    .commit();
}

/**
 * Vincula una línea "Pedido" que se dejó sin asignar al crear el pedido a
 * proveedor con uno de los pedidos de cliente ya existentes: reserva el lote
 * por completo para ese cliente y le agrega la línea correspondiente — igual
 * que si se hubiera vinculado desde el principio.
 */
export async function linkPurchaseOrderLineToOrder(
  purchaseOrder: PurchaseOrder,
  lineIndex: number,
  targetOrder: Order,
  products: Product[]
) {
  const line = purchaseOrder.lines[lineIndex];
  if (line.purpose !== "Pedido") throw new Error('Solo las líneas "Pedido" se pueden vincular a un cliente.');
  if (line.linkedOrderId) throw new Error("Esta línea ya está vinculada a un pedido.");

  const product = products.find((p) => p.id === line.productId);
  if (!product) throw new Error(`"${line.productName}" ya no existe en el inventario.`);
  const variant = product.variants.find((v) => v.size === line.size);
  const existingBatch = variant?.incoming.find((b) => b.id === line.batchId);
  if (!existingBatch) throw new Error("Ese lote ya no existe (puede que su envío ya haya llegado).");

  const batch = writeBatch(db);

  const variants = product.variants.map((v) =>
    v !== variant
      ? v
      : {
          ...v,
          incoming: v.incoming.map((b) =>
            b.id === line.batchId ? { ...b, reserved: line.quantity, linkedOrderId: targetOrder.id } : b
          )
        }
  );
  batch.update(doc(db, PRODUCTS, product.id), { variants, updatedAt: serverTimestamp() });

  batch.update(doc(db, ORDERS, targetOrder.id), {
    lines: [...targetOrder.lines, newOrderLineFor(product, line.size, line.quantity, line.batchId)],
    updatedAt: serverTimestamp()
  });

  const lines = purchaseOrder.lines.map((l, i) => (i === lineIndex ? { ...l, linkedOrderId: targetOrder.id } : l));
  batch.update(doc(db, PURCHASE_ORDERS, purchaseOrder.id), { lines, updatedAt: serverTimestamp() });

  await batch.commit();
}
