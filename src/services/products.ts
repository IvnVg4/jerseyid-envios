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
import type { Product, ProductInput } from "../types";

const COLLECTION = "products";

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
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
          type: data.type ?? "Jersey",
          name: data.name ?? "",
          size: data.size ?? "",
          sleeve: data.sleeve ?? "",
          version: data.version ?? "",
          personalized: data.personalized ?? false,
          patches: data.patches ?? [],
          quantity: data.quantity ?? 0,
          stockStatus: data.stockStatus ?? (data.quantity > 0 ? "En stock" : "Agotado"),
          incoming: data.incoming ?? null,
          images: data.images ?? [],
          price: data.price ?? 0,
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
