import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getDoc, doc, collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { User, Role, Project, TaskStatus, FinancialRecord } from '../types';
import { Mail, Phone, Building2, Plus, X, CreditCard, Tag, ChevronRight, DollarSign, CheckCircle, Briefcase, Share2, Eye, Download, Copy, Edit, FileText, Lock, MessageCircle } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useLoading } from '../contexts/LoadingContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_ORDER } from '../constants'; // Import shared order
import { calculateTaskProgress, formatDateToIndian } from '../utils/taskUtils'; // Task progress calculation
import { createUserInFirebase, updateUserInFirebase } from '../services/userManagementService'; // Firebase user creation
import { updateProject } from '../services/firebaseService'; // Project updates
import { getProjectFinancialRecords } from '../services/financialService'; // Financial records
import { AvatarCircle, getInitials } from '../utils/avatarUtils'; // Avatar utilities

interface PeopleListProps {
  users: User[];
  roleFilter: Role | 'All';
  onAddUser: (user: User) => void;
  projects?: Project[];
  onSelectProject?: (project: Project, opts?: { initialTab?: 'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents' | 'meetings' }) => void;
  onSelectTask?: (task: any, project: Project) => void;
}

const PeopleList: React.FC<PeopleListProps> = ({ users, roleFilter, onAddUser, projects = [], onSelectProject, onSelectTask }) => {
  const { user: currentUser, adminCredentials } = useAuth();
  const { addNotification } = useNotifications();
  const { showLoading, hideLoading } = useLoading();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<User | null>(null);
  const [isVendorDetailOpen, setIsVendorDetailOpen] = useState(false);
  const [selectedDesigner, setSelectedDesigner] = useState<User | null>(null);
  const [isDesignerDetailOpen, setIsDesignerDetailOpen] = useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [selectedVendorForAccounts, setSelectedVendorForAccounts] = useState<User | null>(null);
  const [sharedVendorId, setSharedVendorId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareMethod, setShareMethod] = useState<'email' | 'link'>('email');
  // Removed manual approvals state as it is now derived from project financials
  const [newUser, setNewUser] = useState<Partial<User>>({
    role: roleFilter === 'All' ? Role.CLIENT : roleFilter
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  
  // --- Assign to Project State ---
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [userToAssign, setUserToAssign] = useState<User | null>(null);

  // --- Collapsible Projects State ---
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [welcomeModalUser, setWelcomeModalUser] = useState<User | null>(null);

  // --- Collapsible Designer Tasks State ---
  const [expandedDesignerTasks, setExpandedDesignerTasks] = useState<Record<string, boolean>>({});

  // --- Real-time Projects State ---
  // Use parent's projects prop as the real-time source since App.tsx already subscribes
  const realtimeProjects = projects;

  // --- Vendor Earnings State (for Vendor Detail Modal) ---
  const [vendorEarnings, setVendorEarnings] = useState<{ totalEarnings: number, totalDesignerCharges: number, projectBreakdown: Record<string, { projectName: string, earnings: number, designerCharges: number }> } | null>(null);
  const [vendorEarningsLoading, setVendorEarningsLoading] = useState(false);
  const [allProjectFinancials, setAllProjectFinancials] = useState<Record<string, FinancialRecord[]>>({});

  // Set up real-time listeners for financial records of each project
  useEffect(() => {
    if (projects.length === 0) {
      setAllProjectFinancials({});
      return;
    }

    const unsubscribers: Unsubscribe[] = [];

    projects.forEach((project) => {
      try {
        const financesCollection = collection(db, 'projects', project.id, 'finances');
        const unsubscribe = onSnapshot(
          financesCollection,
          (snapshot) => {
            const records = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id
            } as FinancialRecord));
            
            setAllProjectFinancials(prev => ({
              ...prev,
              [project.id]: records
            }));
          },
          (error) => {
            console.error(`Error listening to financials for project ${project.id}:`, error);
          }
        );
        unsubscribers.push(unsubscribe);
      } catch (error) {
        console.error(`Failed to set up listener for project ${project.id}`, error);
      }
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [projects]);

  // Log for debugging
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') console.log('🔄 PeopleList projects updated:', projects.length, projects);
  }, [projects]);

  // Log financial updates
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') console.log('💰 PeopleList financials updated:', allProjectFinancials);
  }, [allProjectFinancials]);

  useEffect(() => {
    if (!selectedVendor) return;
    setVendorEarningsLoading(true);
    getDoc(doc(db, 'vendors', selectedVendor.id)).then(snap => {
      if (snap.exists()) {
        setVendorEarnings(snap.data() as any);
      } else {
        setVendorEarnings(null);
      }
    }).finally(() => setVendorEarningsLoading(false));
  }, [selectedVendor]);

  // Determine filtering logic
  const filteredUsers = React.useMemo(() => {
    let filtered = roleFilter === 'All' 
      ? users.filter(u => u.role !== Role.ADMIN) 
      : users.filter(u => u.role === roleFilter);
    
    // If current user is a vendor viewing admins, filter to admins they can see
    if (currentUser?.role === Role.VENDOR && roleFilter === Role.ADMIN) {
      const vendorTenantIds = (currentUser as any).tenantIds || [];
      filtered = filtered.filter(u => 
        vendorTenantIds.length === 0 || vendorTenantIds.includes(u.tenantId)
      );
    }

    // If current user is a designer viewing clients, filter to clients related to their projects only
    if (currentUser?.role === Role.DESIGNER && roleFilter === Role.CLIENT) {
      const designerProjects = realtimeProjects.filter(p => 
        p.leadDesignerId === currentUser.id || (p.teamMembers || []).includes(currentUser.id)
      );
      const relatedClientIds = new Set<string>();
      designerProjects.forEach(p => {
        if (p.clientId) relatedClientIds.add(p.clientId);
        (p.clientIds || []).forEach(cId => relatedClientIds.add(cId));
      });
      filtered = filtered.filter(u => relatedClientIds.has(u.id) || u.createdBy === currentUser.id);
    }
    
    // Alphabetical Sorting by name
    return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, roleFilter, currentUser, realtimeProjects]);

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

  // Helper function to format phone numbers
  const formatPhoneNumber = (phone: string) => {
    if (phone.startsWith('+91')) {
      return '+91 ' + phone.slice(3);
    }
    return phone;
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    const isPhoneAuth = user.email && user.email.endsWith('@kydo-phone-auth.local');
    setNewUser({
      name: user.name,
      email: isPhoneAuth ? '' : user.email,
      role: user.role,
      phone: user.phone,
      company: user.company,
      specialty: user.specialty
    });
    setAuthMethod(isPhoneAuth ? 'phone' : 'email');
    setIsModalOpen(true);
  };

  const validateForm = () => {
    if (!newUser.name || !newUser.role || !newUser.phone) {
      setShowErrors(true);
      addNotification('Missing Information', 'Please fill in all compulsory fields marked with *', 'error');
      return false;
    }

    // Validate based on authentication method
    if (!editingUser) {
      if (authMethod === 'email' && !newUser.email) {
        setShowErrors(true);
        addNotification('Missing Email', 'Email is required for email-based authentication', 'error');
        return false;
      }
      if (authMethod === 'phone' && !newUser.phone) {
        setShowErrors(true);
        addNotification('Missing Phone', 'Phone number is required for phone-based authentication', 'error');
        return false;
      }
    } else if (!newUser.email) {
      // For editing existing users, email is required (legacy check, might need adjustment if editing phone users becomes a requirement)
      setShowErrors(true);
      addNotification('Missing Information', 'Please fill in all compulsory fields marked with *', 'error');
      return false;
    }

    // Validate phone number has at least 4 digits
    const phoneDigits = (newUser.phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 4) {
      setShowErrors(true);
      addNotification('Invalid Phone', 'Phone number must have at least 4 digits', 'error');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      showLoading(`Creating ${newUser.role}...`);
      if (editingUser) {
        // Update existing user
        const updatedUser: User = {
          ...editingUser,
          ...newUser as User
        };
        
        await updateUserInFirebase(updatedUser);
        
        addNotification('Success', 'User profile updated successfully', 'success');
        setIsModalOpen(false);
        setEditingUser(null);
        setNewUser({ role: roleFilter === 'All' ? Role.CLIENT : roleFilter });
        setShowErrors(false);
        return;
      }

      // For users with phone-based auth, they don't need an email
      let emailForAuth = newUser.email;
      if (authMethod === 'phone') {
        // Phone auth users: no email needed, just use placeholder
        emailForAuth = '';
      }

      // Generate password from last 6 digits of phone number
      const phoneDigits = (newUser.phone || '').replace(/\D/g, '');
      const generatedPassword = phoneDigits.slice(-6);

      // Create user in Firebase with admin credentials to re-login after
      const firebaseUid = await createUserInFirebase({
        id: '', // Will be set by Firebase
        name: newUser.name!,
        email: emailForAuth || '', // Empty for phone auth users
        role: newUser.role!,
        company: newUser.company || undefined,
        specialty: newUser.specialty || undefined,
        phone: newUser.phone || undefined,
        password: generatedPassword,
        authMethod: (authMethod) as 'email' | 'phone',
        tenantId: currentUser?.tenantId,
        createdBy: currentUser?.id
      }, currentUser?.email, adminCredentials?.password);

      // Create local user object with Firebase UID
      const userToAdd: User = {
        id: firebaseUid,
        name: newUser.name!,
        email: (authMethod === 'phone') ? '' : newUser.email!,
        role: newUser.role!,
        company: newUser.company || undefined,
        specialty: newUser.specialty || undefined,
        phone: newUser.phone || undefined,
        password: generatedPassword,
        authMethod: (authMethod) as 'email' | 'phone',
        createdBy: currentUser?.id
      };

      // Don't add to local state immediately - let Firebase subscription handle all users
      // This prevents duplicates when both local state and Firebase listener update
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ ${newUser.role} "${newUser.name}" created with UID: ${firebaseUid}`);
        console.log('📡 Will sync from Firestore automatically (Firebase subscription).');
      }

      // Show success notification
      addNotification('Success', `${newUser.role} ${newUser.name} created successfully!`, 'success');
      
      // If phone auth, show welcome modal to send WhatsApp message
      if (authMethod === 'phone') {
        // Create a temporary user object for the welcome modal
        const welcomeUser: User = {
          id: firebaseUid,
          name: newUser.name!,
          email: '',
          role: newUser.role!,
          company: newUser.company || undefined,
          specialty: newUser.specialty || undefined,
          phone: newUser.phone || undefined,
          password: generatedPassword,
          authMethod: 'phone'
        };
        if (process.env.NODE_ENV !== 'production') console.log(' Setting welcome modal for:', welcomeUser);
        setWelcomeModalUser(welcomeUser);
      }

      // Close modal and reset form
      setIsModalOpen(false);
      setNewUser({ role: roleFilter === 'All' ? Role.CLIENT : roleFilter });
      setShowErrors(false);

      if (process.env.NODE_ENV !== 'production') {
        console.log('====== USER CREATION DEBUG ======');
        console.log('authMethod:', authMethod);
        console.log('newUser:', newUser);
        console.log('firebaseUid:', firebaseUid);
        console.log('Should show modal?', authMethod === 'phone');
        console.log('====== END DEBUG ======');
      }
    } catch (error: any) {
      console.error('Failed to create user:', error);
      addNotification('Error', error.message || 'Failed to create user. Please try again.', 'error');
    }
    finally {
      hideLoading();
    }
  };

  const handleOpenVendorDetail = (vendor: User) => {
    setSelectedVendor(vendor);
    setIsVendorDetailOpen(true);
  };

  const handleAssignToProject = (user: User) => {
    setUserToAssign(user);
    setIsAssignModalOpen(true);
  };

  const handleConfirmAssignment = async (project: Project) => {
    if (!userToAssign) return;
    try {
      const updatedProject = { ...project };
      let changed = false;

      if (userToAssign.role === Role.CLIENT) {
         const currentClients = project.clientIds || [];
         if (!currentClients.includes(userToAssign.id) && project.clientId !== userToAssign.id) {
           updatedProject.clientIds = [...currentClients, userToAssign.id];
           changed = true;
         } else {
           addNotification('Info', 'User is already a client on this project', 'info');
           return;
         }
      } else {
         const currentMembers = project.teamMembers || [];
         // Check if already lead designer or in team
         if (!currentMembers.includes(userToAssign.id) && project.leadDesignerId !== userToAssign.id) {
           updatedProject.teamMembers = [...currentMembers, userToAssign.id];
           changed = true;
         } else {
           addNotification('Info', 'User is already in the team', 'info');
           return;
         }
      }
      
      if (changed) {
        // We only need to send the fields that changed to updateProject
        const updates: Partial<Project> = {};
        if (userToAssign.role === Role.CLIENT) {
            updates.clientIds = updatedProject.clientIds;
        } else {
            updates.teamMembers = updatedProject.teamMembers;
        }

        await updateProject(project.id, updates);
        addNotification('Success', `Added ${userToAssign.name} to ${project.name}`, 'success');
        setIsAssignModalOpen(false);
        setUserToAssign(null);
      }
    } catch (error) {
      console.error("Error assigning user:", error);
      addNotification('Error', 'Failed to assign user', 'error');
    }
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
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1 flex-1">
                <AvatarCircle avatar={user.avatar} name={user.name} size="md" role={String(user.role).toLowerCase()} />
                <div>
                  <h3 className="text-base md:text-sm font-bold text-gray-900">{user.name}</h3>
                  {user.company && (
                      <p className="text-xs md:text-xs font-medium text-gray-500 flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {user.company}
                      </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isVendor && (
                  <button
                    onClick={() => {
                      setSelectedVendorForAccounts(user);
                      setIsAccountsModalOpen(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="View Accounts"
                  >
                    <CreditCard className="w-5 h-5" />
                  </button>
                )}
                {!hideRole && (
                  <span className={`px-2 py-1 rounded text-xs md:text-xs font-bold uppercase tracking-wide
                  ${user.role === Role.CLIENT ? 'bg-blue-100 text-blue-700' : 
                  user.role === Role.VENDOR ? 'bg-orange-100 text-orange-700' : 
                  'bg-purple-100 text-purple-700'}`}>
                  {user.role}
                  </span>
                )}
              </div>
            </div>
            
            <div className="mt-2">
            {!hideSpecialty && user.specialty && (
                <p className="text-xs md:text-xs text-gray-400 mt-1">{user.specialty}</p>
            )}
            </div>

            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            {user.email && !user.email.endsWith('@kydo-phone-auth.local') && (
              <a href={`mailto:${user.email}`} className="flex items-center gap-2 text-base md:text-sm text-gray-600 hover:text-blue-600 group transition-colors">
                <Mail className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                <span className="truncate">{user.email}</span>
              </a>
            )}
            {user.phone && (
              <a href={`tel:${user.phone}`} className="flex items-center gap-2 text-base md:text-sm text-gray-600 hover:text-blue-600 group transition-colors">
              <Phone className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
              <span className="text-base md:text-sm">{formatPhoneNumber(user.phone)}</span>
              </a>
            )}

            </div>
        </div>
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center mt-auto">
            {isVendor ? (
              <button 
                onClick={() => handleOpenVendorDetail(user)}
                className="text-base md:text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View Details <ChevronRight className="w-3 h-3" />
              </button>
            ) : user.role === Role.DESIGNER ? (
              <button 
                onClick={() => {
                  setSelectedDesigner(user);
                  setIsDesignerDetailOpen(true);
                }}
                className="text-base md:text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View Details <ChevronRight className="w-3 h-3" />
              </button>
            ) : (
              // If current user is a Designer, do not allow editing client details
              (currentUser?.role === Role.DESIGNER && user.role === Role.CLIENT) ? (
                <button className="text-base md:text-sm font-medium text-gray-400 cursor-not-allowed" title="Designers cannot edit client profiles">View Profile</button>
              ) : (
                <button 
                  onClick={() => handleEditUser(user)}
                  className="text-base md:text-sm font-medium text-gray-500 hover:text-gray-900"
                >
                  View Profile
                </button>
              )
            )}
            {currentUser?.role === Role.DESIGNER ? (
              <button
                className="text-base md:text-sm font-medium text-gray-400 cursor-not-allowed"
                title="Designers cannot assign users to projects"
                disabled
              >
                Assign to Project
              </button>
            ) : (
              <button 
                onClick={() => handleAssignToProject(user)}
                className="text-base md:text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Assign to Project
              </button>
            )}
        </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {roleFilter === 'All' ? 'Directory' : `${roleFilter}s`}
        </h2>
        <div className="flex items-center gap-3">
            {!(currentUser?.role === Role.DESIGNER && roleFilter === Role.CLIENT) && (
              <button 
                onClick={() => {
                  setEditingUser(null);
                  setNewUser({ 
                    role: roleFilter === 'All' ? Role.CLIENT : roleFilter,
                    phone: '+91 '
                  });
                  setIsModalOpen(true);
                }}
                className="bg-gray-900 text-white px-4 py-2.5 md:px-4 md:py-2 rounded-lg text-base md:text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4 md:w-4 md:h-4" />
                Add {roleFilter === 'All' ? 'Person' : roleFilter}
              </button>
            )}
        </div>
      </div>

      {groupedVendors ? (
         // GROUPED VENDOR VIEW
         <div className="space-y-8">
            {sortedCategories.length > 0 ? (
              sortedCategories.map(cat => (
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
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="text-center">
                  <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No vendors yet</h3>
                  <p className="text-gray-500">
                    No vendors have been added yet. Click "Add Vendor" to create one.
                  </p>
                </div>
              </div>
            )}
         </div>
      ) : (
         // STANDARD GRID VIEW
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <div key={user.id}>
                  <UserCard user={user} isVendor={roleFilter === Role.VENDOR} hideRole={roleFilter === Role.CLIENT || roleFilter === Role.DESIGNER} />
                </div>
              ))
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center py-20 px-4">
                <div className="text-center">
                  <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">
                    No {roleFilter === 'All' ? 'team members' : roleFilter.toLowerCase() + 's'} yet
                  </h3>
                  <p className="text-gray-500">
                    {roleFilter === 'All' 
                      ? 'Team members will appear here once they are added.'
                      : `${roleFilter}s will appear here once they are added.`}
                  </p>
                </div>
              </div>
            )}
        </div>
      )}

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-24">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[75vh] overflow-hidden animate-fade-in flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">{editingUser ? 'Edit Profile' : `Add New ${roleFilter === 'All' ? 'Person' : roleFilter}`}</h3>
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Role <span className="text-red-500">*</span></label>
                    <select 
                      title="Select user role"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 text-sm ${showErrors && !newUser.role ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}`}
                      value={newUser.role || ''}
                      onChange={e => {
                        const role = e.target.value as Role;
                        setNewUser({...newUser, role});
                        // Reset auth method to email by default when changing roles, or keep it if you prefer persistence
                        // setAuthMethod('email'); 
                      }}
                    >
                      <option value="">Select Role</option>
                      {currentUser?.role !== Role.DESIGNER && (
                        <option value={Role.CLIENT}>Client</option>
                      )}
                      <option value={Role.DESIGNER}>Designer</option>
                      <option value={Role.VENDOR}>Vendor</option>
                      {currentUser?.role === Role.ADMIN && (
                        <option value={Role.ADMIN}>Admin</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Authentication Method Selection - For All Roles (except Admin usually, but allowing for flexibility) */}
                {!editingUser && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Authentication Method <span className="text-red-500">*</span></label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAuthMethod('email')}
                        className={`flex-1 py-2 px-3 rounded-lg border-2 transition-colors font-medium text-sm ${
                          authMethod === 'email'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                        title="User will log in with email and password"
                      >
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMethod('phone');
                          setNewUser(prev => ({ ...prev, email: '' })); // Clear email when switching to phone
                        }}
                        className={`flex-1 py-2 px-3 rounded-lg border-2 transition-colors font-medium text-sm ${
                          authMethod === 'phone'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                        title="User will log in with phone number and OTP"
                      >
                        Phone
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Email Field - Only if Auth Method is Email */}
                {authMethod === 'email' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Email Id <span className="text-red-500">*</span></label>
                    <input 
                      type="email" 
                      className={getInputClass(newUser.email)}
                      placeholder="john@example.com"
                      value={newUser.email || ''}
                      onChange={e => setNewUser({...newUser, email: e.target.value})}
                    />
                  </div>
                )}

                {/* Phone Field - Always Visible */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {authMethod === 'phone' ? 'Phone Number (Login ID)' : 'Phone Number'} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="tel" 
                    className={getInputClass(newUser.phone)}
                    placeholder="+91 98765 43210"
                    value={newUser.phone || ''}
                    onChange={e => setNewUser({...newUser, phone: e.target.value})}
                  />
                  {authMethod === 'email' && (
                    <p className="text-xs text-gray-500 mt-1">Last 6 digits will automatically become their initial password.</p>
                  )}
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

                {newUser.role === Role.VENDOR && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Specialty</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white text-gray-900 text-sm"
                      placeholder="e.g. Flooring"
                      value={newUser.specialty || ''}
                      onChange={e => setNewUser({...newUser, specialty: e.target.value})}
                    />
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-gray-100 bg-gray-50 flex-shrink-0 sticky bottom-0">
                <button type="submit" className="w-full bg-gray-900 text-white font-bold py-2.5 rounded-lg hover:bg-gray-800 transition-colors text-sm">
                  {editingUser ? 'Save Changes' : 'Create Account'}
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
                <AvatarCircle avatar={selectedVendor.avatar} name={selectedVendor.name} size="md" role={String(selectedVendor.role).toLowerCase()} />
                <div>
                  <h3 className="text-xl sm:text-lg font-bold text-gray-900">{selectedVendor.name}</h3>
                  <p className="text-sm sm:text-xs text-gray-500">{selectedVendor.specialty} • {selectedVendor.company}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setIsVendorDetailOpen(false);
                    handleEditUser(selectedVendor);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit Vendor Profile"
                >
                  <Edit className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <button onClick={() => setIsVendorDetailOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close vendor detail panel">
                  <X className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Project-wise Tasks Table with Progress */}
              {(() => {
                // Get all projects where vendor has tasks
                const vendorProjects = realtimeProjects.filter(p => 
                  p.tasks?.some(t => t.assigneeId === selectedVendor?.id)
                ).map(project => {
                  // Get vendor's tasks in this project
                  const vendorTasks = project.tasks?.filter(t => t.assigneeId === selectedVendor?.id) || [];
                  
                  // Calculate progress based on individual task progress values
                  const totalTaskProgress = vendorTasks.reduce((sum, task) => {
                    return sum + calculateTaskProgress(task);
                  }, 0);
                  
                  const progressPercentage = vendorTasks.length > 0 
                    ? Math.round(totalTaskProgress / vendorTasks.length) 
                    : 0;
                  
                  // Count completed tasks for display
                  const completedTasks = vendorTasks.filter(t => t.status === TaskStatus.DONE).length;

                  return {
                    project,
                    tasks: vendorTasks,
                    totalTasks: vendorTasks.length,
                    completedTasks,
                    progressPercentage
                  };
                });

                return (
                  <div>
                    <h4 className="text-base sm:text-sm font-bold text-gray-800 mb-4">Project-wise Tasks & Progress</h4>
                    {vendorProjects.length === 0 ? (
                      <p className="text-base sm:text-sm text-gray-500 text-center py-6">No tasks assigned</p>
                    ) : (
                      <div className="space-y-6">
                        {vendorProjects.map(({ project, tasks, totalTasks, completedTasks, progressPercentage }) => {
                          const isExpanded = expandedProjects[project.id] !== false; // Default to expanded
                          const toggleProject = () => {
                            setExpandedProjects(prev => ({
                              ...prev,
                              [project.id]: !prev[project.id]
                            }));
                          };

                          // Calculate furthest (latest) deadline
                          const furthestDeadline = tasks.length > 0 
                            ? tasks.reduce((latest, task) => {
                                if (!task.dueDate) return latest;
                                if (!latest) return task.dueDate;
                                return new Date(task.dueDate) > new Date(latest) ? task.dueDate : latest;
                              }, null as string | null)
                            : null;
                          
                          const formattedFurthestDeadline = furthestDeadline 
                            ? formatDateToIndian(furthestDeadline)
                            : 'N/A';

                          return (
                          <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            {/* Project Header with Progress and Toggle */}
                            <button 
                              onClick={toggleProject}
                              className="w-full bg-gray-50 p-4 border-b border-gray-200 hover:bg-gray-100 transition-colors flex justify-between items-start"
                            >
                              <div className="flex justify-between items-start flex-1 gap-4">
                                <div className="flex-1">
                                  <h5 className="font-semibold text-gray-900 text-base sm:text-sm text-left cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectProject?.(project)}>{project.name}</h5>
                                  <p className="text-sm sm:text-xs text-gray-500 mt-1 text-left">DueDate: {formattedFurthestDeadline}</p>
                                </div>
                                <span className="text-sm sm:text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md font-medium whitespace-nowrap">
                                  {completedTasks}/{totalTasks} Completed
                                </span>
                              </div>
                              <ChevronRight className={`w-5 h-5 text-gray-600 ml-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Progress Bar */}
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm sm:text-xs font-medium text-gray-600">Work Completed</span>
                                <span className="text-base sm:text-sm font-bold text-gray-900">{progressPercentage}%</span>
                              </div>
                              <div className="w-full bg-gray-300 rounded-full h-2">
                                <div 
                                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${progressPercentage}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Collapsible Tasks Table */}
                            {isExpanded && (
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <colgroup>
                                    <col style={{ width: '30%' }} />
                                    <col style={{ width: '20%' }} />
                                    <col style={{ width: '30%' }} />
                                    <col style={{ width: '20%' }} />
                                  </colgroup>
                                  <thead className="bg-gray-100 border-b border-gray-200">
                                    <tr>
                                      <th className="text-left px-2 sm:px-4 py-3 text-sm sm:text-xs font-semibold text-gray-700">Task Title</th>
                                      <th className="text-center px-2 sm:px-4 py-3 text-sm sm:text-xs font-semibold text-gray-700">Status</th>
                                      <th className="text-center px-2 sm:px-4 py-3 text-sm sm:text-xs font-semibold text-gray-700">Progress</th>
                                      <th className="text-left px-2 sm:px-4 py-3 text-sm sm:text-xs font-semibold text-gray-700">Deadline</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {tasks.map(task => {
                                      // Calculate task progress using shared utility function
                                      const taskProgress = calculateTaskProgress(task);
                                      // Format deadline date from dueDate field
                                      const deadline = task.dueDate ? formatDateToIndian(task.dueDate) : 'No deadline';
                                      
                                      // Check if task is blocked by dependencies
                                      const isBlocked = task.dependencies && task.dependencies.length > 0 && 
                                        task.dependencies.some(depId => {
                                          const depTask = project.tasks?.find(t => t.id === depId);
                                          return depTask && depTask.status !== TaskStatus.DONE;
                                        });
                                      
                                      // Display actual status (same as project plan view)
                                      const statusColor = task.status === TaskStatus.DONE
                                        ? 'bg-green-100 text-green-800'
                                        : task.status === TaskStatus.IN_PROGRESS
                                        ? 'bg-blue-100 text-blue-800'
                                        : task.status === TaskStatus.REVIEW
                                        ? 'bg-purple-100 text-purple-800'
                                        : task.status === TaskStatus.TODO
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-gray-100 text-gray-800';
                                      
                                      return (
                                        <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                                          <td className="px-2 sm:px-4 py-3 text-base sm:text-sm text-gray-700">
                                            <div className="flex items-center gap-2 min-w-0 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectTask?.(task, project)}>
                                              <span className="truncate">{task.title}</span>
                                              {isBlocked && <Lock className="w-3 h-3 text-red-400 flex-shrink-0" aria-label="Task blocked - waiting for dependencies" />}
                                            </div>
                                          </td>
                                          <td className="px-2 sm:px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-md text-sm sm:text-xs font-medium whitespace-nowrap ${statusColor}`}>
                                              {task.status === TaskStatus.DONE ? 'Completed' : task.status}
                                            </span>
                                          </td>
                                          <td className="px-2 sm:px-4 py-3 text-center">
                                            <div className="flex items-center gap-0.5 justify-center">
                                              <div className="bg-gray-200 rounded-full h-2" style={{ width: '50px' }}>
                                                <div 
                                                  className={`h-2 rounded-full transition-all duration-300 ${
                                                    taskProgress === 100 ? 'bg-green-500' : 'bg-blue-500'
                                                  }`}
                                                  style={{ width: `${taskProgress}%` }}
                                                ></div>
                                              </div>
                                              <span className="text-sm sm:text-xs font-medium text-gray-700 min-w-[30px]">{taskProgress}%</span>
                                            </div>
                                          </td>
                                          <td className="px-2 sm:px-4 py-3 text-base sm:text-sm text-gray-700 whitespace-nowrap">{deadline}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Assign to Project Modal */}
      {isAssignModalOpen && userToAssign && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Assign to Project</h3>
                <p className="text-xs text-gray-500">Add {userToAssign.name} to a project team</p>
              </div>
              <button type="button" onClick={() => setIsAssignModalOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close assign modal" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-2 overflow-y-auto flex-1">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No projects available</div>
              ) : (
                <div className="space-y-1">
                  {realtimeProjects.map(project => {
                    // Check if already assigned
                    const isAssigned = 
                      project.clientId === userToAssign.id || 
                      project.leadDesignerId === userToAssign.id ||
                      (project.clientIds || []).includes(userToAssign.id) ||
                      (project.teamMembers || []).includes(userToAssign.id);

                    return (
                      <button
                        key={project.id}
                        onClick={() => !isAssigned && handleConfirmAssignment(project)}
                        disabled={isAssigned}
                        className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors ${
                          isAssigned 
                            ? 'bg-gray-50 opacity-60 cursor-not-allowed' 
                            : 'hover:bg-blue-50 hover:border-blue-100 border border-transparent'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-gray-800 text-sm cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectProject?.(project)}>{project.name}</p>
                          <p className="text-xs text-gray-500">{project.status}</p>
                        </div>
                        {isAssigned ? (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Added
                          </span>
                        ) : (
                          <Plus className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Designer Details Modal */}
      {isDesignerDetailOpen && selectedDesigner && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 sticky top-0 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <AvatarCircle avatar={selectedDesigner.avatar} name={selectedDesigner.name} size="md" role={String(selectedDesigner.role).toLowerCase()} />
                <div>
                  <h3 className="text-2xl sm:text-xl font-bold text-gray-900">{selectedDesigner.name}</h3>
                  <p className="text-base sm:text-sm text-gray-500">{selectedDesigner.specialty || 'Designer'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setIsDesignerDetailOpen(false);
                    handleEditUser(selectedDesigner);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit Designer Profile"
                >
                  <Edit className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <button 
                  onClick={() => {
                    setIsDesignerDetailOpen(false);
                    setSelectedDesigner(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  title="Close designer details"
                >
                  <X className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Project-wise Tasks for Designer */}
              {(() => {
                // Get all projects with tasks assigned to this designer
                const designerProjects = realtimeProjects
                  .filter(p => p.tasks?.some(t => t.assigneeId === selectedDesigner.id))
                  .map(project => ({
                    project,
                    tasks: project.tasks.filter(t => t.assigneeId === selectedDesigner.id),
                    projectFinancials: allProjectFinancials[project.id] || []
                  }));

                return designerProjects.length === 0 ? (
                  <p className="text-lg sm:text-base text-gray-500 text-center py-6">No tasks assigned</p>
                ) : (
                  <div className="space-y-6">
                    {designerProjects.map(({ project, tasks, projectFinancials }) => {
                      // Calculate total payment collected from project (both admin and client approved)
                      const projectPayment = projectFinancials
                        .filter(f => f.adminApproved && f.clientApproved && f.type === 'income')
                        .reduce((sum, f) => sum + (f.amount || 0), 0);

                      const isExpanded = expandedDesignerTasks[project.id] === true; // Default to collapsed
                      const toggleExpanded = () => {
                        setExpandedDesignerTasks(prev => ({
                          ...prev,
                          [project.id]: !prev[project.id]
                        }));
                      };

                      return (
                        <div key={project.id}>
                          <div className="mb-3">
                            <h4 className="text-lg sm:text-base font-bold text-gray-800 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectProject?.(project)}>{project.name}</h4>
                            <p className="text-base sm:text-sm text-gray-500 mt-1">Total Payment Received: <span className="font-semibold text-gray-900">₹{projectPayment.toLocaleString()}</span></p>
                          </div>
                          
                          <button
                            onClick={toggleExpanded}
                            className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-50 to-blue-100 flex justify-between items-center transition-colors text-left border border-blue-200 rounded-t-lg"
                          >
                            <span className="text-sm font-semibold text-blue-900">Tasks ({tasks.length})</span>
                            <ChevronRight className={`w-5 h-5 text-blue-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                          
                          {isExpanded && (
                            <div className="overflow-x-auto border border-gray-200 border-t-0 rounded-b-lg">
                              <table className="w-full text-lg sm:text-base">
                                <thead className="bg-gray-100 border-b border-gray-200">
                                  <tr>
                                    <th className="px-4 py-3 text-left font-bold text-gray-700 text-base sm:text-sm">Task Name</th>
                                  <th className="px-4 py-3 text-center font-bold text-gray-700 text-base sm:text-sm">Progress</th>
                                  <th className="px-4 py-3 text-center font-bold text-gray-700 text-base sm:text-sm">Status</th>
                                  <th className="px-4 py-3 text-center font-bold text-gray-700 text-base sm:text-sm">Due Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tasks.map(task => {
                                  const taskProgress = calculateTaskProgress(task);
                                  const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { 
                                    year: 'numeric', 
                                    month: '2-digit', 
                                    day: '2-digit' 
                                  }) : 'N/A';

                                  const statusColor = task.status === TaskStatus.DONE
                                    ? 'bg-green-100 text-green-800'
                                    : task.status === TaskStatus.IN_PROGRESS
                                    ? 'bg-blue-100 text-blue-800'
                                    : task.status === TaskStatus.REVIEW
                                    ? 'bg-purple-100 text-purple-800'
                                    : task.status === TaskStatus.OVERDUE
                                    ? 'bg-red-100 text-red-800'
                                    : task.status === TaskStatus.TODO
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800';

                                  return (
                                    <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50">
                                      <td className="px-4 py-3 text-left text-gray-900 font-medium text-base sm:text-sm cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectTask?.(task, project)}>{task.title}</td>
                                      <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                            <div 
                                              className="bg-blue-500 h-1.5 rounded-full" 
                                              style={{width: `${taskProgress}%`}}
                                            ></div>
                                          </div>
                                          <span className="text-base sm:text-sm font-semibold text-gray-700">{taskProgress}%</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-base sm:text-sm font-medium whitespace-nowrap ${statusColor}`}>
                                          {task.status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-center text-gray-600 text-base sm:text-sm">{dueDate}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
                  {realtimeProjects.filter(p => p.tasks.some(t => t.assigneeId === selectedVendor?.id)).map(project => (
                    <label key={project.id} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="checkbox" 
                        defaultChecked={true}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectProject?.(project)}>{project.name}</p>
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
                      addNotification('Success', 'Vendor link copied to clipboard', 'success', currentUser?.id || '', projects[0]?.id || '', projects[0]?.name || 'Project');
                      setIsShareModalOpen(false);
                    }).catch(() => {
                      addNotification('Error', 'Failed to copy link', 'error', currentUser?.id || '', projects[0]?.id || '', projects[0]?.name || 'Project');
                    });
                  } else {
                    // Email sharing
                    addNotification('Success', `Vendor report for ${selectedVendor?.name} shared with client`, 'success', currentUser?.id || '', projects[0]?.id || '', projects[0]?.name || 'Project');
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

      {/* Accounts Modal */}
      {isAccountsModalOpen && selectedVendorForAccounts && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-fade-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 sticky top-0 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <AvatarCircle avatar={selectedVendorForAccounts.avatar} name={selectedVendorForAccounts.name} size="md" role={String(selectedVendorForAccounts.role).toLowerCase()} />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedVendorForAccounts.name}</h3>
                  <p className="text-xs text-gray-500">{selectedVendorForAccounts.specialty} • {selectedVendorForAccounts.company}</p>
                </div>
              </div>
              <button onClick={() => setIsAccountsModalOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close accounts panel">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <h4 className="text-sm font-bold text-gray-800 mb-4">Project & Billing Report</h4>
              
              {realtimeProjects.filter(p => {
                const isTeamMember = p.teamMembers?.includes(selectedVendorForAccounts?.id || '');
                const hasTasks = p.tasks?.some(t => t.assigneeId === selectedVendorForAccounts?.id);
                const projectFinancials = allProjectFinancials[p.id] || [];
                const vendorName = selectedVendorForAccounts?.name || '';
                
                const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                const hasFinancials = projectFinancials.some(f => 
                  f.vendorId === selectedVendorForAccounts?.id || 
                  f.vendorName === vendorName || 
                  f.paidTo === vendorName ||
                  f.receivedBy === vendorName ||
                  cleanName(f.receivedByName) === vendorName ||
                  cleanName(f.paidByOther) === vendorName
                );
                
                return isTeamMember || hasTasks || hasFinancials;
              }).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No projects assigned</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-bold text-gray-700">Project</th>
                        <th className="px-4 py-2 text-right font-bold text-gray-700">Net Amount</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Tasks</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Admin Approval</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Client Approval</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtimeProjects.filter(p => {
                        const isTeamMember = p.teamMembers?.includes(selectedVendorForAccounts?.id || '');
                        const hasTasks = p.tasks?.some(t => t.assigneeId === selectedVendorForAccounts?.id);
                        const projectFinancials = allProjectFinancials[p.id] || [];
                        
                        const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                        const vendorName = selectedVendorForAccounts?.name || '';

                        const hasFinancials = projectFinancials.some(f => 
                          f.vendorId === selectedVendorForAccounts?.id || 
                          f.vendorName === vendorName || 
                          f.paidTo === vendorName ||
                          f.receivedBy === vendorName ||
                          cleanName(f.receivedByName) === vendorName ||
                          cleanName(f.paidByOther) === vendorName
                        );
                        return isTeamMember || hasTasks || hasFinancials;
                      }).map((project, idx) => {
                        const projectFinancials = allProjectFinancials[project.id] || [];
                        const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                        const vendorName = selectedVendorForAccounts?.name || '';

                        const allVendorRecords = projectFinancials.filter(f => 
                          f.vendorId === selectedVendorForAccounts?.id || 
                          f.vendorName === vendorName || 
                          f.paidTo === vendorName ||
                          f.receivedBy === vendorName ||
                          cleanName(f.receivedByName) === vendorName ||
                          cleanName(f.paidByOther) === vendorName
                        );

                        const approvedVendorRecords = allVendorRecords.filter(f => f.adminApproved && f.clientApproved);

                        const totalPaidToVendor = approvedVendorRecords
                          .filter(f => cleanName(f.receivedByName) === vendorName || f.receivedBy === vendorName)
                          .reduce((acc, curr) => acc + curr.amount, 0);

                        const totalPaidByVendor = approvedVendorRecords
                          .filter(f => f.vendorName === vendorName || cleanName(f.paidByOther) === vendorName || f.paidTo === vendorName)
                          .reduce((acc, curr) => acc + curr.amount, 0);

                        const netAmount = totalPaidToVendor - totalPaidByVendor;
                        
                        let completedTasksCount = 0;
                        if (selectedVendorForAccounts?.projectMetrics && selectedVendorForAccounts.projectMetrics[project.id]) {
                          completedTasksCount = selectedVendorForAccounts.projectMetrics[project.id].taskCount;
                        } else {
                          // Fallback: count all tasks assigned to vendor (not just DONE)
                          const projectVendorTasks = project.tasks.filter(t => t.assigneeId === selectedVendorForAccounts?.id);
                          completedTasksCount = projectVendorTasks.length;
                        }
                          
                        const hasRecords = allVendorRecords.length > 0;
                        const allAdminApproved = hasRecords && allVendorRecords.every(f => f.adminApproved);
                        const someAdminApproved = hasRecords && allVendorRecords.some(f => f.adminApproved);
                        const allClientApproved = hasRecords && allVendorRecords.every(f => f.clientApproved);
                        const someClientApproved = hasRecords && allVendorRecords.some(f => f.clientApproved);

                        const getStatusBadge = (all: boolean, some: boolean) => {
                          if (all) return <div className="flex justify-center text-green-500 font-bold text-lg">✓</div>;
                          if (some) return <span className="text-orange-500 font-medium text-xs">Partial</span>;
                          return <span className="text-gray-400 text-xs">-</span>;
                        };
                        
                        return (
                          <tr key={project.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <td className="px-4 py-3 font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onSelectProject?.(project)}>{project.name}</td>
                            <td className="px-4 py-3 text-left text-gray-700">₹{(netAmount / 1000).toFixed(1)}k</td>
                            <td className="px-4 py-3 text-center text-gray-700 font-medium">{completedTasksCount}</td>
                            <td className="px-4 py-3 text-center">{getStatusBadge(allAdminApproved, someAdminApproved)}</td>
                            <td className="px-4 py-3 text-center">{getStatusBadge(allClientApproved, someClientApproved)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                allAdminApproved && allClientApproved ? 'bg-green-100 text-green-700' :
                                allAdminApproved ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {allAdminApproved && allClientApproved ? 'Approved' :
                                 allAdminApproved ? 'Admin OK' :
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
        </div>,
        document.body
      )}
      {/* Welcome Modal for Phone Auth Users */}
      {welcomeModalUser && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0}}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center" style={{position: 'relative', zIndex: 10000}}>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">✅ User Created Successfully!</h3>
              <p className="text-gray-700 mb-6 text-base font-medium">
                <strong>{welcomeModalUser.name}</strong> has been created with phone authentication.<br/>
                <span className="text-sm text-gray-600">Phone: {welcomeModalUser.phone}</span>
              </p>

              <div className="bg-blue-50 p-4 rounded-lg text-left mb-6 border-l-4 border-blue-500">
                <p className="text-xs text-blue-600 font-bold uppercase mb-2">📱 Welcome Message</p>
                <p className="text-sm text-gray-800 italic">
                  "Hi {welcomeModalUser.name}, welcome to Kydo Solutions! Your account has been created. Please login using your phone number: {welcomeModalUser.phone}."
                </p>
              </div>

              <div className="space-y-3">
                <a 
                  href={`https://wa.me/+${welcomeModalUser.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${welcomeModalUser.name}, welcome to Kydo Solutions! Your account has been created. Please login using your phone number: ${welcomeModalUser.phone}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md"
                >
                  <MessageCircle className="w-5 h-5" /> Send Welcome on WhatsApp
                </a>
                
                <button 
                  onClick={() => {
                    const msg = `Hi ${welcomeModalUser.name}, welcome to Kydo Solutions! Your account has been created. Please login using your phone number: ${welcomeModalUser.phone}.`;
                    navigator.clipboard.writeText(msg);
                    addNotification('Copied', 'Message copied to clipboard!', 'success');
                  }}
                  className="w-full bg-blue-100 border border-blue-300 hover:bg-blue-200 text-blue-700 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="w-5 h-5" /> Copy Message
                </button>

                <button 
                  onClick={() => {
                    setWelcomeModalUser(null);
                    addNotification('Done', 'Remember to send the message!', 'info');
                  }}
                  className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default PeopleList;