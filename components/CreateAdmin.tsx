import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createUserInFirebase, updateUserInFirebase } from '../services/userManagementService';
import { Role, User } from '../types';
import { Mail, Phone, ArrowRight } from 'lucide-react';
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
    <div className="bg-white rounded-lg shadow p-6 max-w-xl w-full mx-auto">
      <h3 className="text-lg font-bold mb-4">Create Admin Account</h3>
      <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input id="fullName" placeholder="e.g. Rajesh Kumar" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input id="businessName" placeholder="e.g. Kydo Interiors" value={business} onChange={e => setBusiness(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <input id="phone" type="tel" placeholder="+91 9876543210" value={phone} onChange={e => setPhone(e.target.value)} title="Include country code, e.g. +91 for India" className="w-full px-3 py-2 border rounded" />
          <p className="text-xs text-gray-500 mt-1">Last 6 digits will be used as default password</p>
        </div>

        <div>
          <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="adminEmail" placeholder="admin@example.com" value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full px-3 py-2 border rounded" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auth Method</label>
          <div className="flex gap-2">
            <button
              type="button"
              title="Use email for credentials"
              aria-pressed={authMethod === 'email' ? 'true' : 'false'}
              onClick={() => setAuthMethod('email')}
              className={`px-3 py-1 rounded ${authMethod === 'email' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
              Email
            </button>
            <button
              type="button"
              title="Use phone number for credentials"
              aria-pressed={authMethod === 'phone' ? 'true' : 'false'}
              onClick={() => setAuthMethod('phone')}
              className={`px-3 py-1 rounded ${authMethod === 'phone' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
              Phone
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
            {loading ? 'Creating...' : 'Create Admin'} {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateAdmin;
