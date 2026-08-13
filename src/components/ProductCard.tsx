import { useState } from "react";
import type { Category, Product, Shipment } from "../types";
import { summarizeVariant } from "../services/inventory";
import ImageLightbox from "./ImageLightbox";

interface Props {
  product: Product;
  categories: Category[];
  shipments: Shipment[];
  onEdit: () => void;
  onDelete: () => void;
}

export default function ProductCard({ product, categories, shipments, onEdit, onDelete }: Props) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "Sin categoría";
  const hasJerseyAttrs = Boolean(
    product.sleeve || product.version || product.personalized || product.patches.length > 0
  );

  const summaries = product.variants.map((v) => ({ variant: v, summary: summarizeVariant(v) }));
  const totalInStock = summaries.reduce((sum, s) => sum + s.summary.inStock, 0);
  const totalIncoming = summaries.reduce(
    (sum, s) => sum + s.summary.inFactory + s.summary.inTransit,
    0
  );

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
          <span className="type-badge">{categoryName}</span>
        </div>

        <div className="product-price">${product.price.toLocaleString("es-MX")}</div>

        <div className="product-attrs">
          {product.sleeve && <span className="attr-chip">{product.sleeve}</span>}
          {product.version && <span className="attr-chip">{product.version}</span>}
          {product.personalized && <span className="attr-chip">Personalizado</span>}
        </div>

        {showBreakdown && (
          <div className="variant-breakdown">
            {summaries.map(({ variant: v, summary }, i) => {
              const empty = summary.inStock === 0 && summary.inFactory === 0 && summary.inTransit === 0;
              const statusClass = summary.inStock > 0 ? "stock-ok" : empty ? "stock-empty" : "stock-pending";
              const parts: string[] = [];
              if (summary.inStock > 0) parts.push(`${summary.inStock} en stock`);
              if (summary.inFactory > 0) parts.push(`${summary.inFactory} en fábrica`);
              if (summary.inTransit > 0) {
                const trackingNumbers = v.incoming
                  .filter((b) => b.shipmentId)
                  .map((b) => shipments.find((s) => s.id === b.shipmentId)?.trackingNumber)
                  .filter(Boolean);
                parts.push(
                  `${summary.inTransit} en camino${trackingNumbers.length ? ` · #${trackingNumbers.join(", #")}` : ""}`
                );
              }
              return (
                <span key={i} className={`variant-chip ${statusClass}`}>
                  {v.size || "Único"}: {empty ? "Agotado" : parts.join(" + ")}
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
