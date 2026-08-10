import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import { SHIPMENT_STATUSES, Shipment, ShipmentInput, ShipmentStatus } from "./types";
import {
  createShipment,
  deleteShipment,
  subscribeToShipments,
  updateShipment
} from "./services/shipments";
import Login from "./components/Login";
import ShipmentCard from "./components/ShipmentCard";
import ShipmentForm from "./components/ShipmentForm";
import ConfirmDialog from "./components/ConfirmDialog";

type StatusFilter = "Todos" | ShipmentStatus;

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [editing, setEditing] = useState<Shipment | null | "new">(null);
  const [pendingDelete, setPendingDelete] = useState<Shipment | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToShipments(setShipments, (err) =>
      setLoadError(err.message)
    );
    return unsub;
  }, [user]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shipments.filter((s) => {
      const matchesStatus = statusFilter === "Todos" || s.status === statusFilter;
      const matchesTerm =
        !term ||
        s.provider.toLowerCase().includes(term) ||
        s.trackingNumber.toLowerCase().includes(term) ||
        s.notes.toLowerCase().includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [shipments, search, statusFilter]);

  if (!isFirebaseConfigured) {
    return (
      <div className="config-warning">
        <h1>Falta configurar Firebase</h1>
        <p>
          Edita <code>src/firebaseConfig.ts</code> con los datos de tu proyecto de
          Firebase (ver <code>README.md</code>) y vuelve a iniciar la app.
        </p>
      </div>
    );
  }

  if (user === undefined) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!user) {
    return <Login />;
  }

  async function handleSave(input: ShipmentInput) {
    if (editing && editing !== "new") {
      await updateShipment(editing.id, input);
    } else {
      await createShipment(input);
    }
    setEditing(null);
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    await deleteShipment(pendingDelete.id);
    setPendingDelete(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>JerseyID · Envíos</h1>
        <div className="header-actions">
          <span className="user-email">{user.email}</span>
          <button className="secondary" onClick={() => signOut(auth)}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Buscar por proveedor, seguimiento o nota..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="Todos">Todos los estados</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button onClick={() => setEditing("new")}>+ Nuevo envío</button>
      </div>

      {loadError && <div className="auth-error page-error">{loadError}</div>}

      {filtered.length === 0 ? (
        <div className="empty-state">
          {shipments.length === 0
            ? "Todavía no hay envíos registrados. Crea el primero."
            : "Ningún envío coincide con la búsqueda/filtro."}
        </div>
      ) : (
        <div className="shipment-grid">
          {filtered.map((s) => (
            <ShipmentCard
              key={s.id}
              shipment={s}
              onEdit={() => setEditing(s)}
              onDelete={() => setPendingDelete(s)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ShipmentForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          message={`¿Eliminar el envío de "${pendingDelete.provider}" (#${pendingDelete.trackingNumber})?`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
