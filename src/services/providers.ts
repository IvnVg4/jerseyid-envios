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
import type { Provider, ProviderInput, ProviderPriceEntry } from "../types";

const COLLECTION = "providers";

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
}

export function subscribeToProviders(
  onChange: (providers: Provider[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy("name", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const providers: Provider[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const prices = Array.isArray(data.prices) ? data.prices : [];
        return {
          id: docSnap.id,
          name: data.name ?? "",
          whatsapp: data.whatsapp ?? "",
          // "" hasta que se corrija sola (ver reconcileProviderCategoryPrices en
          // sync.ts) cualquier precio que todavía traiga el `categoryName` viejo
          // en vez del `categoryId` actual.
          prices: prices.map((p: Partial<ProviderPriceEntry>) => ({
            categoryId: p.categoryId ?? "",
            sleeve: p.sleeve ?? "",
            version: p.version ?? "",
            cost: p.cost ?? 0
          })),
          personalizationCost: data.personalizationCost ?? 0,
          patchCost: data.patchCost ?? 0,
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onChange(providers);
    },
    onError
  );
}

export async function createProvider(input: ProviderInput) {
  await addDoc(collection(db, COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateProvider(id: string, input: ProviderInput) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...input,
    updatedAt: serverTimestamp()
  });
}

export async function deleteProvider(id: string) {
  await deleteDoc(doc(db, COLLECTION, id));
}
