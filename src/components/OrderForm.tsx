import { FormEvent, useEffect, useState } from "react";
import {
  Category,
  EMPTY_SHIPPING_ADDRESS,
  IncomingBatch,
  ORDER_FULFILLMENT_TYPES,
  Order,
  OrderFulfillmentType,
  OrderInput,
  OrderLine,
  OrderShippingAddress,
  PRODUCT_SIZES,
  Product,
  ProductInput,
  ProductSize,
  Provider,
  Shipment
} from "../types";
import { batchAvailable } from "../services/inventory";
import { NewBatchRequest } from "../services/orders";
import OrderLineStatusBadge from "./OrderLineStatusBadge";
import ProductForm from "./ProductForm";
import ProductPicker from "./ProductPicker";

interface Props {
  initial?: Order | null;
  products: Product[];
  categories: Category[];
  shipments: Shipment[];
  providers: Provider[];
  onCancel: () => void;
  onSave: (input: OrderInput, newBatches: NewBatchRequest[]) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<string>;
}

const EMPTY: OrderInput = {
  customerName: "",
  customerPhone: "",
  hasDeposit: false,
  depositAmount: 0,
  fulfillmentType: "Cliente de Mérida",
  shippingAddress: null,
  lines: [],
  notes: ""
};

/** Una línea vieja (previa a que las tallas se unieran en un solo producto) puede no
 * traer `size`; para un producto de una sola variante eso sigue siendo esa variante. */
function lineMatchesVariant(line: OrderLine, product: Product, size: string): boolean {
  if (line.productId !== product.id) return false;
  if (line.size === size) return true;
  return !line.size && product.variants.length === 1;
}

/** Un lote "Pedido" (ya apartado para un cliente en concreto, asignado o no
 * todavía) no se puede tomar para otro pedido cualquiera — solo cuenta aquí si
 * este MISMO pedido ya lo tenía reclamado (se está reasignando/editando). Los
 * lotes "Stock" siempre son de libre reparto. */
function isBatchClaimable(batch: IncomingBatch, product: Product, size: string, initialLines: OrderLine[]): boolean {
  if (batch.purpose === "Stock") return true;
  return initialLines.some((l) => lineMatchesVariant(l, product, size) && l.sourceBatchId === batch.id);
}

/** Piezas que esa talla del producto todavía puede ofrecer para este pedido (stock +
 * lotes en camino/fábrica juntos, sin contar lotes "Pedido" de otro cliente): lo
 * disponible ahora, más lo que este mismo pedido ya tenía apartado originalmente
 * (se puede reasignar), menos lo que el borrador actual ya está pidiendo. */
function availableQuantity(
  product: Product,
  size: string,
  initialLines: OrderLine[],
  draftLines: OrderLine[]
): number {
  const variant = product.variants.find((v) => v.size === size);
  if (!variant) return 0;
  const givenBack = initialLines
    .filter((l) => lineMatchesVariant(l, product, size))
    .reduce((sum, l) => sum + l.quantity, 0);
  const drafted = draftLines
    .filter((l) => lineMatchesVariant(l, product, size))
    .reduce((sum, l) => sum + l.quantity, 0);
  const claimableIncoming = variant.incoming
    .filter((b) => isBatchClaimable(b, product, size, initialLines))
    .reduce((sum, b) => sum + b.quantity, 0);
  const total = variant.quantity + claimableIncoming;
  return total + givenBack - drafted;
}

interface Allocation {
  quantity: number;
  sourceBatchId: string | null;
  shipmentId: string | null;
}

/** Reparte la cantidad pedida entre el stock físico y los lotes en camino/fábrica
 * de esa talla (sin tocar lotes "Pedido" de otro cliente), en ese orden — así
 * "pido 8 y da que 2 son de stock y 6 de un lote en camino" no requiere que quien
 * captura sepa de dónde sale cada pieza. Cada entrada del resultado se vuelve una
 * `OrderLine` propia (mismo producto/talla). */
