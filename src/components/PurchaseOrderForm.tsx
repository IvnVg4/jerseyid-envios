import { FormEvent, useEffect, useState } from "react";
import {
  BATCH_PURPOSES,
  BatchPurpose,
  Category,
  Order,
  PRODUCT_SIZES,
  Product,
  ProductInput,
  ProductSize,
  Provider,
  PurchaseOrderInput,
  PurchaseOrderLine
} from "../types";
import { summarizeVariant } from "../services/inventory";
import ProductForm from "./ProductForm";
import ProductPicker from "./ProductPicker";

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
  hasDeposit: false,
  depositAmount: 0,
  lines: [],
  notes: ""
};

function purposeLabel(purpose: BatchPurpose): string {
  return purpose === "Stock" ? "Para stock" : "Para pedido";
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
  const [linePurpose, setLinePurpose] = useState<BatchPurpose>("Stock");
  const [lineLinkedOrderId, setLineLinkedOrderId] = useState<string | null>(null);
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
  const openCustomerOrders = orders.filter((o) => o.lines.some((l) => l.status !== "Entregado"));

  function selectProduct(id: string) {
    const product = products.find((p) => p.id === id);
    setSelectedProductId(id);
    setSelectedSize(product?.variants[0]?.size ?? "");
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
      batchId: "", // se asigna al guardar (services/purchaseOrders.ts)
      purpose: linePurpose,
      linkedOrderId: linePurpose === "Pedido" ? lineLinkedOrderId : null
    };
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setSelectedProductId("");
    setSelectedSize("");
    setLineQuantity(1);
    setLinePurpose("Stock");
    setLineLinkedOrderId(null);
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
          <ProductPicker
            products={products}
            categories={categories}
            selectedProductId={selectedProductId}
            onSelect={selectProduct}
            getSubtitle={(p) => {
              const totalIncoming = p.variants.reduce(
                (sum, v) => sum + summarizeVariant(v).inFactory + summarizeVariant(v).inTransit,
                0
              );
              const totalStock = p.variants.reduce((sum, v) => sum + summarizeVariant(v).inStock, 0);
              return `${totalStock} en stock · ${totalIncoming} en camino`;
            }}
          />
          <div className="tag-input-row product-picker-row">
            {needsSizePick && (
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value as ProductSize | "")}
                title="El proveedor surte cualquier talla, esté o no ya dada de alta"
              >
                <option value="" disabled>
                  Talla...
                </option>
                {PRODUCT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
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
            <select
              value={linePurpose}
              onChange={(e) => setLinePurpose(e.target.value as BatchPurpose)}
              title="Para quién es esta pieza"
            >
              {BATCH_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {purposeLabel(p)}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" onClick={addLine}>
              Agregar
            </button>
          </div>
          <span className="field-hint">
            Puedes pedir cualquier talla y cantidad, aunque el producto no la tenga dada de alta
            todavía — es tu proveedor, él te surte.
          </span>
          {linePurpose === "Pedido" && (
            <label>
              ¿A qué pedido de cliente surte? (opcional, se puede vincular después)
              <select
                value={lineLinkedOrderId ?? ""}
                onChange={(e) => setLineLinkedOrderId(e.target.value || null)}
              >
                <option value="">Sin vincular todavía</option>
                {openCustomerOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.customerName} · {o.customerPhone}
                  </option>
                ))}
              </select>
            </label>
          )}
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
            {form.lines.map((line, i) => {
              const linkedOrder = line.linkedOrderId ? orders.find((o) => o.id === line.linkedOrderId) : undefined;
              return (
                <div key={i} className="order-line-row">
                  <div className="order-line-info">
                    <span className="order-line-name">
                      {line.quantity}× {line.productName}
                      {line.size ? ` (Talla ${line.size})` : ""}
                    </span>
                    <div className="order-line-meta">
                      <span className="attr-chip">{purposeLabel(line.purpose)}</span>
                      {linkedOrder && <span className="attr-chip">→ {linkedOrder.customerName}</span>}
                    </div>
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
              );
            })}
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
