import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

export const isFirebaseConfigured =
  !firebaseConfig.apiKey.startsWith("TU_API_KEY") && firebaseConfig.apiKey.length > 0;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
