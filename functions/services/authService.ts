import {
  signInWithEmailAndPassword,
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  RecaptchaVerifier
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

let globalRecaptchaVerifier: RecaptchaVerifier | null = null;

// Setup phone authentication (minimal reCAPTCHA for Firebase compatibility)
export const setupPhoneAuthentication = async (phoneNumber: string, recaptchaContainerId: string): Promise<any> => {
  try {
    console.log('📱 Initializing phone authentication...');
    
    // Verify container exists
    let container = document.getElementById(recaptchaContainerId);
    if (!container) {
      console.log(`⚠️ Container ${recaptchaContainerId} not found, creating it`);
      container = document.createElement('div');
      container.id = recaptchaContainerId;
      container.style.display = 'none'; // Hide it for invisible mode
      document.body.appendChild(container);
    }

    // Clear any existing verifier
    if (globalRecaptchaVerifier) {
      try {
        globalRecaptchaVerifier.clear();
      } catch (e) {
        console.warn("Failed to clear existing verifier:", e);
      }
      globalRecaptchaVerifier = null;
    }

    const sanitizedPhoneNumber = phoneNumber.trim();
    console.log('📱 Sending OTP to:', sanitizedPhoneNumber);

    // Create invisible reCAPTCHA for Firebase compatibility (even though enforcement is AUDIT)
    globalRecaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
      callback: () => {
        console.log('✅ Invisible reCAPTCHA callback');
      }
    });

    console.log('🔄 Calling signInWithPhoneNumber...');
    
    // Send OTP
    const confirmationResult = await signInWithPhoneNumber(auth, sanitizedPhoneNumber, globalRecaptchaVerifier);
    console.log('✅ OTP sent successfully!');
    
    return confirmationResult;
  } catch (error: any) {
    console.error("Phone authentication error:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    
    // Clear verifier on error
    if (globalRecaptchaVerifier) {
      try {
        globalRecaptchaVerifier.clear();
      } catch (e) {
        console.warn("Failed to clear verifier:", e);
      }
      globalRecaptchaVerifier = null;
    }

    // Detailed error handling
    if (error.code === 'auth/invalid-app-credential') {
      throw new Error('Firebase app credential error. This usually means: 1) Phone authentication not properly enabled in Firebase Console, 2) API key restrictions, or 3) Enforcement mode not set correctly. Please verify Phone auth is enabled and set to AUDIT mode.');
    } else if (error.code === 'auth/invalid-phone-number') {
      throw new Error('Invalid phone number format. Please use format like +911234567890');
    } else if (error.message && error.message.includes('400')) {
      throw new Error('SMS delivery failed (400). Possible reasons: 1) Daily SMS quota exceeded (50/day free), 2) Too many requests from this number, 3) Billing issue.');
    } else if (error.code === 'auth/quota-exceeded') {
      throw new Error('SMS quota exceeded. Daily limit reached.');
    }
    
    throw error;
  }
};

// Verify OTP and login with phone
export const verifyPhoneOTP = async (confirmationResult: any, otp: string): Promise<FirebaseUser> => {
  try {
    const result = await confirmationResult.confirm(otp);
    return result.user;
  } catch (error) {
    console.error("Phone OTP verification error:", error);
    throw error;
  }
};


// Phone + PIN login (backup to OTP)
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { User } from '../../types';

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
