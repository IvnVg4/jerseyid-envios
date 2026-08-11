import { FormEvent, useState } from "react";
import type { Category, CategoryInput } from "../types";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  categories: Category[];
  onCreate: (input: CategoryInput) => Promise<void>;
  onUpdate: (id: string, input: Partial<CategoryInput>) => Promise<void>;
  onDelete: (category: Category) => Promise<void>;
}

export default function CategoryManager({ categories, onCreate, onUpdate, onDelete }: Props) {
  const [newParentName, setNewParentName] = useState("");
  const [childInputs, setChildInputs] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parents = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

  async function addParent(e: FormEvent) {
    e.preventDefault();
    const name = newParentName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name, parentId: null, usesSizes: false, isJerseyLike: false });
      setNewParentName("");
    } catch {
      setError("No se pudo crear la categoría.");
    } finally {
      setBusy(false);
    }
  }

  async function addChild(parentId: string) {
    const name = (childInputs[parentId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name, parentId, usesSizes: false, isJerseyLike: false });
      setChildInputs((f) => ({ ...f, [parentId]: "" }));
    } catch {
      setError("No se pudo crear la subcategoría.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(editing.id, { name });
      setEditing(null);
    } catch {
      setError("No se pudo renombrar la categoría.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFlag(category: Category, flag: "usesSizes" | "isJerseyLike") {
    setError(null);
    try {
      await onUpdate(category.id, { [flag]: !category[flag] });
    } catch {
      setError("No se pudo actualizar la categoría.");
    }
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(pendingDelete);
      setPendingDelete(null);
    } catch {
      setError("No se pudo eliminar la categoría.");
    } finally {
      setBusy(false);
    }
  }

  function renderRow(category: Category, isChild: boolean) {
    const isEditing = editing?.id === category.id;
    return (
      <div key={category.id} className={isChild ? "category-row category-row-child" : "category-row"}>
        {isEditing ? (
          <input
            autoFocus
            value={editing.name}
            onChange={(e) => setEditing({ id: category.id, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") setEditing(null);
            }}
          />
        ) : (
          <span
            className="category-name"
            onClick={() => setEditing({ id: category.id, name: category.name })}
            title="Clic para renombrar"
          >
            {category.name}
          </span>
        )}

        <label className="category-flag">
          <input
            type="checkbox"
            checked={category.usesSizes}
            onChange={() => toggleFlag(category, "usesSizes")}
          />
          Tallas
        </label>
        <label className="category-flag">
          <input
            type="checkbox"
            checked={category.isJerseyLike}
            onChange={() => toggleFlag(category, "isJerseyLike")}
          />
          Manga/versión/parches
        </label>

        <div className="spacer" />
        {isEditing ? (
          <>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button type="button" onClick={saveEdit} disabled={busy}>
              Guardar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="icon-button danger"
            onClick={() => setPendingDelete(category)}
            title="Eliminar"
          >
            Eliminar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="category-manager">
      <p className="field-hint category-manager-hint">
        Clic en el nombre de una categoría para renombrarla. "Tallas" muestra el selector de talla
        en el formulario de productos; "Manga/versión/parches" muestra esos campos extra (para tipo
        jersey).
      </p>

      {error && <div className="auth-error page-error">{error}</div>}

      {parents.length === 0 && (
        <div className="empty-state">
          Todavía no hay categorías. Crea la primera categoría padre abajo.
        </div>
      )}

      {parents.map((parent) => (
        <div key={parent.id} className="category-group">
          {renderRow(parent, false)}
          <div className="category-children">
            {childrenOf(parent.id).map((child) => renderRow(child, true))}
            <div className="category-row category-row-child category-row-add">
              <input
                placeholder="Nueva subcategoría..."
                value={childInputs[parent.id] ?? ""}
                onChange={(e) => setChildInputs((f) => ({ ...f, [parent.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChild(parent.id);
                  }
                }}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => addChild(parent.id)}
                disabled={busy}
              >
                + Subcategoría
              </button>
            </div>
          </div>
        </div>
      ))}

      <form className="category-row category-row-add-parent" onSubmit={addParent}>
        <input
          placeholder="Nueva categoría padre..."
          value={newParentName}
          onChange={(e) => setNewParentName(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          + Categoría padre
        </button>
      </form>

      {pendingDelete && (
        <ConfirmDialog
          message={
            pendingDelete.parentId === null && childrenOf(pendingDelete.id).length > 0
              ? `¿Eliminar la categoría "${pendingDelete.name}" y sus ${
                  childrenOf(pendingDelete.id).length
                } subcategoría(s)? Los productos que ya la usan conservan el nombre como texto.`
              : `¿Eliminar la categoría "${pendingDelete.name}"? Los productos que ya la usan conservan el nombre como texto.`
          }
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
