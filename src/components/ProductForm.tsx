import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import {
  JERSEY_SLEEVES,
  JERSEY_VERSIONS,
  MAX_IMAGES_PER_PRODUCT,
  PRODUCT_SIZES,
  PRODUCT_STOCK_STATUSES,
  PRODUCT_TYPES,
  Product,
  ProductInput,
  ProductStockStatus,
  ProductType,
  Shipment,
  SIZED_PRODUCT_TYPES
} from "../types";
import { compressImageFile } from "../utils/imageCompression";
import ImageLightbox from "./ImageLightbox";

interface Props {
  initial?: Product | null;
  shipments: Shipment[];
  onCancel: () => void;
  onSave: (input: ProductInput) => Promise<void>;
}

const EMPTY: ProductInput = {
  type: "Jersey",
  name: "",
  size: "",
  sleeve: "",
  version: "",
  personalized: false,
  patches: [],
  quantity: 1,
  stockStatus: "En stock",
  incoming: null,
  images: []
};

export default function ProductForm({ initial, shipments, onCancel, onSave }: Props) {
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [patchInput, setPatchInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (initial) {
      const { id, createdAt, updatedAt, ...rest } = initial;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  const isJersey = form.type === "Jersey";
  const needsSize = SIZED_PRODUCT_TYPES.includes(form.type);
  const incomingShipments = shipments.filter(
    (s) => s.origin === "Fábrica" && s.status !== "Entregado"
  );

  function handleStockStatusChange(stockStatus: ProductStockStatus) {
    setForm((f) => ({
      ...f,
      stockStatus,
      quantity: stockStatus === "En stock" ? f.quantity || 1 : 0,
      incoming:
        stockStatus === "En camino"
          ? f.incoming ?? { shipmentId: "", quantity: 1, reserved: 0 }
          : null
    }));
  }

  function handleTypeChange(type: ProductType) {
    setForm((f) => ({
      ...f,
      type,
      size: SIZED_PRODUCT_TYPES.includes(type) ? f.size : "",
      sleeve: type === "Jersey" ? f.sleeve : "",
      version: type === "Jersey" ? f.version : "",
      personalized: type === "Jersey" ? f.personalized : false,
      patches: type === "Jersey" ? f.patches : []
    }));
  }

  function addPatch() {
    const value = patchInput.trim();
    if (!value) return;
    setForm((f) => ({ ...f, patches: [...f.patches, value] }));
    setPatchInput("");
  }

  function handlePatchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addPatch();
    }
  }

  function removePatch(index: number) {
    setForm((f) => ({ ...f, patches: f.patches.filter((_, i) => i !== index) }));
  }

  async function handleImagesChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageBusy(true);
    try {
      const room = MAX_IMAGES_PER_PRODUCT - form.images.length;
      const toProcess = Array.from(files).slice(0, Math.max(room, 0));
      const dataUrls = await Promise.all(toProcess.map(compressImageFile));
      setForm((f) => ({ ...f, images: [...f.images, ...dataUrls] }));
    } catch {
      setError("No se pudo procesar alguna imagen.");
    } finally {
      setImageBusy(false);
    }
  }

  function removeImage(index: number) {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("El nombre / diseño es obligatorio.");
      return;
    }
    if (isJersey && (!form.sleeve || !form.version)) {
      setError("Para jerseys, elige el tipo de manga y la versión.");
      return;
    }
    if (needsSize && !form.size) {
      setError("Elige una talla.");
      return;
    }
    if (form.stockStatus === "En stock" && form.quantity < 1) {
      setError("Indica cuántas piezas hay en stock.");
      return;
    }
    if (form.stockStatus === "En camino") {
      if (!form.incoming?.shipmentId) {
        setError("Elige en qué envío vienen las piezas.");
        return;
      }
      if (!form.incoming.quantity || form.incoming.quantity < 1) {
        setError("Indica cuántas piezas vienen en camino.");
        return;
      }
      if (form.incoming.reserved > form.incoming.quantity) {
        setError(
          "Ya hay pedidos apartando más piezas de las que estás dejando en este lote."
        );
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      setError("No se pudo guardar el producto. Revisa tu conexión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <form
        className="modal-card"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>{initial ? "Editar producto" : "Nuevo producto"}</h2>

        <div className="image-picker">
          <div className="image-thumbs">
            {form.images.map((src, i) => (
              <div key={i} className="image-thumb">
                <img
                  src={src}
                  alt={`Imagen ${i + 1}`}
                  onClick={() => setPreviewIndex(i)}
                />
                <button
                  type="button"
                  className="thumb-remove"
                  onClick={() => removeImage(i)}
                  title="Quitar esta imagen"
                >
                  ×
                </button>
              </div>
            ))}
            {form.images.length === 0 && (
              <div className="image-placeholder">Sin imágenes</div>
            )}
          </div>
          {form.images.length < MAX_IMAGES_PER_PRODUCT && (
            <label className="file-button">
              {imageBusy ? "Procesando..." : "Agregar imagen(es)"}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={imageBusy}
                onChange={(e) => handleImagesChange(e.target.files)}
              />
            </label>
          )}
          <span className="image-count-hint">
            {form.images.length}/{MAX_IMAGES_PER_PRODUCT} fotos · haz clic en una para verla en grande
          </span>
        </div>

        <label>
          Tipo de producto *
          <select
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value as ProductType)}
          >
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nombre / diseño *
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej. Real Madrid Local 23/24"
            required
          />
        </label>

        {isJersey && (
          <>
            <label>
              Manga *
              <select
                value={form.sleeve}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sleeve: e.target.value as typeof f.sleeve }))
                }
                required
              >
                <option value="" disabled>
                  Selecciona...
                </option>
                {JERSEY_SLEEVES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Versión *
              <select
                value={form.version}
                onChange={(e) =>
                  setForm((f) => ({ ...f, version: e.target.value as typeof f.version }))
                }
                required
              >
                <option value="" disabled>
                  Selecciona...
                </option>
                {JERSEY_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.personalized}
                onChange={(e) =>
                  setForm((f) => ({ ...f, personalized: e.target.checked }))
                }
              />
              Personalizado (nombre/número)
            </label>

            <label>
              Parches
              <div className="tag-input-row">
                <input
                  value={patchInput}
                  onChange={(e) => setPatchInput(e.target.value)}
                  onKeyDown={handlePatchKeyDown}
                  placeholder="Ej. Champions League"
                />
                <button type="button" className="secondary" onClick={addPatch}>
                  Agregar
                </button>
              </div>
              {form.patches.length > 0 && (
                <div className="tag-list">
                  {form.patches.map((patch, i) => (
                    <span key={i} className="tag-chip">
                      {patch}
                      <button
                        type="button"
                        onClick={() => removePatch(i)}
                        title="Quitar parche"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </label>
          </>
        )}

        {needsSize && (
          <label>
            Talla *
            <select
              value={form.size}
              onChange={(e) =>
                setForm((f) => ({ ...f, size: e.target.value as typeof f.size }))
              }
              required
            >
              <option value="" disabled>
                Selecciona...
              </option>
              {PRODUCT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Estado de stock *
          <select
            value={form.stockStatus}
            onChange={(e) => handleStockStatusChange(e.target.value as ProductStockStatus)}
          >
            {PRODUCT_STOCK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {form.stockStatus === "En stock" && (
          <label>
            Cantidad en stock *
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
              required
            />
          </label>
        )}

        {form.stockStatus === "En camino" && (
          <>
            <label>
              Envío *
              <select
                value={form.incoming?.shipmentId ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    incoming: {
                      shipmentId: e.target.value,
                      quantity: f.incoming?.quantity ?? 1,
                      reserved: f.incoming?.reserved ?? 0
                    }
                  }))
                }
                required
              >
                <option value="" disabled>
                  Selecciona un envío...
                </option>
                {incomingShipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.provider} · #{s.trackingNumber}
                  </option>
                ))}
              </select>
              {incomingShipments.length === 0 && (
                <span className="field-hint">
                  No hay envíos de fábrica pendientes. Crea uno primero en la pestaña Envíos.
                </span>
              )}
            </label>

            <label>
              Cuántas piezas vienen *
              <input
                type="number"
                min={1}
                value={form.incoming?.quantity ?? 1}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    incoming: {
                      shipmentId: f.incoming?.shipmentId ?? "",
                      quantity: Number(e.target.value),
                      reserved: f.incoming?.reserved ?? 0
                    }
                  }))
                }
                required
              />
              {!!form.incoming?.reserved && (
                <span className="field-hint">
                  {form.incoming.reserved} de esas piezas ya están apartadas por pedidos.
                </span>
              )}
            </label>
          </>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={saving || imageBusy}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>

      {previewIndex !== null && (
        <ImageLightbox
          images={form.images}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      )}
    </div>
  );
}
