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
 * Shape viejo de una talla: `stockStatus` mutuamente excluyente con un único
 * `incoming` (en vez de `quantity` + `incoming: IncomingBatch[]` independientes).
 * Se adapta al leerla, sin migración de datos aparte.
 */
interface LegacyIncoming {
  shipmentId: string;
  quantity: number;
  reserved: number;
}
interface LegacyVariant {
  size?: ProductVariant["size"];
  stockStatus?: "Agotado" | "En camino" | "En stock";
  quantity?: number;
  incoming?: LegacyIncoming | ProductVariant["incoming"][number][] | null;
}

function normalizeVariant(v: LegacyVariant): ProductVariant {
  const size = v.size ?? "";
  // Ya en el shape nuevo (incoming es un arreglo): solo rellenar defaults. Los
  // lotes de antes de que existiera `purpose` no traen ese campo — se infiere
  // "Pedido" si ya estaban reservados (así se creaban los lotes automáticos por
  // faltante) o "Stock" si no (restock suelto/de proveedor).
  if (Array.isArray(v.incoming)) {
    return {
      size,
      quantity: v.quantity ?? 0,
      incoming: v.incoming.map((b) => ({
        id: b.id ?? crypto.randomUUID(),
        quantity: b.quantity ?? 0,
        reserved: b.reserved ?? 0,
        purchaseOrderId: b.purchaseOrderId ?? null,
        shipmentId: b.shipmentId ?? null,
        purpose: b.purpose ?? ((b.reserved ?? 0) > 0 ? "Pedido" : "Stock"),
        linkedOrderId: b.linkedOrderId ?? null
      }))
    };
  }
  // Shape viejo: stockStatus + incoming único (o null).
  const legacyIncoming = v.incoming as LegacyIncoming | null | undefined;
  const quantity = v.stockStatus === "En camino" ? 0 : v.quantity ?? 0;
  const incoming: ProductVariant["incoming"] =
    v.stockStatus === "En camino" && legacyIncoming
      ? [
          {
            id: crypto.randomUUID(),
            quantity: legacyIncoming.quantity ?? 0,
            reserved: legacyIncoming.reserved ?? 0,
            purchaseOrderId: null,
            shipmentId: legacyIncoming.shipmentId || null,
            purpose: (legacyIncoming.reserved ?? 0) > 0 ? "Pedido" : "Stock",
            linkedOrderId: null
          }
        ]
      : [];
  return { size, quantity, incoming };
}

function normalizeVariants(data: Record<string, unknown>): ProductVariant[] {
  if (Array.isArray(data.variants) && data.variants.length > 0) {
    return data.variants.map((v: LegacyVariant) => normalizeVariant(v));
  }
  return [
    normalizeVariant({
      size: data.size as ProductVariant["size"],
      stockStatus: data.stockStatus as LegacyVariant["stockStatus"],
      quantity: data.quantity as number,
      incoming: data.incoming as LegacyVariant["incoming"]
    })
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

export async function createProduct(input: ProductInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
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
