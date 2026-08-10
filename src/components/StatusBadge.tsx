import type { ShipmentStatus } from "../types";

const STATUS_CLASS: Record<ShipmentStatus, string> = {
  "Pendiente de envío": "status-pending",
  "Enviado": "status-sent",
  "En tránsito": "status-transit",
  "En aduana": "status-customs",
  "Entregado": "status-delivered",
  "Retraso / Problema": "status-problem"
};

export default function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <span className={`status-badge ${STATUS_CLASS[status]}`}>{status}</span>;
}
