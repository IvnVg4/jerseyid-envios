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

// ---- Stock / inventario ----

export const PRODUCT_TYPES = ["Jersey", "Balón", "Chamarra", "Playera"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const JERSEY_SLEEVES = ["Manga corta", "Manga larga"] as const;
export type JerseySleeve = (typeof JERSEY_SLEEVES)[number];

export const JERSEY_VERSIONS = ["Fan", "Jugador", "Retro"] as const;
export type JerseyVersion = (typeof JERSEY_VERSIONS)[number];

export const PRODUCT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export type ProductSize = (typeof PRODUCT_SIZES)[number];

// Balón no usa tallas de ropa (S-4XL).
export const SIZED_PRODUCT_TYPES: ProductType[] = ["Jersey", "Chamarra", "Playera"];

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
  type: ProductType;
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
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  hasDeposit: boolean;
  depositAmount: number;
  lines: OrderLine[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type OrderInput = Omit<Order, "id" | "createdAt" | "updatedAt">;
