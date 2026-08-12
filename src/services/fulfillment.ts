import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { Order, OrderLine, Product, Provider, Shipment } from "../types";
import { resolveUnitCost } from "./costing";

/**
 * Se llama cuando un envío pasa a estado "Entregado". Solo tiene efecto si el
 * envío es origen "Fábrica" — uno origen "Sucursal" ya es stock propio
 * saliendo hacia un cliente y no dispara nada aquí.
 */
export async function applyShipmentDelivery(
  shipment: Shipment,
  products: Product[],
  orders: Order[],
  providers: Provider[]
) {
  if (shipment.origin !== "Fábrica") return;

  const batch = writeBatch(db);
  let hasWrites = false;

  for (const product of products) {
    const matchesShipment = product.variants.some(
      (v) => v.stockStatus === "En camino" && v.incoming?.shipmentId === shipment.id
    );
    if (!matchesShipment) continue;

    const variants = product.variants.map((v) => {
      if (v.stockStatus !== "En camino" || v.incoming?.shipmentId !== shipment.id) return v;
      // Las piezas ya "reserved" por líneas "Bajo pedido" no se suman al stock
      // general: se van directo al cliente de ese pedido (sus líneas se marcan
      // abajo), no quedan disponibles para vender de nuevo.
      const unreserved = Math.max(0, v.incoming.quantity - v.incoming.reserved);
      const newQuantity = v.quantity + unreserved;
      return {
        ...v,
        quantity: newQuantity,
        stockStatus: newQuantity > 0 ? ("En stock" as const) : ("Agotado" as const),
        incoming: null
      };
    });

    const update: Record<string, unknown> = { variants, updatedAt: serverTimestamp() };
    // Al llegar el envío es cuando se pierde la referencia a de qué envío venía
    // esa talla (incoming pasa a null arriba): aprovechamos este momento para
    // dejar fijo el proveedor vigente del envío en el producto, por si se asignó
    // o cambió después de enlazar el producto a este envío.
    if (shipment.providerId) update.providerId = shipment.providerId;

    batch.update(doc(db, "products", product.id), update);
    hasWrites = true;
  }

  for (const order of orders) {
    let changed = false;
    const lines: OrderLine[] = order.lines.map((line) => {
      if (line.status !== "Bajo pedido" || line.shipmentId !== shipment.id) return line;
      changed = true;
      const delivered = shipment.destinationType !== "Sucursal";
      return {
        ...line,
        status: delivered ? "Entregado" : "Listo para entregar",
        // "shipment" (no product.providerId) es la fuente de verdad del costo aquí:
        // ya trae el proveedor vigente sin depender de que el producto ya se haya
        // actualizado en este mismo batch.
        ...(delivered
          ? { unitCost: resolveUnitCost(line, products, providers, [shipment]) }
          : {})
      };
    });
    if (changed) {
      batch.update(doc(db, "orders", order.id), { lines, updatedAt: serverTimestamp() });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}
