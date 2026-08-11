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
  provider: string;
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

export interface Product {
  id: string;
  type: string;
  name: string;
  size: ProductSize | "";
  sleeve: JerseySleeve | "";
  version: JerseyVersion | "";
  personalized: boolean;
  patches: string[];
  quantity: number;
  stockStatus: ProductStockStatus;
  incoming: ProductIncoming | null;
  images: string[];
  /** Precio de venta unitario. */
  price: number;
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
  quantity: number;
  status: OrderLineStatus;
  shipmentId: string | null;
  /** Precio unitario capturado al agregar la línea (no cambia si luego cambia el precio del producto). */
  unitPrice: number;
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
