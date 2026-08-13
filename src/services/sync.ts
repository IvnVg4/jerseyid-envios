import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { Category, Order, OrderLine, Product, Provider, Shipment } from "../types";

/**
 * Corrige en segundo plano el `providerId` de cualquier envío que todavía no lo
 * tenga pero cuyo nombre de proveedor (el texto libre de antes de que fuera un
 * selector) coincida con uno ya dado de alta — sin esto, un envío puede mostrar
 * "Hu" en su tarjeta sin que `providerId` esté realmente guardado (porque nunca
 * se volvió a abrir y guardar ese envío desde el selector nuevo), y entonces no
 * hay nada de donde `reconcileProductProviders` pueda tomar el proveedor.
 */
export async function reconcileShipmentProviders(shipments: Shipment[], providers: Provider[]) {
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const shipment of shipments) {
    if (shipment.providerId || !shipment.provider) continue;
    const match = providers.find(
      (p) => p.name.trim().toLowerCase() === shipment.provider.trim().toLowerCase()
    );
    if (match) {
      batch.update(doc(db, "shipments", shipment.id), {
        providerId: match.id,
        updatedAt: serverTimestamp()
      });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}

/**
 * Corrige en segundo plano el proveedor de cualquier producto que no coincida con
 * el del envío al que está enlazada alguna de sus tallas ("En camino"). Cubre el
 * caso de que el proveedor del envío se asigne o cambie sin volver a abrir cada
 * producto uno por uno: se corre automáticamente cada vez que cambian los envíos
 * o los productos, no requiere ninguna acción manual.
 */
export async function reconcileProductProviders(products: Product[], shipments: Shipment[]) {
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const product of products) {
    let resolved: string | undefined;
    for (const v of product.variants) {
      for (const incomingBatch of v.incoming) {
        if (!incomingBatch.shipmentId) continue;
        const shipment = shipments.find((s) => s.id === incomingBatch.shipmentId);
        if (shipment?.providerId) resolved = shipment.providerId;
      }
    }
    if (resolved && resolved !== product.providerId) {
      batch.update(doc(db, "products", product.id), {
        providerId: resolved,
        updatedAt: serverTimestamp()
      });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}

/**
 * Corrige en segundo plano el `categoryId` de cualquier producto guardado antes de
 * que las categorías tuvieran id propio (cuando el tipo de producto se guardaba
 * como el *nombre* de la categoría en texto suelto) — empareja ese nombre contra
 * las categorías actuales y, si hay coincidencia exacta, fija el `categoryId`.
 * Lee los productos directo de Firestore (no del snapshot ya tipado) porque el
 * nombre heredado ya no es parte del modelo `Product`; solo sirve como puente de
 * migración para los documentos viejos.
 */
export async function reconcileProductCategories(categories: Category[]) {
  if (categories.length === 0) return;
  const snapshot = await getDocs(collection(db, "products"));
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.categoryId) continue;
    const legacyName = typeof data.type === "string" ? data.type.trim().toLowerCase() : "";
    if (!legacyName) continue;
    const match = categories.find((c) => c.name.trim().toLowerCase() === legacyName);
    if (!match) continue;
    batch.update(doc(db, "products", docSnap.id), {
      categoryId: match.id,
      updatedAt: serverTimestamp()
    });
    hasWrites = true;
  }

  if (hasWrites) await batch.commit();
}

/**
 * Igual que `reconcileProductCategories` pero para los precios de proveedor:
 * los guardados antes de este cambio traen `categoryName` (texto) en cada
 * entrada de `Provider.prices` en vez de `categoryId`. Reemplaza cada entrada
 * que logre emparejar por nombre; las que no coincidan con ninguna categoría
 * actual se dejan igual (se pueden corregir/quitar a mano desde Proveedores).
 */
export async function reconcileProviderCategoryPrices(categories: Category[]) {
  if (categories.length === 0) return;
  const snapshot = await getDocs(collection(db, "providers"));
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const prices: Record<string, unknown>[] = Array.isArray(data.prices) ? data.prices : [];
    let changed = false;
    const nextPrices = prices.map((p) => {
      if (p.categoryId) return p;
      const legacyName = typeof p.categoryName === "string" ? p.categoryName.trim().toLowerCase() : "";
      if (!legacyName) return p;
      const match = categories.find((c) => c.name.trim().toLowerCase() === legacyName);
      if (!match) return p;
      changed = true;
      const { categoryName, ...rest } = p;
      return { ...rest, categoryId: match.id };
    });
    if (changed) {
      batch.update(doc(db, "providers", docSnap.id), {
        prices: nextPrices,
        updatedAt: serverTimestamp()
      });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}

/**
 * Cuando una línea de pedido reserva un lote que todavía está "En fábrica"
 * (`sourceBatchId` fijado, sin `shipmentId` propio) y ese lote luego se enlaza a
 * un envío desde Inventario, esta función copia ese `shipmentId` a la línea y la
 * pasa de "En preparación" a "Enviado" — sin que haya que volver a abrir el
 * pedido a mano. Mismo patrón que `reconcileProductProviders`: corre en segundo
 * plano cada vez que cambian pedidos o productos.
 */
export async function reconcileOrderLineShipments(orders: Order[], products: Product[]) {
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const order of orders) {
    let changed = false;
    const lines: OrderLine[] = order.lines.map((line) => {
      if (!line.sourceBatchId || line.shipmentId || line.status !== "En preparación") return line;
      const product = products.find((p) => p.id === line.productId);
      const incomingBatch = product?.variants
        .flatMap((v) => v.incoming)
        .find((b) => b.id === line.sourceBatchId);
      if (!incomingBatch?.shipmentId) return line;
      changed = true;
      return { ...line, shipmentId: incomingBatch.shipmentId, status: "Enviado" as const };
    });
    if (changed) {
      batch.update(doc(db, "orders", order.id), { lines, updatedAt: serverTimestamp() });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}
