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

// Categorías totalmente editables desde la app (apartado "Categorías"). Una
// categoría con parentId null es una categoría padre; el producto siempre
// guarda el *nombre* (no el id) en `product.type`, igual que antes cuando los
// tipos eran fijos, para no romper los productos ya guardados.
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

export const PRODUCT_STOCK_STATUSES = ["Agotado", "En camino", "En stock"] as const;
export type ProductStockStatus = (typeof PRODUCT_STOCK_STATUSES)[number];

export interface ProductIncoming {
  shipmentId: string;
  quantity: number;
  /** Piezas de este lote ya apartadas por pedidos "Bajo pedido". */
  reserved: number;
}

/** Una talla (o la única variante, si la categoría no usa tallas) dentro de un mismo producto/diseño. */
export interface ProductVariant {
  size: ProductSize | "";
  stockStatus: ProductStockStatus;
  quantity: number;
  incoming: ProductIncoming | null;
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
  type: string;
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
  "Vendida",
  "Bajo pedido",
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
  shipmentId: string | null;
  /** Precio unitario capturado al agregar la línea (no cambia si luego cambia el precio del producto). */
  unitPrice: number;
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
 * Precio (costo) que cobra un proveedor por un tipo de producto. `sleeve`/`version`
 * solo aplican si la categoría es tipo jersey (isJerseyLike); si no, quedan "" y el
 * precio aplica a toda la categoría.
 */
export interface ProviderPriceEntry {
  categoryName: string;
  sleeve: JerseySleeve | "";
  version: JerseyVersion | "";
  cost: number;
}

export interface Provider {
  id: string;
  name: string;
  prices: ProviderPriceEntry[];
  createdAt: number;
  updatedAt: number;
}

export type ProviderInput = Omit<Provider, "id" | "createdAt" | "updatedAt">;
