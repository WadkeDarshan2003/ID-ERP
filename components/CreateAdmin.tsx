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
  
  // Brand customization fields
  const [customBrandName, setCustomBrandName] = useState('');
  const [customLogo, setCustomLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        addNotification('File Size Error', 'Logo must be less than 2MB', 'error');
        return;
      }
      if (!file.type.startsWith('image/')) {
        addNotification('File Type Error', 'Please upload an image file', 'error');
        return;
      }
      setCustomLogo(file);
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

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

      // Prepare branding data for tenant creation
      const brandingData = {
        brandName: customBrandName.trim() || undefined,
        logoFile: customLogo || undefined
      };

      console.log('🎨 Branding data prepared:', {
        brandName: brandingData.brandName,
        hasLogoFile: !!brandingData.logoFile,
        logoFileName: brandingData.logoFile?.name,
        logoFileSize: brandingData.logoFile?.size
      });

      // Create user (uses secondary app internally)
      const uid = await createUserInFirebase(userToCreate, currentUser?.email, adminCredentials?.password, brandingData);

      // Success notification with enhanced message
      addNotification(
        'Admin Created Successfully!', 
        `Account created for ${name}. Password: last 6 digits of ${phone}. Redirecting to login...`, 
        'success'
      );
      
      // Clear form
      setName(''); setEmail(''); setPhone('');
      setBusiness('');
      setCustomBrandName(''); setCustomLogo(null); setLogoPreview('');
      
      // Auto-redirect to login page after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err: any) {
      console.error('Error creating admin:', err);
      addNotification('Error', err.message || 'Failed to create admin', 'error');
    } finally {
      setLoading(false);
      hideLoading();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-3 font-sans">
      <div className="bg-white rounded-xl shadow-xl overflow-hidden max-w-4xl w-full flex flex-col md:flex-row min-h-[500px]">
        
        {/* Left Panel - Brand & Info */}
        <div className="md:w-5/12 bg-gray-900 p-4 md:p-6 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-0 left-0 w-48 h-48 bg-white opacity-5 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full translate-x-1/3 translate-y-1/3"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <img src="/kydoicon.png" alt="Kydo Solutions" className="w-8 h-8 rounded-lg" />
              <span className="text-xl font-bold tracking-tight">Kydo Solutions</span>
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">
              Manage your business with confidence.
            </h2>
            <p className="text-gray-400 text-base mb-4">
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
        <div className="md:w-7/12 p-4 md:p-6 bg-white overflow-y-auto">
          <div className="max-w-sm mx-auto">
            <div className="mb-4">
              <h1 className="text-xl font-bold text-gray-900 mb-1">Create Admin Account</h1>
              <p className="text-gray-500 text-sm">Enter your details to set up your workspace.</p>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              
              {/* Full Name */}
              <div className="space-y-1">
                <label htmlFor="fullName" className="text-xs font-medium text-gray-700">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input 
                    id="fullName" 
                    placeholder="e.g. Rajesh Kumar" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm"
                  />
                </div>
              </div>

              {/* Business Name */}
              <div className="space-y-1">
                <label htmlFor="businessName" className="text-xs font-medium text-gray-700">Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input 
                    id="businessName" 
                    placeholder="e.g. Kydo Interiors" 
                    value={business} 
                    onChange={e => setBusiness(e.target.value)} 
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label htmlFor="phone" className="text-xs font-medium text-gray-700">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input 
                    id="phone" 
                    type="tel" 
                    placeholder="+91 9876543210" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    title="Include country code, e.g. +91 for India" 
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm"
                  />
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  Last 6 digits will be your password
                </p>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="adminEmail" className="text-xs font-medium text-gray-700">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input 
                    id="adminEmail" 
                    placeholder="admin@example.com" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    type="email" 
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm"
                  />
                </div>
              </div>

              {/* Auth Method */}
              <div className="pt-1">
                <label className="text-xs font-medium text-gray-700 mb-1 block">Preferred Login Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('email')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 border ${
                      authMethod === 'email' 
                        ? 'bg-gray-900 border-gray-900 text-white ring-1 ring-gray-900' 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <Mail className="w-3 h-3" />
                    Email Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('phone')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 border ${
                      authMethod === 'phone' 
                        ? 'bg-gray-900 border-gray-900 text-white ring-1 ring-gray-900' 
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <Phone className="w-3 h-3" />
                    Phone Login
                  </button>
                </div>
              </div>

              {/* Brand Customization Section */}
              <div className="pt-2 border-t border-gray-200">
                <h3 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Brand Customization (Optional)
                </h3>
                
                {/* Custom Brand Name */}
                <div className="space-y-1 mb-2">
                  <label htmlFor="brandName" className="text-xs font-medium text-gray-700">Company Brand Name</label>
                  <input 
                    id="brandName" 
                    placeholder="e.g. Your Company Name (defaults to Kydo Solutions)" 
                    value={customBrandName} 
                    onChange={e => setCustomBrandName(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-sm"
                  />
                  <p className="text-xs text-gray-500">This will replace "Kydo Solutions" throughout the application</p>
                </div>

                {/* Logo Upload */}
                <div className="space-y-1">
                  <label htmlFor="logo" className="text-xs font-medium text-gray-700">Company Logo</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <input 
                        id="logo" 
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all file:mr-2 file:py-0.5 file:px-2 file:border-0 file:text-xs file:bg-gray-200 file:text-gray-700 file:rounded hover:file:bg-gray-300 text-xs"
                      />
                      <p className="text-xs text-gray-500 mt-0.5">PNG, JPG up to 2MB. Square logos work best.</p>
                    </div>
                    {logoPreview && (
                      <div className="w-12 h-12 border-2 border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center pt-1">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md shadow-blue-600/20 text-sm"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Admin Account
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center mt-3">
                <p className="text-xs text-gray-600">
                  Already have an account?{' '}
                  <a href="/" className="font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors">
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
