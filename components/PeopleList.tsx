import React, { useState } from 'react';
import { User, Role } from '../types';
import { Mail, Phone, Building2, Plus, X, CreditCard } from 'lucide-react';

interface PeopleListProps {
  users: User[];
  roleFilter: Role | 'All';
  onAddUser: (user: User) => void;
}

const PeopleList: React.FC<PeopleListProps> = ({ users, roleFilter, onAddUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState<Partial<User>>({
    role: roleFilter === 'All' ? Role.CLIENT : roleFilter
  });

  const filteredUsers = roleFilter === 'All' 
    ? users.filter(u => u.role !== Role.ADMIN) // Hide admin usually
    : users.filter(u => u.role === roleFilter);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.role || !newUser.aadhar) return;

    const userToAdd: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      company: newUser.company || undefined,
      specialty: newUser.specialty || undefined,
      phone: newUser.phone || undefined,
      aadhar: newUser.aadhar,
      password: newUser.aadhar, // Aadhar is the password
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=random`
    };

    onAddUser(userToAdd);
    setIsModalOpen(false);
    setNewUser({ role: roleFilter === 'All' ? Role.CLIENT : roleFilter });
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          {roleFilter === 'All' ? 'Directory' : `${roleFilter}s`}
        </h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add {roleFilter === 'All' ? 'Person' : roleFilter}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map(user => (
          <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" />
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide
                  ${user.role === Role.CLIENT ? 'bg-blue-100 text-blue-700' : 
                    user.role === Role.VENDOR ? 'bg-orange-100 text-orange-700' : 
                    'bg-purple-100 text-purple-700'}`}>
                  {user.role}
                </span>
              </div>
              
              <div className="mt-4">
                <h3 className="text-lg font-bold text-gray-900">{user.name}</h3>
                {user.company && (
                  <p className="text-sm font-medium text-gray-500 flex items-center gap-1 mt-1">
                    <Building2 className="w-3 h-3" /> {user.company}
                  </p>
                )}
                {user.specialty && (
                   <p className="text-xs text-gray-400 mt-1">{user.specialty}</p>
                )}
              </div>

              <div className="mt-6 space-y-2 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${user.email}`} className="hover:text-blue-600 truncate">{user.email}</a>
                </div>
                {user.phone && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{user.phone}</span>
                  </div>
                )}
                {user.aadhar && (
                   <div className="flex items-center gap-3 text-sm text-gray-600">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      <span title="Aadhar / Password">ID: ****{user.aadhar.slice(-4)}</span>
                   </div>
                )}
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center">
              <button className="text-xs font-medium text-gray-500 hover:text-gray-900">View Profile</button>
              <button className="text-xs font-medium text-blue-600 hover:text-blue-800">Assign to Project</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Add New Person</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g. John Doe"
                  value={newUser.name || ''}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login ID (Email)</label>
                <input 
                  required
                  type="email" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="john@example.com"
                  value={newUser.email || ''}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aadhar Card Number (Password)</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="12 Digit Aadhar Number"
                  value={newUser.aadhar || ''}
                  onChange={e => setNewUser({...newUser, aadhar: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">This will be used as their login password.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                  >
                    <option value={Role.CLIENT}>Client</option>
                    <option value={Role.DESIGNER}>Designer</option>
                    <option value={Role.VENDOR}>Vendor</option>
                  </select>
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Phone (Opt)</label>
                   <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="555-0000"
                    value={newUser.phone || ''}
                    onChange={e => setNewUser({...newUser, phone: e.target.value})}
                   />
                </div>
              </div>

              {newUser.role === Role.VENDOR && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newUser.company || ''}
                    onChange={e => setNewUser({...newUser, company: e.target.value})}
                  />
                </div>
              )}

              {(newUser.role === Role.VENDOR || newUser.role === Role.DESIGNER) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder={newUser.role === Role.VENDOR ? "e.g. Flooring" : "e.g. Modern"}
                    value={newUser.specialty || ''}
                    onChange={e => setNewUser({...newUser, specialty: e.target.value})}
                  />
                </div>
              )}

              <button type="submit" className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors mt-2">
                Create Account
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeopleList;