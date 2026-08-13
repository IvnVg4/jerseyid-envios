export const SHIPMENT_STATUSES = [
  "Pendiente de envío",
  "Enviado",
  "En tránsito",
  "En aduana",
  "Entregado",
  "Retraso / Problema"
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const MAX_IMAGES_PER_SHIPMENT = 6;

// Fábrica = restock hacia la sucursal. Sucursal = ya es stock propio,
// saliendo hacia un cliente (no dispara la automatización de abajo).
export const SHIPMENT_ORIGINS = ["Fábrica", "Sucursal"] as const;
export type ShipmentOrigin = (typeof SHIPMENT_ORIGINS)[number];

// Solo aplica/se pide cuando origin es "Fábrica": define si al llegar el
// envío el pedido ligado pasa a "Listo para entregar" (Sucursal) o directo
// a "Entregado" (Domicilio).
export const SHIPMENT_DESTINATION_TYPES = ["Sucursal", "Domicilio"] as const;
export type ShipmentDestinationType = (typeof SHIPMENT_DESTINATION_TYPES)[number];

export interface Shipment {
  id: string;
  /** Nombre del proveedor (copiado de `providerId` al elegirlo; se guarda también como
   * texto para no depender de un join al mostrar el envío). */
  provider: string;
  /** Proveedor de mercancía (de la pestaña Proveedores) del que viene este envío — se
   * elige de una lista, no se escribe. Se copia automáticamente a los productos que se
   * enlacen a este envío, para calcular su costo/ganancia en Ventas sin asignarlo uno
   * por uno. */
  providerId: string;
  trackingNumber: string;
  trackingLink: string;
  destination: string;
  status: ShipmentStatus;
  origin: ShipmentOrigin;
  destinationType: ShipmentDestinationType;
  notes: string;
  images: string[];
  createdAt: number;
  updatedAt: number;
}

export type ShipmentInput = Omit<Shipment, "id" | "createdAt" | "updatedAt">;

// ---- Categorías ----

// Categorías totalmente editables desde la app (apartado "Categorías"): son el
// catálogo de tipos de producto (Jersey, Balón, Chamarra, ...) y también la
// llave con la que un proveedor cotiza cada tipo (ver `ProviderPriceEntry`).
// Una categoría con parentId null es una categoría padre.
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  /** Si aplica selector de talla (S–4XL) a los productos de esta categoría. */
  usesSizes: boolean;
  /** Si aplica los campos de manga/versión/personalizado/parches. */
  isJerseyLike: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CategoryInput = Omit<Category, "id" | "createdAt" | "updatedAt">;

// ---- Stock / inventario ----

export const JERSEY_SLEEVES = ["Manga corta", "Manga larga"] as const;
export type JerseySleeve = (typeof JERSEY_SLEEVES)[number];

export const JERSEY_VERSIONS = ["Fan", "Jugador", "Retro"] as const;
export type JerseyVersion = (typeof JERSEY_VERSIONS)[number];

export const PRODUCT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export type ProductSize = (typeof PRODUCT_SIZES)[number];

export const MAX_IMAGES_PER_PRODUCT = 2;

// "Stock" = restock general de la tienda, disponible para cualquier cliente.
// "Pedido" = ya está apartado para un pedido de cliente en concreto (aunque
// todavía no se le haya asignado cuál — ver `linkedOrderId`); nunca cuenta como
// inventario disponible en general, y su envío se asigna desde Pedidos, no
// desde Inventario.
export const BATCH_PURPOSES = ["Stock", "Pedido"] as const;
export type BatchPurpose = (typeof BATCH_PURPOSES)[number];

/**
 * Un lote de piezas que todavía no es stock físico: se pidió al proveedor (ver
 * `PurchaseOrder`) y puede estar "En fábrica" (sin tracking todavía, `shipmentId`
 * null) o "En camino" (ya se le enlazó un envío). Una misma talla puede tener
 * varios lotes a la vez (ej. uno en fábrica y otro ya en camino), y puede tener
 * lotes Y stock (`ProductVariant.quantity`) simultáneamente — no son excluyentes.
 */
export interface IncomingBatch {
  id: string;
  quantity: number;
  /** Piezas de este lote ya apartadas por líneas de pedido. */
  reserved: number;
  /** De qué "pedido a proveedor" salió este lote (ver `PurchaseOrder`). null = lote suelto, capturado a mano en el producto. */
  purchaseOrderId: string | null;
  /** null = "En fábrica" (pedido, sin tracking aún); con valor = "En camino" (ya tiene envío enlazado).
   * Se asigna desde Inventario si `purpose` es "Stock" (al hacer/editar el pedido a proveedor), o
   * desde Pedidos si `purpose` es "Pedido" — nunca desde el producto directamente. */
  shipmentId: string | null;
  /** Para quién es este lote: restock general ("Stock") o ya apartado para un cliente ("Pedido"). */
  purpose: BatchPurpose;
  /** Solo aplica si `purpose` es "Pedido": a qué pedido de cliente está destinado. Puede quedar
   * null si todavía no se decide a cuál (se puede vincular después). */
  linkedOrderId: string | null;
}

/** Una talla (o la única variante, si la categoría no usa tallas) dentro de un mismo producto/diseño. */
export interface ProductVariant {
  size: ProductSize | "";
  /** Piezas físicamente en stock — independiente de `incoming`, pueden coexistir. */
  quantity: number;
  /** Lotes que todavía no son stock (0..n, ver `IncomingBatch`). */
  incoming: IncomingBatch[];
}

/**
 * Piezas ya personalizadas (nombre/número ya estampado) que llegaron como parte del
 * stock normal del mismo diseño — ej. 10 jerseys en blanco + 1 idéntica pero con
 * "Vini Jr · 7" ya impresa. Es solo una etiqueta informativa sobre piezas que ya
 * están contadas dentro de `ProductVariant.quantity`; no lleva su propio conteo
 * independiente (se ajusta a mano junto con la cantidad de la talla al venderse).
 */
export interface PersonalizedUnit {
  id: string;
  size: ProductSize | "";
  customName: string;
  customNumber: string;
  quantity: number;
}

export interface Product {
  id: string;
  /** Referencia a `Category.id` (nunca al nombre: así renombrar una categoría no
   * desconecta los productos que ya la usan ni los precios de proveedor). "" si
   * el producto quedó sin categoría (ej. su categoría se borró). */
  categoryId: string;
  name: string;
  sleeve: JerseySleeve | "";
  version: JerseyVersion | "";
  personalized: boolean;
  patches: string[];
  images: string[];
  /** Precio de venta unitario. */
  price: number;
  /** Proveedor del que viene este diseño (para calcular costo/ganancia en Ventas). "" si no aplica. */
  providerId: string;
  /** Una entrada por talla; si la categoría no usa tallas, hay exactamente una con size "". */
  variants: ProductVariant[];
  personalizedUnits: PersonalizedUnit[];
  createdAt: number;
  updatedAt: number;
}

export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;

// ---- Pedidos ----

export const ORDER_LINE_STATUSES = [
  "En preparación",
  "Enviado",
  "Listo para entregar",
  "Entregado"
] as const;
export type OrderLineStatus = (typeof ORDER_LINE_STATUSES)[number];

export interface OrderLine {
  productId: string;
  productName: string;
  /** Talla vendida de ese producto. "" si la categoría no usa tallas. */
  size: ProductSize | "";
  quantity: number;
  status: OrderLineStatus;
  /** Qué lote de `ProductVariant.incoming` reservó esta pieza (ver services/orders.ts).
   * null = la pieza salió directo del stock físico (`ProductVariant.quantity`). */
  sourceBatchId: string | null;
  /** Envío que lleva esta pieza a su destino final (tienda o domicilio del cliente).
   * Se puede asignar a cualquier línea, venga de stock o de un lote de fábrica — no
   * solo a las que llegaron "bajo pedido" como antes. */
  shipmentId: string | null;
  /** Precio unitario capturado al agregar la línea (no cambia si luego cambia el precio del producto). */
  unitPrice: number;
  /**
   * Costo unitario del proveedor, congelado en el momento en que la línea se marca
   * "Entregado" (ver `resolveUnitCost` en services/costing.ts) — igual que
   * `unitPrice` ya se fija al agregar la línea, así el reporte de Ventas no cambia
   * si después se edita el precio del proveedor.
   * `null` = en ese momento no había proveedor/precio asignado (costo desconocido,
   * nunca se trata como 0 para no inflar la ganancia mostrada).
   * `undefined` = línea entregada antes de que existiera este campo; Ventas cae de
   * vuelta a calcularlo al vuelo con el precio vigente, como respaldo.
   */
  unitCost?: number | null;
  /** Nombre a estampar en la jersey (solo para productos personalizados). Puede venir vacío si solo se pide número. */
  customName: string;
  /** Número a estampar en la jersey (solo para productos personalizados). Puede venir vacío si solo se pide nombre. */
  customNumber: string;
}

// Cliente de Mérida = entrega local, sin datos de envío. Envío foráneo =
// pide dirección completa para mandarlo fuera de Mérida.
export const ORDER_FULFILLMENT_TYPES = ["Cliente de Mérida", "Envío foráneo"] as const;
export type OrderFulfillmentType = (typeof ORDER_FULFILLMENT_TYPES)[number];

export interface OrderShippingAddress {
  city: string;
  state: string;
  street: string;
  crossStreets: string;
  neighborhood: string;
  postalCode: string;
}

export const EMPTY_SHIPPING_ADDRESS: OrderShippingAddress = {
  city: "",
  state: "",
  street: "",
  crossStreets: "",
  neighborhood: "",
  postalCode: ""
};

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  hasDeposit: boolean;
  depositAmount: number;
  fulfillmentType: OrderFulfillmentType;
  shippingAddress: OrderShippingAddress | null;
  lines: OrderLine[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type OrderInput = Omit<Order, "id" | "createdAt" | "updatedAt">;

// ---- Proveedores ----

/**
 * Precio (costo) que cobra un proveedor por un tipo de producto. Referencia
 * `Category.id` (no el nombre) para no desconectarse si la categoría se
 * renombra. `sleeve`/`version` solo aplican si la categoría es tipo jersey
 * (isJerseyLike); si no, quedan "" y el precio aplica a toda la categoría.
 */
export interface ProviderPriceEntry {
  categoryId: string;
  sleeve: JerseySleeve | "";
  version: JerseyVersion | "";
  cost: number;
}

export interface Provider {
  id: string;
  name: string;
  /** Número de WhatsApp del proveedor (con o sin lada), para contactarlo directo. */
  whatsapp: string;
  prices: ProviderPriceEntry[];
  /** Costo extra que cobra este proveedor por personalizar una pieza (nombre/número),
   * aplicado por línea de pedido cuando el cliente pide esa personalización. */
  personalizationCost: number;
  /** Costo extra que cobra este proveedor por cada parche agregado a una pieza,
   * multiplicado por la cantidad de parches del producto (`Product.patches`). */
  patchCost: number;
  createdAt: number;
  updatedAt: number;
}

export type ProviderInput = Omit<Provider, "id" | "createdAt" | "updatedAt">;

// ---- Pedidos a proveedor ----

/**
 * Una línea de un pedido a proveedor: cada producto/talla que se pide decide por
 * separado si es para engrosar el stock de la tienda o si ya va destinado a un
 * pedido de cliente — un mismo pedido a proveedor puede mezclar ambos casos
 * (ej. 10 piezas de restock + 2 que ya tienen dueño).
 */
export interface PurchaseOrderLine {
  productId: string;
  productName: string;
  size: ProductSize | "";
  quantity: number;
  /** Id del `IncomingBatch` creado en el producto para esta línea. */
  batchId: string;
  purpose: BatchPurpose;
  /** Solo aplica si purpose es "Pedido". Puede quedar null (sin decidir todavía)
   * y vincularse después desde la tarjeta del pedido a proveedor. */
  linkedOrderId: string | null;
}

export interface PurchaseOrder {
  id: string;
  providerId: string;
  hasDeposit: boolean;
  depositAmount: number;
  lines: PurchaseOrderLine[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type PurchaseOrderInput = Omit<PurchaseOrder, "id" | "createdAt" | "updatedAt">;
