import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, FolderKanban, Users, ShoppingBag, 
  Palette, LogOut, Bell, Menu, X, Tag, Edit, Trash2, Settings, Shield
} from 'lucide-react';
import { IoPersonOutline } from 'react-icons/io5';
import { MOCK_PROJECTS, MOCK_USERS } from './constants';
import { Project, Role, User, ProjectStatus, ProjectType, ProjectCategory, Task } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { subscribeToProjects, subscribeToUserProjects, subscribeToUsers, subscribeToDesigners, subscribeToVendors, subscribeToClients, seedDatabase, updateProject, deleteProject, syncAllVendorMetrics } from './services/firebaseService';
import { subscribeToProjectTasks } from './services/projectDetailsService';
import { requestNotificationPermission, onMessageListener } from './services/pushNotificationService';
import { AvatarCircle } from './utils/avatarUtils';
import { formatDateToIndian } from './utils/taskUtils';

// Components
import Dashboard from './components/Dashboard';
import ProjectDetail from './components/ProjectDetail';
import PeopleList from './components/PeopleList';
import Login from './components/Login';
import NotificationPanel from './components/NotificationPanel';
import NewProjectModal from './components/NewProjectModal';
import Loader from './components/Loader';
import RememberedDevices from './components/RememberedDevices';
import SessionExpiryWarning from './components/SessionExpiryWarning';
import BrandingSettings from './components/BrandingSettings';
import { PageTitleUpdater } from './components/PageTitleUpdater';
import { useTenantBranding } from './hooks/useTenantBranding';

import { calculateProjectProgress } from './utils/taskUtils';

