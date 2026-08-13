import type { IncomingBatch, ProductVariant } from "../types";

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

/** Resumen del estado de una talla, para mostrar en tarjetas/badges sin repetir la cuenta. */
export function summarizeVariant(variant: ProductVariant): VariantSummary {
  let inFactory = 0;
  let inTransit = 0;
  for (const batch of variant.incoming) {
    if (batch.shipmentId) inTransit += batch.quantity;
    else inFactory += batch.quantity;
  }
  return { inStock: variant.quantity, inFactory, inTransit };
}

export function isVariantEmpty(variant: ProductVariant): boolean {
  const s = summarizeVariant(variant);
  return s.inStock === 0 && s.inFactory === 0 && s.inTransit === 0;
}
