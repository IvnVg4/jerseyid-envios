import type { Order, Shipment } from "../types";
import OrderLineStatusBadge from "./OrderLineStatusBadge";

interface Props {
  order: Order;
  shipments: Shipment[];
  onEdit: () => void;
  onDelete: () => void;
  onMarkLineDelivered: (lineIndex: number) => void;
}

export default function OrderCard({ order, shipments, onEdit, onDelete, onMarkLineDelivered }: Props) {
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

        {order.notes && <p className="shipment-notes">{order.notes}</p>}

        <div className="order-lines">
          {order.lines.map((line, i) => {
            const shipment = line.shipmentId ? shipments.find((s) => s.id === line.shipmentId) : undefined;
            return (
              <div key={i} className="order-line-row">
                <div className="order-line-info">
                  <span className="order-line-name">
                    {line.quantity}× {line.productName}
                  </span>
                  <div className="order-line-meta">
                    <OrderLineStatusBadge status={line.status} />
                    {shipment && <span className="attr-chip">vía envío #{shipment.trackingNumber}</span>}
                  </div>
                </div>
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
            );
          })}
        </div>

        <div className="shipment-actions">
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
