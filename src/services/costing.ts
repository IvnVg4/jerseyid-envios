import type { OrderLine, Product, Provider, Shipment } from "../types";

/**
 * Resuelve el costo unitario vigente de una línea de pedido.
 *
 * Si la línea viene de un envío enlazado (`shipmentId`, típico de una línea "Bajo
 * pedido"), se usa el proveedor de ESE envío directamente — es el registro real de
 * dónde se compró esa pieza — en vez de `product.providerId`, que puede haber
 * quedado desfasado si el producto se reasignó a otro envío después de que esta
 * línea se creó. Si la línea es una venta directa de stock ya mezclado (sin envío
 * asociado, ej. status "Vendida"), no hay forma de saber de qué lote salió esa
 * pieza puntual, así que se usa el proveedor vigente del producto como mejor
 * referencia disponible.
 *
 * Devuelve `null` (nunca 0) cuando el costo no se puede determinar — sin proveedor
 * asignado, o sin un precio registrado para esa categoría/manga/versión — para que
 * quien llama pueda distinguir "no sabemos el costo" de "cuesta gratis".
 */
export function resolveUnitCost(
  line: Pick<OrderLine, "productId" | "shipmentId">,
  products: Product[],
  providers: Provider[],
  shipments: Shipment[]
): number | null {
  const product = products.find((p) => p.id === line.productId);
  if (!product) return null;

  const shipment = line.shipmentId ? shipments.find((s) => s.id === line.shipmentId) : undefined;
  const providerId = shipment?.providerId || product.providerId;
  if (!providerId) return null;

  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return null;

  const entry = provider.prices.find(
    (p) =>
      p.categoryName === product.type &&
      p.sleeve === (product.sleeve || "") &&
      p.version === (product.version || "")
  );
  return entry ? entry.cost : null;
}
