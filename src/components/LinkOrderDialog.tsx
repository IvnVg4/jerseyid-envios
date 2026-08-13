import { useState } from "react";
import type { Order, PurchaseOrder } from "../types";

interface Props {
  purchaseOrder: PurchaseOrder;
  lineIndex: number;
  orders: Order[];
  onLink: (order: Order) => Promise<void>;
  onCancel: () => void;
}

export default function LinkOrderDialog({ purchaseOrder, lineIndex, orders, onLink, onCancel }: Props) {
  const line = purchaseOrder.lines[lineIndex];
  const [orderId, setOrderId] = useState("");
  const [saving, setSaving] = useState(false);
  const eligible = orders.filter((o) => o.lines.some((l) => l.status !== "Entregado"));

  async function handleLink() {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setSaving(true);
    try {
      await onLink(order);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Vincular a pedido de cliente</h2>
        <p className="field-hint">
          {line.quantity}× {line.productName}
          {line.size ? ` (Talla ${line.size})` : ""} — se reservará por completo para el pedido que
          elijas.
        </p>

        <label>
          Pedido de cliente
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="" disabled>
              Selecciona un pedido...
            </option>
            {eligible.map((o) => (
              <option key={o.id} value={o.id}>
                {o.customerName} · {o.customerPhone}
              </option>
            ))}
          </select>
          {eligible.length === 0 && (
            <span className="field-hint">No hay pedidos de cliente abiertos todavía.</span>
          )}
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" onClick={handleLink} disabled={!orderId || saving}>
            {saving ? "Vinculando..." : "Vincular"}
          </button>
        </div>
      </div>
    </div>
  );
}
