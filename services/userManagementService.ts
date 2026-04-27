import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword, getAuth, initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { auth, db, firebaseConfig } from './firebaseConfig';
import { setDoc, doc, updateDoc, getFirestore, collection, addDoc } from 'firebase/firestore';
import { User, Role } from '../types';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { uploadLogoToStorage } from './storageService';

/**
 * Update an existing user's profile in Firestore
 * Updates BOTH 'users' collection AND role-specific collection
 * @param user - User data to update
 */
export const updateUserInFirebase = async (user: User): Promise<void> => {
  try {
    const userRef = doc(db, 'users', user.id);
    const roleCollection = user.role.toLowerCase() + 's';
    const roleRef = doc(db, roleCollection, user.id);

    const updateData: any = {
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
    };

    if (user.company) updateData.company = user.company;
    if (user.specialty) updateData.specialty = user.specialty;
    if (user.tenantId) updateData.tenantId = user.tenantId;
    if (user.tenantIds) updateData.tenantIds = user.tenantIds;

    // Use setDoc with merge: true instead of updateDoc to handle cases where document might be missing
    await setDoc(userRef, updateData, { merge: true });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Updated 'users' collection: ${user.email}`);

    await setDoc(roleRef, updateData, { merge: true });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Updated '${roleCollection}' collection: ${user.email}`);

  } catch (error: any) {
    console.error('Error updating user in Firebase:', error);
    throw new Error(error.message || 'Failed to update user');
  }
};

/**
 * Create a new user in Firebase Authentication and save profile to Firestore
 * Saves to BOTH 'users' collection AND role-specific collection (designers/vendors/clients)
 * @param user - User data including email, password (generated from last 6 digits of phone), role, etc.
 * @param adminEmail - Email of currently logged-in admin
 * @param adminPassword - Password of currently logged-in admin (needed to re-login after creating user)
 * @param brandingData - Optional branding data for tenant customization
 * @returns Promise with created user ID
 */
export const createUserInFirebase = async (
  user: User,
  adminEmail?: string,
  adminPassword?: string,
  brandingData?: { brandName?: string; logoFile?: File }
): Promise<string> => {
  // Initialize a secondary app to create user without logging out the admin
  // Check if app already exists to avoid "already exists" error
  const secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
  
  // Use inMemoryPersistence for secondary auth to avoid conflicts with main admin session
  // and to prevent the SDK from trying to look up existing accounts in local storage
  const secondaryAuth = getApps().find(app => app.name === "SecondaryApp") 
    ? getAuth(secondaryApp)
    : initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
    
  const secondaryDb = getFirestore(secondaryApp);

  try {
    let firebaseUid = '';

    // Handle Phone Authentication Users (Vendor without email)
    if (user.authMethod === 'phone') {
      // For phone-auth users, DON'T create Firebase Auth yet
      // They will authenticate via phone when they login
      // Generate a temporary UID for the Firestore document
      const cleanPhoneDigits = (user.phone || '').replace(/\D/g, '');
      firebaseUid = `phone_${cleanPhoneDigits}`;
      if (process.env.NODE_ENV !== 'production') console.log(`📱 Phone-auth user will authenticate via phone. Temp ID: ${firebaseUid}`);
    } else {
      // Step 1: Create user in Firebase Authentication (Email/Password)
      // Use secondaryAuth to create user
      const authResult = await createUserWithEmailAndPassword(
        secondaryAuth,
        user.email,
        user.password! // Using password (last 6 digits of phone)
      );
      firebaseUid = authResult.user.uid;
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Firebase Auth created for: ${user.email}`);
    }

    // Step 2: Prepare user profile for Firestore
    // Normalize phone number: keep only digits for consistent searching
    const normalizedPhone = (user.phone || '').replace(/\D/g, ''); // Keep only digits
    
    let finalTenantId = user.tenantId;

    // If this is an Admin and no tenantId is provided, create a new tenant document
    if (user.role === Role.ADMIN && !finalTenantId) {
      try {
        console.log('🏗️ Creating new tenant document...');
        console.log('📋 Branding data received:', brandingData);
        
        // Handle logo upload if provided
        let logoUrl = '';
        if (brandingData?.logoFile) {
          try {
            console.log('📤 Uploading logo file:', brandingData.logoFile.name, brandingData.logoFile.size, 'bytes');
            logoUrl = await uploadLogoToStorage(brandingData.logoFile, firebaseUid);
            console.log('✅ Logo uploaded successfully:', logoUrl);
          } catch (logoError) {
            console.error('❌ Error uploading logo:', logoError);
            // Continue without logo if upload fails
            logoUrl = ''; // Ensure it's empty string, not undefined
          }
        } else {
          console.log('ℹ️ No logo file provided');
        }

        const tenantData: any = {
          name: user.company || `${user.name}'s Organization`,
          ownerId: firebaseUid,
          createdAt: new Date().toISOString(),
          status: 'active'
        };
        
        // Only add branding fields if they have values
        if (brandingData?.brandName?.trim()) {
          tenantData.brandName = brandingData.brandName.trim();
        }
        if (logoUrl?.trim()) {
          tenantData.logoUrl = logoUrl.trim();
        }

        console.log('📝 Creating tenant document with data:', tenantData);

        const tenantRef = await addDoc(collection(secondaryDb, 'tenants'), tenantData);
        finalTenantId = tenantRef.id;
        console.log(`🏢 New tenant created with ID: ${finalTenantId}`);
        console.log(`📍 Tenant document path: tenants/${finalTenantId}`);
      } catch (tenantError) {
        console.error('❌ Error creating tenant document:', tenantError);
        // Fallback to UID if tenant doc creation fails
        finalTenantId = firebaseUid;
      }
    }

    const userProfile: any = {
      id: firebaseUid,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: normalizedPhone || '',
      password: user.password,
      authMethod: user.authMethod || 'email',
      tenantId: finalTenantId || firebaseUid, // Fallback to UID if still null
      createdBy: user.createdBy || ''
    };

    // Add optional fields only if they exist
    if (user.company) userProfile.company = user.company;
    if (user.specialty) userProfile.specialty = user.specialty;
    if (user.password) userProfile.password = user.password;

    // Step 3: Save profile to Firestore - BOTH to users collection AND role-specific collection
    // Save to users collection
    await setDoc(doc(secondaryDb, 'users', firebaseUid), userProfile);
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Saved to 'users' collection: ${user.email || user.phone}`);

    // Save to role-specific collection (designers, vendors, clients)
    const roleCollection = user.role.toLowerCase() + 's'; // Designer -> designers, Vendor -> vendors, Client -> clients
    await setDoc(doc(secondaryDb, roleCollection, firebaseUid), userProfile);
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Saved to '${roleCollection}' collection: ${user.email || user.phone}`);
    
    if (process.env.NODE_ENV !== 'production') console.log(`📊 User creation complete. Admin session should be intact.`);
    
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
  } finally {
    // Clean up the secondary app
    try {
      await deleteApp(secondaryApp);
      if (process.env.NODE_ENV !== 'production') console.log('🧹 Secondary app deleted');
    } catch (e) {
      console.warn('Error deleting secondary app:', e);
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
