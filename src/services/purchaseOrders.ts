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
import type { IncomingBatchDestination, Product, PurchaseOrder, PurchaseOrderInput } from "../types";

const PURCHASE_ORDERS = "purchaseOrders";
const PRODUCTS = "products";

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
          destination: data.destination ?? "Tienda",
          hasDeposit: data.hasDeposit ?? false,
          depositAmount: data.depositAmount ?? 0,
          linkedOrderId: data.linkedOrderId ?? null,
          lines: data.lines ?? [],
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

/**
 * Crea el pedido a proveedor y, en el mismo batch, agrega un `IncomingBatch`
 * nuevo (estado "En fábrica", sin envío enlazado todavía) a cada producto/talla
 * de sus líneas — creando la variante de esa talla si el producto todavía no la
 * tenía. Así, apenas se guarda el pedido a proveedor, esas piezas ya aparecen en
 * Inventario listas para reservarse desde un pedido de cliente o para enlazarse a
 * un envío cuando salgan de fábrica.
 */
export async function createPurchaseOrder(input: PurchaseOrderInput, products: Product[]) {
  const batch = writeBatch(db);
  const poRef = doc(collection(db, PURCHASE_ORDERS));

  const destination: IncomingBatchDestination =
    input.destination === "Tienda" ? "Tienda" : "Domicilio";

  const productUpdates = new Map<string, Product["variants"]>();
  const lines = input.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) throw new Error(`"${line.productName}" ya no existe en el inventario.`);

    const variants = (productUpdates.get(product.id) ?? product.variants).map((v) => ({
      ...v,
      incoming: v.incoming.map((b) => ({ ...b }))
    }));
    const batchId = crypto.randomUUID();
    const idx = variants.findIndex((v) => v.size === line.size);
    const newBatch = {
      id: batchId,
      quantity: line.quantity,
      reserved: 0,
      purchaseOrderId: poRef.id,
      shipmentId: null,
      destination
    };
    if (idx === -1) {
      variants.push({ size: line.size, quantity: 0, incoming: [newBatch] });
    } else {
      variants[idx] = { ...variants[idx], incoming: [...variants[idx].incoming, newBatch] };
    }
    productUpdates.set(product.id, variants);
    return { ...line, batchId };
  });

  for (const [productId, variants] of productUpdates) {
    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
  }

  batch.set(poRef, {
    ...input,
    lines,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

/** Solo se puede borrar si ninguno de sus lotes ya se movió a stock (llegó el
 * envío) o tiene piezas reservadas por un pedido de cliente — si no, el pedido a
 * proveedor ya no refleja la realidad del inventario y borrarlo lo desincroniza. */
export async function deletePurchaseOrder(purchaseOrder: PurchaseOrder, products: Product[]) {
  const batch = writeBatch(db);
  const productUpdates = new Map<string, Product["variants"]>();

  for (const line of purchaseOrder.lines) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) continue;
    const variants = productUpdates.get(product.id) ?? product.variants;
    const variant = variants.find((v) => v.size === line.size);
    const incomingBatch = variant?.incoming.find((b) => b.id === line.batchId);
    if (!incomingBatch) continue; // ya se movió a stock (el envío llegó): nada que revertir aquí
    if (incomingBatch.reserved > 0) {
      throw new Error(
        `"${line.productName}"${line.size ? ` talla ${line.size}` : ""} ya tiene piezas apartadas por un pedido de cliente — quítalas antes de borrar este pedido a proveedor.`
      );
    }
    const nextVariants = variants.map((v) =>
      v !== variant ? v : { ...v, incoming: v.incoming.filter((b) => b.id !== line.batchId) }
    );
    productUpdates.set(product.id, nextVariants);
  }

  for (const [productId, variants] of productUpdates) {
    batch.update(doc(db, PRODUCTS, productId), { variants, updatedAt: serverTimestamp() });
  }

  batch.delete(doc(db, PURCHASE_ORDERS, purchaseOrder.id));
  await batch.commit();
}
