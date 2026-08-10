import { FormEvent, useEffect, useState } from "react";
import {
  MAX_IMAGES_PER_SHIPMENT,
  SHIPMENT_STATUSES,
  Shipment,
  ShipmentInput,
  ShipmentStatus
} from "../types";
import { compressImageFile } from "../utils/imageCompression";

interface Props {
  initial?: Shipment | null;
  onCancel: () => void;
  onSave: (input: ShipmentInput) => Promise<void>;
}

const EMPTY: ShipmentInput = {
  provider: "",
  trackingNumber: "",
  trackingLink: "",
  destination: "",
  status: "Pendiente de envío",
  notes: "",
  images: []
};

export default function ShipmentForm({ initial, onCancel, onSave }: Props) {
  const [form, setForm] = useState<ShipmentInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      const { id, createdAt, updatedAt, ...rest } = initial;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  async function handleImagesChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageBusy(true);
    try {
      const room = MAX_IMAGES_PER_SHIPMENT - form.images.length;
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
    if (!form.provider.trim() || !form.trackingNumber.trim()) {
      setError("Proveedor y número de seguimiento son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      setError("No se pudo guardar el envío. Revisa tu conexión.");
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
        <h2>{initial ? "Editar envío" : "Nuevo envío"}</h2>

        <div className="image-picker">
          <div className="image-thumbs">
            {form.images.map((src, i) => (
              <div key={i} className="image-thumb">
                <img src={src} alt={`Imagen ${i + 1}`} />
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
          {form.images.length < MAX_IMAGES_PER_SHIPMENT && (
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
            {form.images.length}/{MAX_IMAGES_PER_SHIPMENT} imágenes · la primera es la que se ve en la lista
          </span>
        </div>

        <label>
          Proveedor *
          <input
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            placeholder="Ej. Envíos Rápidos SA"
            required
          />
        </label>

        <label>
          Número de seguimiento *
          <input
            value={form.trackingNumber}
            onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))}
            placeholder="Ej. 1Z999AA10123456784"
            required
          />
        </label>

        <label>
          Link de rastreo
          <input
            type="url"
            value={form.trackingLink}
            onChange={(e) => setForm((f) => ({ ...f, trackingLink: e.target.value }))}
            placeholder="https://..."
          />
        </label>

        <label>
          Destino
          <input
            value={form.destination}
            onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
            placeholder="Ej. Caracas, Venezuela"
          />
        </label>

        <label>
          Estado
          <select
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({ ...f, status: e.target.value as ShipmentStatus }))
            }
          >
            {SHIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Detalles adicionales, cliente, etc."
          />
        </label>

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
    </div>
  );
}
