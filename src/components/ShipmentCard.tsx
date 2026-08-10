import type { Shipment } from "../types";
import StatusBadge from "./StatusBadge";

interface Props {
  shipment: Shipment;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ShipmentCard({ shipment, onEdit, onDelete }: Props) {
  return (
    <div className="shipment-card">
      <div className="shipment-image">
        {shipment.images.length > 0 ? (
          <img src={shipment.images[0]} alt={shipment.trackingNumber} />
        ) : (
          <div className="image-placeholder">Sin imagen</div>
        )}
        {shipment.images.length > 1 && (
          <span className="image-count-badge">+{shipment.images.length - 1}</span>
        )}
      </div>

      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{shipment.provider}</h3>
          <StatusBadge status={shipment.status} />
        </div>

        <div className="shipment-tracking">#{shipment.trackingNumber}</div>

        {shipment.notes && <p className="shipment-notes">{shipment.notes}</p>}

        <div className="shipment-actions">
          {shipment.trackingLink ? (
            <a
              className="track-link"
              href={shipment.trackingLink}
              target="_blank"
              rel="noreferrer"
            >
              Ver rastreo ↗
            </a>
          ) : (
            <span className="track-link disabled">Sin link de rastreo</span>
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
