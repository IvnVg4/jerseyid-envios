import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { Product, Provider, Shipment } from "../types";

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
      const shipmentId = v.incoming?.shipmentId;
      if (!shipmentId) continue;
      const shipment = shipments.find((s) => s.id === shipmentId);
      if (shipment?.providerId) resolved = shipment.providerId;
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
