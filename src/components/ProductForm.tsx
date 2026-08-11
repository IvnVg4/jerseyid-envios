import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import {
  Category,
  JERSEY_SLEEVES,
  JERSEY_VERSIONS,
  MAX_IMAGES_PER_PRODUCT,
  PersonalizedUnit,
  PRODUCT_SIZES,
  PRODUCT_STOCK_STATUSES,
  Product,
  ProductInput,
  ProductSize,
  ProductStockStatus,
  ProductVariant,
  Provider,
  Shipment
} from "../types";
import { compressImageFile } from "../utils/imageCompression";
import ImageLightbox from "./ImageLightbox";

interface Props {
  initial?: Product | null;
  categories: Category[];
  shipments: Shipment[];
  providers: Provider[];
  onCancel: () => void;
  onSave: (input: ProductInput) => Promise<void>;
}

type FormState = Omit<ProductInput, "variants" | "personalizedUnits">;

const EMPTY_FORM: FormState = {
  type: "",
  name: "",
  sleeve: "",
  version: "",
  personalized: false,
  patches: [],
  images: [],
  price: 0,
  providerId: ""
};

function emptyVariant(size: ProductSize | ""): ProductVariant {
  return { size, stockStatus: "En stock", quantity: 1, incoming: null };
}

export default function ProductForm({
  initial,
  categories,
  shipments,
  providers,
  onCancel,
  onSave
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [personalizedUnits, setPersonalizedUnits] = useState<PersonalizedUnit[]>([]);
  const [puSize, setPuSize] = useState<ProductSize | "">("");
  const [puName, setPuName] = useState("");
  const [puNumber, setPuNumber] = useState("");
  const [puQty, setPuQty] = useState(1);
  const [patchInput, setPatchInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (initial) {
      const { id, createdAt, updatedAt, variants: v, personalizedUnits: pu, ...rest } = initial;
      setForm(rest);
      setVariants(v);
      setPersonalizedUnits(pu);
    } else {
      setForm(EMPTY_FORM);
      setVariants([]);
      setPersonalizedUnits([]);
    }
  }, [initial]);

  const parentCategories = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

  const selectedCategory = categories.find((c) => c.name === form.type);
  const isJersey = selectedCategory?.isJerseyLike ?? false;
  const needsSize = selectedCategory?.usesSizes ?? false;
  const incomingShipments = shipments.filter(
    (s) => s.origin === "Fábrica" && s.status !== "Entregado"
  );

  function handleTypeChange(typeName: string) {
    const category = categories.find((c) => c.name === typeName);
    const nextIsJersey = category?.isJerseyLike ?? false;
    const nextNeedsSize = category?.usesSizes ?? false;
    setForm((f) => ({
      ...f,
      type: typeName,
      sleeve: nextIsJersey ? f.sleeve : "",
      version: nextIsJersey ? f.version : "",
      personalized: nextIsJersey ? f.personalized : false,
      patches: nextIsJersey ? f.patches : []
    }));
    if (!nextNeedsSize) {
      const totalQuantity = variants.reduce(
        (sum, v) => sum + (v.stockStatus === "En stock" ? v.quantity : 0),
        0
      );
      setVariants([
        {
          size: "",
          stockStatus: totalQuantity > 0 ? "En stock" : "Agotado",
          quantity: totalQuantity || 1,
          incoming: null
        }
      ]);
      setPersonalizedUnits([]);
    } else if (variants.some((v) => v.size === "")) {
      setVariants([]);
    }
  }

  function toggleSize(size: ProductSize) {
    setVariants((vs) =>
      vs.some((v) => v.size === size) ? vs.filter((v) => v.size !== size) : [...vs, emptyVariant(size)]
    );
  }

  function updateVariant(index: number, patch: Partial<ProductVariant>) {
    setVariants((vs) => vs.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function setVariantStockStatus(index: number, stockStatus: ProductStockStatus) {
    setVariants((vs) =>
      vs.map((v, i) => {
        if (i !== index) return v;
        return {
          ...v,
          stockStatus,
          quantity: stockStatus === "En stock" ? v.quantity || 1 : 0,
          incoming:
            stockStatus === "En camino" ? v.incoming ?? { shipmentId: "", quantity: 1, reserved: 0 } : null
        };
      })
    );
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

  function addPersonalizedUnit() {
    setError(null);
    if (!puName.trim() && !puNumber.trim()) {
      setError("Indica al menos el nombre o el número de la pieza personalizada.");
      return;
    }
    if (needsSize && !puSize) {
      setError("Elige la talla de la pieza personalizada.");
      return;
    }
    if (puQty < 1) {
      setError("La cantidad de la pieza personalizada debe ser al menos 1.");
      return;
    }
    const size = needsSize ? puSize : "";
    setPersonalizedUnits((units) => [
      ...units,
      {
        id: crypto.randomUUID(),
        size,
        customName: puName.trim(),
        customNumber: puNumber.trim(),
        quantity: puQty
      }
    ]);
    setVariants((vs) => {
      const idx = vs.findIndex((v) => v.size === size);
      if (idx === -1) return [...vs, { size, stockStatus: "En stock", quantity: puQty, incoming: null }];
      return vs.map((v, i) =>
        i === idx ? { ...v, quantity: v.quantity + puQty, stockStatus: "En stock" } : v
      );
    });
    setPuSize("");
    setPuName("");
    setPuNumber("");
    setPuQty(1);
  }

  function removePersonalizedUnit(id: string) {
    setPersonalizedUnits((units) => units.filter((u) => u.id !== id));
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
    if (!form.type) {
      setError("Elige una categoría.");
      return;
    }
    if (!form.name.trim()) {
      setError("El nombre / diseño es obligatorio.");
      return;
    }
    if (isJersey && (!form.sleeve || !form.version)) {
      setError("Para jerseys, elige el tipo de manga y la versión.");
      return;
    }
    if (!form.price || form.price <= 0) {
      setError("Indica el precio de venta.");
      return;
    }
    if (needsSize && variants.length === 0) {
      setError("Elige al menos una talla.");
      return;
    }
    for (const v of variants) {
      const label = v.size ? ` (talla ${v.size})` : "";
      if (v.stockStatus === "En stock" && v.quantity < 1) {
        setError(`Indica cuántas piezas hay en stock${label}.`);
        return;
      }
      if (v.stockStatus === "En camino") {
        if (!v.incoming?.shipmentId) {
          setError(`Elige en qué envío vienen las piezas${label}.`);
          return;
        }
        if (!v.incoming.quantity || v.incoming.quantity < 1) {
          setError(`Indica cuántas piezas vienen en camino${label}.`);
          return;
        }
        if (v.incoming.reserved > v.incoming.quantity) {
          setError(`Ya hay pedidos apartando más piezas de las que estás dejando en el lote${label}.`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const input: ProductInput = { ...form, variants, personalizedUnits };
      await onSave(input);
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
          Categoría *
          <select value={form.type} onChange={(e) => handleTypeChange(e.target.value)} required>
            <option value="" disabled>
              Selecciona...
            </option>
            {parentCategories.map((parent) => {
              const children = childrenOf(parent.id);
              if (children.length === 0) {
                return (
                  <option key={parent.id} value={parent.name}>
                    {parent.name}
                  </option>
                );
              }
              return (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.name}>{parent.name} (general)</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.name}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {parentCategories.length === 0 && (
            <span className="field-hint">
              No hay categorías todavía. Crea una en la pestaña "Categorías".
            </span>
          )}
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

        <label>
          Precio de venta *
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            required
          />
        </label>

        <label>
          Proveedor
          <select
            value={form.providerId}
            onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
          >
            <option value="">Sin proveedor</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="field-hint">Se usa para calcular el costo y la ganancia en Ventas.</span>
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

        {needsSize ? (
          <div className="form-field">
            <span className="form-field-title">Tallas y existencias *</span>
            <div className="variant-grid">
              {PRODUCT_SIZES.map((size) => {
                const idx = variants.findIndex((v) => v.size === size);
                const variant = idx !== -1 ? variants[idx] : null;
                return (
                  <div key={size} className={variant ? "variant-row variant-row-active" : "variant-row"}>
                    <label className="variant-size-check">
                      <input type="checkbox" checked={!!variant} onChange={() => toggleSize(size)} />
                      {size}
                    </label>
                    {variant && (
                      <div className="variant-fields">
                        <select
                          value={variant.stockStatus}
                          onChange={(e) => setVariantStockStatus(idx, e.target.value as ProductStockStatus)}
                        >
                          {PRODUCT_STOCK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {variant.stockStatus === "En stock" && (
                          <input
                            type="number"
                            min={1}
                            className="line-qty-input"
                            title="Cantidad en stock"
                            value={variant.quantity}
                            onChange={(e) => updateVariant(idx, { quantity: Number(e.target.value) })}
                          />
                        )}
                        {variant.stockStatus === "En camino" && (
                          <>
                            <select
                              value={variant.incoming?.shipmentId ?? ""}
                              onChange={(e) =>
                                updateVariant(idx, {
                                  incoming: {
                                    shipmentId: e.target.value,
                                    quantity: variant.incoming?.quantity ?? 1,
                                    reserved: variant.incoming?.reserved ?? 0
                                  }
                                })
                              }
                            >
                              <option value="" disabled>
                                Envío...
                              </option>
                              {incomingShipments.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.provider} · #{s.trackingNumber}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              className="line-qty-input"
                              title="Piezas en camino"
                              value={variant.incoming?.quantity ?? 1}
                              onChange={(e) =>
                                updateVariant(idx, {
                                  incoming: {
                                    shipmentId: variant.incoming?.shipmentId ?? "",
                                    quantity: Number(e.target.value),
                                    reserved: variant.incoming?.reserved ?? 0
                                  }
                                })
                              }
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {incomingShipments.length === 0 && variants.some((v) => v.stockStatus === "En camino") && (
              <span className="field-hint">
                No hay envíos de fábrica pendientes. Crea uno primero en la pestaña Envíos.
              </span>
            )}
            <span className="field-hint">
              Marca las tallas que tiene este diseño; todas quedan en el mismo producto.
            </span>
          </div>
        ) : (
          variants[0] && (
            <>
              <label>
                Estado de stock *
                <select
                  value={variants[0].stockStatus}
                  onChange={(e) => setVariantStockStatus(0, e.target.value as ProductStockStatus)}
                >
                  {PRODUCT_STOCK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {variants[0].stockStatus === "En stock" && (
                <label>
                  Cantidad en stock *
                  <input
                    type="number"
                    min={1}
                    value={variants[0].quantity}
                    onChange={(e) => updateVariant(0, { quantity: Number(e.target.value) })}
                    required
                  />
                </label>
              )}

              {variants[0].stockStatus === "En camino" && (
                <>
                  <label>
                    Envío *
                    <select
                      value={variants[0].incoming?.shipmentId ?? ""}
                      onChange={(e) =>
                        updateVariant(0, {
                          incoming: {
                            shipmentId: e.target.value,
                            quantity: variants[0].incoming?.quantity ?? 1,
                            reserved: variants[0].incoming?.reserved ?? 0
                          }
                        })
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
                      value={variants[0].incoming?.quantity ?? 1}
                      onChange={(e) =>
                        updateVariant(0, {
                          incoming: {
                            shipmentId: variants[0].incoming?.shipmentId ?? "",
                            quantity: Number(e.target.value),
                            reserved: variants[0].incoming?.reserved ?? 0
                          }
                        })
                      }
                      required
                    />
                    {!!variants[0].incoming?.reserved && (
                      <span className="field-hint">
                        {variants[0].incoming.reserved} de esas piezas ya están apartadas por pedidos.
                      </span>
                    )}
                  </label>
                </>
              )}
            </>
          )
        )}

        {initial && isJersey && form.personalized && (
          <div className="form-field">
            <span className="form-field-title">Piezas ya personalizadas</span>
            <span className="field-hint">
              Para piezas que llegaron con nombre/número ya estampado (mismo diseño, no es un
              producto aparte). Se suman a la cantidad de esa talla.
            </span>
            {personalizedUnits.length > 0 && (
              <div className="personalized-unit-list">
                {personalizedUnits.map((u) => (
                  <div key={u.id} className="personalized-unit-row">
                    <span>
                      {u.quantity}× {[u.customName, u.customNumber].filter(Boolean).join(" · ")}
                      {u.size ? ` (Talla ${u.size})` : ""}
                    </span>
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={() => removePersonalizedUnit(u.id)}
                      title="Quitar etiqueta (no ajusta la cantidad)"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="tag-input-row personalized-unit-add">
              {needsSize && (
                <select value={puSize} onChange={(e) => setPuSize(e.target.value as ProductSize | "")}>
                  <option value="" disabled>
                    Talla...
                  </option>
                  {PRODUCT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <input value={puName} onChange={(e) => setPuName(e.target.value)} placeholder="Nombre" />
              <input value={puNumber} onChange={(e) => setPuNumber(e.target.value)} placeholder="Número" />
              <input
                type="number"
                min={1}
                className="line-qty-input"
                value={puQty}
                onChange={(e) => setPuQty(Number(e.target.value))}
              />
              <button type="button" className="secondary" onClick={addPersonalizedUnit}>
                Agregar
              </button>
            </div>
          </div>
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
