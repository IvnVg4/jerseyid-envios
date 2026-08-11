import type { OrderLineStatus } from "../types";

const STATUS_CLASS: Record<OrderLineStatus, string> = {
  "Vendida": "status-sent",
  "Bajo pedido": "status-pending",
  "Listo para entregar": "status-transit",
  "Entregado": "status-delivered"
};

export default function OrderLineStatusBadge({ status }: { status: OrderLineStatus }) {
  return <span className={`status-badge ${STATUS_CLASS[status]}`}>{status}</span>;
}
