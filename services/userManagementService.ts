import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { setDoc, doc, updateDoc } from 'firebase/firestore';
import { User, Role } from '../types';
import { sendEmail } from './emailService';

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

    // Use setDoc with merge: true instead of updateDoc to handle cases where document might be missing
    await setDoc(userRef, updateData, { merge: true });
    console.log(`✅ Updated 'users' collection: ${user.email}`);

    await setDoc(roleRef, updateData, { merge: true });
    console.log(`✅ Updated '${roleCollection}' collection: ${user.email}`);

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
      user.password! // Using password (last 6 digits of phone)
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
      password: user.password
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

    // Step 4: Send welcome email with credentials
    try {
      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="color: #fff; margin: 0; font-size: 24px;">🎉 Welcome to Kydo Solutions!</h2>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="color: #333; font-size: 16px;">Hi <strong>${user.name}</strong>,</p>
            
            <p style="color: #555; font-size: 14px;">Your account has been created on Kydo Solutions. Here are your login credentials:</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ef4444;">
              <p style="margin: 0; color: #333; font-size: 14px;"><strong>Your ID (Email):</strong></p>
              <p style="margin: 5px 0 15px 0; color: #1f2937; font-size: 16px; font-family: monospace; background: white; padding: 8px; border-radius: 4px;">${user.email}</p>
              
              <p style="margin: 0; color: #333; font-size: 14px;"><strong>Your Password:</strong></p>
              <p style="margin: 5px 0 0 0; color: #1f2937; font-size: 16px; font-family: monospace; background: white; padding: 8px; border-radius: 4px;">${user.password}</p>
            </div>
            
            <p style="color: #555; font-size: 14px;">
              <strong>Keep these credentials safe!</strong> You can change your password after logging in for the first time.
            </p>
            
            <div style="margin-top: 30px; text-align: center;">
              <a href="https://btw-erp.web.app" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 600;">
                Go to Kydo Solutions
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              If you have any questions, please contact the administrator.
            </p>
          </div>
        </div>
      `;

      await sendEmail({
        to: user.email,
        recipientName: user.name,
        subject: 'Welcome to Kydo Solutions - Your Account Credentials',
        htmlContent: htmlContent
      });
      console.log(`✅ Welcome email sent to ${user.email}`);
    } catch (emailError: any) {
      console.error(`⚠️ Failed to send welcome email to ${user.email}:`, emailError.message);
      // Don't throw - user is created successfully, email is just a courtesy
    }
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
