import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types';
import { Lock, ArrowRight, Phone, Mail } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import Loader from './Loader';
import { useLoading } from '../contexts/LoadingContext';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { getUser, claimPhoneUserProfile } from '../services/firebaseService';
import { setupPhoneAuthentication, verifyPhoneOTP } from '../services/authService';
import { getFirebaseErrorMessage } from '../utils/firebaseErrorMessages';

interface LoginProps {
  users?: User[];
}

const Login: React.FC<LoginProps> = ({ users = [] }) => {
  const { login, setAdminCredentials } = useAuth();
  const { addNotification } = useNotifications();
  const { showLoading, hideLoading } = useLoading();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  const handleFirebaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    setError('');

    if (!email || !password) {
      addNotification('Validation Error', 'Please fill in all required fields.', 'error');
      return;
    }

    setLoading(true);
    showLoading('Signing in...');
    try {
      // Sign in with Firebase
      const authResult = await signInWithEmailAndPassword(auth, email, password);
      
      // Store admin credentials for creating new users without logout
      if (process.env.NODE_ENV !== 'production') console.log(`🔐 Storing admin credentials: ${email}`);
      setAdminCredentials({ email, password });
      
      // Also store in sessionStorage as backup
      sessionStorage.setItem('adminEmail', email);
      sessionStorage.setItem('adminPassword', password);
      if (process.env.NODE_ENV !== 'production') console.log(`💾 Admin credentials stored in sessionStorage`);
      
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
        if (process.env.NODE_ENV !== 'production') console.log('Admin logged in without profile (auto-created minimal profile)');
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
      hideLoading();
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    setError('');

    if (!phone) {
      addNotification('Validation Error', 'Please enter your phone number.', 'error');
      return;
    }

    // Validate phone format (basic validation)
    // Allow digits, spaces, dashes, plus, parentheses
    const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
    // We'll do more robust formatting before sending
    
    setLoading(true);
    showLoading('Sending OTP...');
    try {
      // Format phone number to E.164
      let formattedPhone = phone.replace(/[\s\-()]/g, '');
      if (!formattedPhone.startsWith('+')) {
        // Default to +91 if no country code provided
        formattedPhone = `+91${formattedPhone}`;
      }

      // IMPORTANT: Hide the loading overlay BEFORE calling setupPhoneAuthentication
      // so the reCAPTCHA challenge is visible to the user
      hideLoading();
      
      const result = await setupPhoneAuthentication(formattedPhone, 'recaptcha-container');
      setConfirmationResult(result);
      setOtpSent(true);
      addNotification('Success', 'OTP sent to your phone number.', 'success');
      setError('');
    } catch (err: any) {
      console.error('Phone OTP error:', err);
      let errorMessage = getFirebaseErrorMessage(err.code);
      // Special handling for too many attempts
      if (err.code === 'auth/too-many-requests') {
        // Firebase does not provide remaining attempts, but we can show a lockout message
        errorMessage += ' You have reached the maximum number of attempts. Please wait a few minutes before trying again.';
      }
      setError(errorMessage);
      addNotification('Error', errorMessage, 'error');
    } finally {
      setLoading(false);
      hideLoading();
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    setError('');

    if (!otp) {
      addNotification('Validation Error', 'Please enter the OTP.', 'error');
      return;
    }

    setLoading(true);
    showLoading('Verifying OTP...');
    try {
      const authResult = await verifyPhoneOTP(confirmationResult, otp);
      
      // Try to fetch user profile from Firestore
      let userProfile = null;
      try {
        userProfile = await getUser(authResult.uid);
        
        // If not found by UID, try to claim a phone placeholder profile
        if (!userProfile && authResult.phoneNumber) {
          userProfile = await claimPhoneUserProfile(authResult.uid, authResult.phoneNumber);
        }
      } catch (error) {
        console.warn('Could not fetch user profile:', error);
      }
      
      // If no profile found, show error - vendor profiles must be created by admin
      if (!userProfile) {
        setError('User profile not found. Please contact your administrator to set up your account.');
        addNotification('Profile Not Found', 'Your profile has not been created yet. Please contact the administrator.', 'error');
        // Reset to allow resending OTP or switching methods
        setOtpSent(false);
        setOtp('');
        return;
      }
      
      login(userProfile);
      setError('');
    } catch (err: any) {
      console.error('OTP verification error:', err);
      let errorMessage = getFirebaseErrorMessage(err.code);
      setError(errorMessage);
      addNotification('Verification Failed', errorMessage, 'error');
    } finally {
      setLoading(false);
      hideLoading();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {loading && <Loader message="Signing in..." />}
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
          {/* Login Method Tabs */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign In</h2>
            <div className="flex gap-2 border-b border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('email');
                  setOtpSent(false);
                  setError('');
                  setAttemptedSubmit(false);
                  setPhone('+91 '); // Clear phone input
                  setOtp('');
                }}
                className={`pb-3 px-4 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  loginMethod === 'email'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('phone');
                  setOtpSent(false);
                  setError('');
                  setAttemptedSubmit(false);
                  setEmail(''); // Clear email input
                  setPassword(''); // Clear password input
                }}
                className={`pb-3 px-4 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  loginMethod === 'phone'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Phone className="w-4 h-4" />
                Phone
              </button>
            </div>
          </div>

          {/* Email Login Form */}
          {loginMethod === 'email' && (
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
          )}

          {/* Phone Login Form */}
          {loginMethod === 'phone' && (
            <>
              {!otpSent ? (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                    <input 
                      type="tel" 
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 placeholder-gray-400 ${attemptedSubmit && !phone ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}`}
                      placeholder="+91 9876543210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +91 for India)</p>
                  </div>
                  <div id="recaptcha-container"></div>
                  {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? 'Sending OTP...' : 'Send OTP'} {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP <span className="text-red-500">*</span></label>
                    <p className="text-sm text-gray-600 mb-3">OTP sent to {phone}</p>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 placeholder-gray-400 text-center tracking-widest ${attemptedSubmit && !otp ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}`}
                      placeholder="000000"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      disabled={loading}
                      maxLength={6}
                    />
                  </div>
                  {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'} {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setError('');
                    }}
                    className="w-full text-blue-600 hover:text-blue-700 font-medium py-2"
                  >
                    Send OTP Again
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;