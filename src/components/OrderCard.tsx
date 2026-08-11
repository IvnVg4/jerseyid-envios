import type { Order, Product, Shipment } from "../types";
import OrderLineStatusBadge from "./OrderLineStatusBadge";

interface Props {
  order: Order;
  shipments: Shipment[];
  products: Product[];
  onEdit: () => void;
  onDelete: () => void;
  onMarkLineDelivered: (lineIndex: number) => void;
  onMarkAllDelivered: () => void;
  onRemoveLine: (lineIndex: number) => void;
}

export default function OrderCard({
  order,
  shipments,
  products,
  onEdit,
  onDelete,
  onMarkLineDelivered,
  onMarkAllDelivered,
  onRemoveLine
}: Props) {
  const orderTotal = order.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const hasPendingDelivery = order.lines.some((l) => l.status !== "Entregado");
  const address = order.shippingAddress;

  return (
    <div className="order-card">
      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{order.customerName}</h3>
          {order.hasDeposit && (
            <span className="type-badge">Anticipo ${order.depositAmount}</span>
          )}
        </div>

        <div className="shipment-tracking">{order.customerPhone}</div>

        <span className="type-badge">{order.fulfillmentType}</span>

        {address && (
          <div className="shipment-destination">
            {address.street}
            {address.crossStreets ? `, entre ${address.crossStreets}` : ""}, {address.neighborhood},{" "}
            {address.city}, {address.state}, CP {address.postalCode}
          </div>
        )}

        {order.notes && <p className="shipment-notes">{order.notes}</p>}

        <div className="order-lines">
          {order.lines.map((line, i) => {
            const shipment = line.shipmentId ? shipments.find((s) => s.id === line.shipmentId) : undefined;
            const lineProduct = products.find((p) => p.id === line.productId);
            const personalization = [line.customName, line.customNumber].filter(Boolean).join(" · ");
            return (
              <div key={i} className="order-line-row">
                <div className="order-line-thumb">
                  {lineProduct?.images[0] ? (
                    <img src={lineProduct.images[0]} alt={line.productName} />
                  ) : (
                    <div className="order-line-thumb-empty" />
                  )}
                </div>
                <div className="order-line-info">
                  <span className="order-line-name">
                    {line.quantity}× {line.productName} — ${(line.quantity * line.unitPrice).toLocaleString("es-MX")}
                  </span>
                  <div className="order-line-meta">
                    <OrderLineStatusBadge status={line.status} />
                    {shipment && <span className="attr-chip">vía envío #{shipment.trackingNumber}</span>}
                    {personalization && <span className="attr-chip">{personalization}</span>}
                  </div>
                </div>
                <div className="order-line-actions">
                  {line.status === "Bajo pedido" && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onRemoveLine(i)}
                      title="Cancelar el apartado de esta pieza"
                    >
                      Quitar apartado
                    </button>
                  )}
                  {line.status !== "Entregado" && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onMarkLineDelivered(i)}
                      title="Marcar esta línea como entregada"
                    >
                      Marcar entregado
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="order-total-row">
          <span>Total: ${orderTotal.toLocaleString("es-MX")}</span>
          {order.hasDeposit && (
            <span className="field-hint">
              Saldo pendiente: ${(orderTotal - order.depositAmount).toLocaleString("es-MX")}
            </span>
          )}
        </div>

        <div className="shipment-actions">
          {hasPendingDelivery && order.lines.length > 1 && (
            <button
              type="button"
              className="icon-button"
              onClick={onMarkAllDelivered}
              title="Marcar todos los productos de este pedido como entregados"
            >
              Marcar todo entregado
            </button>
          )}
          <div className="spacer" />
          <button className="icon-button" onClick={onEdit} title="Editar">
            Editar
          </button>
          <button className="icon-button danger" onClick={onDelete} title="Eliminar">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
