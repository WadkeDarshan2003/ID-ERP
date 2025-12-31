import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createUserInFirebase, updateUserInFirebase } from '../services/userManagementService';
import { Role, User } from '../types';
import { Mail, Phone, ArrowRight, Building2, User as UserIcon, Lock, ShieldCheck, Zap, LayoutDashboard, CheckCircle2 } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useLoading } from '../contexts/LoadingContext';

const CreateAdmin: React.FC = () => {
  const { user: currentUser, adminCredentials } = useAuth();
  const { addNotification } = useNotifications();
  const { showLoading, hideLoading } = useLoading();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return addNotification('Validation Error', 'Please enter a name', 'error');
    if (!business) return addNotification('Validation Error', 'Please enter a business name', 'error');
    if (!phone) return addNotification('Validation Error', 'Please enter a phone number', 'error');
    if (authMethod === 'email' && !email) return addNotification('Validation Error', 'Please enter an email', 'error');

    setLoading(true);
    showLoading('Creating admin...');
    try {
      // Generate password from last 6 digits of phone (used as default password)
      const phoneDigits = (phone || '').replace(/\D/g, '');
      const generatedPassword = (phoneDigits.slice(-6)) || 'admin123';

      // Prepare new user object
      const userToCreate: User = {
        id: '',
        name,
        email: authMethod === 'email' ? email : '',
        role: Role.ADMIN,
        company: business || undefined,
        phone: phone || undefined,
        password: generatedPassword,
        authMethod: authMethod,
      } as User;

      // If an admin is logged in, reuse their tenantId so created admin is in same tenant
      if (currentUser && currentUser.tenantId) userToCreate.tenantId = currentUser.tenantId;

      // Create user (uses secondary app internally)
      const uid = await createUserInFirebase(userToCreate, currentUser?.email, adminCredentials?.password);

      // If created via public page (no currentUser) assign tenantId = uid
      if (!currentUser) {
        await updateUserInFirebase({
          id: uid,
          name,
          email: userToCreate.email || '',
          role: Role.ADMIN,
          phone: userToCreate.phone || '',
          company: userToCreate.company || '',
          tenantId: uid
        } as any);
      }

      addNotification('Success', `Admin account created. Password: last 6 digits of ${phone}`, 'success');
      // Optionally redirect to login or clear form
      setName(''); setEmail(''); setPhone('');
      setBusiness('');
    } catch (err: any) {
      console.error('Error creating admin:', err);
      addNotification('Error', err.message || 'Failed to create admin', 'error');
    } finally {
      setLoading(false);
      hideLoading();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-5xl w-full flex flex-col md:flex-row min-h-[600px]">
        
        {/* Left Panel - Brand & Info */}
        <div className="md:w-5/12 bg-gray-900 p-8 md:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full translate-x-1/3 translate-y-1/3"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <img src="/kydoicon.png" alt="Kydo" className="w-10 h-10 rounded-lg" />
              <span className="text-2xl font-bold tracking-tight">Kydo Solutions</span>
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">
              Manage your business with confidence.
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              Create your admin account to access powerful tools for project management, financial tracking, and team collaboration.
            </p>
          </div>

          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl backdrop-blur-sm border border-white/10">
              <ShieldCheck className="w-8 h-8 text-gray-300" />
              <div>
                <h3 className="font-semibold">Enterprise Security</h3>
                <p className="text-sm text-gray-400">High-Level encryption for your data</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl backdrop-blur-sm border border-white/10">
              <Zap className="w-8 h-8 text-gray-300" />
              <div>
                <h3 className="font-semibold">Quick Setup</h3>
                <p className="text-sm text-gray-400">Get started in less than 2 minutes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="md:w-7/12 p-8 md:p-12 bg-white overflow-y-auto">
          <div className="max-w-md mx-auto">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Admin Account</h1>
              <p className="text-gray-500">Enter your details to set up your workspace.</p>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              
              {/* Full Name */}
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="text-sm font-medium text-gray-700">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input 
                    id="fullName" 
                    placeholder="e.g. Rajesh Kumar" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Business Name */}
              <div className="space-y-1.5">
                <label htmlFor="businessName" className="text-sm font-medium text-gray-700">Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input 
                    id="businessName" 
                    placeholder="e.g. Kydo Interiors" 
                    value={business} 
                    onChange={e => setBusiness(e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input 
                    id="phone" 
                    type="tel" 
                    placeholder="+91 9876543210" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    title="Include country code, e.g. +91 for India" 
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  Last 6 digits will be your password
                </p>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="adminEmail" className="text-sm font-medium text-gray-700">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input 
                    id="adminEmail" 
                    placeholder="admin@example.com" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    type="email" 
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Auth Method */}
              <div className="pt-2">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Preferred Login Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('email')}
                    className={`py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border ${
                      authMethod === 'email' 
                        ? 'bg-gray-900 border-gray-900 text-white ring-1 ring-gray-900' 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <Mail className="w-4 h-4" />
                    Email Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('phone')}
                    className={`py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border ${
                      authMethod === 'phone' 
                        ? 'bg-gray-900 border-gray-900 text-white ring-1 ring-gray-900' 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <Phone className="w-4 h-4" />
                    Phone Login
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center pt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="px-10 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Admin Account
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center mt-6">
                <p className="text-sm text-gray-600">
                  Already have an account?{' '}
                  <a href="/" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                    Sign In
                  </a>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAdmin;
