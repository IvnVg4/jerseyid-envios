import { useState } from "react";
import type { Product, Shipment } from "../types";
import ImageLightbox from "./ImageLightbox";

interface Props {
  product: Product;
  shipments: Shipment[];
  onEdit: () => void;
  onDelete: () => void;
}

const VARIANT_STATUS_CLASS: Record<Product["variants"][number]["stockStatus"], string> = {
  Agotado: "stock-empty",
  "En camino": "stock-pending",
  "En stock": "stock-ok"
};

export default function ProductCard({ product, shipments, onEdit, onDelete }: Props) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const hasJerseyAttrs = Boolean(
    product.sleeve || product.version || product.personalized || product.patches.length > 0
  );

  const totalInStock = product.variants
    .filter((v) => v.stockStatus === "En stock")
    .reduce((sum, v) => sum + v.quantity, 0);
  const totalIncoming = product.variants
    .filter((v) => v.stockStatus === "En camino")
    .reduce((sum, v) => sum + (v.incoming?.quantity ?? 0), 0);

  const showBreakdown = product.variants.length > 1;

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
        {totalInStock > 0 ? (
          <span className="stock-badge stock-ok">{totalInStock} en stock</span>
        ) : totalIncoming > 0 ? (
          <span className="stock-badge stock-pending">En camino · {totalIncoming} pzs</span>
        ) : (
          <span className="stock-badge stock-empty">Agotado</span>
        )}
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
          {product.personalized && <span className="attr-chip">Personalizado</span>}
        </div>

        {showBreakdown && (
          <div className="variant-breakdown">
            {product.variants.map((v, i) => {
              const incomingShipment = v.incoming
                ? shipments.find((s) => s.id === v.incoming?.shipmentId)
                : undefined;
              return (
                <span key={i} className={`variant-chip ${VARIANT_STATUS_CLASS[v.stockStatus]}`}>
                  {v.size || "Único"}:{" "}
                  {v.stockStatus === "En stock" && `${v.quantity}`}
                  {v.stockStatus === "Agotado" && "Agotado"}
                  {v.stockStatus === "En camino" &&
                    `en camino ×${v.incoming?.quantity ?? 0}${
                      incomingShipment ? ` · #${incomingShipment.trackingNumber}` : ""
                    }`}
                </span>
              );
            })}
          </div>
        )}

        {product.personalizedUnits.length > 0 && (
          <div className="tag-list">
            {product.personalizedUnits.map((u) => (
              <span key={u.id} className="tag-chip tag-chip-static personalized-chip">
                {u.quantity}× {[u.customName, u.customNumber].filter(Boolean).join(" · ")}
                {u.size ? ` (${u.size})` : ""}
              </span>
            ))}
          </div>
        )}

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
