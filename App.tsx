import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, FolderKanban, Users, ShoppingBag, 
  Palette, LogOut, Bell, Menu, X, Tag, Edit, Trash2
} from 'lucide-react';
import { MOCK_PROJECTS, MOCK_USERS } from './constants';
import { Project, Role, User, ProjectStatus, ProjectType, ProjectCategory } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { subscribeToProjects, subscribeToUsers, subscribeToDesigners, subscribeToVendors, subscribeToClients, seedDatabase, updateProject, deleteProject, syncAllVendorMetrics } from './services/firebaseService';
import { AvatarCircle } from './utils/avatarUtils';

// Components
import Dashboard from './components/Dashboard';
import ProjectDetail from './components/ProjectDetail';
import PeopleList from './components/PeopleList';
import Login from './components/Login';
import NotificationPanel from './components/NotificationPanel';
import NewProjectModal from './components/NewProjectModal';

import { calculateProjectProgress } from './utils/taskUtils';

// Helper for project list
const ProjectList = ({ 
  projects, 
  onSelect,
  user,
  setEditingProject,
  setIsNewProjectModalOpen,
  onDeleteProject
}: { 
  projects: Project[], 
  onSelect: (p: Project) => void,
  user: User | null,
  setEditingProject: (project: Project | null) => void,
  setIsNewProjectModalOpen: (open: boolean) => void,
  onDeleteProject: (project: Project) => void
}) => {
  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.DISCOVERY: return 'bg-teal-100 text-teal-700';
      case ProjectStatus.PLANNING: return 'bg-purple-100 text-purple-700';
      case ProjectStatus.EXECUTION: return 'bg-blue-100 text-blue-700';
      case ProjectStatus.COMPLETED: return 'bg-green-100 text-green-700';
      case ProjectStatus.ON_HOLD: return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getTypeColor = (type: ProjectType) => {
    return type === ProjectType.DESIGNING ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700';
  };

  // Group projects by category
  const groupedProjects = projects.reduce((acc, project) => {
    const category = project.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(project);
    return acc;
  }, {} as Record<ProjectCategory, Project[]>);

  // Sort categories (Commercial first, then Residential)
  const sortedCategories = Object.keys(groupedProjects).sort((a, b) => {
    if (a === ProjectCategory.COMMERCIAL) return -1;
    if (b === ProjectCategory.COMMERCIAL) return 1;
    return 0;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {sortedCategories.map(category => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-800">{category}</h2>
            <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {groupedProjects[category as ProjectCategory].length} projects
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupedProjects[category as ProjectCategory].map(project => (
              <div 
                key={project.id} 
                onClick={() => onSelect(project)}
                className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="h-40 overflow-hidden relative">
                  <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    {user?.role === Role.ADMIN && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProject(project);
                            setIsNewProjectModalOpen(true);
                          }}
                          className="backdrop-blur-md p-2 rounded text-xs font-bold shadow-sm border border-white/20 hover:bg-white/20 transition-colors"
                          title="Edit project"
                        >
                          <Edit className="w-4 h-4 text-gray-900" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
                              onDeleteProject(project);
                            }
                          }}
                          className="backdrop-blur-md p-2 rounded text-xs font-bold shadow-sm border border-white/20 hover:bg-red-500/20 transition-colors group/delete"
                          title="Delete project"
                        >
                          <Trash2 className="w-4 h-4 text-red-600 group-hover/delete:text-red-700" />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="absolute top-3 left-14 flex gap-2">
                    <div className={`backdrop-blur-md px-2 py-1 rounded text-xs font-bold shadow-sm border border-white/20 ${getStatusColor(project.status)}`}>
                      {project.status}
                    </div>
                    <div className={`backdrop-blur-md px-2 py-1 rounded text-xs font-bold shadow-sm border border-white/20 ${getTypeColor(project.type)}`}>
                      {project.type}
                    </div>
                  </div>
                  {/* Activity Dot */}
                  {project.activityLog && project.activityLog.length > 0 && (
                     // Simple logic: if latest activity is < 24h
                     (new Date().getTime() - new Date(project.activityLog[0].timestamp).getTime()) < 86400000 && (
                        <div className="absolute bottom-3 right-3 w-3 h-3 bg-blue-500 rounded-full border-2 border-white animate-pulse" title="New Activity"></div>
                     )
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">{project.name}</h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{project.description}</p>
                  <div className="flex justify-between items-center border-t border-gray-100 pt-4">
                    <div></div>
                    <span className="text-xs font-medium text-gray-400">Due {new Date(project.deadline).toLocaleDateString()}</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="mt-4">
                     <div className="flex justify-between text-xs mb-1">
                       <span className="text-gray-500">Progress</span>
                       <span className="text-gray-900 font-bold">
                         {calculateProjectProgress(project.tasks)}%
                       </span>
                     </div>
                     <div className="w-full bg-gray-100 rounded-full h-1.5">
                       <div 
                         {...{ style: { width: `${calculateProjectProgress(project.tasks)}%` } }}
                         className="bg-gray-900 h-1.5 rounded-full transition-all duration-1000" 
                       />
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

type ViewState = 'dashboard' | 'projects' | 'clients' | 'vendors' | 'designers';

function App() {
  // Lifted state to allow NotificationProvider access to projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  return (
    <AuthProvider>
      <NotificationProvider projects={projects}>
        <AppContent 
          projects={projects} 
          setProjects={setProjects}
          users={users}
          setUsers={setUsers}
        />
      </NotificationProvider>
    </AuthProvider>
  );
}

interface AppContentProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

function AppContent({ projects, setProjects, users, setUsers }: AppContentProps) {

  const { user, logout, loading: authLoading } = useAuth();
  const { unreadCount, addNotification } = useNotifications();
  
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to Firebase real-time updates
  useEffect(() => {
    if (!user) return;

    setIsLoading(false); // No loading state needed, show empty immediately

    // Subscribe to projects (will be empty initially)
    const unsubscribeProjects = subscribeToProjects((firebaseProjects) => {
      console.log('🔄 Projects updated in App:', firebaseProjects.length);
      setProjects(firebaseProjects || []);
      
      // Sync all vendor metrics whenever projects change
      syncAllVendorMetrics().catch((err: any) => {
        console.error('Failed to sync vendor metrics:', err);
      });
    });

    // Subscribe to users - combines from all role collections
    const unsubscribeUsers = subscribeToUsers((firebaseUsers) => {
      console.log('🔄 Users updated in App:', firebaseUsers.length, firebaseUsers);
      setUsers(firebaseUsers || []);
    });

    // Also subscribe to role-specific collections for redundancy/updates
    const unsubscribeDesigners = subscribeToDesigners((designers) => {
      console.log('🔄 Designers updated:', designers.length);
      // Merge with existing users
      setUsers(prev => {
        const merged = [...prev];
        designers.forEach(designer => {
          const index = merged.findIndex(u => u.id === designer.id);
          if (index >= 0) {
            merged[index] = designer;
          } else {
            merged.push(designer);
          }
        });
        return merged;
      });
    });

    const unsubscribeVendors = subscribeToVendors((vendors) => {
      console.log('🔄 Vendors updated:', vendors.length);
      // Merge with existing users
      setUsers(prev => {
        const merged = [...prev];
        vendors.forEach(vendor => {
          const index = merged.findIndex(u => u.id === vendor.id);
          if (index >= 0) {
            merged[index] = vendor;
          } else {
            merged.push(vendor);
          }
        });
        return merged;
      });
    });

    const unsubscribeClients = subscribeToClients((clients) => {
      console.log('🔄 Clients updated:', clients.length);
      // Merge with existing users
      setUsers(prev => {
        const merged = [...prev];
        clients.forEach(client => {
          const index = merged.findIndex(u => u.id === client.id);
          if (index >= 0) {
            merged[index] = client;
          } else {
            merged.push(client);
          }
        });
        return merged;
      });
    });

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeProjects();
      unsubscribeUsers();
      unsubscribeDesigners();
      unsubscribeVendors();
      unsubscribeClients();
    };
  }, [user, setProjects, setUsers]);

  // Reset view to dashboard on login
  useEffect(() => {
    if (user) {
      setCurrentView('dashboard');
      setSelectedProject(null);
    }
  }, [user]);

  // Sync selectedProject with real-time updates
  useEffect(() => {
    if (selectedProject) {
      const updated = projects.find(p => p.id === selectedProject.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedProject)) {
        setSelectedProject(updated);
      }
    }
  }, [projects, selectedProject]);

  // If not logged in, show login screen
  if (!user) {
    return <Login users={users} />;
  }

  // Permission Logic for Views
  const canSeeProjects = true; // All roles can see some form of projects
  const canSeeClients = user.role === Role.ADMIN || user.role === Role.DESIGNER;
  const canSeeDesigners = user.role === Role.ADMIN;
  const canSeeVendors = user.role === Role.ADMIN || user.role === Role.DESIGNER;

  // Handlers
  const handleUpdateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedProject(updated);
    // Also save to Firestore (this ensures vendor sees the updated tasks array in Dashboard)
    const { id, ...projectDataWithoutId } = updated;
    updateProject(updated.id, projectDataWithoutId as Partial<Project>).catch((err: any) => {
      console.error('Failed to save project update to Firebase:', err);
    });
    // Sync vendor metrics after project change
    syncAllVendorMetrics().catch((err: any) => {
      console.error('Failed to sync vendor metrics:', err);
    });
  };

  const handleAddUser = (newUser: User) => {
    setUsers(prev => [...prev, newUser]);
  };

  const handleAddProject = (newProject: Project) => {
    // Don't add to local state - let Firebase subscription handle it
    // This prevents duplicate projects
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      await deleteProject(project.id);
      addNotification('Success', `Project "${project.name}" deleted successfully`, 'success');
    } catch (error: any) {
      console.error('Error deleting project:', error);
      addNotification('Error', `Failed to delete project: ${error.message}`, 'error');
    }
  };

  // Filter Projects for List View based on Role
  const visibleProjects = projects.filter(p => {
    if (user.role === Role.ADMIN) return true;
    if (user.role === Role.DESIGNER) return p.leadDesignerId === user.id;
    if (user.role === Role.CLIENT) return p.clientId === user.id;
    if (user.role === Role.VENDOR) {
      // Vendors see projects they have tasks in
      return p.tasks.some(t => t.assigneeId === user.id);
    }
    return false;
  });

  const SidebarItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSelectedProject(null);
        setIsSidebarOpen(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1 ${isSidebarCollapsed ? 'justify-center' : ''}
        ${currentView === view && !selectedProject 
          ? 'bg-gray-900 text-white shadow-lg' 
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
      title={isSidebarCollapsed ? label : ""}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!isSidebarCollapsed && <span className="font-medium">{label}</span>}
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-200 transform transition-all duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64 w-64'}
      `}>
        <div className="h-full flex flex-col relative">
          <div className="p-6 flex items-center justify-between">
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2">
                <img src="/kydoicon.png" alt="Kydo Solutions Logo" className="h-8 w-8 rounded-lg" style={{ background: 'none', filter: 'invert(0)' }} />
                <span className="text-xl font-bold text-gray-900">Kydo Solutions</span>
              </div>
            )}
            {isSidebarCollapsed && (
              <img src="/kydoicon.png" alt="Kydo Solutions Logo" className="h-8 w-8" style={{ background: 'none', filter: 'invert(0)' }} />
            )}
            <button className="md:hidden" onClick={() => setIsSidebarOpen(false)} title="Close sidebar">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Toggle Button - On Right Border */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="hidden md:flex absolute -right-3.5 top-6 w-7 h-7 text-gray-400 hover:text-gray-900 rounded items-center justify-center transition-colors"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="px-4 flex-1 overflow-y-auto">
            <div className="mb-6">
              {!isSidebarCollapsed && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Main</p>}
              <SidebarItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
              {canSeeProjects && <SidebarItem view="projects" icon={FolderKanban} label="Projects" />}
            </div>

            {(canSeeClients || canSeeDesigners || canSeeVendors) && (
              <div className="mb-6">
                {!isSidebarCollapsed && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">People</p>}
                {canSeeClients && <SidebarItem view="clients" icon={Users} label="Clients" />}
                {canSeeDesigners && <SidebarItem view="designers" icon={Palette} label="Team" />}
                {canSeeVendors && <SidebarItem view="vendors" icon={ShoppingBag} label="Vendors" />}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200">
            <button 
              onClick={async () => {
                try {
                  await logout();
                } catch (error) {
                  console.error('Logout failed:', error);
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={isSidebarCollapsed ? "Sign Out" : ""}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="font-medium">Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Top Navbar */}
        {/* Added relative and z-20 to ensure dropdowns overlap sticky content in main */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 relative z-20">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Toggle sidebar menu">
              <Menu className="w-6 h-6" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title="Toggle notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white animate-pulse"></span>
                )}
              </button>
              {/* Notification Panel */}
              <NotificationPanel 
                isOpen={isNotifOpen} 
                onClose={() => setIsNotifOpen(false)}
                projects={projects}
                onSelectProject={setSelectedProject}
              />
            </div>

            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
              <AvatarCircle avatar={user.avatar} name={user.name} size="sm" />
            </div>
          </div>
        </header>

        {/* View Content */}
        <main 
          className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-6 relative z-0" 
          onClick={() => isNotifOpen && setIsNotifOpen(false)}
        >
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-gray-900 animate-spin mx-auto mb-4"></div>
                <p className="text-gray-500 font-medium">Loading data from Firebase...</p>
              </div>
            </div>
          )}

          {!isLoading && (
            <>
              {selectedProject ? (
                 <ProjectDetail 
                   project={selectedProject} 
                   users={users} 
                   onUpdateProject={handleUpdateProject}
                   onBack={() => setSelectedProject(null)} 
                 />
              ) : (
                <>
                  {currentView === 'dashboard' && <Dashboard projects={projects} users={users} onSelectProject={setSelectedProject} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                  }} />}
                  
                  {currentView === 'projects' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800">Projects</h2>
                        {(user.role === Role.ADMIN || user.role === Role.DESIGNER) && (
                          <button 
                            onClick={() => setIsNewProjectModalOpen(true)}
                            className="bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2"
                          >
                             <Palette className="w-4 h-4" /> New Project
                          </button>
                        )}
                      </div>
                      {visibleProjects.length > 0 ? (
                        <ProjectList 
                          projects={visibleProjects} 
                          onSelect={setSelectedProject}
                          user={user}
                          setEditingProject={setEditingProject}
                          setIsNewProjectModalOpen={setIsNewProjectModalOpen}
                          onDeleteProject={handleDeleteProject}
                        />
                      ) : (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                          <p className="text-gray-500">No projects found for your account.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {currentView === 'clients' && <PeopleList users={users} roleFilter={Role.CLIENT} onAddUser={handleAddUser} projects={projects} onSelectProject={setSelectedProject} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                  }} />}
                  {currentView === 'vendors' && <PeopleList users={users} roleFilter={Role.VENDOR} onAddUser={handleAddUser} projects={projects} onSelectProject={setSelectedProject} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                  }} />}
                  {currentView === 'designers' && <PeopleList users={users} roleFilter={Role.DESIGNER} onAddUser={handleAddUser} projects={projects} onSelectProject={setSelectedProject} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                  }} />}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {isNewProjectModalOpen && (
        <NewProjectModal 
          users={users}
          onClose={() => {
            setIsNewProjectModalOpen(false);
            setEditingProject(null);
          }}
          onSave={handleAddProject}
          initialProject={editingProject}
        />
      )}
    </div>
  );
}

export default App;