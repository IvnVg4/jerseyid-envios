import type { IncomingBatch, Product, ProductVariant } from "../types";

/** Piezas de un lote que todavía no están apartadas por ningún pedido. */
export function batchAvailable(batch: IncomingBatch): number {
  return Math.max(0, batch.quantity - batch.reserved);
}

/** Piezas disponibles para vender de una talla: stock físico + lo libre de cada lote. */
export function availableQuantity(variant: ProductVariant): number {
  return variant.quantity + variant.incoming.reduce((sum, b) => sum + batchAvailable(b), 0);
}

export interface VariantSummary {
  inStock: number;
  inFactory: number; // lotes sin envío enlazado todavía (shipmentId null)
  inTransit: number; // lotes con envío enlazado (shipmentId set)
}

/**
 * Resumen del estado de una talla, para mostrar en tarjetas/badges sin repetir
 * la cuenta. Los lotes "Pedido" (ya apartados para un cliente en concreto,
 * asignado o no todavía) y cualquier lote con piezas reservadas no cuentan
 * aquí: desde la tienda no hay nada realmente disponible en esas piezas,
 * aunque técnicamente sigan sin llegar.
 */
export function summarizeVariant(variant: ProductVariant): VariantSummary {
  let inFactory = 0;
  let inTransit = 0;
  for (const batch of variant.incoming) {
    if (batch.purpose === "Pedido" || batch.reserved > 0) continue;
    if (batch.shipmentId) inTransit += batch.quantity;
    else inFactory += batch.quantity;
  }
  return { inStock: variant.quantity, inFactory, inTransit };
}

export function isVariantEmpty(variant: ProductVariant): boolean {
  const s = summarizeVariant(variant);
  return s.inStock === 0 && s.inFactory === 0 && s.inTransit === 0;
}

export const PRODUCT_STOCK_FILTERS = ["Todos", "En stock", "Solo en fábrica/camino", "Agotado"] as const;
export type ProductStockFilter = (typeof PRODUCT_STOCK_FILTERS)[number];

/** Estado del producto completo (todas sus tallas juntas), para filtrarlo en Inventario. */
export function productStockState(product: Product): "En stock" | "Solo en fábrica/camino" | "Agotado" {
  let hasStock = false;
  let hasIncoming = false;
  for (const v of product.variants) {
    const s = summarizeVariant(v);
    if (s.inStock > 0) hasStock = true;
    if (s.inFactory > 0 || s.inTransit > 0) hasIncoming = true;
  }
  if (hasStock) return "En stock";
  if (hasIncoming) return "Solo en fábrica/camino";
  return "Agotado";
}

export function matchesStockFilter(product: Product, filter: ProductStockFilter): boolean {
  if (filter === "Todos") return true;
  return productStockState(product) === filter;
}
