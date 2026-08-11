import { useState } from "react";
import type { Product, Shipment } from "../types";
import StatusBadge from "./StatusBadge";
import ImageLightbox from "./ImageLightbox";

interface Props {
  shipment: Shipment;
  products: Product[];
  onEdit: () => void;
  onDelete: () => void;
}

export default function ShipmentCard({ shipment, products, onEdit, onDelete }: Props) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const linkedProducts = products.filter((p) => p.incoming?.shipmentId === shipment.id);

  return (
    <div className="shipment-card">
      <div
        className="shipment-image"
        onClick={() => shipment.images.length > 0 && setPreviewIndex(0)}
      >
        {shipment.images.length > 0 ? (
          <img src={shipment.images[0]} alt={shipment.trackingNumber} />
        ) : (
          <div className="image-placeholder">Sin imagen</div>
        )}
        {shipment.images.length > 1 && (
          <span className="image-count-badge">+{shipment.images.length - 1}</span>
        )}
      </div>

      {previewIndex !== null && (
        <ImageLightbox
          images={shipment.images}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      )}

      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{shipment.provider}</h3>
          <StatusBadge status={shipment.status} />
        </div>

        <div className="shipment-tracking">#{shipment.trackingNumber}</div>

        {shipment.destination && (
          <div className="shipment-destination">Destino: {shipment.destination}</div>
        )}

        {shipment.notes && <p className="shipment-notes">{shipment.notes}</p>}

        {linkedProducts.length > 0 && (
          <div className="shipment-details">
            <button
              type="button"
              className="link-button"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Ocultar" : "Ver"} detalles del envío ({linkedProducts.length})
            </button>
            {showDetails && (
              <div className="shipment-details-list">
                {linkedProducts.map((p) => (
                  <div key={p.id} className="shipment-details-row">
                    <span>
                      {p.incoming?.quantity ?? 0}× {p.name}
                      {p.size ? ` (Talla ${p.size})` : ""}
                    </span>
                    {!!p.incoming?.reserved && (
                      <span className="field-hint">{p.incoming.reserved} apartada(s)</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
