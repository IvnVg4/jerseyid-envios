import type { Category, Product } from "../types";

interface Props {
  products: Product[];
  categories: Category[];
  selectedProductId: string;
  onSelect: (productId: string) => void;
  getSubtitle?: (product: Product) => string;
}

/** Selector visual de producto (foto + nombre) en vez de un <select> de texto —
 * usado en Pedidos, Pedido a proveedor, y donde más haga falta identificar de un
 * vistazo qué producto se está escogiendo. */
export default function ProductPicker({
  products,
  categories,
  selectedProductId,
  onSelect,
  getSubtitle
}: Props) {
  if (products.length === 0) return null;

  return (
    <div className="product-picker-grid">
      {products.map((p) => {
        const categoryName = categories.find((c) => c.id === p.categoryId)?.name ?? "";
        const attrs = [categoryName, p.sleeve, p.version].filter(Boolean).join(" · ");
        const active = p.id === selectedProductId;
        return (
          <button
            type="button"
            key={p.id}
            className={active ? "product-picker-card product-picker-card-active" : "product-picker-card"}
            onClick={() => onSelect(p.id)}
            title={p.name}
          >
            <div className="product-picker-thumb">
              {p.images[0] ? (
                <img src={p.images[0]} alt={p.name} />
              ) : (
                <div className="image-placeholder">Sin imagen</div>
              )}
            </div>
            <span className="product-picker-name">{p.name}</span>
            {attrs && <span className="product-picker-attrs">{attrs}</span>}
            <span className="product-picker-attrs">{getSubtitle ? getSubtitle(p) : `$${p.price.toLocaleString("es-MX")}`}</span>
          </button>
        );
      })}
    </div>
  );
}
