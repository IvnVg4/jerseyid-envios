import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import {
  Category,
  IncomingBatch,
  JERSEY_SLEEVES,
  JERSEY_VERSIONS,
  MAX_IMAGES_PER_PRODUCT,
  PersonalizedUnit,
  PRODUCT_SIZES,
  Product,
  ProductInput,
  ProductSize,
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
  categoryId: "",
  name: "",
  sleeve: "",
  version: "",
  personalized: false,
  patches: [],
  images: [],
  price: 0,
  providerId: ""
};

/** Un lote agregado a mano desde Inventario siempre es restock general
 * ("Stock", sin envío) — las piezas ya apartadas para un cliente ("Pedido") se
 * originan desde un Pedido a proveedor o desde el pedido del cliente mismo, no
 * se capturan aquí, para no mezclar. */
function emptyBatch(): IncomingBatch {
  return {
    id: crypto.randomUUID(),
    quantity: 1,
    reserved: 0,
    purchaseOrderId: null,
    shipmentId: null,
    purpose: "Stock",
    linkedOrderId: null
  };
}

/** Al activar una talla nueva sin decir nada más, se asume que se pidió al
 * proveedor pero todavía no hay tracking — un lote "En fábrica" por default,
 * en vez de dejarla simplemente vacía. */
function emptyVariant(size: ProductSize | ""): ProductVariant {
  return { size, quantity: 0, incoming: [emptyBatch()] };
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
  const [showManualProvider, setShowManualProvider] = useState(false);
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
    setShowManualProvider(false);
  }, [initial]);

  // Reafirma el proveedor cada vez que se abre el formulario o cambian los
  // envíos: si algún lote enlazado como "En camino" cambió de proveedor después
  // de haberlo enlazado aquí (ej. se corrigió en la pestaña Envíos), esto lo
  // pone al día sin tener que volver a tocar el selector de envío.
  useEffect(() => {
    let resolved: string | undefined;
    for (const v of variants) {
      for (const b of v.incoming) {
        if (!b.shipmentId) continue;
        const shipment = shipments.find((s) => s.id === b.shipmentId);
        if (shipment?.providerId) resolved = shipment.providerId;
      }
    }
    if (resolved && resolved !== form.providerId) {
      setForm((f) => ({ ...f, providerId: resolved! }));
    }
  }, [variants, shipments]);

  const parentCategories = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const isJersey = selectedCategory?.isJerseyLike ?? false;
  const needsSize = selectedCategory?.usesSizes ?? false;

  function handleCategoryChange(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    const nextIsJersey = category?.isJerseyLike ?? false;
    const nextNeedsSize = category?.usesSizes ?? false;
    setForm((f) => ({
      ...f,
      categoryId,
      sleeve: nextIsJersey ? f.sleeve : "",
      version: nextIsJersey ? f.version : "",
      personalized: nextIsJersey ? f.personalized : false,
      patches: nextIsJersey ? f.patches : []
    }));
    if (!nextNeedsSize) {
      const totalQuantity = variants.reduce((sum, v) => sum + v.quantity, 0);
      setVariants([{ size: "", quantity: totalQuantity, incoming: totalQuantity > 0 ? [] : [emptyBatch()] }]);
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

  function setVariantQuantity(index: number, quantity: number) {
    setVariants((vs) => vs.map((v, i) => (i === index ? { ...v, quantity } : v)));
  }

  function addBatch(index: number) {
    setVariants((vs) => vs.map((v, i) => (i === index ? { ...v, incoming: [...v.incoming, emptyBatch()] } : v)));
  }

  function updateBatch(index: number, batchId: string, patch: Partial<IncomingBatch>) {
    setVariants((vs) =>
      vs.map((v, i) =>
        i !== index
          ? v
          : { ...v, incoming: v.incoming.map((b) => (b.id === batchId ? { ...b, ...patch } : b)) }
      )
    );
  }

  function removeBatch(index: number, batchId: string) {
    setVariants((vs) =>
      vs.map((v, i) => (i !== index ? v : { ...v, incoming: v.incoming.filter((b) => b.id !== batchId) }))
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
      if (idx === -1) return [...vs, { size, quantity: puQty, incoming: [] }];
      return vs.map((v, i) => (i === idx ? { ...v, quantity: v.quantity + puQty } : v));
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
    if (!form.categoryId) {
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
      if (v.quantity < 0) {
        setError(`La cantidad en stock${label} no puede ser negativa.`);
        return;
      }
      const total = v.quantity + v.incoming.reduce((sum, b) => sum + b.quantity, 0);
      if (total <= 0) {
        setError(`Indica cuántas piezas hay (en stock o en camino)${label}.`);
        return;
      }
      for (const b of v.incoming) {
        if (!b.quantity || b.quantity < 1) {
          setError(`Indica cuántas piezas vienen en un lote en camino${label}.`);
          return;
        }
        if (b.reserved > b.quantity) {
          setError(`Ya hay pedidos apartando más piezas de las que estás dejando en un lote${label}.`);
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

  /** El envío de un lote ya no se elige aquí (rule: "ya no mezclar") — se
   * asigna desde el Pedido a proveedor si es "Stock", o desde el Pedido del
   * cliente si es "Pedido"; aquí solo se ve el estado resultante. */
  function batchStatusLabel(batch: IncomingBatch): string {
    if (batch.purpose === "Pedido") return "Apartado para un pedido";
    const shipment = shipments.find((s) => s.id === batch.shipmentId);
    return batch.shipmentId ? `En camino${shipment ? ` · #${shipment.trackingNumber}` : ""}` : "En fábrica";
  }

  function renderBatchRow(variantIndex: number, batch: IncomingBatch) {
    return (
      <div key={batch.id} className="incoming-batch-row">
        <input
          type="number"
          min={1}
          className="line-qty-input"
          title="Piezas en este lote"
          value={batch.quantity}
          onChange={(e) => updateBatch(variantIndex, batch.id, { quantity: Number(e.target.value) })}
        />
        <span className="field-hint">{batchStatusLabel(batch)}</span>
        {!!batch.reserved && (
          <span className="field-hint">{batch.reserved} ya apartadas</span>
        )}
        <button
          type="button"
          className="thumb-remove"
          onClick={() => removeBatch(variantIndex, batch.id)}
          title="Quitar este lote"
        >
          ×
        </button>
      </div>
    );
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
          <select value={form.categoryId} onChange={(e) => handleCategoryChange(e.target.value)} required>
            <option value="" disabled>
              Selecciona...
            </option>
            {parentCategories.map((parent) => {
              const children = childrenOf(parent.id);
              if (children.length === 0) {
                return (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                );
              }
              return (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name} (general)</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
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

        <div className="form-field">
          <span className="form-field-title">
            Proveedor: {providers.find((p) => p.id === form.providerId)?.name ?? "sin asignar"}
          </span>
          {!showManualProvider ? (
            <>
              <span className="field-hint">
                Se toma automáticamente del envío que enlaces abajo a un lote "En camino" — no
                hace falta elegirlo aquí.
              </span>
              <button
                type="button"
                className="link-button"
                onClick={() => setShowManualProvider(true)}
              >
                ¿No es el correcto? Corregirlo a mano
              </button>
            </>
          ) : (
            <>
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
              <span className="field-hint">
                Para corregir un producto de antes de que esto fuera automático, o uno cuyo envío
                ya llegó con el proveedor equivocado. Si vuelves a enlazar una talla a un envío,
                el proveedor de ese envío manda de nuevo.
              </span>
            </>
          )}
        </div>

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
                      <div className="variant-fields variant-fields-stacked">
                        <div className="incoming-batch-row">
                          <input
                            type="number"
                            min={0}
                            className="line-qty-input"
                            title="Cantidad en stock"
                            value={variant.quantity}
                            onChange={(e) => setVariantQuantity(idx, Number(e.target.value))}
                          />
                          <span className="field-hint">en stock</span>
                        </div>
                        {variant.incoming.map((b) => renderBatchRow(idx, b))}
                        <button type="button" className="link-button" onClick={() => addBatch(idx)}>
                          + Agregar lote en camino
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <span className="field-hint">
              Marca las tallas que tiene este diseño. Una talla puede tener piezas en stock y uno o
              varios lotes en camino al mismo tiempo. El envío de un lote ya no se asigna aquí:
              hazlo desde "Pedido a proveedor" (restock) o desde el pedido del cliente (piezas ya
              apartadas).
            </span>
          </div>
        ) : (
          variants[0] && (
            <div className="form-field">
              <span className="form-field-title">Existencias *</span>
              <div className="variant-fields variant-fields-stacked">
                <div className="incoming-batch-row">
                  <input
                    type="number"
                    min={0}
                    className="line-qty-input"
                    title="Cantidad en stock"
                    value={variants[0].quantity}
                    onChange={(e) => setVariantQuantity(0, Number(e.target.value))}
                  />
                  <span className="field-hint">en stock</span>
                </div>
                {variants[0].incoming.map((b) => renderBatchRow(0, b))}
                <button type="button" className="link-button" onClick={() => addBatch(0)}>
                  + Agregar lote en camino
                </button>
              </div>
            </div>
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
