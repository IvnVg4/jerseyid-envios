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

export interface Shipment {
  id: string;
  provider: string;
  trackingNumber: string;
  trackingLink: string;
  status: ShipmentStatus;
  notes: string;
  images: string[];
  createdAt: number;
  updatedAt: number;
}

export type ShipmentInput = Omit<Shipment, "id" | "createdAt" | "updatedAt">;
