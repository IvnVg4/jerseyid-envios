import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { Order, OrderLine, Product, Shipment } from "../types";

/**
 * Se llama cuando un envío pasa a estado "Entregado". Solo tiene efecto si el
 * envío es origen "Fábrica" — uno origen "Sucursal" ya es stock propio
 * saliendo hacia un cliente y no dispara nada aquí.
 */
export async function applyShipmentDelivery(
  shipment: Shipment,
  products: Product[],
  orders: Order[]
) {
  if (shipment.origin !== "Fábrica") return;

  const batch = writeBatch(db);
  let hasWrites = false;

  for (const product of products) {
    if (product.stockStatus === "En camino" && product.incoming?.shipmentId === shipment.id) {
      // Las piezas ya "reserved" por líneas "Bajo pedido" no se suman al stock
      // general: se van directo al cliente de ese pedido (sus líneas se marcan
      // abajo), no quedan disponibles para vender de nuevo.
      const unreserved = Math.max(0, product.incoming.quantity - product.incoming.reserved);
      const newQuantity = product.quantity + unreserved;
      batch.update(doc(db, "products", product.id), {
        quantity: newQuantity,
        stockStatus: newQuantity > 0 ? "En stock" : "Agotado",
        incoming: null,
        updatedAt: serverTimestamp()
      });
      hasWrites = true;
    }
  }

  for (const order of orders) {
    let changed = false;
    const lines: OrderLine[] = order.lines.map((line) => {
      if (line.status !== "Bajo pedido" || line.shipmentId !== shipment.id) return line;
      changed = true;
      return {
        ...line,
        status: shipment.destinationType === "Sucursal" ? "Listo para entregar" : "Entregado"
      };
    });
    if (changed) {
      batch.update(doc(db, "orders", order.id), { lines, updatedAt: serverTimestamp() });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}
