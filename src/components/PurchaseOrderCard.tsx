import type { Order, Product, Provider, PurchaseOrder } from "../types";

interface Props {
  purchaseOrder: PurchaseOrder;
  providers: Provider[];
  products: Product[];
  orders: Order[];
  onDelete: () => void;
  onAssignShipment: (lineIndex: number) => void;
  onLinkToOrder: (lineIndex: number) => void;
  onRemoveLine: (lineIndex: number) => void;
}

function purposeLabel(purpose: PurchaseOrder["lines"][number]["purpose"]): string {
  return purpose === "Stock" ? "Para stock" : "Para pedido";
}

export default function PurchaseOrderCard({
  purchaseOrder,
  providers,
  products,
  orders,
  onDelete,
  onAssignShipment,
  onLinkToOrder,
  onRemoveLine
}: Props) {
  const providerName = providers.find((p) => p.id === purchaseOrder.providerId)?.name ?? "Proveedor eliminado";
  const totalPieces = purchaseOrder.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="order-card">
      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{providerName}</h3>
        </div>

        {purchaseOrder.hasDeposit && (
          <span className="type-badge">Anticipo ${purchaseOrder.depositAmount.toLocaleString("es-MX")}</span>
        )}

        <div className="order-lines">
          {purchaseOrder.lines.map((line, i) => {
            const product = products.find((p) => p.id === line.productId);
            const batch = product?.variants.flatMap((v) => v.incoming).find((b) => b.id === line.batchId);
            const linkedOrder = line.linkedOrderId ? orders.find((o) => o.id === line.linkedOrderId) : undefined;
            const arrived = !batch; // ya no está en `incoming`: el envío llegó y se movió a stock
            const removable = !arrived && !batch?.reserved;
            return (
              <div key={i} className="order-line-row">
                <div className="order-line-info">
                  <span className="order-line-name">
                    {line.quantity}× {line.productName}
                    {line.size ? ` (Talla ${line.size})` : ""}
                  </span>
                  <div className="order-line-meta">
                    <span className="attr-chip">{purposeLabel(line.purpose)}</span>
                    {arrived && <span className="attr-chip">Ya en stock</span>}
                    {!arrived && batch?.shipmentId && <span className="attr-chip">En camino</span>}
                    {!arrived && !batch?.shipmentId && line.purpose === "Stock" && (
                      <span className="attr-chip">En fábrica</span>
                    )}
                    {linkedOrder && <span className="attr-chip">→ {linkedOrder.customerName}</span>}
                  </div>
                </div>
                <div className="order-line-actions">
                  {!arrived && line.purpose === "Stock" && !batch?.shipmentId && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onAssignShipment(i)}
                      title="Enlazar esta pieza a un envío de fábrica"
                    >
                      Asignar envío
                    </button>
                  )}
                  {!arrived && line.purpose === "Pedido" && !line.linkedOrderId && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onLinkToOrder(i)}
                      title="Vincular esta pieza a un pedido de cliente ya existente"
                    >
                      Vincular a pedido
                    </button>
                  )}
                  {removable && (
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={() => onRemoveLine(i)}
                      title="Quitar este producto del pedido a proveedor"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shipment-tracking">{totalPieces} pieza(s) en total</div>

        {purchaseOrder.notes && <p className="shipment-notes">{purchaseOrder.notes}</p>}

        <div className="shipment-actions">
          <div className="spacer" />
          <button className="icon-button danger" onClick={onDelete} title="Eliminar">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
