import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import {
  Category,
  CategoryInput,
  Order,
  OrderInput,
  Product,
  ProductInput,
  Provider,
  ProviderInput,
  SHIPMENT_STATUSES,
  Shipment,
  ShipmentInput,
  ShipmentStatus
} from "./types";
import {
  createShipment,
  deleteShipment,
  subscribeToShipments,
  updateShipment
} from "./services/shipments";
import {
  createProduct,
  deleteProduct,
  subscribeToProducts,
  updateProduct
} from "./services/products";
import {
  createOrder,
  deleteOrder,
  markAllOrderLinesDelivered,
  markOrderLineDelivered,
  removeOrderLine,
  revertAllOrderLinesDelivered,
  revertOrderLineDelivered,
  subscribeToOrders,
  updateOrder
} from "./services/orders";
import {
  createCategory,
  deleteCategory,
  deleteCategoryWithChildren,
  seedDefaultCategoriesIfEmpty,
  subscribeToCategories,
  updateCategory
} from "./services/categories";
import {
  createProvider,
  deleteProvider,
  subscribeToProviders,
  updateProvider
} from "./services/providers";
import { applyShipmentDelivery } from "./services/fulfillment";
import {
  reconcileProductCategories,
  reconcileProductProviders,
  reconcileProviderCategoryPrices,
  reconcileShipmentProviders
} from "./services/sync";
import Login from "./components/Login";
import ShipmentCard from "./components/ShipmentCard";
import ShipmentForm from "./components/ShipmentForm";
import ProductCard from "./components/ProductCard";
import ProductForm from "./components/ProductForm";
import OrderCard from "./components/OrderCard";
import OrderForm from "./components/OrderForm";
import CategoryManager from "./components/CategoryManager";
import ProviderCard from "./components/ProviderCard";
import ProviderForm from "./components/ProviderForm";
import SalesView from "./components/SalesView";
import ConfirmDialog from "./components/ConfirmDialog";

