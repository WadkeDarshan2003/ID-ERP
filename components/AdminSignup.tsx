import React, { useState } from 'react';
import { Mail, Lock, User as UserIcon, Phone, ArrowLeft, ArrowRight } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useLoading } from '../contexts/LoadingContext';
import Loader from './Loader';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setDoc, doc } from 'firebase/firestore';
import { firebaseConfig } from '../services/firebaseConfig';

const AdminSignup: React.FC = () => {
  const { addNotification } = useNotifications();
  const { showLoading, hideLoading } = useLoading();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Company name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.email.includes('@')) newErrors.email = 'Valid email is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';

    // Generate password from last 6 digits of phone
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (phoneDigits.length < 6) newErrors.phone = 'Phone must have at least 6 digits';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Generate password from last 6 digits of phone
    const phoneDigits = formData.phone.replace(/\D/g, '');
    const password = phoneDigits.slice(-6);
    setGeneratedPassword(password);

    setLoading(true);
    showLoading('Creating admin account...');

    const secondaryApp = initializeApp(firebaseConfig, `AdminSignup_${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    const secondaryDb = getFirestore(secondaryApp);

    try {
      // Create Firebase Auth user with auto-generated password
      const authResult = await createUserWithEmailAndPassword(
        secondaryAuth,
        formData.email,
        password
      );
      const adminId = authResult.user.uid;

      // Generate NEW tenantId for this admin's firm
      const tenantId = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now();

      // Create admin user document with NEW tenantId
      const adminUser = {
        id: adminId,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: 'Admin',
        tenantId: tenantId,
        createdBy: 'system', // Mark as self-signup
        company: formData.name,
        authMethod: 'email' as const
      };

      // Save to users collection using secondary db
      await setDoc(doc(secondaryDb, 'users', adminId), adminUser);

      // Save to admins collection using secondary db
      await setDoc(doc(secondaryDb, 'admins', adminId), adminUser);

      // Create tenant document for this firm using secondary db
      await setDoc(doc(secondaryDb, 'tenants', tenantId), {
        name: formData.name,
        adminUid: adminId,
        adminEmail: formData.email,
        createdAt: new Date(),
        status: 'active'
      });

      // Sign out the secondary auth
      await signOut(secondaryAuth);

      addNotification(
        'Success',
        `Admin account created! Your firm ID is ${tenantId.substring(0, 8)}...`,
        'success'
      );

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (error: any) {
      const message = error.code === 'auth/email-already-in-use'
        ? 'Email already registered'
        : error.message || 'Failed to create account';
      
      addNotification('Error', message, 'error');
      setErrors({ submit: message });
    } finally {
      setLoading(false);
      hideLoading();
      try {
        deleteApp(secondaryApp);
      } catch (e) {
        // App might already be deleted
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Loader />
      
      {/* Success Modal */}
      {generatedPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-green-600 mb-4">✅ Account Created!</h2>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Your login credentials:</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Email:</p>
                  <p className="font-mono bg-gray-100 p-2 rounded text-sm font-semibold">{formData.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Password (Last 6 digits of phone):</p>
                  <div className="flex gap-2">
                    <p className="font-mono bg-gray-100 p-2 rounded text-sm font-semibold flex-1">
                      {showPassword ? generatedPassword : '••••••'}
                    </p>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-3 py-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 text-sm font-semibold"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mb-4">
              <p className="font-semibold mb-2">📋 Important:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Your Firm ID (tenantId) is ready</li>
                <li>You can now manage your firm</li>
                <li>Save these credentials safely</li>
              </ul>
            </div>

            <button
              onClick={() => {
                window.location.href = '/login';
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition"
            >
              Go to Login
            </button>
          </div>
        </div>
      )}
      
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => window.location.href = '/login'}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-4"
          >
            <ArrowLeft size={20} />
            Back to Login
          </button>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Register Your Firm</h1>
          <p className="text-gray-600">Create an admin account to manage your firm</p>
        </div>

        {/* Signup Form */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <form onSubmit={handleSignup} className="space-y-4">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <UserIcon className="inline w-4 h-4 mr-2" />
                Firm/Company Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your firm name"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Mail className="inline w-4 h-4 mr-2" />
                Email Address *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="your@email.com"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Phone className="inline w-4 h-4 mr-2" />
                Phone Number *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
            </div>

            {/* Auto-Generated Password Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 mt-4">
              <p className="font-semibold mb-2">📝 Password Auto-Generated</p>
              <p className="text-amber-800">Your password will be the last 6 digits of your phone number.</p>
            </div>

            {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">What happens next:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>You get a unique Firm ID (tenantId)</li>
                <li>You can manage vendors, clients & designers</li>
                <li>All your data stays private to your firm</li>
              </ul>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? 'Creating account...' : (
                <>
                  Create Admin Account
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-sm mt-4">
          Already have an account?{' '}
          <button
            onClick={() => window.location.href = '/login'}
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >
            Login here
          </button>
        </p>
      </div>
    </div>
  );
};

export default AdminSignup;
