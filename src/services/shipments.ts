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
import type { Shipment, ShipmentInput } from "../types";

const COLLECTION = "shipments";

function toMillis(value: Timestamp | undefined): number {
  return value ? value.toMillis() : Date.now();
}

export function subscribeToShipments(
  onChange: (shipments: Shipment[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const shipments: Shipment[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          provider: data.provider ?? "",
          providerId: data.providerId ?? "",
          trackingNumber: data.trackingNumber ?? "",
          trackingLink: data.trackingLink ?? "",
          destination: data.destination ?? "",
          status: data.status ?? "Pendiente de envío",
          origin: data.origin ?? "Fábrica",
          destinationType: data.destinationType ?? "Sucursal",
          notes: data.notes ?? "",
          images: data.images ?? (data.imageBase64 ? [data.imageBase64] : []),
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onChange(shipments);
    },
    onError
  );
}

export async function createShipment(input: ShipmentInput) {
  await addDoc(collection(db, COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateShipment(id: string, input: ShipmentInput) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...input,
    updatedAt: serverTimestamp()
  });
}

export async function deleteShipment(id: string) {
  await deleteDoc(doc(db, COLLECTION, id));
}
