import type { Provider, PurchaseOrder } from "../types";

interface Props {
  purchaseOrder: PurchaseOrder;
  providers: Provider[];
  onDelete: () => void;
}

export default function PurchaseOrderCard({ purchaseOrder, providers, onDelete }: Props) {
  const providerName = providers.find((p) => p.id === purchaseOrder.providerId)?.name ?? "Proveedor eliminado";
  const totalPieces = purchaseOrder.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="order-card">
      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{providerName}</h3>
          <span className="type-badge">{purchaseOrder.destination}</span>
        </div>

        {purchaseOrder.hasDeposit && (
          <span className="type-badge">Anticipo ${purchaseOrder.depositAmount.toLocaleString("es-MX")}</span>
        )}

        <div className="order-lines">
          {purchaseOrder.lines.map((line, i) => (
            <div key={i} className="order-line-row">
              <div className="order-line-info">
                <span className="order-line-name">
                  {line.quantity}× {line.productName}
                  {line.size ? ` (Talla ${line.size})` : ""}
                </span>
              </div>
            </div>
          ))}
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