type StatusFilter = "Todos" | ShipmentStatus;
type ProductTypeFilter = "Todos" | string;
type View = "shipments" | "stock" | "orders" | "providers" | "sales" | "categories";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>("shipments");

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [editing, setEditing] = useState<Shipment | null | "new">(null);
  const [pendingDelete, setPendingDelete] = useState<Shipment | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>("Todos");
  const [editingProduct, setEditingProduct] = useState<Product | null | "new">(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [editingOrder, setEditingOrder] = useState<Order | null | "new">(null);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);
  const seededCategories = useRef(false);
  const migratedProductCategories = useRef(false);
  const migratedProviderCategoryPrices = useRef(false);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerLoadError, setProviderLoadError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null | "new">(null);
  const [pendingDeleteProvider, setPendingDeleteProvider] = useState<Provider | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToShipments(setShipments, (err) =>
      setLoadError(err.message)
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToProducts(setProducts, (err) =>
      setProductLoadError(err.message)
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToOrders(setOrders, (err) => setOrderLoadError(err.message));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCategories(
      (cats) => {
        setCategories(cats);
        if (cats.length === 0 && !seededCategories.current) {
          seededCategories.current = true;
          seedDefaultCategoriesIfEmpty().catch(() => {
            seededCategories.current = false;
          });
        }
      },
      (err) => setCategoryLoadError(err.message)
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToProviders(setProviders, (err) => setProviderLoadError(err.message));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user || shipments.length === 0 || providers.length === 0) return;
    reconcileShipmentProviders(shipments, providers).catch(() => {});
  }, [user, shipments, providers]);

  useEffect(() => {
    if (!user || products.length === 0 || shipments.length === 0) return;
    reconcileProductProviders(products, shipments).catch(() => {});
  }, [user, products, shipments]);

  // Migración: productos y precios de proveedor guardados antes de que las
  // categorías tuvieran id propio traen el tipo/categoría como nombre en texto
  // suelto. Se corrige sola una vez por sesión en cuanto hay categorías cargadas
  // (mismo patrón que el self-heal de proveedor de arriba).
  useEffect(() => {
    if (!user || categories.length === 0 || migratedProductCategories.current) return;
    migratedProductCategories.current = true;
    reconcileProductCategories(categories).catch(() => {
      migratedProductCategories.current = false;
    });
  }, [user, categories]);

  useEffect(() => {
    if (!user || categories.length === 0 || migratedProviderCategoryPrices.current) return;
    migratedProviderCategoryPrices.current = true;
    reconcileProviderCategoryPrices(categories).catch(() => {
      migratedProviderCategoryPrices.current = false;
    });
  }, [user, categories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shipments.filter((s) => {
      const matchesStatus = statusFilter === "Todos" || s.status === statusFilter;
      const matchesTerm =
        !term ||
        s.provider.toLowerCase().includes(term) ||
        s.trackingNumber.toLowerCase().includes(term) ||
        s.notes.toLowerCase().includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [shipments, search, statusFilter]);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesType = productTypeFilter === "Todos" || p.categoryId === productTypeFilter;
      const matchesTerm =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.patches.some((patch) => patch.toLowerCase().includes(term));
      return matchesType && matchesTerm;
    });
  }, [products, productSearch, productTypeFilter]);

  const categoryOptions = useMemo(
    () => categories.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const filteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      return (
        !term ||
        o.customerName.toLowerCase().includes(term) ||
        o.customerPhone.toLowerCase().includes(term)
      );
    });
  }, [orders, orderSearch]);

  if (!isFirebaseConfigured) {
    return (
      <div className="config-warning">
        <h1>Falta configurar Firebase</h1>
        <p>
          Edita <code>src/firebaseConfig.ts</code> con los datos de tu proyecto de
          Firebase (ver <code>README.md</code>) y vuelve a iniciar la app.
        </p>
      </div>
    );
  }

  if (user === undefined) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!user) {
    return <Login />;
  }

  async function handleSave(input: ShipmentInput) {
    if (editing && editing !== "new") {
      const wasDelivered = editing.status === "Entregado";
      await updateShipment(editing.id, input);
      if (!wasDelivered && input.status === "Entregado") {
        await applyShipmentDelivery({ ...editing, ...input }, products, orders, providers);
      }
    } else {
      await createShipment(input);
    }
    setEditing(null);
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    await deleteShipment(pendingDelete.id);
    setPendingDelete(null);
  }

  async function handleSaveProduct(input: ProductInput) {
    if (editingProduct && editingProduct !== "new") {
      await updateProduct(editingProduct.id, input);
    } else {
      await createProduct(input);
    }
    setEditingProduct(null);
  }

  async function handleDeleteProductConfirmed() {
    if (!pendingDeleteProduct) return;
    await deleteProduct(pendingDeleteProduct.id);
    setPendingDeleteProduct(null);
  }

  async function handleSaveOrder(input: OrderInput) {
    if (editingOrder && editingOrder !== "new") {
      await updateOrder(editingOrder.id, editingOrder, input, products);
    } else {
      await createOrder(input, products);
    }
    setEditingOrder(null);
  }

  async function handleDeleteOrderConfirmed() {
    if (!pendingDeleteOrder) return;
    await deleteOrder(pendingDeleteOrder, products);
    setPendingDeleteOrder(null);
  }

  async function handleMarkLineDelivered(order: Order, lineIndex: number) {
    await markOrderLineDelivered(order, lineIndex, products, providers, shipments);
  }

  async function handleMarkAllDelivered(order: Order) {
    await markAllOrderLinesDelivered(order, products, providers, shipments);
  }

  async function handleRevertLineDelivered(order: Order, lineIndex: number) {
    await revertOrderLineDelivered(order, lineIndex);
  }

  async function handleRevertAllDelivered(order: Order) {
    await revertAllOrderLinesDelivered(order);
  }

  async function handleRemoveOrderLine(order: Order, lineIndex: number) {
    await removeOrderLine(order, lineIndex, products);
  }

  async function handleCreateCategory(input: CategoryInput) {
    await createCategory(input);
  }

  async function handleUpdateCategory(id: string, input: Partial<CategoryInput>) {
    await updateCategory(id, input);
  }

  async function handleDeleteCategory(category: Category) {
    const hasChildren = categories.some((c) => c.parentId === category.id);
    if (hasChildren) {
      await deleteCategoryWithChildren(category.id, categories, providers);
    } else {
      await deleteCategory(category.id, providers);
    }
  }

  async function handleSaveProvider(input: ProviderInput) {
    if (editingProvider && editingProvider !== "new") {
      await updateProvider(editingProvider.id, input);
    } else {
      await createProvider(input);
    }
    setEditingProvider(null);
  }

  async function handleDeleteProviderConfirmed() {
    if (!pendingDeleteProvider) return;
    await deleteProvider(pendingDeleteProvider.id);
    setPendingDeleteProvider(null);
  }

  const countLabel =
    view === "shipments"
      ? filtered.length === shipments.length
        ? `${shipments.length} envío${shipments.length === 1 ? "" : "s"}`
        : `${filtered.length} de ${shipments.length} envíos`
      : view === "stock"
      ? filteredProducts.length === products.length
        ? `${products.length} producto${products.length === 1 ? "" : "s"}`
        : `${filteredProducts.length} de ${products.length} productos`
      : view === "orders"
      ? filteredOrders.length === orders.length
        ? `${orders.length} pedido${orders.length === 1 ? "" : "s"}`
        : `${filteredOrders.length} de ${orders.length} pedidos`
      : view === "providers"
      ? `${providers.length} proveedor${providers.length === 1 ? "" : "es"}`
      : view === "sales"
      ? "Ventas"
      : `${categories.length} categoría${categories.length === 1 ? "" : "s"}`;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-title">
          <h1 className="brand">
            Jersey<span className="brand-accent">·</span>ID
          </h1>
          <span className="shipment-count">{countLabel}</span>
        </div>
        <div className="header-actions">
          <span className="user-email">{user.email}</span>
          <button className="secondary" onClick={() => signOut(auth)}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="view-tabs">
        <button
          className={view === "shipments" ? "tab-active" : "tab"}
          onClick={() => setView("shipments")}
        >
          Envíos
        </button>
        <button
          className={view === "stock" ? "tab-active" : "tab"}
          onClick={() => setView("stock")}
        >
          Stock
        </button>
        <button
          className={view === "orders" ? "tab-active" : "tab"}
          onClick={() => setView("orders")}
        >
          Pedidos
        </button>
        <button
          className={view === "providers" ? "tab-active" : "tab"}
          onClick={() => setView("providers")}
        >
          Proveedores
        </button>
        <button
          className={view === "sales" ? "tab-active" : "tab"}
          onClick={() => setView("sales")}
        >
          Ventas
        </button>
        <button
          className={view === "categories" ? "tab-active" : "tab"}
          onClick={() => setView("categories")}
        >
          Categorías
        </button>
      </div>

      {view === "shipments" && (
        <>
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Buscar por proveedor, seguimiento o nota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="Todos">Todos los estados</option>
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button onClick={() => setEditing("new")}>+ Nuevo envío</button>
          </div>

          {loadError && <div className="auth-error page-error">{loadError}</div>}

          {filtered.length === 0 ? (
            <div className="empty-state">
              {shipments.length === 0
                ? "Todavía no hay envíos registrados. Crea el primero."
                : "Ningún envío coincide con la búsqueda/filtro."}
            </div>
          ) : (
            <div className="shipment-grid">
              {filtered.map((s) => (
                <ShipmentCard
                  key={s.id}
                  shipment={s}
                  products={products}
                  onEdit={() => setEditing(s)}
                  onDelete={() => setPendingDelete(s)}
                />
              ))}
            </div>
          )}

          {editing && (
            <ShipmentForm
              initial={editing === "new" ? null : editing}
              providers={providers}
              onCancel={() => setEditing(null)}
              onSave={handleSave}
            />
          )}

          {pendingDelete && (
            <ConfirmDialog
              message={`¿Eliminar el envío de "${pendingDelete.provider}" (#${pendingDelete.trackingNumber})?`}
              onConfirm={handleDeleteConfirmed}
              onCancel={() => setPendingDelete(null)}
            />
          )}
        </>
      )}

      {view === "stock" && (
        <>
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Buscar por nombre/diseño o parche..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            <select
              value={productTypeFilter}
              onChange={(e) => setProductTypeFilter(e.target.value as ProductTypeFilter)}
            >
              <option value="Todos">Todos los tipos</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button onClick={() => setEditingProduct("new")}>+ Nuevo producto</button>
          </div>

          {productLoadError && (
            <div className="auth-error page-error">{productLoadError}</div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              {products.length === 0
                ? "Todavía no hay productos en el inventario. Crea el primero."
                : "Ningún producto coincide con la búsqueda/filtro."}
            </div>
          ) : (
            <div className="shipment-grid">
              {filteredProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  categories={categories}
                  shipments={shipments}
                  onEdit={() => setEditingProduct(p)}
                  onDelete={() => setPendingDeleteProduct(p)}
                />
              ))}
            </div>
          )}

          {editingProduct && (
            <ProductForm
              initial={editingProduct === "new" ? null : editingProduct}
              categories={categories}
              shipments={shipments}
              providers={providers}
              onCancel={() => setEditingProduct(null)}
              onSave={handleSaveProduct}
            />
          )}

          {pendingDeleteProduct && (
            <ConfirmDialog
              message={`¿Eliminar el producto "${pendingDeleteProduct.name}"?`}
              onConfirm={handleDeleteProductConfirmed}
              onCancel={() => setPendingDeleteProduct(null)}
            />
          )}
        </>
      )}

      {view === "orders" && (
        <>
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Buscar por nombre o número del cliente..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
            <button onClick={() => setEditingOrder("new")}>+ Nuevo pedido</button>
          </div>

          {orderLoadError && <div className="auth-error page-error">{orderLoadError}</div>}

          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              {orders.length === 0
                ? "Todavía no hay pedidos registrados. Crea el primero."
                : "Ningún pedido coincide con la búsqueda."}
            </div>
          ) : (
            <div className="shipment-grid">
              {filteredOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  shipments={shipments}
                  products={products}
                  onEdit={() => setEditingOrder(o)}
                  onDelete={() => setPendingDeleteOrder(o)}
                  onMarkLineDelivered={(lineIndex) => handleMarkLineDelivered(o, lineIndex)}
                  onMarkAllDelivered={() => handleMarkAllDelivered(o)}
                  onRevertLineDelivered={(lineIndex) => handleRevertLineDelivered(o, lineIndex)}
                  onRevertAllDelivered={() => handleRevertAllDelivered(o)}
                  onRemoveLine={(lineIndex) => handleRemoveOrderLine(o, lineIndex)}
                />
              ))}
            </div>
          )}

          {editingOrder && (
            <OrderForm
              initial={editingOrder === "new" ? null : editingOrder}
              products={products}
              categories={categories}
              shipments={shipments}
              onCancel={() => setEditingOrder(null)}
              onSave={handleSaveOrder}
            />
          )}

          {pendingDeleteOrder && (
            <ConfirmDialog
              message={`¿Eliminar el pedido de "${pendingDeleteOrder.customerName}"?`}
              onConfirm={handleDeleteOrderConfirmed}
              onCancel={() => setPendingDeleteOrder(null)}
            />
          )}
        </>
      )}

      {view === "providers" && (
        <>
          <div className="toolbar">
            <div className="spacer" />
            <button onClick={() => setEditingProvider("new")}>+ Nuevo proveedor</button>
          </div>

          {providerLoadError && <div className="auth-error page-error">{providerLoadError}</div>}

          {providers.length === 0 ? (
            <div className="empty-state">
              Todavía no hay proveedores registrados. Crea el primero.
            </div>
          ) : (
            <div className="shipment-grid">
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  categories={categories}
                  onEdit={() => setEditingProvider(p)}
                  onDelete={() => setPendingDeleteProvider(p)}
                />
              ))}
            </div>
          )}

          {editingProvider && (
            <ProviderForm
              initial={editingProvider === "new" ? null : editingProvider}
              categories={categories}
              onCancel={() => setEditingProvider(null)}
              onSave={handleSaveProvider}
            />
          )}

          {pendingDeleteProvider && (
            <ConfirmDialog
              message={`¿Eliminar el proveedor "${pendingDeleteProvider.name}"?`}
              onConfirm={handleDeleteProviderConfirmed}
              onCancel={() => setPendingDeleteProvider(null)}
            />
          )}
        </>
      )}

      {view === "sales" && (
        <SalesView orders={orders} products={products} providers={providers} shipments={shipments} />
      )}

      {view === "categories" && (
        <>
          {categoryLoadError && (
            <div className="auth-error page-error">{categoryLoadError}</div>
          )}
          <CategoryManager
            categories={categories}
            onCreate={handleCreateCategory}
            onUpdate={handleUpdateCategory}
            onDelete={handleDeleteCategory}
          />
        </>
      )}
    </div>
  );
}
