import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import type { Product, ProductInput, ProductVariant } from "../types";

const COLLECTION = "products";

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
}

/**
 * Productos guardados antes de que las tallas se unieran en `variants` traían
 * `size`/`quantity`/`stockStatus`/`incoming` sueltos a nivel de producto. Los
 * adaptamos al leerlos para no requerir una migración de datos aparte; en cuanto
 * se vuelvan a guardar (editar el producto, o cualquier ajuste de stock) quedan
 * en el formato nuevo.
 */
function normalizeVariants(data: Record<string, unknown>): ProductVariant[] {
  if (Array.isArray(data.variants) && data.variants.length > 0) {
    return data.variants.map((v: Partial<ProductVariant>) => ({
      size: v.size ?? "",
      stockStatus: v.stockStatus ?? "Agotado",
      quantity: v.quantity ?? 0,
      incoming: v.incoming ?? null
    }));
  }
  return [
    {
      size: (data.size as ProductVariant["size"]) ?? "",
      stockStatus:
        (data.stockStatus as ProductVariant["stockStatus"]) ??
        ((data.quantity as number) > 0 ? "En stock" : "Agotado"),
      quantity: (data.quantity as number) ?? 0,
      incoming: (data.incoming as ProductVariant["incoming"]) ?? null
    }
  ];
}

export function subscribeToProducts(
  onChange: (products: Product[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const products: Product[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          // "" hasta que se corrija sola (ver reconcileProductCategories en
          // sync.ts) cualquier producto que todavía traiga el `type` (nombre)
          // viejo en vez del `categoryId` actual.
          categoryId: data.categoryId ?? "",
          name: data.name ?? "",
          sleeve: data.sleeve ?? "",
          version: data.version ?? "",
          personalized: data.personalized ?? false,
          patches: data.patches ?? [],
          images: data.images ?? [],
          price: data.price ?? 0,
          providerId: data.providerId ?? "",
          variants: normalizeVariants(data),
          personalizedUnits: data.personalizedUnits ?? [],
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onChange(products);
    },
    onError
  );
}

export async function createProduct(input: ProductInput) {
  await addDoc(collection(db, COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...input,
    updatedAt: serverTimestamp()
  });
}

export async function deleteProduct(id: string) {
  await deleteDoc(doc(db, COLLECTION, id));
}
