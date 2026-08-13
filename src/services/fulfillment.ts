import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { Order, OrderLine, Product, Provider, Shipment } from "../types";
import { resolveUnitCost } from "./costing";

/**
 * Se llama cuando un envío pasa a estado "Entregado". Cubre los dos orígenes:
 * - "Fábrica": mueve las piezas libres del lote enlazado a stock físico, y avanza
 *   las líneas de pedido que reservaron ese lote (a "Listo para entregar" si el
 *   lote iba a la Sucursal, o directo a "Entregado" si iba a Domicilio).
 * - "Sucursal": ya es stock propio saliendo hacia un cliente (envío de tienda a
 *   domicilio, o una pieza que ya estaba en stock y se mandó fuera del estado) —
 *   no mueve inventario, solo avanza a "Entregado" cualquier línea enlazada a
 *   este envío.
 */
export async function applyShipmentDelivery(
  shipment: Shipment,
  products: Product[],
  orders: Order[],
  providers: Provider[]
) {
  const batch = writeBatch(db);
  let hasWrites = false;

  // Ids de los lotes que este envío resuelve (para saber qué líneas de pedido avanzar).
  const resolvedBatchIds = new Set<string>();

  if (shipment.origin === "Fábrica") {
    for (const product of products) {
      const matchesShipment = product.variants.some((v) =>
        v.incoming.some((b) => b.shipmentId === shipment.id)
      );
      if (!matchesShipment) continue;

      const variants = product.variants.map((v) => {
        const matchingBatches = v.incoming.filter((b) => b.shipmentId === shipment.id);
        if (matchingBatches.length === 0) return v;
        for (const b of matchingBatches) resolvedBatchIds.add(b.id);
        // Las piezas ya "reserved" por líneas de pedido no se suman al stock
        // general: se van directo al cliente de ese pedido (sus líneas se avanzan
        // abajo), no quedan disponibles para vender de nuevo.
        const freed = matchingBatches.reduce(
          (sum, b) => sum + Math.max(0, b.quantity - b.reserved),
          0
        );
        return {
          ...v,
          quantity: v.quantity + freed,
          incoming: v.incoming.filter((b) => b.shipmentId !== shipment.id)
        };
      });

      const update: Record<string, unknown> = { variants, updatedAt: serverTimestamp() };
      // Al llegar el envío es cuando se pierde la referencia a de qué lote venía
      // esa talla: aprovechamos este momento para dejar fijo el proveedor vigente
      // del envío en el producto, por si se asignó o cambió después de enlazarlo.
      if (shipment.providerId) update.providerId = shipment.providerId;

      batch.update(doc(db, "products", product.id), update);
      hasWrites = true;
    }
  }

  for (const order of orders) {
    let changed = false;
    const lines: OrderLine[] = order.lines.map((line) => {
      if (line.status === "Entregado" || line.shipmentId !== shipment.id) return line;

      if (shipment.origin === "Fábrica") {
        // Solo avanzar líneas que efectivamente reservaron un lote de este envío
        // (o, por compatibilidad, que ya traían este shipmentId asignado).
        if (line.sourceBatchId && !resolvedBatchIds.has(line.sourceBatchId)) return line;
        changed = true;
        const delivered = shipment.destinationType !== "Sucursal";
        return {
          ...line,
          status: delivered ? "Entregado" : "Listo para entregar",
          // "shipment" (no product.providerId) es la fuente de verdad del costo
          // aquí: ya trae el proveedor vigente sin depender de que el producto ya
          // se haya actualizado en este mismo batch.
          ...(delivered
            ? { unitCost: resolveUnitCost(line, products, providers, [shipment]) }
            : {})
        };
      }

      // Origen "Sucursal": ya es stock propio saliendo hacia un cliente, la
      // entrega del envío es directamente la entrega de la pieza.
      changed = true;
      return {
        ...line,
        status: "Entregado" as const,
        unitCost: resolveUnitCost(line, products, providers, [shipment])
      };
    });
    if (changed) {
      batch.update(doc(db, "orders", order.id), { lines, updatedAt: serverTimestamp() });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}
