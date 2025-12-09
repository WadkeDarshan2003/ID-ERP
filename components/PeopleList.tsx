import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Role, Project, TaskStatus } from '../types';
import { Mail, Phone, Building2, Plus, X, CreditCard, Tag, ChevronRight, DollarSign, CheckCircle, Briefcase, Share2, Eye, Download, Copy, Image as ImageIcon } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_ORDER } from '../constants'; // Import shared order
import { createUserInFirebase } from '../services/userManagementService'; // Firebase user creation
import { AvatarCircle, getInitials } from '../utils/avatarUtils'; // Avatar utilities

interface PeopleListProps {
  users: User[];
  roleFilter: Role | 'All';
  onAddUser: (user: User) => void;
  projects?: Project[];
}

const PeopleList: React.FC<PeopleListProps> = ({ users, roleFilter, onAddUser, projects = [] }) => {
  const { user: currentUser, adminCredentials } = useAuth();
  const { addNotification } = useNotifications();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<User | null>(null);
  const [isVendorDetailOpen, setIsVendorDetailOpen] = useState(false);
  const [sharedVendorId, setSharedVendorId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareMethod, setShareMethod] = useState<'email' | 'link'>('email');
  const [approvals, setApprovals] = useState<Record<string, { adminApproved: boolean; clientApproved: boolean }>>({});
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      // Get admin password from context or sessionStorage
      let adminPassword = adminCredentials?.password;
      if (!adminPassword) {
        adminPassword = sessionStorage.getItem('adminPassword') || undefined;
        console.log(`📦 Retrieved admin password from sessionStorage`);
      }

      // Validate admin credentials exist
      if (!adminPassword) {
        console.warn('⚠️ Admin credentials not available! User may be logged out.');
        addNotification('Warning', 'Admin credentials not available. You may be logged out.', 'warning');
      }

      console.log(`📝 Creating user with credentials:`, {
        userEmail: currentUser?.email,
        hasPassword: !!adminPassword
      });

      // Create user in Firebase with admin credentials to re-login after
      const firebaseUid = await createUserInFirebase({
        id: '', // Will be set by Firebase
        name: newUser.name!,
        email: newUser.email!,
        role: newUser.role!,
        company: newUser.company || undefined,
        specialty: newUser.specialty || undefined,
        phone: newUser.phone || undefined,
        aadhar: newUser.aadhar!,
        password: newUser.aadhar
      }, currentUser?.email, adminPassword);

      // Create local user object with Firebase UID
      const userToAdd: User = {
        id: firebaseUid,
        name: newUser.name!,
        email: newUser.email!,
        role: newUser.role!,
        company: newUser.company || undefined,
        specialty: newUser.specialty || undefined,
        phone: newUser.phone || undefined,
        aadhar: newUser.aadhar!,
        password: newUser.aadhar
      };

      // Call parent callback to update local state
      onAddUser(userToAdd);

      // Close modal and reset form
      setIsModalOpen(false);
      setNewUser({ role: roleFilter === 'All' ? Role.CLIENT : roleFilter });
      setShowErrors(false);

      // Show success notification
      addNotification('Success', `${newUser.role} ${newUser.name} created and authenticated successfully!`, 'success');
      console.log(`✅ ${newUser.role} created with UID: ${firebaseUid}`);
      console.log(`🔄 The real-time listener should update the list automatically...`);
    } catch (error: any) {
      console.error('Failed to create user:', error);
      addNotification('Error', error.message || 'Failed to create user. Please try again.', 'error');
    }
  };

  const handleOpenVendorDetail = (vendor: User) => {
    setSelectedVendor(vendor);
    setIsVendorDetailOpen(true);
  };

  const getInputClass = (value?: string) => `
    w-full px-3 py-2 border rounded-lg focus:outline-none transition-all
    bg-white text-gray-900 placeholder-gray-400
    ${showErrors && !value ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

  // Helper to render user card
  const UserCard = ({ user, hideRole = false, hideSpecialty = false, isVendor = false }: { user: User, hideRole?: boolean, hideSpecialty?: boolean, isVendor?: boolean }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
        <div className="p-6 flex-1">
            <div className="flex items-start justify-between">
            <AvatarCircle avatar={user.avatar} name={user.name} size="lg" />
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
            {isVendor ? (
              <button 
                onClick={() => handleOpenVendorDetail(user)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View Details <ChevronRight className="w-3 h-3" />
              </button>
            ) : (
              <button className="text-xs font-medium text-gray-500 hover:text-gray-900">View Profile</button>
            )}
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
                            <div key={user.id}>
                              <UserCard user={user} hideRole={true} hideSpecialty={true} isVendor={true} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
         </div>
      ) : (
         // STANDARD GRID VIEW
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.map(user => (
                <div key={user.id}>
                  <UserCard user={user} isVendor={roleFilter === Role.VENDOR} />
                </div>
            ))}
        </div>
      )}

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-24">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[75vh] overflow-hidden animate-fade-in flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Add New {roleFilter === 'All' ? 'Person' : roleFilter}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close add person dialog">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    className={getInputClass(newUser.name)}
                    placeholder="e.g. John Doe"
                    value={newUser.name || ''}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">Login ID (Email) <span className="text-red-500">*</span></label>
                  <input 
                    type="email" 
                    className={getInputClass(newUser.email)}
                    placeholder="john@example.com"
                    value={newUser.email || ''}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">Aadhar Card Number (Password) <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    className={getInputClass(newUser.aadhar)}
                    placeholder="12 Digit Aadhar Number"
                    value={newUser.aadhar || ''}
                    onChange={e => setNewUser({...newUser, aadhar: e.target.value})}
                  />
                  <p className="text-xs text-gray-500 mt-1">This will be used as their login password.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Role <span className="text-red-500">*</span></label>
                    <select 
                      title="Select user role"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 text-sm ${showErrors && !newUser.role ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}`}
                      value={newUser.role || ''}
                      onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                    >
                      <option value="">Select Role</option>
                      <option value={Role.CLIENT}>Client</option>
                      <option value={Role.DESIGNER}>Designer</option>
                      <option value={Role.VENDOR}>Vendor</option>
                    </select>
                  </div>
                  <div>
                     <label className="block text-sm font-semibold text-gray-900 mb-1.5">Phone <span className="text-gray-400 text-xs">(Opt)</span></label>
                     <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white text-gray-900 text-sm"
                      placeholder="555-0000"
                      value={newUser.phone || ''}
                      onChange={e => setNewUser({...newUser, phone: e.target.value})}
                     />
                  </div>
                </div>

                {newUser.role === Role.VENDOR && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Company Name</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white text-gray-900 text-sm"
                      placeholder="e.g. ABC Construction"
                      value={newUser.company || ''}
                      onChange={e => setNewUser({...newUser, company: e.target.value})}
                    />
                  </div>
                )}

                {(newUser.role === Role.VENDOR || newUser.role === Role.DESIGNER) && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Specialty</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white text-gray-900 text-sm"
                      placeholder={newUser.role === Role.VENDOR ? "e.g. Flooring" : "e.g. Modern Design"}
                      value={newUser.specialty || ''}
                      onChange={e => setNewUser({...newUser, specialty: e.target.value})}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Avatar <span className="text-gray-400 font-normal text-xs">(Opt)</span>
                  </label>
                  <div className="flex items-start gap-3">
                    <AvatarCircle avatar={newUser.avatar} name={newUser.name || 'U'} size="sm" />
                    <div className="flex-1">
                      <input 
                        type="file"
                        accept="image/*"
                        title="Upload user avatar"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white text-gray-900 text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setNewUser({...newUser, avatar: reader.result as string});
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-gray-100 bg-gray-50 flex-shrink-0 sticky bottom-0">
                <button type="submit" className="w-full bg-gray-900 text-white font-bold py-2.5 rounded-lg hover:bg-gray-800 transition-colors text-sm">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Detail Modal */}
      {isVendorDetailOpen && selectedVendor && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 sticky top-0 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <AvatarCircle avatar={selectedVendor.avatar} name={selectedVendor.name} size="md" />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedVendor.name}</h3>
                  <p className="text-xs text-gray-500">{selectedVendor.specialty} • {selectedVendor.company}</p>
                </div>
              </div>
              <button onClick={() => setIsVendorDetailOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close vendor detail panel">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Contact Info */}
              <div>
                <h4 className="text-sm font-bold text-gray-800 mb-3">Contact Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <a href={`mailto:${selectedVendor.email}`} className="hover:text-blue-600">{selectedVendor.email}</a>
                  </div>
                  {selectedVendor.phone && (
                    <div className="flex items-center gap-3 text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{selectedVendor.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Statistics */}
              {(() => {
                const vendorTasks = projects.flatMap(p => 
                  p.tasks.filter(t => t.assigneeId === selectedVendor?.id)
                );
                const completedTasks = vendorTasks.filter(t => t.status === TaskStatus.DONE);
                const totalProjectsInvolved = new Set(projects.filter(p => 
                  p.tasks.some(t => t.assigneeId === selectedVendor?.id)
                ).map(p => p.id)).size;
                const totalPaid = projects.flatMap(p => p.financials).filter(f => 
                  f.type === 'expense' && f.status === 'paid'
                ).reduce((sum, f) => sum + f.amount, 0);

                return (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-blue-600 font-medium uppercase">Active Tasks</p>
                          <p className="text-2xl font-bold text-blue-900">{vendorTasks.length}</p>
                        </div>
                        <Briefcase className="w-8 h-8 text-blue-300" />
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-green-600 font-medium uppercase">Completed</p>
                          <p className="text-2xl font-bold text-green-900">{completedTasks.length}</p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-green-300" />
                      </div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-purple-600 font-medium uppercase">Projects</p>
                          <p className="text-2xl font-bold text-purple-900">{totalProjectsInvolved}</p>
                        </div>
                        <Briefcase className="w-8 h-8 text-purple-300" />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Payment Summary */}
              {(() => {
                const totalPaid = projects.flatMap(p => p.financials).filter(f => 
                  f.type === 'expense' && f.status === 'paid'
                ).reduce((sum, f) => sum + f.amount, 0);
                const totalPending = projects.flatMap(p => p.financials).filter(f => 
                  f.type === 'expense' && f.status === 'pending'
                ).reduce((sum, f) => sum + f.amount, 0);

                return (
                  <div>
                    <h4 className="text-sm font-bold text-gray-800 mb-3">Payment Summary</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <p className="text-xs text-green-600 font-medium uppercase mb-1">Amount Paid</p>
                        <p className="text-2xl font-bold text-green-900">₹{(totalPaid / 1000).toFixed(1)}k</p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                        <p className="text-xs text-yellow-600 font-medium uppercase mb-1">Pending</p>
                        <p className="text-2xl font-bold text-yellow-900">₹{(totalPending / 1000).toFixed(1)}k</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Vendor Report Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-800">Project & Billing Report</h4>
                  {currentUser?.role === Role.ADMIN && (
                    <button 
                      onClick={() => setIsShareModalOpen(true)}
                      title="Share vendor details with client"
                      className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share with Client
                    </button>
                  )}
                </div>
                
                {projects.filter(p => p.tasks.some(t => t.assigneeId === selectedVendor?.id)).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No projects assigned</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-bold text-gray-700">Project</th>
                          <th className="px-4 py-2 text-right font-bold text-gray-700">Bill Amount</th>
                          <th className="px-4 py-2 text-center font-bold text-gray-700">Admin Approval</th>
                          <th className="px-4 py-2 text-center font-bold text-gray-700">Client Approval</th>
                          <th className="px-4 py-2 text-center font-bold text-gray-700">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.filter(p => p.tasks.some(t => t.assigneeId === selectedVendor?.id)).map((project, idx) => {
                          const projectBill = project.financials.find(f => f.type === 'expense' && f.vendorName === selectedVendor?.name);
                          const billAmount = projectBill?.amount || 0;
                          
                          return (
                            <tr key={project.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                              <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
                              <td className="px-4 py-3 text-right text-gray-700">₹{(billAmount / 1000).toFixed(1)}k</td>
                              <td className="px-4 py-3">
                                <div className="flex justify-center">
                                  <input 
                                    type="checkbox" 
                                    title="Admin approval for vendor billing"
                                    checked={approvals[`${project.id}-admin`]?.adminApproved || false} 
                                    disabled={currentUser?.role !== Role.ADMIN}
                                    onChange={(e) => {
                                      if (currentUser?.role === Role.ADMIN) {
                                        const key = `${project.id}-admin`;
                                        setApprovals(prev => ({
                                          ...prev,
                                          [key]: {
                                            adminApproved: e.target.checked,
                                            clientApproved: prev[key]?.clientApproved || false
                                          }
                                        }));
                                        addNotification({
                                          id: Date.now().toString(),
                                          message: `Admin approval ${e.target.checked ? 'approved' : 'removed'} for ${project.name}`,
                                          type: 'success',
                                          read: false,
                                          timestamp: new Date(),
                                          recipientId: selectedVendor.id,
                                          projectId: project.id,
                                          projectName: project.name
                                        });
                                      }
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 cursor-pointer hover:border-gray-400"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-center">
                                  <input 
                                    type="checkbox" 
                                    title="Client approval for vendor billing"
                                    checked={approvals[`${project.id}-client`]?.clientApproved || false}
                                    disabled={currentUser?.role !== Role.ADMIN}
                                    onChange={(e) => {
                                      if (currentUser?.role === Role.ADMIN) {
                                        const key = `${project.id}-client`;
                                        setApprovals(prev => ({
                                          ...prev,
                                          [key]: {
                                            adminApproved: prev[key]?.adminApproved || false,
                                            clientApproved: e.target.checked
                                          }
                                        }));
                                        addNotification({
                                          id: Date.now().toString(),
                                          message: `Client approval ${e.target.checked ? 'approved' : 'removed'} for ${project.name}`,
                                          type: 'success',
                                          read: false,
                                          timestamp: new Date(),
                                          recipientId: selectedVendor.id,
                                          projectId: project.id,
                                          projectName: project.name
                                        });
                                      }
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 cursor-pointer hover:border-gray-400"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                  approvals[`${project.id}-admin`]?.adminApproved && approvals[`${project.id}-client`]?.clientApproved ? 'bg-green-100 text-green-700' :
                                  approvals[`${project.id}-admin`]?.adminApproved ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {approvals[`${project.id}-admin`]?.adminApproved && approvals[`${project.id}-client`]?.clientApproved ? 'Approved' :
                                   approvals[`${project.id}-admin`]?.adminApproved ? 'Admin OK' :
                                   'Pending'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Share Vendor Report Modal */}
      {isShareModalOpen && selectedVendor && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Share Vendor Report</h3>
              <button onClick={() => setIsShareModalOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close share report dialog">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Share <span className="font-semibold">{selectedVendor.name}</span>'s billing report with:
                </p>
                
                <div className="space-y-3">
                  {projects.filter(p => p.tasks.some(t => t.assigneeId === selectedVendor?.id)).map(project => (
                    <label key={project.id} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="checkbox" 
                        defaultChecked={true}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500">{project.team?.length || 0} team members</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Share Method</label>
                <div className="space-y-2">
                  <label className="flex items-center p-3 border border-blue-200 bg-blue-50 rounded-lg cursor-pointer">
                    <input 
                      type="radio" 
                      name="shareMethod"
                      value="email"
                      checked={shareMethod === 'email'}
                      onChange={(e) => setShareMethod(e.target.value as 'email' | 'link')}
                      className="w-4 h-4 border-gray-300"
                    />
                    <span className="ml-3 text-sm font-medium text-gray-900">Send via Email</span>
                  </label>
                  <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input 
                      type="radio" 
                      name="shareMethod"
                      value="link"
                      checked={shareMethod === 'link'}
                      onChange={(e) => setShareMethod(e.target.value as 'email' | 'link')}
                      className="w-4 h-4 border-gray-300"
                    />
                    <span className="ml-3 text-sm font-medium text-gray-900">Create Shareable Link</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (shareMethod === 'link' && selectedVendor) {
                    // Copy vendor link to clipboard
                    const vendorLink = `${window.location.origin}${window.location.pathname}?vendorId=${selectedVendor.id}`;
                    navigator.clipboard.writeText(vendorLink).then(() => {
                      addNotification({
                        id: Date.now().toString(),
                        message: `Vendor link copied to clipboard`,
                        type: 'success',
                        read: false,
                        timestamp: new Date(),
                        recipientId: currentUser?.id || '',
                        projectId: projects[0]?.id || '',
                        projectName: projects[0]?.name || 'Project'
                      });
                      setIsShareModalOpen(false);
                    }).catch(() => {
                      addNotification({
                        id: Date.now().toString(),
                        message: `Failed to copy link`,
                        type: 'error',
                        read: false,
                        timestamp: new Date(),
                        recipientId: currentUser?.id || '',
                        projectId: projects[0]?.id || '',
                        projectName: projects[0]?.name || 'Project'
                      });
                    });
                  } else {
                    // Email sharing
                    addNotification({
                      id: Date.now().toString(),
                      message: `Vendor report for ${selectedVendor?.name} shared with client`,
                      type: 'success',
                      read: false,
                      timestamp: new Date(),
                      recipientId: currentUser?.id || '',
                      projectId: projects[0]?.id || '',
                      projectName: projects[0]?.name || 'Project'
                    });
                    setIsShareModalOpen(false);
                  }
                }}
                title="Share vendor billing report"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share Report
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PeopleList;