function allocateSources(
  product: Product,
  size: string,
  requestedQty: number,
  initialLines: OrderLine[],
  draftLines: OrderLine[]
): Allocation[] {
  const variant = product.variants.find((v) => v.size === size);
  if (!variant) return [];

  const givenBackFor = (sourceBatchId: string | null) =>
    initialLines
      .filter((l) => lineMatchesVariant(l, product, size) && l.sourceBatchId === sourceBatchId)
      .reduce((sum, l) => sum + l.quantity, 0);
  const draftedFor = (sourceBatchId: string | null) =>
    draftLines
      .filter((l) => lineMatchesVariant(l, product, size) && l.sourceBatchId === sourceBatchId)
      .reduce((sum, l) => sum + l.quantity, 0);

  const allocations: Allocation[] = [];
  let remaining = requestedQty;

  const stockAvailable = variant.quantity + givenBackFor(null) - draftedFor(null);
  if (stockAvailable > 0 && remaining > 0) {
    const take = Math.min(stockAvailable, remaining);
    allocations.push({ quantity: take, sourceBatchId: null, shipmentId: null });
    remaining -= take;
  }

  for (const b of variant.incoming) {
    if (remaining <= 0) break;
    if (!isBatchClaimable(b, product, size, initialLines)) continue;
    const batchAvail = batchAvailable(b) + givenBackFor(b.id) - draftedFor(b.id);
    if (batchAvail <= 0) continue;
    const take = Math.min(batchAvail, remaining);
    allocations.push({ quantity: take, sourceBatchId: b.id, shipmentId: b.shipmentId });
    remaining -= take;
  }

  return allocations;
}

