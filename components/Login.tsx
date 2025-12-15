import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types';
import { Lock, ArrowRight } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { getUser } from '../services/firebaseService';

interface LoginProps {
  users?: User[];
}

const Login: React.FC<LoginProps> = ({ users = [] }) => {
  const { login, setAdminCredentials } = useAuth();
  const { addNotification } = useNotifications();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const handleFirebaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    setError('');

    if (!email || !password) {
      addNotification('Validation Error', 'Please fill in all required fields.', 'error');
      return;
    }

    setLoading(true);
    try {
      // Sign in with Firebase
      const authResult = await signInWithEmailAndPassword(auth, email, password);
      
      // Store admin credentials for creating new users without logout
      console.log(`🔐 Storing admin credentials: ${email}`);
      setAdminCredentials({ email, password });
      
      // Also store in sessionStorage as backup
      sessionStorage.setItem('adminEmail', email);
      sessionStorage.setItem('adminPassword', password);
      console.log(`💾 Admin credentials stored in sessionStorage`);
      
      // Try to fetch user profile from Firestore
      let userProfile = null;
      try {
        userProfile = await getUser(authResult.user.uid);
      } catch (error) {
        console.warn('Could not fetch user profile:', error);
      }
      
      // If no profile found, create admin profile from auth data
      if (!userProfile) {
        userProfile = {
          id: authResult.user.uid,
          name: authResult.user.email?.split('@')[0] || 'Admin',
          email: authResult.user.email || '',
          role: 'Admin' as any,
          phone: ''
        };
        console.log('Admin logged in without profile (auto-created minimal profile)');
      }
      
      login(userProfile);
      setError('');
    } catch (err: any) {
      console.error('Firebase login error:', err);
      
      let errorMessage = 'Invalid credentials.';
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'Email not found.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email format.';
      }
      
      setError(errorMessage);
      addNotification('Login Failed', errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };
  const getInputClass = (value: string) => `
    w-full px-4 py-2 border rounded-lg focus:outline-none transition-all 
    bg-white text-gray-900 placeholder-gray-400
    ${attemptedSubmit && !value ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full overflow-hidden flex flex-col md:flex-row">
        {/* Left Side - Brand */}
        <div className="md:w-1/2 bg-gray-900 p-12 text-white flex flex-col justify-between">
          <div>
            <img src="/kydoicon.png" alt="Kydo Solutions Logo" className="h-12 w-12 mb-6 rounded-xl bg-white p-1" />
            <h1 className="text-4xl font-bold mb-4">Kydo Solutions</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Manage your interior design projects, clients, and vendors in one seamless platform.
            </p>
          </div>
          <div className="mt-12">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4" />
              <span>Secure Role-Based Access</span>
            </div>
          </div>
        </div>

        {/* Right Side - Login Options */}
        <div className="md:w-1/2 p-12 bg-white flex flex-col justify-center">
          
          {/* Firebase Email/Password Login Form */}
          <div>
             <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign In</h2>
             <form onSubmit={handleFirebaseLogin} className="space-y-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                   <input 
                     type="email" 
                     className={`w-full px-4 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 placeholder-gray-400 ${attemptedSubmit && !email ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}`}
                     placeholder="Enter your email"
                     value={email}
                     onChange={e => setEmail(e.target.value)}
                     disabled={loading}
                   />
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
                   <input 
                     type="password" 
                     className={`w-full px-4 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 placeholder-gray-400 ${attemptedSubmit && !password ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}`}
                     placeholder="Enter password"
                     value={password}
                     onChange={e => setPassword(e.target.value)}
                     disabled={loading}
                   />
                </div>
                {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                   {loading ? 'Signing in...' : 'Login'} {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
             </form>
             <p className="text-xs text-gray-500 text-center mt-4">
               Create an account in Firebase Authentication first with email and password
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;