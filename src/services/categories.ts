import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import type { Category, CategoryInput } from "../types";

const COLLECTION = "categories";

const DEFAULT_CATEGORIES: CategoryInput[] = [
  { name: "Jersey", parentId: null, usesSizes: true, isJerseyLike: true },
  { name: "Balón", parentId: null, usesSizes: false, isJerseyLike: false },
  { name: "Chamarra", parentId: null, usesSizes: true, isJerseyLike: false },
  { name: "Playera", parentId: null, usesSizes: true, isJerseyLike: false }
];

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
}

export function subscribeToCategories(
  onChange: (categories: Category[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy("name", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const categories: Category[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name ?? "",
          parentId: data.parentId ?? null,
          usesSizes: data.usesSizes ?? false,
          isJerseyLike: data.isJerseyLike ?? false,
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onChange(categories);
    },
    onError
  );
}

/** Si el proyecto todavía no tiene categorías, precarga las 4 originales (mismos nombres que ya usan los productos existentes). */
export async function seedDefaultCategoriesIfEmpty() {
  const snapshot = await getDocs(collection(db, COLLECTION));
  if (!snapshot.empty) return;
  const batch = writeBatch(db);
  for (const input of DEFAULT_CATEGORIES) {
    const ref = doc(collection(db, COLLECTION));
    batch.set(ref, { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

export async function createCategory(input: CategoryInput) {
  await addDoc(collection(db, COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateCategory(id: string, input: Partial<CategoryInput>) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...input,
    updatedAt: serverTimestamp()
  });
}

export async function deleteCategory(id: string) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Borra una categoría padre junto con todas sus subcategorías. */
export async function deleteCategoryWithChildren(id: string, categories: Category[]) {
  const batch = writeBatch(db);
  batch.delete(doc(db, COLLECTION, id));
  for (const child of categories.filter((c) => c.parentId === id)) {
    batch.delete(doc(db, COLLECTION, child.id));
  }
  await batch.commit();
}
