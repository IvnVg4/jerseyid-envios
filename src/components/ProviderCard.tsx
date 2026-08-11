import type { Provider } from "../types";

interface Props {
  provider: Provider;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ProviderCard({ provider, onEdit, onDelete }: Props) {
  return (
    <div className="order-card">
      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{provider.name}</h3>
          <span className="type-badge">
            {provider.prices.length} precio{provider.prices.length === 1 ? "" : "s"}
          </span>
        </div>

        {provider.prices.length > 0 ? (
          <div className="provider-price-list">
            {provider.prices.map((p, i) => (
              <div key={i} className="provider-price-row">
                <span>{[p.categoryName, p.sleeve, p.version].filter(Boolean).join(" · ")}</span>
                <span className="provider-price-cost">${p.cost.toLocaleString("es-MX")}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="field-hint">Sin precios registrados todavía.</span>
        )}

        <div className="shipment-actions">
          <div className="spacer" />
          <button className="icon-button" onClick={onEdit} title="Editar">
            Editar
          </button>
          <button className="icon-button danger" onClick={onDelete} title="Eliminar">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
