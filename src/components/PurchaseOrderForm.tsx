import { FormEvent, useEffect, useState } from "react";
import {
  Category,
  Order,
  PURCHASE_ORDER_DESTINATIONS,
  Product,
  ProductInput,
  ProductSize,
  Provider,
  PurchaseOrderInput,
  PurchaseOrderLine
} from "../types";
import ProductForm from "./ProductForm";

interface Props {
  products: Product[];
  categories: Category[];
  providers: Provider[];
  orders: Order[];
  onCancel: () => void;
  onSave: (input: PurchaseOrderInput) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<string>;
}

const EMPTY: PurchaseOrderInput = {
  providerId: "",
  destination: "Tienda",
  hasDeposit: false,
  depositAmount: 0,
  linkedOrderId: null,
  lines: [],
  notes: ""
};

function productLabel(product: Product, categories: Category[]) {
  const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "";
  const attrs = [categoryName, product.sleeve, product.version].filter(Boolean).join(" · ");
  return `${product.name} (${attrs})`;
}

export default function PurchaseOrderForm({
  products,
  categories,
  providers,
  orders,
  onCancel,
  onSave,
  onCreateProduct
}: Props) {
  const [form, setForm] = useState<PurchaseOrderInput>(EMPTY);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSize, setSelectedSize] = useState<ProductSize | "">("");
  const [lineQuantity, setLineQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [pendingNewProductId, setPendingNewProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingNewProductId) return;
    const created = products.find((p) => p.id === pendingNewProductId);
    if (created) {
      setSelectedProductId(created.id);
      setSelectedSize(created.variants[0]?.size ?? "");
      setPendingNewProductId(null);
    }
  }, [products, pendingNewProductId]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const needsSizePick = !!selectedProduct && selectedProduct.variants.some((v) => v.size !== "");

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
    if (lineQuantity < 1) {
      setError("La cantidad debe ser al menos 1.");
      return;
    }
    const size = productNeedsSize ? selectedSize : "";
    const line: PurchaseOrderLine = {
      productId: product.id,
      productName: product.name,
      size,
      quantity: lineQuantity,
      batchId: "" // se asigna al guardar (services/purchaseOrders.ts)
    };
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setSelectedProductId("");
    setSelectedSize("");
    setLineQuantity(1);
  }

  function removeLine(index: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  }

  async function handleCreateProduct(input: ProductInput) {
    const id = await onCreateProduct(input);
    setPendingNewProductId(id);
    setCreatingProduct(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.providerId) {
      setError("Elige un proveedor.");
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
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el pedido a proveedor.");
    } finally {
      setSaving(false);
    }
  }

  const openCustomerOrders = orders.filter((o) => o.lines.some((l) => l.status !== "Entregado"));

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <form
        className="modal-card"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>Nuevo pedido a proveedor</h2>

        <label>
          Proveedor *
          <select
            value={form.providerId}
            onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
            required
          >
            <option value="" disabled>
              Selecciona un proveedor...
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Destino *
          <select
            value={form.destination}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                destination: e.target.value as typeof f.destination,
                linkedOrderId: e.target.value === "Tienda" ? null : f.linkedOrderId
              }))
            }
          >
            {PURCHASE_ORDER_DESTINATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Tienda = llega a la sucursal como restock. Domicilio del cliente = va directo de
            fábrica al domicilio, sin pasar por tienda.
          </span>
        </label>

        {form.destination === "Domicilio del cliente" && (
          <label>
            ¿A qué pedido de cliente surte? (opcional)
            <select
              value={form.linkedOrderId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, linkedOrderId: e.target.value || null }))}
            >
              <option value="">Sin vincular</option>
              {openCustomerOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.customerName} · {o.customerPhone}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.hasDeposit}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                hasDeposit: e.target.checked,
                depositAmount: e.target.checked ? f.depositAmount : 0
              }))
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
                setSelectedSize(product?.variants[0]?.size ?? "");
              }}
            >
              <option value="">Selecciona un producto...</option>
              {products.map((p) => (
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
                {selectedProduct!.variants.map((v) => (
                  <option key={v.size} value={v.size}>
                    {v.size}
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
            <button type="button" className="secondary" onClick={addLine}>
              Agregar
            </button>
          </div>
          <div className="tag-input-row">
            <button type="button" className="link-button" onClick={() => setCreatingProduct(true)}>
              + Producto nuevo (se guarda también en Inventario)
            </button>
          </div>
          {products.length === 0 && (
            <span className="field-hint">Todavía no hay productos en Inventario.</span>
          )}
        </label>

        {form.lines.length > 0 && (
          <div className="order-lines">
            {form.lines.map((line, i) => (
              <div key={i} className="order-line-row">
                <div className="order-line-info">
                  <span className="order-line-name">
                    {line.quantity}× {line.productName}
                    {line.size ? ` (Talla ${line.size})` : ""}
                  </span>
                </div>
                <div className="order-line-actions">
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
            ))}
          </div>
        )}

        <label>
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Detalles adicionales..."
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
          shipments={[]}
          providers={providers}
          onCancel={() => setCreatingProduct(false)}
          onSave={handleCreateProduct}
        />
      )}
    </div>
  );
}