export default function OrderForm({
  initial,
  products,
  categories,
  shipments,
  providers,
  onCancel,
  onSave,
  onCreateProduct
}: Props) {
  const [form, setForm] = useState<OrderInput>(EMPTY);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSize, setSelectedSize] = useState<ProductSize | "">("");
  const [lineQuantity, setLineQuantity] = useState(1);
  const [lineUnitPrice, setLineUnitPrice] = useState(0);
  const [lineCustomName, setLineCustomName] = useState("");
  const [lineCustomNumber, setLineCustomNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [pendingNewProductId, setPendingNewProductId] = useState<string | null>(null);
  const [pendingNewBatches, setPendingNewBatches] = useState<NewBatchRequest[]>([]);

  const initialLines = initial?.lines ?? [];

  useEffect(() => {
    if (initial) {
      const { id, createdAt, updatedAt, ...rest } = initial;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  // En cuanto el producto recién creado desde "+ Producto nuevo" aparece en el
  // snapshot en vivo, se autoselecciona — no hace falta ir a buscarlo al select.
  useEffect(() => {
    if (!pendingNewProductId) return;
    const created = products.find((p) => p.id === pendingNewProductId);
    if (created) {
      setSelectedProductId(created.id);
      setLineUnitPrice(created.price);
      const firstAvailable = created.variants.find(
        (v) => availableQuantity(created, v.size, initialLines, form.lines) > 0
      );
      setSelectedSize(firstAvailable?.size ?? "");
      setPendingNewProductId(null);
    }
  }, [products, pendingNewProductId]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const needsSizePick = !!selectedProduct && selectedProduct.variants.some((v) => v.size !== "");
  // Se muestran TODAS las tallas posibles, no solo las que ya tienen piezas
  // disponibles: si se pide una talla sin stock ni lotes, el faltante se pide
  // automáticamente de fábrica al agregar la línea (ver addLine).
  const availableSizes = selectedProduct
    ? PRODUCT_SIZES.map((size) => ({
        size,
        available: availableQuantity(selectedProduct, size, initialLines, form.lines)
      }))
    : [];
  const matchingPersonalizedUnits =
    selectedProduct?.personalizedUnits.filter((u) => u.size === selectedSize) ?? [];

  function selectProduct(id: string) {
    const product = products.find((p) => p.id === id);
    setSelectedProductId(id);
    setLineUnitPrice(product?.price ?? 0);
    const firstAvailable = product?.variants.find(
      (v) => product && availableQuantity(product, v.size, initialLines, form.lines) > 0
    );
    setSelectedSize(firstAvailable?.size ?? "");
  }

  function addLine() {
    setError(null);
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      setError("Elige un producto.");
      return;
    }
    const productNeedsSize = product.variants.some((v) => v.size !== "");
    if (productNeedsSize && !selectedSize) {
      setError("Elige una talla.");
      return;
    }
    const size = productNeedsSize ? selectedSize : "";
    if (lineQuantity < 1) {
      setError("La cantidad debe ser al menos 1.");
      return;
    }

    // Se reparte lo pedido entre stock y lotes existentes; lo que no alcance a
    // cubrirse se pide automáticamente de fábrica (lote nuevo, sin envío
    // todavía) en vez de bloquear el pedido.
    const allocations: Allocation[] = allocateSources(product, size, lineQuantity, initialLines, form.lines);
    const allocated = allocations.reduce((sum, a) => sum + a.quantity, 0);
    const shortfall = lineQuantity - allocated;
    let newBatch: NewBatchRequest | null = null;
    if (shortfall > 0) {
      newBatch = { productId: product.id, size, batchId: crypto.randomUUID(), quantity: shortfall };
      allocations.push({ quantity: shortfall, sourceBatchId: newBatch.batchId, shipmentId: null });
    }

    const newLines: OrderLine[] = allocations.map((a) => ({
      productId: product.id,
      productName: product.name,
      size,
      quantity: a.quantity,
      status: a.shipmentId ? "Enviado" : "En preparación",
      sourceBatchId: a.sourceBatchId,
      shipmentId: a.shipmentId,
      unitPrice: lineUnitPrice,
      customName: product.personalized ? lineCustomName.trim() : "",
      customNumber: product.personalized ? lineCustomNumber.trim() : ""
    }));
    if (newBatch) setPendingNewBatches((pb) => [...pb, newBatch!]);
    setForm((f) => ({ ...f, lines: [...f.lines, ...newLines] }));
    setSelectedProductId("");
    setSelectedSize("");
    setLineQuantity(1);
    setLineUnitPrice(0);
    setLineCustomName("");
    setLineCustomNumber("");
  }

  async function handleCreateProduct(input: ProductInput) {
    const id = await onCreateProduct(input);
    setPendingNewProductId(id);
    setCreatingProduct(false);
  }

  function updateAddress(field: keyof OrderShippingAddress, value: string) {
    setForm((f) => ({
      ...f,
      shippingAddress: { ...(f.shippingAddress ?? EMPTY_SHIPPING_ADDRESS), [field]: value }
    }));
  }

  function handleFulfillmentChange(fulfillmentType: OrderFulfillmentType) {
    setForm((f) => ({
      ...f,
      fulfillmentType,
      shippingAddress:
        fulfillmentType === "Envío foráneo" ? f.shippingAddress ?? EMPTY_SHIPPING_ADDRESS : null
    }));
  }

  const orderTotal = form.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  function removeLine(index: number) {
    const removed = form.lines[index];
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
    // Si esa línea era la única que reclamaba un lote nuevo (todavía sin guardar,
    // pedido automáticamente de fábrica por faltante), se descarta también —
    // si no, quedaría un lote pedido de fábrica sin ninguna línea que lo use.
    if (removed.sourceBatchId) {
      const stillUsed = form.lines.some((l, i) => i !== index && l.sourceBatchId === removed.sourceBatchId);
      if (!stillUsed) {
        setPendingNewBatches((pb) => pb.filter((b) => b.batchId !== removed.sourceBatchId));
      }
    }
  }

  function markLineDelivered(index: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => (i === index ? { ...l, status: "Entregado" } : l))
    }));
  }

  /** Al quitar "Entregado": si la línea ya tiene un envío enlazado, regresa a
   * "Listo para entregar"; si no, a "En preparación". No mueve stock en ningún
   * caso (ambos extremos ya están fuera del conteo general). */
  function revertLineDelivered(index: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) =>
        i === index ? { ...l, status: l.shipmentId ? "Listo para entregar" : "En preparación" } : l
      )
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.customerName.trim()) {
      setError("El nombre del cliente es obligatorio.");
      return;
    }
    if (!form.customerPhone.trim()) {
      setError("El número del cliente es obligatorio.");
      return;
    }
    if (form.lines.length === 0) {
      setError("Agrega al menos un producto al pedido.");
      return;
    }
    if (form.hasDeposit && form.depositAmount <= 0) {
      setError("Indica el monto del anticipo.");
      return;
    }
    if (form.fulfillmentType === "Envío foráneo") {
      const a = form.shippingAddress;
      if (
        !a ||
        !a.city.trim() ||
        !a.state.trim() ||
        !a.street.trim() ||
        !a.neighborhood.trim() ||
        !a.postalCode.trim()
      ) {
        setError(
          "Completa los datos de envío (ciudad, estado, calle y número, colonia y código postal)."
        );
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(form, pendingNewBatches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el pedido.");
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
        <h2>{initial ? "Editar pedido" : "Nuevo pedido"}</h2>

        <label>
          Nombre del cliente *
          <input
            value={form.customerName}
            onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
            placeholder="Ej. Juan Pérez"
            required
          />
        </label>

        <label>
          Número del cliente *
          <input
            value={form.customerPhone}
            onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
            placeholder="Ej. 555 123 4567"
            required
          />
        </label>

        <label>
          Tipo de cliente *
          <select
            value={form.fulfillmentType}
            onChange={(e) => handleFulfillmentChange(e.target.value as OrderFulfillmentType)}
          >
            {ORDER_FULFILLMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {form.fulfillmentType === "Envío foráneo" && (
          <fieldset className="address-fieldset">
            <label>
              Ciudad *
              <input
                value={form.shippingAddress?.city ?? ""}
                onChange={(e) => updateAddress("city", e.target.value)}
                required
              />
            </label>
            <label>
              Estado *
              <input
                value={form.shippingAddress?.state ?? ""}
                onChange={(e) => updateAddress("state", e.target.value)}
                required
              />
            </label>
            <label>
              Calle y número *
              <input
                value={form.shippingAddress?.street ?? ""}
                onChange={(e) => updateAddress("street", e.target.value)}
                required
              />
            </label>
            <label>
              Cruzamientos
              <input
                value={form.shippingAddress?.crossStreets ?? ""}
                onChange={(e) => updateAddress("crossStreets", e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label>
              Colonia *
              <input
                value={form.shippingAddress?.neighborhood ?? ""}
                onChange={(e) => updateAddress("neighborhood", e.target.value)}
                required
              />
            </label>
            <label>
              Código postal *
              <input
                value={form.shippingAddress?.postalCode ?? ""}
                onChange={(e) => updateAddress("postalCode", e.target.value)}
                required
              />
            </label>
          </fieldset>
        )}

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.hasDeposit}
            onChange={(e) =>
              setForm((f) => ({ ...f, hasDeposit: e.target.checked, depositAmount: e.target.checked ? f.depositAmount : 0 }))
            }
          />
          ¿Con anticipo?
        </label>

        {form.hasDeposit && (
          <label>
            Monto del anticipo *
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.depositAmount}
              onChange={(e) => setForm((f) => ({ ...f, depositAmount: Number(e.target.value) }))}
              required
            />
          </label>
        )}

        <label>
          Productos del pedido *
          <ProductPicker
            products={products}
            categories={categories}
            selectedProductId={selectedProductId}
            onSelect={selectProduct}
            getSubtitle={(p) =>
              `${p.variants.reduce((sum, v) => sum + availableQuantity(p, v.size, initialLines, form.lines), 0)} disp.`
            }
          />
          <div className="tag-input-row product-picker-row">
            {needsSizePick && (
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value as ProductSize | "")}
              >
                <option value="" disabled>
                  Talla...
                </option>
                {availableSizes.map(({ size, available }) => (
                  <option key={size} value={size}>
                    {size} — {available > 0 ? `${available} disp.` : "se pedirá de fábrica"}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              min={1}
              className="line-qty-input"
              value={lineQuantity}
              onChange={(e) => setLineQuantity(Number(e.target.value))}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              className="line-price-input"
              title="Precio unitario"
              value={lineUnitPrice}
              onChange={(e) => setLineUnitPrice(Number(e.target.value))}
            />
            <button type="button" className="secondary" onClick={addLine}>
              Agregar
            </button>
          </div>
          {selectedProduct &&
            lineQuantity > 0 &&
            (!needsSizePick || selectedSize) &&
            (() => {
              const size = needsSizePick ? selectedSize : "";
              const available = availableQuantity(selectedProduct, size, initialLines, form.lines);
              const shortfall = Math.max(0, lineQuantity - available);
              if (shortfall === 0) return null;
              return (
                <span className="field-hint">
                  Hay {available} disponible(s) ahora — las {shortfall} pieza(s) que faltan se
                  pedirán automáticamente de fábrica.
                </span>
              );
            })()}
          <div className="tag-input-row">
            <button type="button" className="link-button" onClick={() => setCreatingProduct(true)}>
              + Producto nuevo (se guarda también en Inventario)
            </button>
          </div>
          {selectedProduct?.personalized && (
            <div className="tag-input-row">
              <input
                value={lineCustomName}
                onChange={(e) => setLineCustomName(e.target.value)}
                placeholder="Nombre en la jersey (opcional)"
              />
              <input
                value={lineCustomNumber}
                onChange={(e) => setLineCustomNumber(e.target.value)}
                placeholder="Número (opcional)"
                className="line-qty-input"
              />
            </div>
          )}
          {matchingPersonalizedUnits.length > 0 && (
            <div className="tag-list">
              <span className="field-hint">Piezas ya personalizadas disponibles:</span>
              {matchingPersonalizedUnits.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="tag-chip tag-chip-static tag-chip-button"
                  onClick={() => {
                    setLineCustomName(u.customName);
                    setLineCustomNumber(u.customNumber);
                  }}
                >
                  {[u.customName, u.customNumber].filter(Boolean).join(" · ")}
                </button>
              ))}
            </div>
          )}
          {products.length === 0 && (
            <span className="field-hint">
              Todavía no hay productos en el inventario.
            </span>
          )}
        </label>

        {form.lines.length > 0 && (
          <div className="order-lines">
            {form.lines.map((line, i) => {
              const shipment = line.shipmentId ? shipments.find((s) => s.id === line.shipmentId) : undefined;
              const lineProduct = products.find((p) => p.id === line.productId);
              const personalization = [line.customName, line.customNumber].filter(Boolean).join(" · ");
              return (
                <div key={i} className="order-line-row">
                  <div className="order-line-thumb">
                    {lineProduct?.images[0] ? (
                      <img src={lineProduct.images[0]} alt={line.productName} />
                    ) : (
                      <div className="order-line-thumb-empty" />
                    )}
                  </div>
                  <div className="order-line-info">
                    <span className="order-line-name">
                      {line.quantity}× {line.productName}
                      {line.size ? ` (Talla ${line.size})` : ""} — $
                      {(line.quantity * line.unitPrice).toLocaleString("es-MX")}
                    </span>
                    <div className="order-line-meta">
                      <OrderLineStatusBadge status={line.status} />
                      {shipment && <span className="attr-chip">vía envío #{shipment.trackingNumber}</span>}
                      {personalization && <span className="attr-chip">{personalization}</span>}
                    </div>
                  </div>
                  <div className="order-line-actions">
                    {line.status !== "Entregado" ? (
                      <button type="button" className="secondary" onClick={() => markLineDelivered(i)}>
                        Marcar entregado
                      </button>
                    ) : (
                      <button type="button" className="secondary" onClick={() => revertLineDelivered(i)}>
                        Quitar entregado
                      </button>
                    )}
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={() => removeLine(i)}
                      title="Quitar línea"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {form.lines.length > 0 && (
          <div className="order-total-row">
            <span>Total: ${orderTotal.toLocaleString("es-MX")}</span>
            {form.hasDeposit && (
              <span className="field-hint">
                Saldo pendiente: ${(orderTotal - form.depositAmount).toLocaleString("es-MX")}
              </span>
            )}
          </div>
        )}

        <label>
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Detalles adicionales del pedido..."
          />
        </label>

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

      {creatingProduct && (
        <ProductForm
          categories={categories}
          shipments={shipments}
          providers={providers}
          onCancel={() => setCreatingProduct(false)}
          onSave={handleCreateProduct}
        />
      )}
    </div>
  );
}
