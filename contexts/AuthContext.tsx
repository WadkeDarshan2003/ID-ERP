import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';
import { getUser, createUser, claimPhoneUserProfile } from '../services/firebaseService';
import { getTenantsByAdmin, saveSelectedTenant, getSelectedTenant, getTenantById } from '../services/tenantService';
import { updateDeviceLastLogin } from '../utils/deviceUtils';
import { saveSession, getSession, clearSession, extendSession as extendSessionUtil } from '../utils/sessionUtils';
import { clearIndexedDbPersistence } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  firebaseUser: any | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
  adminCredentials: { email: string; password: string } | null;
  setAdminCredentials: (credentials: { email: string; password: string } | null) => void;
  extendSession: () => void;
  currentTenant: { id: string; name: string } | null;
  availableTenants: Array<{ id: string; name: string }>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminCredentials, setAdminCredentials] = useState<{ email: string; password: string } | null>(null);
  const [currentTenant, setCurrentTenant] = useState<{ id: string; name: string } | null>(null);
  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string }>>([]);

  // Listen to Firebase authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          // Try to fetch user profile from Firestore
          let userProfile = null;
          try {
            userProfile = await getUser(authUser.uid);
            
            // If not found by UID, try to claim a phone placeholder profile
            if (!userProfile && authUser.phoneNumber) {
              userProfile = await claimPhoneUserProfile(authUser.uid, authUser.phoneNumber);
            }
          } catch (error) {
            console.warn('Could not fetch user profile:', error);
          }
          
          // If no profile found
          if (!userProfile) {
            // For Phone Auth users, if no profile is found (and claim failed), DO NOT allow access
            if (authUser.phoneNumber) {
              console.warn('Phone user has no profile and claim failed. Access denied.');
              setFirebaseUser(null);
              setUser(null);
              setLoading(false);
              return;
            }

            // For Email users (likely Admin/Dev), create temporary admin profile
            // This is a fallback for initial setup or admin access
            // IMPORTANT: Assign tenantId based on UID to isolate this admin's data
            userProfile = {
              id: authUser.uid,
              name: authUser.email?.split('@')[0] || 'Admin',
              email: authUser.email || '',
              role: 'Admin' as any,
              phone: '',
              tenantId: authUser.uid // Use UID as tenantId for temporary profiles
            };
          }
          
          setFirebaseUser(authUser);
          setUser(userProfile);
          
          // Save session for 24-hour persistence
          saveSession(userProfile);
          
        } else {
          // Check if there's a valid cached session (24-hour persistence)
          const cachedSession = getSession();
          if (cachedSession) {
            // Restore from cache
            setUser(cachedSession.user);
            setLoading(false);
            if (process.env.NODE_ENV !== 'production') {
              console.log('✅ Session auto-restored from cache (within 24 hours)');
            }
            return;
          }
          
          setFirebaseUser(null);
          setUser(null);
        }
      } catch (error) {
        console.error("Auth state change error:", error);
        setFirebaseUser(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    // Save session for 24-hour persistence
    saveSession(userData);
    // Update device last login time when user logs in
    try {
      const { generateDeviceFingerprint } = require('../utils/deviceUtils');
      const deviceId = generateDeviceFingerprint();
      updateDeviceLastLogin(deviceId);
    } catch (error) {
      // Silently fail if device tracking is not available
    }
  };

  const logout = async () => {
    try {
      // Clear user state first to signal listeners to stop
      setUser(null);
      setFirebaseUser(null);
      
      // Clear session cache
      clearSession();
      
      // Clear Firestore cache/persistence to prevent cross-tenant data leakage
      try {
        await clearIndexedDbPersistence(db);
        console.log('🗑️ Firestore cache cleared on logout');
      } catch (error) {
        console.warn('Could not clear Firestore cache:', error);
      }
      
      // Small delay to allow cleanup handlers to run
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now sign out
      await signOut(auth);
      
      // Force page reload to ensure complete cleanup
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const extendSession = () => {
    if (user) {
      extendSessionUtil(user);
    }
  };

  // Load available tenants for admin users
  useEffect(() => {
    if (!user || user.role !== 'Admin') {
      setAvailableTenants([]);
      setCurrentTenant(null);
      return;
    }

    const loadTenants = async () => {
      try {
        const tenants = await getTenantsByAdmin(user.id);
        
        // If no tenants found, fetch tenant name from Firestore
        if (!tenants || tenants.length === 0) {
          if (user.tenantId) {
            const tenantDoc = await getTenantById(user.tenantId);
            const tenantName = tenantDoc?.name || user.tenantId;
            const defaultTenant = { id: user.tenantId, name: tenantName };
            setAvailableTenants([defaultTenant]);
            setCurrentTenant(defaultTenant);
          }
          return;
        }
        
        setAvailableTenants(tenants);

        // Load last selected tenant or use first one
        const lastSelected = getSelectedTenant(user.id);
        const tenantToUse = tenants.find(t => t.id === lastSelected) || tenants[0] || null;
        
        if (tenantToUse) {
          setCurrentTenant(tenantToUse);
        }
      } catch (error) {
        console.error('Error loading tenants:', error);
        // Fallback: fetch tenant name from Firestore
        if (user.tenantId) {
          try {
            const tenantDoc = await getTenantById(user.tenantId);
            const tenantName = tenantDoc?.name || user.tenantId;
            const defaultTenant = { id: user.tenantId, name: tenantName };
            setAvailableTenants([defaultTenant]);
            setCurrentTenant(defaultTenant);
          } catch (err) {
            // Last resort: use tenantId as name
            const defaultTenant = { id: user.tenantId, name: user.tenantId };
            setAvailableTenants([defaultTenant]);
            setCurrentTenant(defaultTenant);
          }
        }
      }
    };

    loadTenants();
  }, [user]);

  const switchTenant = async (tenantId: string) => {
    try {
      const tenant = availableTenants.find(t => t.id === tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      setCurrentTenant(tenant);
      if (user) {
        saveSelectedTenant(user.id, tenantId);
      }
    } catch (error) {
      console.error('Error switching tenant:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      firebaseUser, 
      login, 
      logout, 
      loading, 
      adminCredentials, 
      setAdminCredentials, 
      extendSession,
      currentTenant,
      availableTenants,
      switchTenant
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};