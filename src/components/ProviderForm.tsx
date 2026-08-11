import { FormEvent, useEffect, useState } from "react";
import {
  Category,
  JERSEY_SLEEVES,
  JERSEY_VERSIONS,
  JerseySleeve,
  JerseyVersion,
  Provider,
  ProviderInput,
  ProviderPriceEntry
} from "../types";

interface Props {
  initial?: Provider | null;
  categories: Category[];
  onCancel: () => void;
  onSave: (input: ProviderInput) => Promise<void>;
}

const EMPTY: ProviderInput = { name: "", prices: [] };

export default function ProviderForm({ initial, categories, onCancel, onSave }: Props) {
  const [form, setForm] = useState<ProviderInput>(EMPTY);
  const [priceCategory, setPriceCategory] = useState("");
  const [priceSleeve, setPriceSleeve] = useState<JerseySleeve | "">("");
  const [priceVersion, setPriceVersion] = useState<JerseyVersion | "">("");
  const [priceCost, setPriceCost] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      const { id, createdAt, updatedAt, ...rest } = initial;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  const categoryOptions = [...new Set(categories.map((c) => c.name))].sort((a, b) =>
    a.localeCompare(b)
  );
  const priceCategoryIsJersey = categories.find((c) => c.name === priceCategory)?.isJerseyLike ?? false;

  function addPrice() {
    setError(null);
    if (!priceCategory) {
      setError("Elige una categoría para el precio.");
      return;
    }
    if (priceCategoryIsJersey && (!priceSleeve || !priceVersion)) {
      setError("Elige manga y versión para esa categoría.");
      return;
    }
    if (!priceCost || priceCost <= 0) {
      setError("Indica el costo.");
      return;
    }
    const sleeve = priceCategoryIsJersey ? priceSleeve : "";
    const version = priceCategoryIsJersey ? priceVersion : "";
    const exists = form.prices.some(
      (p) => p.categoryName === priceCategory && p.sleeve === sleeve && p.version === version
    );
    if (exists) {
      setError("Ya hay un precio para esa combinación. Quítalo primero si quieres cambiarlo.");
      return;
    }
    const entry: ProviderPriceEntry = { categoryName: priceCategory, sleeve, version, cost: priceCost };
    setForm((f) => ({ ...f, prices: [...f.prices, entry] }));
    setPriceCategory("");
    setPriceSleeve("");
    setPriceVersion("");
    setPriceCost(0);
  }

  function removePrice(index: number) {
    setForm((f) => ({ ...f, prices: f.prices.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("El nombre del proveedor es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      setError("No se pudo guardar el proveedor. Revisa tu conexión.");
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
        <h2>{initial ? "Editar proveedor" : "Nuevo proveedor"}</h2>

        <label>
          Nombre *
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej. Proveedor Hu"
            required
          />
        </label>

        <div className="form-field">
          <span className="form-field-title">Precios por tipo de producto</span>
          {form.prices.length > 0 && (
            <div className="provider-price-list">
              {form.prices.map((p, i) => (
                <div key={i} className="provider-price-row">
                  <span>
                    {[p.categoryName, p.sleeve, p.version].filter(Boolean).join(" · ")}
                  </span>
                  <span className="provider-price-cost">${p.cost.toLocaleString("es-MX")}</span>
                  <button
                    type="button"
                    className="thumb-remove"
                    onClick={() => removePrice(i)}
                    title="Quitar precio"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="provider-price-add">
            <select value={priceCategory} onChange={(e) => setPriceCategory(e.target.value)}>
              <option value="">Categoría...</option>
              {categoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {priceCategoryIsJersey && (
              <>
                <select
                  value={priceSleeve}
                  onChange={(e) => setPriceSleeve(e.target.value as JerseySleeve | "")}
                >
                  <option value="">Manga...</option>
                  {JERSEY_SLEEVES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={priceVersion}
                  onChange={(e) => setPriceVersion(e.target.value as JerseyVersion | "")}
                >
                  <option value="">Versión...</option>
                  {JERSEY_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </>
            )}
            <input
              type="number"
              min={0}
              step="0.01"
              className="line-price-input"
              title="Costo"
              placeholder="Costo"
              value={priceCost || ""}
              onChange={(e) => setPriceCost(Number(e.target.value))}
            />
            <button type="button" className="secondary" onClick={addPrice}>
              Agregar
            </button>
          </div>
          <span className="field-hint">
            Un precio por categoría (y, si es jersey, por manga/versión). Se usa para calcular el
            costo y la ganancia en Ventas.
          </span>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
