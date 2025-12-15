import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { getUser, createUser } from '../services/firebaseService';

interface AuthContextType {
  user: User | null;
  firebaseUser: any | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
  adminCredentials: { email: string; password: string } | null;
  setAdminCredentials: (credentials: { email: string; password: string } | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminCredentials, setAdminCredentials] = useState<{ email: string; password: string } | null>(null);

  // Listen to Firebase authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          // Try to fetch user profile from Firestore
          let userProfile = null;
          try {
            userProfile = await getUser(authUser.uid);
          } catch (error) {
            console.warn('Could not fetch user profile:', error);
          }
          
          // If no profile found, create admin profile from auth data
          if (!userProfile) {
            userProfile = {
              id: authUser.uid,
              name: authUser.email?.split('@')[0] || 'Admin',
              email: authUser.email || '',
              role: 'Admin' as any,
              phone: ''
            };
            
            // Continue with user profile
          }
          
          setFirebaseUser(authUser);
          setUser(userProfile);
        } else {
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
  };

  const logout = async () => {
    try {
      // Clear user state first to signal listeners to stop
      setUser(null);
      setFirebaseUser(null);
      
      // Small delay to allow cleanup handlers to run
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now sign out
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, login, logout, loading, adminCredentials, setAdminCredentials }}>
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