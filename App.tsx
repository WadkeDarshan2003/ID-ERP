import React, { useState } from 'react';
import { 
  LayoutDashboard, FolderKanban, Users, ShoppingBag, 
  Palette, LogOut, Search, Bell, Menu, X
} from 'lucide-react';
import { MOCK_PROJECTS, MOCK_USERS } from './constants';
import { Project, Role } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';

// Components
import Dashboard from './components/Dashboard';
import ProjectDetail from './components/ProjectDetail';
import PeopleList from './components/PeopleList';
import Login from './components/Login';
import NotificationPanel from './components/NotificationPanel';

// Helper for project list
const ProjectList = ({ projects, onSelect }: { projects: Project[], onSelect: (p: Project) => void }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
    {projects.map(project => (
      <div 
        key={project.id} 
        onClick={() => onSelect(project)}
        className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
      >
        <div className="h-40 overflow-hidden relative">
          <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-gray-800 shadow-sm">
            {project.status}
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-bold text-gray-900 text-lg mb-1">{project.name}</h3>
          <p className="text-sm text-gray-500 mb-4 line-clamp-2">{project.description}</p>
          <div className="flex justify-between items-center border-t border-gray-100 pt-4">
            <div className="flex -space-x-2">
              <img className="w-8 h-8 rounded-full border-2 border-white" src={MOCK_USERS.find(u=>u.id === project.leadDesignerId)?.avatar} title="Lead" alt="" />
              <img className="w-8 h-8 rounded-full border-2 border-white" src={MOCK_USERS.find(u=>u.id === project.clientId)?.avatar} title="Client" alt="" />
            </div>
            <span className="text-xs font-medium text-gray-400">Due {new Date(project.deadline).toLocaleDateString()}</span>
          </div>
          {/* Progress Bar */}
          <div className="mt-4">
             <div className="flex justify-between text-xs mb-1">
               <span className="text-gray-500">Progress</span>
               <span className="text-gray-900 font-bold">
                 {Math.round((project.tasks.filter(t => t.status === 'Done').length / (project.tasks.length || 1)) * 100)}%
               </span>
             </div>
             <div className="w-full bg-gray-100 rounded-full h-1.5">
               <div 
                 className="bg-gray-900 h-1.5 rounded-full transition-all duration-1000" 
                 style={{ width: `${(project.tasks.filter(t => t.status === 'Done').length / (project.tasks.length || 1)) * 100}%` }} 
               />
             </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

type ViewState = 'dashboard' | 'projects' | 'clients' | 'vendors' | 'designers';

function AppContent() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // If not logged in, show login screen
  if (!user) {
    return <Login />;
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
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1
        ${currentView === view && !selectedProject 
          ? 'bg-gray-900 text-white shadow-lg' 
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
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
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-xl">L</div>
              <span className="text-xl font-bold text-gray-900">LuxeSpace</span>
            </div>
            <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="px-4 flex-1 overflow-y-auto">
            <div className="mb-6">
              <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Main</p>
              <SidebarItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
              {canSeeProjects && <SidebarItem view="projects" icon={FolderKanban} label="Projects" />}
            </div>

            {(canSeeClients || canSeeDesigners || canSeeVendors) && (
              <div className="mb-6">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">People</p>
                {canSeeClients && <SidebarItem view="clients" icon={Users} label="Clients" />}
                {canSeeDesigners && <SidebarItem view="designers" icon={Palette} label="Designers" />}
                {canSeeVendors && <SidebarItem view="vendors" icon={ShoppingBag} label="Vendors" />}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200">
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:border-gray-300 focus:ring-0 rounded-lg text-sm w-64 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white animate-pulse"></span>
                )}
              </button>
              {/* Notification Panel */}
              <NotificationPanel isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
            </div>

            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
              <img src={user.avatar} alt="Profile" className="w-10 h-10 rounded-full border border-gray-200" />
            </div>
          </div>
        </header>

        {/* View Content */}
        <main 
          className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8" 
          onClick={() => isNotifOpen && setIsNotifOpen(false)}
        >
          {selectedProject ? (
             <ProjectDetail 
               project={selectedProject} 
               users={MOCK_USERS} 
               onUpdateProject={handleUpdateProject}
               onBack={() => setSelectedProject(null)} 
             />
          ) : (
            <>
              {currentView === 'dashboard' && <Dashboard projects={projects} users={MOCK_USERS} />}
              
              {currentView === 'projects' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800">Projects</h2>
                    {(user.role === Role.ADMIN || user.role === Role.DESIGNER) && (
                      <button className="bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2">
                         <Palette className="w-4 h-4" /> New Project
                      </button>
                    )}
                  </div>
                  {visibleProjects.length > 0 ? (
                    <ProjectList projects={visibleProjects} onSelect={setSelectedProject} />
                  ) : (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                      <p className="text-gray-500">No projects found for your account.</p>
                    </div>
                  )}
                </div>
              )}

              {currentView === 'clients' && <PeopleList users={MOCK_USERS} roleFilter={Role.CLIENT} />}
              {currentView === 'vendors' && <PeopleList users={MOCK_USERS} roleFilter={Role.VENDOR} />}
              {currentView === 'designers' && <PeopleList users={MOCK_USERS} roleFilter={Role.DESIGNER} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;