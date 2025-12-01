import React, { useState } from 'react';
import { User, Role } from '../types';
import { Mail, Phone, Building2, Plus, X, CreditCard, Tag } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { CATEGORY_ORDER } from '../constants'; // Import shared order

interface PeopleListProps {
  users: User[];
  roleFilter: Role | 'All';
  onAddUser: (user: User) => void;
}

const PeopleList: React.FC<PeopleListProps> = ({ users, roleFilter, onAddUser }) => {
  const { addNotification } = useNotifications();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState<Partial<User>>({
    role: roleFilter === 'All' ? Role.CLIENT : roleFilter
  });
  const [showErrors, setShowErrors] = useState(false);

  // Determine filtering logic
  const filteredUsers = roleFilter === 'All' 
    ? users.filter(u => u.role !== Role.ADMIN) 
    : users.filter(u => u.role === roleFilter);

  // Group Vendors by Specialty if in Vendor view
  const groupedVendors = React.useMemo(() => {
    if (roleFilter !== Role.VENDOR) return null;
    
    const grouped: Record<string, User[]> = {};
    filteredUsers.forEach(u => {
      const cat = u.specialty || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(u);
    });
    return grouped;
  }, [filteredUsers, roleFilter]);

  // Sort categories
  const sortedCategories = React.useMemo(() => {
    if (!groupedVendors) return [];
    return Object.keys(groupedVendors).sort((a, b) => {
        const idxA = CATEGORY_ORDER.indexOf(a);
        const idxB = CATEGORY_ORDER.indexOf(b);
        const valA = idxA === -1 ? 999 : idxA;
        const valB = idxB === -1 ? 999 : idxB;
        return valA - valB;
    });
  }, [groupedVendors]);

  const validateForm = () => {
    if (!newUser.name || !newUser.email || !newUser.role || !newUser.aadhar) {
      setShowErrors(true);
      addNotification('Missing Information', 'Please fill in all compulsory fields marked with *', 'error');
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const userToAdd: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: newUser.name!,
      email: newUser.email!,
      role: newUser.role!,
      company: newUser.company || undefined,
      specialty: newUser.specialty || undefined,
      phone: newUser.phone || undefined,
      aadhar: newUser.aadhar!,
      password: newUser.aadhar,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name!)}&background=random`
    };

    onAddUser(userToAdd);
    setIsModalOpen(false);
    setNewUser({ role: roleFilter === 'All' ? Role.CLIENT : roleFilter });
    setShowErrors(false);
    addNotification('Success', 'User created successfully', 'success');
  };

  const getInputClass = (value?: string) => `
    w-full px-3 py-2 border rounded-lg focus:outline-none transition-all
    bg-white text-gray-900 placeholder-gray-400
    ${showErrors && !value ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

  // Helper to render user card
  const UserCard = ({ user, hideRole = false, hideSpecialty = false }: { user: User, hideRole?: boolean, hideSpecialty?: boolean }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
        <div className="p-6 flex-1">
            <div className="flex items-start justify-between">
            <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" />
            {!hideRole && (
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide
                ${user.role === Role.CLIENT ? 'bg-blue-100 text-blue-700' : 
                user.role === Role.VENDOR ? 'bg-orange-100 text-orange-700' : 
                'bg-purple-100 text-purple-700'}`}>
                {user.role}
                </span>
            )}
            </div>
            
            <div className="mt-4">
            <h3 className="text-lg font-bold text-gray-900">{user.name}</h3>
            {user.company && (
                <p className="text-sm font-medium text-gray-500 flex items-center gap-1 mt-1">
                <Building2 className="w-3 h-3" /> {user.company}
                </p>
            )}
            {!hideSpecialty && user.specialty && (
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
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center mt-auto">
            <button className="text-xs font-medium text-gray-500 hover:text-gray-900">View Profile</button>
            <button className="text-xs font-medium text-blue-600 hover:text-blue-800">Assign to Project</button>
        </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
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

      {groupedVendors ? (
         // GROUPED VENDOR VIEW
         <div className="space-y-8">
            {sortedCategories.map(cat => (
                <div key={cat}>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
                        <Tag className="w-4 h-4" /> {cat}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groupedVendors[cat].map(user => (
                            <UserCard key={user.id} user={user} hideRole={true} hideSpecialty={true} />
                        ))}
                    </div>
                </div>
            ))}
         </div>
      ) : (
         // STANDARD GRID VIEW
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.map(user => (
                <UserCard key={user.id} user={user} />
            ))}
        </div>
      )}

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-white">
              <h3 className="text-lg font-bold text-gray-800">Add New Person</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  className={getInputClass(newUser.name)}
                  placeholder="e.g. John Doe"
                  value={newUser.name || ''}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login ID (Email) <span className="text-red-500">*</span></label>
                <input 
                  type="email" 
                  className={getInputClass(newUser.email)}
                  placeholder="john@example.com"
                  value={newUser.email || ''}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aadhar Card Number (Password) <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  className={getInputClass(newUser.aadhar)}
                  placeholder="12 Digit Aadhar Number"
                  value={newUser.aadhar || ''}
                  onChange={e => setNewUser({...newUser, aadhar: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">This will be used as their login password.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role <span className="text-red-500">*</span></label>
                  <select 
                    className={getInputClass(newUser.role)}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white text-gray-900"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white text-gray-900"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white text-gray-900"
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