// Helper for project list
const ProjectList = ({ 
  projects, 
  onSelect,
  user,
  setEditingProject,
  setIsNewProjectModalOpen,
  onDeleteProject,
  realTimeTasks
}: { 
  projects: Project[], 
  onSelect: (p: Project) => void,
  user: User | null,
  setEditingProject: (project: Project | null) => void,
  setIsNewProjectModalOpen: (open: boolean) => void,
  onDeleteProject: (project: Project) => void,
  realTimeTasks: Map<string, Task[]>
}) => {
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
  const getSafeTimestamp = (date: any) => {
    if (!date) return 0;
    if (typeof date === 'string') return new Date(date).getTime();
    if (date.toDate && typeof date.toDate === 'function') return date.toDate().getTime();
    return new Date(date).getTime() || 0;
  };

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

  // (No per-category sorting on the Project page)

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
            <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full mobile-increase">
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
                <div className="h-40 overflow-hidden relative bg-gray-100">
                  {imageLoading[project.id] && (
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
                  )}
                  <img 
                    src={project.thumbnail} 
                    alt={project.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onLoad={() => setImageLoading(prev => ({ ...prev, [project.id]: false }))}
                    onLoadStart={() => setImageLoading(prev => ({ ...prev, [project.id]: true }))}
                  />
                  {/* Edit/Delete moved to card footer for left-aligned placement */}
                  <div className="absolute top-3 right-3 flex gap-2 items-center">
                    <div className={`backdrop-blur-md px-3 py-1 rounded text-sm font-bold md:px-2 md:text-xs md:font-bold shadow-sm border border-white/20 ${getTypeColor(project.type)}`}>
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
                  <h3 className="font-bold text-gray-900 text-lg mb-1 mobile-increase">{project.name}</h3>
                  <p className="text-base text-gray-600 md:text-sm md:text-gray-500 mb-4 line-clamp-2 mobile-increase">{project.description}</p>
                  {/* Progress Bar (moved above due date) */}
                  <div className="mt-2">
                     <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500 mobile-increase">Progress</span>
                        <span className="text-gray-900 font-bold mobile-increase">
                          {calculateProjectProgress(realTimeTasks.get(project.id) || project.tasks)}%
                        </span>
                      </div>
                     <div className="w-full bg-gray-100 rounded-full h-1.5">
                       <div 
                         {...{ style: { width: `${calculateProjectProgress(realTimeTasks.get(project.id) || project.tasks)}%` } }}
                         className="bg-gray-900 h-1.5 rounded-full transition-all duration-1000" 
                       />
                     </div>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-100 pt-4 mt-3">
                    <div className="flex items-center gap-2">
                      {user?.role === Role.ADMIN && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProject(project);
                              setIsNewProjectModalOpen(true);
                            }}
                            className="p-2 rounded text-xs font-bold shadow-sm border border-gray-200 hover:bg-gray-100 transition-colors"
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
                            className="p-2 rounded text-xs font-bold shadow-sm border border-gray-200 hover:bg-red-50 transition-colors"
                            title="Delete project"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </>
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-600 md:text-xs md:text-gray-400 mobile-increase">Due {formatDateToIndian(project.deadline)}</span>
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

type ViewState = 'dashboard' | 'projects' | 'clients' | 'vendors' | 'designers' | 'admins' | 'settings';

function App() {
  // Lifted state to allow NotificationProvider access to projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  return (
    <AuthProvider>
      <NotificationProvider projects={projects}>
        <LoadingProvider>
          <AppContent 
            projects={projects} 
            setProjects={setProjects}
            users={users}
            setUsers={setUsers}
          />
        </LoadingProvider>
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
  const { brandName, logoUrl } = useTenantBranding();
  
  const [currentView, setCurrentView] = useState<ViewState>(() => {
    // Default clients to Projects view, others to Dashboard
    return (user && user.role === Role.CLIENT) ? 'projects' : 'dashboard';
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskOnlyView, setIsTaskOnlyView] = useState(false);
  const [initialProjectTab, setInitialProjectTab] = useState<'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents' | 'meetings' | undefined>(undefined);
  // Store pending deep-link params found on page load and apply them after projects/tasks load
  const [pendingDeepLink, setPendingDeepLink] = useState<{ projectId?: string; taskId?: string; meetingId?: string; tab?: string; open?: string } | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isBrandingSettingsOpen, setIsBrandingSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [realTimeTasks, setRealTimeTasks] = useState<Map<string, Task[]>>(new Map());
  const [showNotifPermissionBanner, setShowNotifPermissionBanner] = useState(false);

  // Initialize push notifications
  useEffect(() => {
    if (user) {
      // Check current permission status
      const checkPermission = async () => {
        if ('Notification' in window) {
          const permission = Notification.permission;
          if (permission === 'default') {
            // Show banner to request permission
            setShowNotifPermissionBanner(true);
          } else if (permission === 'granted') {
            // Request token
            await requestNotificationPermission(user.id);
          }
        }
      };
      
      checkPermission();
      
      onMessageListener().then((payload: any) => {
        // console.log('Received foreground message: ', payload);
        if (payload?.notification) {
          addNotification({
            title: payload.notification.title,
            message: payload.notification.body,
            type: 'info'
          });
        }
      }).catch(err => console.log('failed: ', err));
    }
  }, [user]);

  const handleEnableNotifications = async () => {
    if (user) {
      const token = await requestNotificationPermission(user.id);
      if (token) {
        setShowNotifPermissionBanner(false);
        // Test notification
        if (Notification.permission === 'granted') {
          new Notification('Notifications Enabled! 🎉', {
            body: 'You will now receive push notifications for project updates',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png'
          });
        }
      }
    }
  };

  // Subscribe to Firebase real-time updates
  useEffect(() => {
    // Capture URL query params on load and defer applying until data is available
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qProject = params.get('projectId') || params.get('project') || undefined;
        const qTask = params.get('taskId') || params.get('task') || undefined;
        const qMeeting = params.get('meetingId') || undefined;
        const qTab = params.get('tab') || undefined;
        const qOpen = params.get('open') || undefined;
        if (qProject || qTask || qMeeting || qTab || qOpen) {
          setPendingDeepLink({ projectId: qProject, taskId: qTask, meetingId: qMeeting, tab: qTab, open: qOpen });
        }
      }
    } catch (e) {
      // ignore URL parse errors
    }

    if (!user) return;

    setIsLoading(false); // No loading state needed, show empty immediately

    // Subscribe to projects (will be empty initially)
    let unsubscribeProjects: any;
    
    // Use global subscription for all roles for now to ensure visibility
    // The security rules are permissive enough to allow this, and it fixes the issue where
    // vendors couldn't see projects they were assigned to via tasks but not in vendorIds array.
    // Long term fix: Ensure vendorIds is always updated when tasks are assigned (implemented in projectDetailsService)
    // But for immediate fix for existing data, we fetch all.
    unsubscribeProjects = subscribeToProjects((firebaseProjects) => {
      setProjects(firebaseProjects || []);
      
      // Sync all vendor metrics whenever projects change (except for vendors)
      if (user.role !== Role.VENDOR) {
        syncAllVendorMetrics(user.tenantId).catch((err: any) => {
          console.error('Failed to sync vendor metrics:', err);
        });
      }
    }, user.tenantId);

    // Subscribe to users - combines from all role collections
    const unsubscribeUsers = subscribeToUsers((firebaseUsers) => {
      setUsers(prev => {
        const newIds = new Set(firebaseUsers.map(u => u.id));
        const others = prev.filter(u => !newIds.has(u.id));
        return [...others, ...firebaseUsers];
      });
    }, user.tenantId);

    // Also subscribe to role-specific collections for redundancy/updates
    const unsubscribeDesigners = subscribeToDesigners((designers) => {
      // Replace all designers with the new list, ensuring no ID duplicates
      setUsers(prev => {
        const newIds = new Set(designers.map(d => d.id));
        const others = prev.filter(u => !newIds.has(u.id));
        return [...others, ...designers];
      });
    }, user.tenantId);

    const unsubscribeVendors = subscribeToVendors((vendors) => {
      // Replace all vendors with the new list, ensuring no ID duplicates
      setUsers(prev => {
        const newIds = new Set(vendors.map(v => v.id));
        const others = prev.filter(u => !newIds.has(u.id));
        return [...others, ...vendors];
      });
    }, user.tenantId);

    const unsubscribeClients = subscribeToClients((clients) => {
      // Replace all clients with the new list, ensuring no ID duplicates
      setUsers(prev => {
        const newIds = new Set(clients.map(c => c.id));
        const others = prev.filter(u => !newIds.has(u.id));
        return [...others, ...clients];
      });
    }, user.tenantId);

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeProjects();
      unsubscribeUsers();
      unsubscribeDesigners();
      unsubscribeVendors();
      unsubscribeClients();
    };
  }, [user, setProjects, setUsers]);

    // Apply pending deep-link after projects or realTimeTasks update
    useEffect(() => {
      if (!pendingDeepLink) return;
      const { projectId, taskId, meetingId, tab } = pendingDeepLink;
      if (!projectId) return;

      const proj = projects.find(p => p.id === projectId);
      if (proj) {
        setSelectedProject(proj);
        setInitialProjectTab((tab as any) || undefined);

        if (taskId) {
          const tasks = realTimeTasks.get(projectId) || proj.tasks || [];
          const t = tasks.find(tsk => tsk.id === taskId) || null;
          if (t) {
            setSelectedTask(t);
            setIsTaskOnlyView(true);
          }
        }

        // If meetingId provided, just ensure project opens with meetings tab
        if (meetingId && !taskId) {
          setInitialProjectTab('meetings');
        }

        // Clear pending deep link so it doesn't re-run
        setPendingDeepLink(null);
        // Remove query params from URL so child components can also check URL if needed
        try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) { /* ignore */ }
      }
    }, [projects, realTimeTasks, pendingDeepLink]);

  // Subscribe to all project tasks for real-time updates
  useEffect(() => {
    if (projects.length === 0) return;

    const unsubscribers: Array<() => void> = [];

    projects.forEach((project) => {
      const unsubscribe = subscribeToProjectTasks(project.id, (tasks) => {
        setRealTimeTasks((prev) => new Map(prev).set(project.id, tasks));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [projects]);

  // Reset view to dashboard on login
  useEffect(() => {
    if (user) {
      // If a pending deep-link requests opening Admins, honor it after login
      try {
        const p = (pendingDeepLink as any) || {};
        if (p.open === 'admins') {
          setCurrentView('admins');
        } else {
          // Send clients directly to Projects, other roles to Dashboard
          setCurrentView(user.role === Role.CLIENT ? 'projects' : 'dashboard');
        }
      } catch (e) {
        setCurrentView(user.role === Role.CLIENT ? 'projects' : 'dashboard');
      }
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
  const canSeeAdmins = user.role === Role.ADMIN || user.role === Role.VENDOR;

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
    syncAllVendorMetrics(user.tenantId).catch((err: any) => {
      console.error('Failed to sync vendor metrics:', err);
    });
  };

  const handleAddUser = (newUser: User) => {
    setUsers(prev => {
      if (prev.find(u => u.id === newUser.id)) return prev;
      return [...prev, newUser];
    });
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
    if (user.role === Role.DESIGNER) return p.leadDesignerId === user.id || (p.teamMembers || []).includes(user.id);
    if (user.role === Role.CLIENT) return p.clientId === user.id || (p.clientIds || []).includes(user.id);
    if (user.role === Role.VENDOR) {
      // Vendors see projects they have tasks in, are explicitly added to, or included in vendorIds
      // Use realTimeTasks map which has tasks fetched from subcollection, not p.tasks which may be empty
      const projectTasks = realTimeTasks.get(p.id) || [];
      return projectTasks.some(t => t.assigneeId === user.id) || (p.vendorIds || []).includes(user.id) || (p.teamMembers || []).includes(user.id);
    }
    return false;
  });

  const SidebarItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSelectedProject(null);
        setSelectedTask(null);
        setIsTaskOnlyView(false);
        setIsSidebarOpen(false);
      }}
      className={`w-full flex items-center gap-1 px-4 py-3 rounded-lg transition-colors mb-1 ${isSidebarCollapsed ? 'justify-center' : ''}
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
      <Loader />
      <SessionExpiryWarning />
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
                <img src={logoUrl} alt={`${brandName} Logo`} className="h-8 w-8 rounded-lg" style={{ background: 'none', filter: 'invert(0)' }} />
                <span className="text-xl font-bold text-gray-900">{brandName}</span>
              </div>
            )}
            {isSidebarCollapsed && (
              <img src={logoUrl} alt={`${brandName} Logo`} className="h-8 w-8" style={{ background: 'none', filter: 'invert(0)' }} />
            )}
            <button className="md:hidden" onClick={() => setIsSidebarOpen(false)} title="Close sidebar">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Toggle Button - On Right Border */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="hidden md:flex absolute -right-3 top-6 w-7 h-7 bg-white text-gray-900 rounded-full items-center justify-center hover:bg-gray-100 transition-colors shadow-md border border-gray-200 z-40"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle sidebar"
          >
            <span className="relative w-4 h-4 block">
              <span
                className={`absolute left-1/2 top-1/2 w-4 h-0.5 bg-gray-900 rounded transition-all duration-300 ease-in-out
                  ${!isSidebarCollapsed ? 'rotate-45 -translate-x-1/2 -translate-y-1/2' : '-translate-x-1/2'}
                `}
                style={{transform: !isSidebarCollapsed ? 'translate(-50%, -50%) rotate(45deg)' : 'translate(-50%, -5px) rotate(0deg)'}}
              />
              <span
                className={`absolute left-1/2 top-1/2 w-4 h-0.5 bg-gray-900 rounded transition-all duration-300 ease-in-out
                  ${!isSidebarCollapsed ? '-rotate-45 -translate-x-1/2 -translate-y-1/2' : '-translate-x-1/2 translate-y-1/2'}
                `}
                style={{transform: !isSidebarCollapsed ? 'translate(-50%, -50%) rotate(-45deg)' : 'translate(-50%, 5px) rotate(0deg)'}}
              />
              <span
                className={`absolute left-1/2 top-1/2 w-4 h-0.5 bg-gray-900 rounded transition-all duration-300 ease-in-out
                  ${!isSidebarCollapsed ? 'opacity-0' : '-translate-x-1/2 -translate-y-1/2'}
                `}
                style={{opacity: !isSidebarCollapsed ? 0 : 1, transform: !isSidebarCollapsed ? 'translate(-50%, -50%) scaleX(0)' : 'translate(-50%, 0) scaleX(1)'}}
              />
            </span>
          </button>

          <div className="px-4 flex-1 overflow-y-auto">
              <div className="mb-6">
              {!isSidebarCollapsed && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Main</p>}
              {/* Hide Dashboard for clients; clients should see Projects directly */}
              {user.role !== Role.CLIENT && <SidebarItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />}
              {canSeeProjects && <SidebarItem view="projects" icon={FolderKanban} label="Projects" />}
            </div>

            {(canSeeClients || canSeeDesigners || canSeeVendors || canSeeAdmins) && (
              <div className="mb-6">
                {!isSidebarCollapsed && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">People</p>}
                {canSeeClients && <SidebarItem view="clients" icon={IoPersonOutline} label="Clients" />}
                {canSeeDesigners && <SidebarItem view="designers" icon={Users} label="Team" />}
                {canSeeVendors && <SidebarItem view="vendors" icon={ShoppingBag} label="Vendors" />}
                {canSeeAdmins && <SidebarItem view="admins" icon={Shield} label="Admins" />}
              </div>
            )}

            <div className="mb-6">
              {!isSidebarCollapsed && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Account</p>}
              <SidebarItem view="settings" icon={Settings} label="Settings" />
            </div>
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
        {/* Notification Permission Banner */}
        {showNotifPermissionBanner && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-900">
                Enable push notifications to stay updated on project activities
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnableNotifications}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Enable
              </button>
              <button
                onClick={() => setShowNotifPermissionBanner(false)}
                className="text-blue-600 px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        
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
                onSelectProject={(project, opts) => {
                  setSelectedProject(project);
                  setSelectedTask(null);
                  setIsTaskOnlyView(false);
                  setInitialProjectTab(opts?.initialTab);
                }}
              />
            </div>

            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
              <AvatarCircle avatar={user.avatar} name={user.name} size="sm" role={String(user.role).toLowerCase()} />
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
                   projects={projects}
                   users={users} 
                   onUpdateProject={handleUpdateProject}
                   onBack={() => { 
                     setSelectedProject(null); 
                     setSelectedTask(null); 
                     setIsTaskOnlyView(false);
                     setInitialProjectTab(undefined);
                   }} 
                   initialTask={selectedTask || undefined}
                   initialTab={initialProjectTab}
                   onCloseTask={() => {
                     if (isTaskOnlyView) {
                       setSelectedProject(null);
                       setSelectedTask(null);
                       setIsTaskOnlyView(false);
                     }
                   }}
                 />
              ) : (
                <>
                  {currentView === 'dashboard' && <Dashboard projects={projects} users={users} onSelectProject={(project, opts) => {
                    setSelectedProject(project);
                    setSelectedTask(null);
                    setIsTaskOnlyView(false);
                    setInitialProjectTab(opts?.initialTab);
                  }} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                    setSelectedTask(task);
                    setIsTaskOnlyView(true);
                  }} />}
                  
                  {currentView === 'projects' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800">Projects</h2>
                          {(user.role === Role.ADMIN) && (
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
                          onSelect={(project) => {
                            setSelectedProject(project);
                            setSelectedTask(null);
                            setIsTaskOnlyView(false);
                            setInitialProjectTab(undefined);
                          }}
                          user={user}
                          setEditingProject={setEditingProject}
                          setIsNewProjectModalOpen={setIsNewProjectModalOpen}
                          onDeleteProject={handleDeleteProject}
                          realTimeTasks={realTimeTasks}
                        />
                      ) : (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                          <p className="text-gray-500">No projects found for your account.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {currentView === 'clients' && <PeopleList users={users} roleFilter={Role.CLIENT} onAddUser={handleAddUser} projects={projects} onSelectProject={(project) => {
                    setSelectedProject(project);
                    setSelectedTask(null);
                    setIsTaskOnlyView(false);
                    setInitialProjectTab(undefined);
                  }} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                    setSelectedTask(task);
                    setIsTaskOnlyView(true);
                  }} />}
                  {currentView === 'vendors' && <PeopleList users={users} roleFilter={Role.VENDOR} onAddUser={handleAddUser} projects={projects} onSelectProject={(project) => {
                    setSelectedProject(project);
                    setSelectedTask(null);
                    setIsTaskOnlyView(false);
                    setInitialProjectTab(undefined);
                  }} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                    setSelectedTask(task);
                    setIsTaskOnlyView(true);
                  }} />}
                  {currentView === 'designers' && <PeopleList users={users} roleFilter={Role.DESIGNER} onAddUser={handleAddUser} projects={projects} onSelectProject={(project) => {
                    setSelectedProject(project);
                    setSelectedTask(null);
                    setIsTaskOnlyView(false);
                    setInitialProjectTab(undefined);
                  }} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                    setSelectedTask(task);
                    setIsTaskOnlyView(true);
                  }} />}
                  {currentView === 'admins' && <PeopleList users={users} roleFilter={Role.ADMIN} onAddUser={handleAddUser} projects={projects} onSelectProject={(project) => {
                    setSelectedProject(project);
                    setSelectedTask(null);
                    setIsTaskOnlyView(false);
                    setInitialProjectTab(undefined);
                  }} onSelectTask={(task, project) => {
                    setSelectedProject(project);
                    setSelectedTask(task);
                    setIsTaskOnlyView(true);
                  }} />}
                  
                  {currentView === 'settings' && (
                    <div className="max-w-3xl mx-auto space-y-8">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Settings</h2>
                        <p className="text-gray-600">Manage your account security and preferences</p>
                      </div>

                      {/* Account Info Card */}
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Account Information</h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 uppercase font-semibold">Name</p>
                              <p className="text-gray-900 font-medium">{user.name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase font-semibold">Email</p>
                              <p className="text-gray-900 font-medium">{user.email}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase font-semibold">Role</p>
                              <p className="text-gray-900 font-medium capitalize">{user.role}</p>
                            </div>
                            {user.phone && (
                              <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Phone</p>
                                <p className="text-gray-900 font-medium">{user.phone}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Branding Settings - Admin Only */}
                      {user.role === Role.ADMIN && (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Company Branding</h3>
                              <p className="text-sm text-gray-600">Customize your organization's brand name and logo</p>
                            </div>
                            <button
                              onClick={() => setIsBrandingSettingsOpen(true)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                              <Palette className="w-4 h-4" />
                              Edit Branding
                            </button>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center gap-3">
                              <img src={logoUrl} alt={brandName} className="w-8 h-8 rounded" />
                              <span className="font-medium text-gray-900">{brandName}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Remembered Devices */}
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <RememberedDevices />
                      </div>
                    </div>
                  )}
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
      
      {isBrandingSettingsOpen && (
        <BrandingSettings 
          isOpen={isBrandingSettingsOpen}
          onClose={() => setIsBrandingSettingsOpen(false)}
        />
      )}
      
      {/* Page title updater for tenant branding */}
      <PageTitleUpdater />
    </div>
  );
}

export default App;