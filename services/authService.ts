import {
  signInWithEmailAndPassword,
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { auth } from "./firebaseConfig";

// Login with email and password
export const loginWithEmail = async (email: string, password: string): Promise<FirebaseUser> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

// Sign up with email and password
export const signUpWithEmail = async (email: string, password: string): Promise<FirebaseUser> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Signup error:", error);
    throw error;
  }
};

// Logout
export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
};

// Real-time auth state listener
export const subscribeToAuthState = (
  callback: (user: FirebaseUser | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

// Get current user
export const getCurrentUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

// Get current user ID token
export const getCurrentUserToken = async (): Promise<string | null> => {
  const user = getCurrentUser();
  if (user) {
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error("Error getting token:", error);
      return null;
    }
  }
  return null;
};
