import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration
export const firebaseConfig = {
  apiKey: "",
  authDomain: "btw-erp.firebaseapp.com",
  projectId: "btw-erp",
  storageBucket: "btw-erp.firebasestorage.app",
  messagingSenderId: "700838936930",
  appId: "",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);

// Enable offline persistence for Firestore
try {
  enableIndexedDbPersistence(db).catch((error) => {
    if (error.code === "failed-precondition") {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
    } else if (error.code === "unimplemented") {
      console.warn("Current browser doesn't support persistence.");
    }
  });
} catch (error) {
  console.warn("Firestore persistence error:", error);
}

export default app;
