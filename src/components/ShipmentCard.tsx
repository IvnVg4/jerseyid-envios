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
  const linkedVariants = products.flatMap((p) =>
    p.variants.flatMap((v) =>
      v.incoming
        .filter((b) => b.shipmentId === shipment.id)
        .map((b) => ({ product: p, size: v.size, quantity: b.quantity, reserved: b.reserved }))
    )
  );

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

        {linkedVariants.length > 0 && (
          <div className="shipment-details">
            <button
              type="button"
              className="link-button"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Ocultar" : "Ver"} detalles del envío ({linkedVariants.length})
            </button>
            {showDetails && (
              <div className="shipment-details-list">
                {linkedVariants.map(({ product, size, quantity, reserved }, i) => (
                  <div key={`${product.id}-${size}-${i}`} className="shipment-details-row">
                    <span>
                      {quantity}× {product.name}
                      {size ? ` (Talla ${size})` : ""}
                    </span>
                    {!!reserved && <span className="field-hint">{reserved} apartada(s)</span>}
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
