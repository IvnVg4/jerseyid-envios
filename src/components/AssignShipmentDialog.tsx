import { useState } from "react";
import type { Order, Shipment } from "../types";

interface Props {
  order: Order;
  lineIndex: number;
  shipments: Shipment[];
  onAssign: (shipmentId: string) => Promise<void>;
  onCreateNew: () => void;
  onCancel: () => void;
}

export default function AssignShipmentDialog({ order, lineIndex, shipments, onAssign, onCreateNew, onCancel }: Props) {
  const line = order.lines[lineIndex];
  const [shipmentId, setShipmentId] = useState(line.shipmentId ?? "");
  const [saving, setSaving] = useState(false);
  const eligible = shipments.filter((s) => s.status !== "Entregado");

  async function handleAssign() {
    if (!shipmentId) return;
    setSaving(true);
    try {
      await onAssign(shipmentId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Asignar envío</h2>
        <p className="field-hint">
          {line.quantity}× {line.productName}
          {line.size ? ` (Talla ${line.size})` : ""} — {order.customerName}
        </p>

        <label>
          Envío
          <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
            <option value="" disabled>
              Selecciona un envío...
            </option>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.provider || "Sin proveedor"} · #{s.trackingNumber} · {s.status}
              </option>
            ))}
          </select>
          {eligible.length === 0 && (
            <span className="field-hint">No hay envíos pendientes todavía.</span>
          )}
        </label>

        <button type="button" className="link-button" onClick={onCreateNew}>
          + Crear un envío nuevo para esta pieza
        </button>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" onClick={handleAssign} disabled={!shipmentId || saving}>
            {saving ? "Asignando..." : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}
