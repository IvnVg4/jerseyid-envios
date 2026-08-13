import type { Shipment } from "../types";

interface Props {
  shipments: Shipment[];
  selectedShipmentId: string;
  onSelect: (shipmentId: string) => void;
}

/** Selector visual de envío (foto + número de guía) en vez de un <select> de
 * texto — para identificar de un vistazo cuál es cuál al asignarlo. */
export default function ShipmentPicker({ shipments, selectedShipmentId, onSelect }: Props) {
  if (shipments.length === 0) {
    return <span className="field-hint">No hay envíos disponibles todavía.</span>;
  }

  return (
    <div className="product-picker-grid">
      {shipments.map((s) => {
        const active = s.id === selectedShipmentId;
        return (
          <button
            type="button"
            key={s.id}
            className={active ? "product-picker-card product-picker-card-active" : "product-picker-card"}
            onClick={() => onSelect(s.id)}
            title={`#${s.trackingNumber}`}
          >
            <div className="product-picker-thumb">
              {s.images[0] ? (
                <img src={s.images[0]} alt={s.trackingNumber} />
              ) : (
                <div className="image-placeholder">Sin imagen</div>
              )}
            </div>
            <span className="product-picker-name">#{s.trackingNumber}</span>
            <span className="product-picker-attrs">{s.provider || "Sin proveedor"}</span>
            <span className="product-picker-attrs">{s.status}</span>
          </button>
        );
      })}
    </div>
  );
}
