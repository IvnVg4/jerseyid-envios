import { FormEvent, useEffect, useState } from "react";
import {
  Category,
  EMPTY_SHIPPING_ADDRESS,
  ORDER_FULFILLMENT_TYPES,
  Order,
  OrderFulfillmentType,
  OrderInput,
  OrderLine,
  OrderLineStatus,
  OrderShippingAddress,
  Product,
  ProductSize,
  Shipment
} from "../types";
import OrderLineStatusBadge from "./OrderLineStatusBadge";

interface Props {
  initial?: Order | null;
  products: Product[];
  categories: Category[];
  shipments: Shipment[];
  onCancel: () => void;
  onSave: (input: OrderInput) => Promise<void>;
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

function productLabel(product: Product, categories: Category[]) {
  const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "";
  const attrs = [categoryName, product.sleeve, product.version].filter(Boolean).join(" · ");
  return `${product.name} (${attrs})`;
}

/** Una línea vieja (previa a que las tallas se unieran en un solo producto) puede no
 * traer `size`; para un producto de una sola variante eso sigue siendo esa variante. */
function lineMatchesVariant(line: OrderLine, product: Product, size: string): boolean {
  if (line.productId !== product.id) return false;
  if (line.size === size) return true;
  return !line.size && product.variants.length === 1;
}

/** Piezas que esa talla del producto todavía puede ofrecer para este pedido: lo
 * disponible ahora, más lo que este mismo pedido ya tenía reservado originalmente
 * (se puede reasignar), menos lo que el borrador actual ya está pidiendo. */
function availableQuantity(
  product: Product,
  size: string,
  initialLines: OrderLine[],
  draftLines: OrderLine[]
): number {
  const variant = product.variants.find((v) => v.size === size);
  if (!variant) return 0;
  if (variant.stockStatus === "En stock") {
    const givenBack = initialLines
      .filter((l) => lineMatchesVariant(l, product, size) && l.status === "Vendida")
      .reduce((sum, l) => sum + l.quantity, 0);
    const drafted = draftLines
      .filter((l) => lineMatchesVariant(l, product, size) && l.status === "Vendida")
      .reduce((sum, l) => sum + l.quantity, 0);
    return variant.quantity + givenBack - drafted;
  }
  if (variant.stockStatus === "En camino" && variant.incoming) {
    const pool = variant.incoming.quantity - variant.incoming.reserved;
    const givenBack = initialLines
      .filter((l) => lineMatchesVariant(l, product, size) && l.status === "Bajo pedido")
      .reduce((sum, l) => sum + l.quantity, 0);
    const drafted = draftLines
      .filter((l) => lineMatchesVariant(l, product, size) && l.status === "Bajo pedido")
      .reduce((sum, l) => sum + l.quantity, 0);
    return pool + givenBack - drafted;
  }
  return 0;
}

export default function OrderForm({ initial, products, categories, shipments, onCancel, onSave }: Props) {
  const [form, setForm] = useState<OrderInput>(EMPTY);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSize, setSelectedSize] = useState<ProductSize | "">("");
  const [lineQuantity, setLineQuantity] = useState(1);
  const [lineUnitPrice, setLineUnitPrice] = useState(0);
  const [lineCustomName, setLineCustomName] = useState("");
  const [lineCustomNumber, setLineCustomNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialLines = initial?.lines ?? [];

  useEffect(() => {
    if (initial) {
      const { id, createdAt, updatedAt, ...rest } = initial;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  const sellableProducts = products.filter((p) =>
    p.variants.some((v) => availableQuantity(p, v.size, initialLines, form.lines) > 0)
  );
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const needsSizePick = !!selectedProduct && selectedProduct.variants.some((v) => v.size !== "");
  const availableSizes = selectedProduct
    ? selectedProduct.variants.filter(
        (v) => availableQuantity(selectedProduct, v.size, initialLines, form.lines) > 0
      )
    : [];
  const matchingPersonalizedUnits =
    selectedProduct?.personalizedUnits.filter((u) => u.size === selectedSize) ?? [];

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
    const available = availableQuantity(product, size, initialLines, form.lines);
    if (lineQuantity > available) {
      setError(
        `Solo hay ${available} pieza(s) disponible(s)${size ? ` de la talla ${size}` : ""} de "${product.name}".`
      );
      return;
    }

    const variant =
      product.variants.find((v) => v.size === size) ??
      (product.variants.length === 1 ? product.variants[0] : undefined);
    const status: OrderLineStatus = variant?.stockStatus === "En stock" ? "Vendida" : "Bajo pedido";
    const shipmentId = status === "Bajo pedido" ? variant?.incoming?.shipmentId ?? null : null;

    const line: OrderLine = {
      productId: product.id,
      productName: product.name,
      size,
      quantity: lineQuantity,
      status,
      shipmentId,
      unitPrice: lineUnitPrice,
      customName: product.personalized ? lineCustomName.trim() : "",
      customNumber: product.personalized ? lineCustomNumber.trim() : ""
    };
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setSelectedProductId("");
    setSelectedSize("");
    setLineQuantity(1);
    setLineUnitPrice(0);
    setLineCustomName("");
    setLineCustomNumber("");
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
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  }

  function markLineDelivered(index: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => (i === index ? { ...l, status: "Entregado" } : l))
    }));
  }

  /** Al quitar "Entregado": si la línea venía de un envío, regresa a "Listo para
   * entregar"; si era venta directa de stock, regresa a "Vendida". No mueve stock
   * en ningún caso (ambos extremos ya están fuera del conteo general). */
  function revertLineDelivered(index: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) =>
        i === index ? { ...l, status: l.shipmentId ? "Listo para entregar" : "Vendida" } : l
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
      await onSave(form);
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
          <div className="tag-input-row product-picker-row">
            <select
              className="product-picker-select"
              value={selectedProductId}
              onChange={(e) => {
                const id = e.target.value;
                const product = products.find((p) => p.id === id);
                setSelectedProductId(id);
                setLineUnitPrice(product?.price ?? 0);
                const firstAvailable = product?.variants.find(
                  (v) => product && availableQuantity(product, v.size, initialLines, form.lines) > 0
                );
                setSelectedSize(firstAvailable?.size ?? "");
              }}
            >
              <option value="">Selecciona un producto...</option>
              {sellableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {productLabel(p, categories)}
                </option>
              ))}
            </select>
            {needsSizePick && (
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value as ProductSize | "")}
              >
                <option value="" disabled>
                  Talla...
                </option>
                {availableSizes.map((v) => (
                  <option key={v.size} value={v.size}>
                    {v.size} —{" "}
                    {availableQuantity(selectedProduct!, v.size, initialLines, form.lines)} disp.
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
          {sellableProducts.length === 0 && (
            <span className="field-hint">
              No hay productos con stock disponible ni en camino para vender.
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
    </div>
  );
}
