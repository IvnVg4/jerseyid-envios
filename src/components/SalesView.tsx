import type { Order, Product, Provider } from "../types";

interface Props {
  orders: Order[];
  products: Product[];
  providers: Provider[];
}

interface Row {
  key: string;
  date: number;
  customerName: string;
  productName: string;
  size: string;
  quantity: number;
  revenue: number;
  cost: number;
  costKnown: boolean;
  profit: number;
}

function lineCost(product: Product | undefined, providers: Provider[]): { cost: number; known: boolean } {
  if (!product || !product.providerId) return { cost: 0, known: false };
  const provider = providers.find((p) => p.id === product.providerId);
  if (!provider) return { cost: 0, known: false };
  const entry = provider.prices.find(
    (p) =>
      p.categoryName === product.type &&
      p.sleeve === (product.sleeve || "") &&
      p.version === (product.version || "")
  );
  if (!entry) return { cost: 0, known: false };
  return { cost: entry.cost, known: true };
}

export default function SalesView({ orders, products, providers }: Props) {
  const rows: Row[] = [];
  for (const order of orders) {
    order.lines.forEach((line, i) => {
      if (line.status !== "Entregado") return;
      const product = products.find((p) => p.id === line.productId);
      const { cost, known } = lineCost(product, providers);
      const revenue = line.quantity * line.unitPrice;
      const cogs = line.quantity * cost;
      rows.push({
        key: `${order.id}-${i}`,
        date: order.updatedAt,
        customerName: order.customerName,
        productName: line.productName,
        size: line.size,
        quantity: line.quantity,
        revenue,
        cost: cogs,
        costKnown: known,
        profit: revenue - cogs
      });
    });
  }
  rows.sort((a, b) => b.date - a.date);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalPieces = rows.reduce((s, r) => s + r.quantity, 0);
  const unknownCostPieces = rows.filter((r) => !r.costKnown).reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="sales-view">
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Ingresos entregados</span>
          <span className="stat-value">${totalRevenue.toLocaleString("es-MX")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Costo</span>
          <span className="stat-value">${totalCost.toLocaleString("es-MX")}</span>
        </div>
        <div className="stat-card stat-card-accent">
          <span className="stat-label">Ganancia</span>
          <span className="stat-value">${totalProfit.toLocaleString("es-MX")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Piezas entregadas</span>
          <span className="stat-value">{totalPieces}</span>
        </div>
      </div>

      <p className="field-hint sales-hint">
        Solo cuenta lo ya <strong>entregado</strong>: lo vendido, apartado o listo para entregar
        todavía no se refleja aquí.
        {unknownCostPieces > 0 &&
          ` ${unknownCostPieces} pieza(s) entregada(s) no tienen proveedor/costo asignado — su ganancia mostrada equivale al precio completo. Asígnales un proveedor en Stock y un precio en Proveedores para verlo real.`}
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">
          Todavía no hay piezas entregadas. Las ventas y ganancias aparecen aquí en cuanto un
          pedido se marca como entregado.
        </div>
      ) : (
        <div className="sales-table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Producto</th>
                <th>Talla</th>
                <th>Cant.</th>
                <th>Venta</th>
                <th>Costo</th>
                <th>Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.customerName}</td>
                  <td>{r.productName}</td>
                  <td>{r.size || "—"}</td>
                  <td>{r.quantity}</td>
                  <td>${r.revenue.toLocaleString("es-MX")}</td>
                  <td>{r.costKnown ? `$${r.cost.toLocaleString("es-MX")}` : "—"}</td>
                  <td>${r.profit.toLocaleString("es-MX")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
