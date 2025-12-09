import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { setDoc, doc } from 'firebase/firestore';
import { User, Role } from '../types';

/**
 * Create a new user in Firebase Authentication and save profile to Firestore
 * Saves to BOTH 'users' collection AND role-specific collection (designers/vendors/clients)
 * @param user - User data including email, aadhar (password), role, etc.
 * @param adminEmail - Email of currently logged-in admin
 * @param adminPassword - Password of currently logged-in admin (needed to re-login after creating user)
 * @returns Promise with created user ID
 */
export const createUserInFirebase = async (
  user: User,
  adminEmail?: string,
  adminPassword?: string
): Promise<string> => {
  const currentUser = auth.currentUser;

  try {
    // Step 1: Create user in Firebase Authentication
    const authResult = await createUserWithEmailAndPassword(
      auth,
      user.email,
      user.aadhar // Using aadhar as password
    );

    const firebaseUid = authResult.user.uid;
    console.log(`✅ Firebase Auth created for: ${user.email}`);

    // Step 2: Prepare user profile for Firestore
    const userProfile: any = {
      id: firebaseUid,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      aadhar: user.aadhar
    };

    // Add optional fields only if they exist
    if (user.company) userProfile.company = user.company;
    if (user.specialty) userProfile.specialty = user.specialty;
    if (user.password) userProfile.password = user.password;

    // Step 3: Save profile to Firestore - BOTH to users collection AND role-specific collection
    
    // Save to users collection
    await setDoc(doc(db, 'users', firebaseUid), userProfile);
    console.log(`✅ Saved to 'users' collection: ${user.email}`);

    // Save to role-specific collection (designers, vendors, clients)
    const roleCollection = user.role.toLowerCase() + 's'; // Designer -> designers, Vendor -> vendors, Client -> clients
    await setDoc(doc(db, roleCollection, firebaseUid), userProfile);
    console.log(`✅ Saved to '${roleCollection}' collection: ${user.email}`);
    console.log(`   Firebase UID: ${firebaseUid}`);
    console.log(`   Saved data:`, userProfile);

    // Step 4: Re-login as admin if needed
    // Firebase auto-logged in the new user, so we need to sign back in as admin
    const newLoggedInUser = auth.currentUser?.email;
    console.log(`📊 Current auth user: ${newLoggedInUser}`);
    console.log(`📊 Admin email: ${adminEmail}`);
    console.log(`📊 Has admin password: ${!!adminPassword}`);
    
    if (adminEmail && adminPassword) {
      if (newLoggedInUser !== adminEmail) {
        console.log(`🔐 New user was logged in (${newLoggedInUser}), re-logging in as admin...`);
        try {
          await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
          console.log(`✅ Admin session restored: ${auth.currentUser?.email}`);
        } catch (reLoginError: any) {
          console.error(`❌ Failed to re-login as admin:`, reLoginError.message);
          // Don't throw - user is created successfully, just couldn't restore admin session
          // Admin will be logged out but that's better than losing the user
        }
      } else {
        console.log(`✅ Admin already logged in, no re-login needed`);
      }
    } else {
      console.warn(`⚠️ Admin credentials not provided, cannot restore admin session`);
    }

    return firebaseUid;
  } catch (error: any) {
    console.error('Error creating user in Firebase:', error);

    // Provide user-friendly error messages
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email is already registered.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak. Use at least 6 characters.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address.');
    } else {
      throw new Error(error.message || 'Failed to create user');
    }
  }
};

/**
 * Verify that a user was created successfully
 */
export const verifyUserCreated = async (uid: string): Promise<boolean> => {
  try {
    const userDoc = await (await import('firebase/firestore')).getDoc(
      doc(db, 'users', uid)
    );
    return userDoc.exists();
  } catch (error) {
    console.error('Error verifying user:', error);
    return false;
  }
};
