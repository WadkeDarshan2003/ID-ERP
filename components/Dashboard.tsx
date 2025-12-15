import React, { useState, useEffect } from 'react';
import { Project, User, ProjectStatus, Role, Task, TaskStatus } from '../types';
import { DollarSign, Briefcase, Clock, List, Calendar, RefreshCw, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToProjectTasks } from '../services/projectDetailsService';
import { calculateTaskProgress, formatDateToIndian } from '../utils/taskUtils';
import { checkAndSendDueDateReminders } from '../services/emailTriggerService';


interface DashboardProps {
  projects: Project[];
  users: User[];
  onSelectProject?: (project: Project) => void;
  onSelectTask?: (task: Task, project: Project) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ projects, users, onSelectProject, onSelectTask }) => {
  const { user } = useAuth();
  const [realTimeTasks, setRealTimeTasks] = useState<Map<string, Task[]>>(new Map());
  const [expandedPendingProjects, setExpandedPendingProjects] = useState<Record<string, boolean>>({});
  const [sentReminders, setSentReminders] = useState<Set<string>>(new Set());

  
  if (!user) return null;



  // Subscribe to all project tasks
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

  // Check for tasks due in 24 hours and send reminders (run once per day)
  useEffect(() => {
    const checkDueDateReminders = async () => {
      for (const project of projects) {
        const projectTasks = realTimeTasks.get(project.id) || project.tasks || [];
        await checkAndSendDueDateReminders(projectTasks, users, project.name, sentReminders);
      }
    };

    const now = new Date();
    const nextCheck = new Date();
    nextCheck.setDate(nextCheck.getDate() + 1);
    nextCheck.setHours(8, 0, 0, 0); // Check at 8 AM every day

    const timeUntilNextCheck = nextCheck.getTime() - now.getTime();
    const timer = setTimeout(() => {
      checkDueDateReminders();
      
      // Set up recurring daily check
      const dailyInterval = setInterval(checkDueDateReminders, 24 * 60 * 60 * 1000);
      return () => clearInterval(dailyInterval);
    }, Math.max(0, timeUntilNextCheck));

    return () => clearTimeout(timer);
  }, [projects, realTimeTasks, users, sentReminders]);

  // Helper function to get tasks - prioritize real-time, fallback to legacy
  const getProjectTasks = (projectId: string): Task[] => {
    return realTimeTasks.get(projectId) || projects.find(p => p.id === projectId)?.tasks || [];
  };

  // --- Filter Data based on Role ---
  let filteredProjects = projects;
  let assignedTasks: { task: Task, project: Project }[] = [];

  if (user.role === Role.CLIENT) {
    filteredProjects = projects.filter(p => p.clientId === user.id);
  } else if (user.role === Role.DESIGNER) {
    filteredProjects = projects.filter(p => p.leadDesignerId === user.id);
  } else if (user.role === Role.VENDOR) {
    // Combine all tasks from all projects the vendor is assigned to
    assignedTasks = filteredProjects
      .flatMap((p) => getProjectTasks(p.id).map((t) => ({ task: t, project: p })))
      .filter((item) => item.task.assigneeId === user.id);
    const projectIds = new Set(assignedTasks.map(t => t.project.id));
    filteredProjects = projects.filter(p => projectIds.has(p.id));
  }


  const activeProjectsCount = filteredProjects.filter(p => p.status === ProjectStatus.EXECUTION).length;
  
  const pendingTasksCount = user.role === Role.VENDOR 
    ? assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length 
    : filteredProjects.reduce((acc, p) => acc + getProjectTasks(p.id).filter(t => t.status !== TaskStatus.DONE).length, 0);



  const StatCard = ({ title, value, icon: Icon, color, onClick }: any) => (
    <div 
      onClick={onClick}
      className={`bg-white p-5 md:p-6 rounded-xl border border-gray-100 flex items-center justify-between hover:shadow-sm transition-shadow ${onClick ? 'cursor-pointer hover:border-gray-300' : ''}`}
    >
      <div>
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold text-gray-800">
          {user.role === Role.ADMIN ? 'Global Overview' : 'Dashboard'}
        </h2>
        <div className="flex items-center gap-3">
          {/* Migration button removed */}
          <span className="text-sm text-gray-500 font-medium px-4 py-1.5 bg-white rounded-full border border-gray-200">
            {filteredProjects.length} Projects Loaded
          </span>
        </div>
      </div>

      {/* Migration status removed */}

      {/* Stats Grid - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">

        
        {user.role === Role.VENDOR ? (
           <StatCard 
            title="My Tasks" 
            value={assignedTasks.length} 
            icon={List} 
            color="bg-blue-500"
            onClick={() => {
              // Scroll to tasks section
              const tasksSection = document.querySelector('[data-section="vendor-tasks"]');
              tasksSection?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ) : user.role === Role.CLIENT ? (
          <StatCard 
            title="Completed Tasks" 
            value={filteredProjects.flatMap(p => getProjectTasks(p.id)).filter(t => t.status === TaskStatus.DONE).length} 
            icon={CheckCircle2} 
            color="bg-green-500"
            onClick={() => {
              // Scroll to completed tasks section
              const completedSection = document.querySelector('[data-section="completed-tasks"]');
              completedSection?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ) : (
          <StatCard 
            title="Active Projects" 
            value={activeProjectsCount} 
            icon={Briefcase} 
            color="bg-blue-500"
            onClick={() => {
              // Select first active project or show all projects view
              const activeProjects = filteredProjects.filter(p => p.status === ProjectStatus.EXECUTION);
              if (activeProjects.length > 0 && onSelectProject) {
                onSelectProject(activeProjects[0]);
              }
            }}
          />
        )}
        


        {user.role !== Role.VENDOR && user.role !== Role.CLIENT && (
          <StatCard 
            title="Pending Tasks" 
            value={pendingTasksCount} 
            icon={Clock} 
            color="bg-amber-500"
            onClick={() => {
              // Scroll to active projects section
              const activeSection = document.querySelector('[data-section="active-projects"]');
              activeSection?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        )}

        {user.role === Role.CLIENT && (
          <StatCard 
            title="Pending Tasks" 
            value={filteredProjects.flatMap(p => getProjectTasks(p.id)).filter(t => t.status !== TaskStatus.DONE).length} 
            icon={Clock} 
            color="bg-amber-500"
            onClick={() => {
              // Scroll to pending tasks section
              const pendingSection = document.querySelector('[data-section="pending-tasks"]');
              pendingSection?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        )}
      </div>

      {/* Active Projects Section - Shows all statuses in grid (ADMIN only) */}
      {user.role === Role.ADMIN && (
        <div className="bg-white p-6 rounded-xl border border-gray-100" data-section="active-projects">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">Active Projects</h3>
            <span className="text-sm text-gray-500 px-2 py-1 bg-gray-50 rounded-full">
              {filteredProjects.length} total
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-400">No projects available</div>
            ) : (
              filteredProjects.map(project => {
                const projectTasks = getProjectTasks(project.id);
                const totalTasks = projectTasks.length;
                const completedTasks = projectTasks.filter(t => t.status === TaskStatus.DONE).length;
                const pendingTasks = projectTasks.filter(t => t.status !== TaskStatus.DONE);
                const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const clientName = users.find(u => u.id === project.clientId)?.name || 'Unknown';
                const isExpanded = expandedPendingProjects[project.id] === true; // Default to collapsed
                const toggleExpanded = () => {
                  setExpandedPendingProjects(prev => ({
                    ...prev,
                    [project.id]: !prev[project.id]
                  }));
                };
                
                // Status badge styling
                const getStatusColor = (status: ProjectStatus) => {
                  switch(status) {
                    case ProjectStatus.DISCOVERY:
                      return 'bg-teal-100 text-teal-700';
                    case ProjectStatus.PLANNING:
                      return 'bg-purple-100 text-purple-700';
                    case ProjectStatus.EXECUTION:
                      return 'bg-blue-100 text-blue-700';
                    case ProjectStatus.ON_HOLD:
                      return 'bg-orange-100 text-orange-700';
                    case ProjectStatus.COMPLETED:
                      return 'bg-green-100 text-green-700';
                    default:
                      return 'bg-gray-100 text-gray-700';
                  }
                };
                
                return (
                  <div key={project.id} className="rounded-lg overflow-hidden bg-white shadow-sm">
                    {/* Project Header */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <p className="text-base font-semibold text-gray-900 line-clamp-2">{project.name}</p>
                          <p className="text-sm text-gray-600 mt-1">{clientName}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-md text-sm font-semibold whitespace-nowrap ml-2 ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                      </div>
                      
                      <div className="mb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-300 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all" 
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-gray-600 w-10">{progress}%</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <span className="text-sm text-gray-500">{totalTasks} tasks • {pendingTasks.length} pending</span>
                        <button 
                          onClick={() => onSelectProject?.(project)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-sm font-semibold hover:bg-blue-100 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Pending Tasks */}
                    {pendingTasks.length > 0 && (
                      <>
                        <button
                          onClick={toggleExpanded}
                          className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-50 to-amber-100 flex justify-between items-center transition-colors text-left"
                        >
                          <span className="text-sm font-semibold text-amber-900">Pending Tasks ({pendingTasks.length})</span>
                          <ChevronRight className={`w-5 h-5 md:w-4 md:h-4 text-amber-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                        
                        {isExpanded && (
                          <div className="divide-y divide-gray-200">
                            {pendingTasks.map(task => {
                              const taskProgress = calculateTaskProgress(task);
                              const assigneeName = users.find(u => u.id === task.assigneeId)?.name || 'Unassigned';
                              return (
                                <div key={task.id} className="px-4 py-3 border-b border-gray-200">
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1">
                                      <button
                                        onClick={() => onSelectTask?.(task, project)}
                                        className="text-base text-gray-900 font-medium hover:text-blue-600 text-left"
                                      >
                                        {task.title}
                                      </button>
                                      <p className="text-sm text-gray-500 mt-1">Due: {formatDateToIndian(task.dueDate)}</p>
                                      <p className="text-sm text-gray-500 mt-0.5">Assigned to: {assigneeName}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-bold text-gray-600">{taskProgress}%</span>
                                      <span className={`px-2 py-0.5 rounded text-sm font-semibold whitespace-nowrap
                                        ${task.status === TaskStatus.IN_PROGRESS 
                                          ? 'bg-blue-100 text-blue-700' 
                                          : task.status === TaskStatus.TODO
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {task.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Pending Tasks Section - CLIENT only */}
      {user.role === Role.CLIENT && (
        <div className="bg-white p-6 rounded-xl border border-gray-100" data-section="pending-tasks">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Pending Tasks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects
              .map(project => {
                const projectTasks = getProjectTasks(project.id);
                const pendingTasks = projectTasks.filter(t => t.status !== TaskStatus.DONE);
                return { project, pendingTasks };
              })
              .filter(item => item.pendingTasks.length > 0)
              .sort((a, b) => b.pendingTasks.length - a.pendingTasks.length)
              .map(({ project, pendingTasks }) => {
                const isExpanded = expandedPendingProjects[project.id] === true; // Default to collapsed
                const toggleExpanded = () => {
                  setExpandedPendingProjects(prev => ({
                    ...prev,
                    [project.id]: !prev[project.id]
                  }));
                };
                
                return (
                  <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Project Header - Clickable to toggle */}
                    <button
                      onClick={toggleExpanded}
                      className="w-full bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 flex justify-between items-center border-b border-gray-200 hover:from-gray-100 hover:to-gray-150 transition-colors"
                    >
                      <div className="text-left flex-1">
                        <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{project.status} • {pendingTasks.length} pending</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProject?.(project);
                          }}
                          className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs font-semibold transition-colors"
                        >
                          View
                        </button>
                        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                    
                    {/* Tasks List - Collapsible */}
                    {isExpanded && (
                      <div className="divide-y divide-gray-100">
                        {pendingTasks.map(task => {
                          const taskProgress = calculateTaskProgress(task);
                          const assigneeName = users.find(u => u.id === task.assigneeId)?.name || 'Unassigned';
                          return (
                          <div key={task.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <p className="text-sm text-gray-900 font-medium">{task.title}</p>
                                <p className="text-xs text-gray-500 mt-1">Due: {formatDateToIndian(task.dueDate)}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Assigned to: {assigneeName}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-600">{taskProgress}%</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap
                                  ${task.status === TaskStatus.IN_PROGRESS 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : task.status === TaskStatus.TODO
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-600'
                                  }`}>
                                  {task.status}
                                </span>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            {filteredProjects
              .map(project => {
                const projectTasks = getProjectTasks(project.id);
                return projectTasks.filter(t => t.status !== TaskStatus.DONE).length;
              })
              .reduce((a, b) => a + b, 0) === 0 && (
              <div className="text-center py-8 text-gray-400 col-span-full">
                <p className="text-sm">All tasks completed! 🎉</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completed Tasks Section - CLIENT only */}
      {user.role === Role.CLIENT && (
        <div className="bg-white p-6 rounded-xl border border-gray-100" data-section="completed-tasks">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Completed Tasks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects
              .map(project => {
                const projectTasks = getProjectTasks(project.id);
                const completedTasks = projectTasks.filter(t => t.status === TaskStatus.DONE);
                return { project, completedTasks };
              })
              .filter(item => item.completedTasks.length > 0)
              .sort((a, b) => b.completedTasks.length - a.completedTasks.length)
              .map(({ project, completedTasks }) => {
                const isExpanded = expandedPendingProjects[project.id + '-completed'] === true; // Default to collapsed
                const toggleExpanded = () => {
                  setExpandedPendingProjects(prev => ({
                    ...prev,
                    [project.id + '-completed']: !prev[project.id + '-completed']
                  }));
                };
                
                return (
                  <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Project Header - Clickable to toggle */}
                    <button
                      onClick={toggleExpanded}
                      className="w-full bg-gradient-to-r from-green-50 to-green-100 px-4 py-3 flex justify-between items-center border-b border-gray-200 hover:from-green-100 hover:to-green-150 transition-colors"
                    >
                      <div className="text-left flex-1">
                        <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{project.status} • {completedTasks.length} completed</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProject?.(project);
                          }}
                          className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs font-semibold transition-colors"
                        >
                          View
                        </button>
                        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                    
                    {/* Tasks List - Collapsible */}
                    {isExpanded && (
                      <div className="divide-y divide-gray-100">
                        {completedTasks.map(task => {
                          const taskProgress = calculateTaskProgress(task);
                          const assigneeName = users.find(u => u.id === task.assigneeId)?.name || 'Unassigned';
                          return (
                          <div key={task.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <p className="text-sm text-gray-900 font-medium">{task.title}</p>
                                <p className="text-xs text-gray-500 mt-1">Due: {formatDateToIndian(task.dueDate)}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Assigned to: {assigneeName}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-600">{taskProgress}%</span>
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
                                  {task.status}
                                </span>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            {filteredProjects
              .map(project => {
                const projectTasks = getProjectTasks(project.id);
                return projectTasks.filter(t => t.status === TaskStatus.DONE).length;
              })
              .reduce((a, b) => a + b, 0) === 0 && (
              <div className="text-center py-8 text-gray-400 col-span-full">
                <p className="text-sm">No completed tasks yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VENDOR: Task List View - Real-time sync */}
      {user.role === Role.VENDOR && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 lg:col-span-3" data-section="vendor-tasks">
            <h3 className="text-sm font-bold text-gray-800 mb-4">
              Your Active Tasks 
              <span className="ml-2 text-xs text-gray-400 font-normal">Real-time synced</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs font-semibold">
                   <tr>
                     <th className="px-4 py-3 rounded-l-lg">Task</th>
                     <th className="px-4 py-3">Project</th>
                     <th className="px-4 py-3">Due</th>
                     <th className="px-4 py-3 rounded-r-lg">Status</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assignedTasks
                    .filter(t => t.task.status !== TaskStatus.DONE)
                    .sort((a, b) => {
                      // Sort by status (In Progress first) then by dueDate
                      if (a.task.status !== b.task.status) {
                        return a.task.status === TaskStatus.IN_PROGRESS ? -1 : 1;
                      }
                      return new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime();
                    })
                    .map(({ task, project }) => (
                    <tr 
                      key={task.id} 
                      onClick={() => onSelectProject?.(project)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{task.title}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{project.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDateToIndian(task.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase transition-colors
                          ${task.status === TaskStatus.IN_PROGRESS 
                            ? 'bg-blue-100 text-blue-700' 
                            : task.status === TaskStatus.TODO
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">All caught up! 🎉</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default Dashboard;