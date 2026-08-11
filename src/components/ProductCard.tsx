import { useState } from "react";
import type { Product, Shipment } from "../types";
import ImageLightbox from "./ImageLightbox";

interface Props {
  product: Product;
  shipments: Shipment[];
  onEdit: () => void;
  onDelete: () => void;
}

const STOCK_STATUS_CLASS: Record<Product["stockStatus"], string> = {
  Agotado: "stock-empty",
  "En camino": "stock-pending",
  "En stock": "stock-ok"
};

export default function ProductCard({ product, shipments, onEdit, onDelete }: Props) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const hasJerseyAttrs = Boolean(
    product.sleeve || product.version || product.personalized || product.patches.length > 0
  );
  const incomingShipment = product.incoming
    ? shipments.find((s) => s.id === product.incoming?.shipmentId)
    : undefined;

  return (
    <div className="product-card">
      <div
        className="shipment-image"
        onClick={() => product.images.length > 0 && setPreviewIndex(0)}
      >
        {product.images.length > 0 ? (
          <img src={product.images[0]} alt={product.name} />
        ) : (
          <div className="image-placeholder">Sin imagen</div>
        )}
        {product.images.length > 1 && (
          <span className="image-count-badge">+{product.images.length - 1}</span>
        )}
        <span className={`stock-badge ${STOCK_STATUS_CLASS[product.stockStatus]}`}>
          {product.stockStatus === "En stock" && `${product.quantity} en stock`}
          {product.stockStatus === "Agotado" && "Agotado"}
          {product.stockStatus === "En camino" &&
            `En camino · ${product.incoming?.quantity ?? 0} pzs${
              incomingShipment ? ` · #${incomingShipment.trackingNumber}` : ""
            }`}
        </span>
      </div>

      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{product.name}</h3>
          <span className="type-badge">{product.type}</span>
        </div>

        <div className="product-price">${product.price.toLocaleString("es-MX")}</div>

        <div className="product-attrs">
          {product.sleeve && <span className="attr-chip">{product.sleeve}</span>}
          {product.version && <span className="attr-chip">{product.version}</span>}
          {product.size && <span className="attr-chip">Talla {product.size}</span>}
          {product.personalized && <span className="attr-chip">Personalizado</span>}
        </div>

        {hasJerseyAttrs && product.patches.length > 0 && (
          <div className="tag-list">
            {product.patches.map((patch, i) => (
              <span key={i} className="tag-chip tag-chip-static">
                {patch}
              </span>
            ))}
          </div>
        )}

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

      {previewIndex !== null && (
        <ImageLightbox
          images={product.images}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      )}
    </div>
  );
}
