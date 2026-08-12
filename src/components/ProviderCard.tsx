import type { Category, Provider } from "../types";

interface Props {
  provider: Provider;
  categories: Category[];
  onEdit: () => void;
  onDelete: () => void;
}

function whatsappLink(whatsapp: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export default function ProviderCard({ provider, categories, onEdit, onDelete }: Props) {
  const categoryName = (categoryId: string) =>
    categories.find((c) => c.id === categoryId)?.name ?? "Categoría eliminada";

  return (
    <div className="order-card">
      <div className="shipment-body">
        <div className="shipment-header">
          <h3>{provider.name}</h3>
          <span className="type-badge">
            {provider.prices.length} precio{provider.prices.length === 1 ? "" : "s"}
          </span>
        </div>

        {provider.whatsapp && (
          <a
            className="provider-whatsapp"
            href={whatsappLink(provider.whatsapp)}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp · {provider.whatsapp}
          </a>
        )}

        {provider.prices.length > 0 ? (
          <div className="provider-price-list">
            {provider.prices.map((p, i) => (
              <div key={i} className="provider-price-row">
                <span>{[categoryName(p.categoryId), p.sleeve, p.version].filter(Boolean).join(" · ")}</span>
                <span className="provider-price-cost">${p.cost.toLocaleString("es-MX")}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="field-hint">Sin precios registrados todavía.</span>
        )}

        {(provider.personalizationCost > 0 || provider.patchCost > 0) && (
          <div className="product-attrs">
            {provider.personalizationCost > 0 && (
              <span className="attr-chip">
                Personalización ${provider.personalizationCost.toLocaleString("es-MX")}
              </span>
            )}
            {provider.patchCost > 0 && (
              <span className="attr-chip">Parche ${provider.patchCost.toLocaleString("es-MX")}</span>
            )}
          </div>
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
