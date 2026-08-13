import type { OrderLineStatus } from "../types";

const STATUS_CLASS: Record<OrderLineStatus, string> = {
  "En preparación": "status-pending",
  "Enviado": "status-sent",
  "Listo para entregar": "status-transit",
  "Entregado": "status-delivered"
};

export default function OrderLineStatusBadge({ status }: { status: OrderLineStatus }) {
  return <span className={`status-badge ${STATUS_CLASS[status]}`}>{status}</span>;
}
