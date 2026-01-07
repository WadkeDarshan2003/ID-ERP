import React, { useState, useEffect } from 'react';
import { Project, User, ProjectStatus, Role, Task, TaskStatus, ProjectDocument, FinancialRecord } from '../types';
import { DollarSign, Briefcase, Clock, List, Calendar, RefreshCw, ChevronRight, CheckCircle2, AlertCircle, FileText, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToProjectTasks, subscribeToProjectDocuments, updateTask } from '../services/projectDetailsService';
import { subscribeToProjectFinancialRecords } from '../services/financialService';
import { calculateTaskProgress, calculateProjectProgress, formatDateToIndian } from '../utils/taskUtils';
import { checkAndSendDueDateReminders } from '../services/emailTriggerService';


interface DashboardProps {
  projects: Project[];
  users: User[];
  onSelectProject?: (project: Project, opts?: { initialTab?: 'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents' | 'meetings' }) => void;
  onSelectTask?: (task: Task, project: Project) => void;
}

const SortButton = ({ 
  currentField, 
  currentOrder, 
  fields, 
  onSort 
}: { 
  currentField: string, 
  currentOrder: 'asc' | 'desc', 
  fields: { value: string, label: string }[], 
  onSort: (field: any, order: 'asc' | 'desc') => void 
}) => {
  return (
    <div className="flex items-center gap-1 bg-white/50 rounded-lg px-2 py-1 border border-gray-100">
      <select 
        value={currentField} 
        onChange={(e) => onSort(e.target.value, currentOrder)}
        className="text-[10px] font-bold bg-transparent border-none focus:ring-0 cursor-pointer text-gray-500 hover:text-gray-700 p-0"
        aria-label="Sort field"
        title="Sort field"
      >
        {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <button 
        onClick={() => onSort(currentField, currentOrder === 'asc' ? 'desc' : 'asc')}
        className="p-0.5 hover:bg-gray-200 rounded transition-colors text-gray-400 hover:text-gray-600"
        title={`Sort ${currentOrder === 'asc' ? 'Descending' : 'Ascending'}`}
      >
        {currentOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      </button>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ projects, users, onSelectProject, onSelectTask }) => {
  const { user } = useAuth();
  const [realTimeTasks, setRealTimeTasks] = useState<Map<string, Task[]>>(new Map());
  const [realTimeDocuments, setRealTimeDocuments] = useState<Map<string, ProjectDocument[]>>(new Map());
  const [realTimeFinancials, setRealTimeFinancials] = useState<Map<string, FinancialRecord[]>>(new Map());
  const [expandedPendingProjects, setExpandedPendingProjects] = useState<Record<string, boolean>>({});
  const [expandedActiveProjectTasks, setExpandedActiveProjectTasks] = useState<Record<string, boolean>>({});
  const [sentReminders, setSentReminders] = useState<Set<string>>(new Set());
  const [projectSort, setProjectSort] = useState<{ field: 'activity' | 'name' | 'progress', order: 'asc' | 'desc' }>({ field: 'activity', order: 'desc' });
  const [taskSort, setTaskSort] = useState<{ field: 'dueDate' | 'activity' | 'title', order: 'asc' | 'desc' }>({ field: 'activity', order: 'desc' });
  const [vendorTaskSort, setVendorTaskSort] = useState<{ field: 'dueDate' | 'activity' | 'title', order: 'asc' | 'desc' }>({ field: 'activity', order: 'desc' });

  
  if (!user) return null;



  const handleTaskCompletion = async (task: Task, project: Project) => {
    // 1. Mark all subtasks as completed
    const updatedSubtasks = task.subtasks?.map(st => ({ ...st, isCompleted: true })) || [];
    
    // 2. Determine new status: If not in REVIEW, go to REVIEW. If in REVIEW, go to DONE.
    let newStatus = task.status;
    if (task.status === TaskStatus.REVIEW) {
        newStatus = TaskStatus.DONE;
    } else {
        newStatus = TaskStatus.REVIEW;
    }

    try {
        await updateTask(project.id, task.id, {
            subtasks: updatedSubtasks,
            status: newStatus
        });
    } catch (error) {
        console.error('Error completing task:', error);
    }
  };

  // Subscribe to all project tasks, documents, and financials
  useEffect(() => {
    if (projects.length === 0) return;

    const unsubscribers: Array<() => void> = [];

    projects.forEach((project) => {
      // Tasks
      const unsubscribeTasks = subscribeToProjectTasks(project.id, (tasks) => {
        setRealTimeTasks((prev) => new Map(prev).set(project.id, tasks));
      });
      unsubscribers.push(unsubscribeTasks);

      // Documents
      const unsubscribeDocs = subscribeToProjectDocuments(project.id, (docs) => {
        setRealTimeDocuments((prev) => new Map(prev).set(project.id, docs));
      });
      unsubscribers.push(unsubscribeDocs);

      // Financials
      const unsubscribeFin = subscribeToProjectFinancialRecords(project.id, (fin) => {
        setRealTimeFinancials((prev) => new Map(prev).set(project.id, fin));
      });
      unsubscribers.push(unsubscribeFin);
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

  // Helper function to get safe timestamp for sorting
  const getSafeTimestamp = (date: any) => {
    if (!date) return 0;
    if (typeof date === 'string') return new Date(date).getTime();
    if (date.toDate && typeof date.toDate === 'function') return date.toDate().getTime();
    if (date instanceof Date) return date.getTime();
    return new Date(date).getTime() || 0;
  };

  // Helper to compute the most-recent timestamp for a project (project.updatedAt or any task.updatedAt)
  const getProjectRecentTimestamp = (project: Project) => {
    const tasks = getProjectTasks(project.id) || [];
    const latestTaskTs = tasks.reduce((maxTs, t) => {
      // Tasks may not have explicit updatedAt; use last comment timestamp or fallback fields
      const commentTs = getSafeTimestamp((t as any).comments?.slice?.(-1)?.[0]?.timestamp);
      const tsFallback = getSafeTimestamp((t as any).completedAt || (t as any).modifiedAt || (t as any).lastModified || (t as any).createdAt || (t as any).timestamp);
      const ts = Math.max(commentTs || 0, tsFallback || 0);
      return Math.max(maxTs, ts || 0);
    }, 0);
    const docTs = getSafeTimestamp((project as any).documents?.slice?.(-1)?.[0]?.uploadDate);
    const projTs = getSafeTimestamp((project as any).updatedAt || (project as any).modifiedAt || (project as any).lastModified || (project as any).activityLog?.slice?.(-1)?.[0]?.timestamp || (project as any).createdAt || docTs);
    return Math.max(projTs || 0, latestTaskTs || 0);
  };

  const getTaskRecentTimestamp = (task: any, project?: Project) => {
    const commentTs = getSafeTimestamp(task.comments?.slice?.(-1)?.[0]?.timestamp);
    const fallbackTs = getSafeTimestamp((task as any).completedAt || (task as any).modifiedAt || (task as any).createdAt || (task as any).timestamp);
    const projectTs = project ? getProjectRecentTimestamp(project) : 0;
    return Math.max(commentTs || 0, fallbackTs || 0, projectTs || 0);
  };

  // Helper to hide completed tasks that are admin-approved (they're done)
  const shouldHideCompletedApprovedTask = (t: Task) => {
    try {
      const adminApproved = t?.approvals?.completion?.admin?.status === 'approved';
      const isCompleted = t.status === TaskStatus.DONE;
      const isInReview = t.status === TaskStatus.REVIEW;
      return adminApproved && (isCompleted || isInReview);
    } catch (err) {
      return false;
    }
  };

  // Helper function to get documents - prioritize real-time
  const getProjectDocuments = (projectId: string): ProjectDocument[] => {
    return realTimeDocuments.get(projectId) || projects.find(p => p.id === projectId)?.documents || [];
  };

  // Helper to determine if a task should be hidden from dashboard lists
  const shouldHideTaskDueToClientApproval = (t: Task) => {
    try {
      // Only hide tasks that are already completed and then admin-approved but still waiting client approval
      const adminApproved = t?.approvals?.completion?.admin?.status === 'approved';
      const clientStatus = t?.approvals?.completion?.client?.status;
      const clientPending = !clientStatus || clientStatus === 'pending';
      const isCompleted = t.status === TaskStatus.DONE;
      return isCompleted && adminApproved && clientPending;
    } catch (err) {
      return false;
    }
  };

  // Helper function to get financials - prioritize real-time
  const getProjectFinancials = (projectId: string): FinancialRecord[] => {
    return realTimeFinancials.get(projectId) || projects.find(p => p.id === projectId)?.financials || [];
  };

  // Helper function to get pending approvals for a project
  const getPendingApprovals = (project: Project) => {
    const approvals: { label: string; type: string; projectName: string; projectId: string; task?: Task }[] = [];
    const tasks = getProjectTasks(project.id);
    const documents = getProjectDocuments(project.id);
    const financials = getProjectFinancials(project.id);

    tasks.forEach(task => {
      if (user.role === Role.ADMIN) {
        if (task.approvals.start.admin.status === 'pending') approvals.push({ label: `Start: ${task.title}`, type: 'task', projectName: project.name, projectId: project.id, task });
        if (task.approvals.completion.admin.status === 'pending') approvals.push({ label: `End: ${task.title}`, type: 'task', projectName: project.name, projectId: project.id, task });
      } else if (user.role === Role.CLIENT) {
        if (task.approvals.start.client.status === 'pending') approvals.push({ label: `Start: ${task.title}`, type: 'task', projectName: project.name, projectId: project.id, task });
        if (task.approvals.completion.client.status === 'pending') approvals.push({ label: `End: ${task.title}`, type: 'task', projectName: project.name, projectId: project.id, task });
      } else if (user.role === Role.DESIGNER) {
        if (task.approvals.start.designer?.status === 'pending') approvals.push({ label: `Start: ${task.title}`, type: 'task', projectName: project.name, projectId: project.id, task });
        if (task.approvals.completion.designer?.status === 'pending') approvals.push({ label: `End: ${task.title}`, type: 'task', projectName: project.name, projectId: project.id, task });
      }
    });

    documents.forEach(doc => {
      if (user.role === Role.ADMIN) {
        if (doc.approvalStatus === 'pending') approvals.push({ label: `Doc: ${doc.name}`, type: 'doc', projectName: project.name, projectId: project.id });
      } else if (user.role === Role.CLIENT) {
        if (doc.approvalStatus === 'approved' && (doc.clientApprovalStatus === 'pending' || !doc.clientApprovalStatus)) {
           const isSharedWithClient = Array.isArray(doc.sharedWith) && doc.sharedWith.includes(user.id);
           if (isSharedWithClient || project.clientId === user.id || (project.clientIds || []).includes(user.id)) {
             approvals.push({ label: `Doc: ${doc.name}`, type: 'doc', projectName: project.name, projectId: project.id });
           }
        }
      }
    });

    financials.forEach(fin => {
      if (user.role === Role.ADMIN) {
        if (fin.isAdditionalBudget && fin.adminApprovalForAdditionalBudget === 'pending') {
          approvals.push({ label: `Budget: ${fin.description}`, type: 'fin', projectName: project.name, projectId: project.id });
        }
        if (fin.isClientPayment && fin.adminApprovalForPayment === 'pending') {
          approvals.push({ label: `Payment: ${fin.description}`, type: 'fin', projectName: project.name, projectId: project.id });
        }
      } else if (user.role === Role.CLIENT) {
        if (fin.isAdditionalBudget && fin.clientApprovalForAdditionalBudget === 'pending') {
          approvals.push({ label: `Budget: ${fin.description}`, type: 'fin', projectName: project.name, projectId: project.id });
        }
        if (fin.isClientPayment && fin.clientApprovalForPayment === 'pending') {
          approvals.push({ label: `Payment: ${fin.description}`, type: 'fin', projectName: project.name, projectId: project.id });
        }
      }
    });

    return approvals;
  };

  // --- Filter Data based on Role ---
  let filteredProjects = projects;
  let assignedTasks: { task: Task, project: Project }[] = [];

  if (user.role === Role.CLIENT) {
    // Client can see projects where they are in clientId or clientIds
    filteredProjects = projects.filter(p => {
      const allClientIds = [p.clientId, ...(p.clientIds || [])].filter(Boolean);
      return allClientIds.includes(user.id);
    });
  } else if (user.role === Role.DESIGNER) {
    // Projects where designer is lead or part of team only (not based on clientIds)
    const relatedProjectIds = new Set(projects.filter(p => p.leadDesignerId === user.id || (p.teamMembers || []).includes(user.id)).map(p => p.id));
    filteredProjects = projects.filter(p => relatedProjectIds.has(p.id));
    // Collect assigned tasks for designer (only tasks assigned to them)
    assignedTasks = projects
      .flatMap((p) => getProjectTasks(p.id).map((t) => ({ task: t, project: p })))
      .filter((item) => item.task.assigneeId === user.id);
  } else if (user.role === Role.VENDOR) {
    // Combine all tasks from all projects the vendor is assigned to
    assignedTasks = projects
      .flatMap((p) => getProjectTasks(p.id).map((t) => ({ task: t, project: p })))
      .filter((item) => item.task.assigneeId === user.id);
    const projectIds = new Set(assignedTasks.map(t => t.project.id));
    filteredProjects = projects.filter(p => projectIds.has(p.id) || (p.vendorIds || []).includes(user.id) || (p.teamMembers || []).includes(user.id));
  }


  const StatCard = ({ title, value, icon: Icon, color, onClick }: any) => (
    <div 
      onClick={onClick}
      className={`bg-white p-5 md:p-6 rounded-xl border border-gray-100 flex items-center justify-between hover:shadow-sm transition-shadow ${onClick ? 'cursor-pointer hover:border-gray-300' : ''}`}
    >
      <div>
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
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
          {user.role === Role.ADMIN ? 'Dashboard' : 'Dashboard'}
        </h2>
        <div className="flex items-center gap-3">
          {/* Migration button removed */}
          <span className="text-sm text-gray-500 font-medium px-4 py-1.5 bg-white rounded-full border border-gray-200">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
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
              // Scroll to project overview section
              const overviewSection = document.querySelector('[data-section="project-overview"]');
              overviewSection?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ) : null}
        


      </div>

      {/* 3-Column Dashboard Layout */}
      {(user.role === Role.ADMIN || user.role === Role.DESIGNER || user.role === Role.CLIENT) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Active Projects */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-500" />
                Active Projects
              </h3>
              <div className="flex items-center gap-2">
                <SortButton 
                  currentField={projectSort.field}
                  currentOrder={projectSort.order}
                  onSort={(field, order) => setProjectSort({ field, order })}
                  fields={[
                      { value: 'activity', label: 'Recent' },
                      { value: 'name', label: 'Name' },
                      { value: 'progress', label: 'Progress' }
                    ]}
                />
                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {filteredProjects.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No active projects</div>
              ) : (
                [...filteredProjects]
                  .sort((a, b) => {
                    let comparison = 0;
                    if (projectSort.field === 'activity') {
                      comparison = getProjectRecentTimestamp(a) - getProjectRecentTimestamp(b);
                    } else if (projectSort.field === 'name') {
                      comparison = a.name.localeCompare(b.name);
                    } else if (projectSort.field === 'progress') {
                      comparison = calculateProjectProgress(getProjectTasks(a.id)) - calculateProjectProgress(getProjectTasks(b.id));
                    }
                    return projectSort.order === 'desc' ? -comparison : comparison;
                  })
                  .map(project => {
                    const progress = calculateProjectProgress(getProjectTasks(project.id));
                    const projectTasks = getProjectTasks(project.id);
                    const pendingTasks = projectTasks.filter(t => t.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(t));
                    const isExpanded = expandedActiveProjectTasks[project.id];
                    
                    return (
                    <div 
                      key={project.id}
                      className="rounded-lg border border-gray-50 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
                    >
                      <div 
                        onClick={() => onSelectProject?.(project)}
                        className="p-3 cursor-pointer group"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-600">{project.name}</p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {project.clientIds?.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ') || users.find(u => u.id === project.clientId)?.name || 'No Client'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1">
                            <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs font-bold text-gray-400">{progress}%</span>
                        </div>
                      </div>
                      
                      {/* Pending Tasks Dropdown */}
                      {pendingTasks.length > 0 && (
                        <div className="border-t border-gray-50">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedActiveProjectTasks(prev => ({
                                ...prev,
                                [project.id]: !prev[project.id]
                              }));
                            }}
                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                              <List className="w-3 h-3" />
                              Pending Tasks ({pendingTasks.length})
                            </span>
                            <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {isExpanded && (
                            <div className="px-3 py-2 space-y-1 bg-gray-50/50">
                              {pendingTasks.slice(0, 5).map(task => (
                                <div
                                  key={task.id}
                                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-white transition-colors group/task"
                                >
                                  <button 
                                    onClick={() => onSelectTask?.(task, project)}
                                    className="flex-1 text-left flex items-start gap-2 min-w-0"
                                  >
                                    <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${
                                      task.status === TaskStatus.DONE ? 'bg-green-500' :
                                      task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' :
                                      'bg-gray-300'
                                    }`} />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-gray-700 truncate font-medium">{task.title}</p>
                                      {task.dueDate && (
                                        <p className="text-gray-400 text-xs mt-0.5">{formatDateToIndian(task.dueDate)}</p>
                                      )}
                                    </div>
                                  </button>
                                  
                                  {/* Quick Complete Button */}
                                  {task.status !== TaskStatus.DONE && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTaskCompletion(task, project);
                                      }}
                                      className="ml-2 p-1 text-gray-300 hover:text-green-500 opacity-0 group-hover/task:opacity-100 transition-all"
                                      title="Mark as Done"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {pendingTasks.length > 5 && (
                                <p className="text-xs text-gray-400 text-center py-1">+{pendingTasks.length - 5} more tasks</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: All Tasks */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-auto max-h-[500px] lg:h-[600px] lg:max-h-none">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <List className="w-4 h-4 text-amber-500" />
                Tasks
              </h3>
              <div className="flex items-center gap-2">
                <SortButton 
                  currentField={taskSort.field}
                  currentOrder={taskSort.order}
                  onSort={(field, order) => setTaskSort({ field, order })}
                  fields={[
                    { value: 'activity', label: 'Recent' },
                    { value: 'dueDate', label: 'Due Date' },
                    { value: 'title', label: 'Title' }
                  ]}
                />
                <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {user.role === Role.DESIGNER
                    ? assignedTasks.filter(i => i.task.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(i.task)).length
                    : filteredProjects.reduce((acc, p) => acc + getProjectTasks(p.id).filter(t => t.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(t)).length, 0)}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {(
                user.role === Role.DESIGNER
                  ? assignedTasks.filter(i => i.task.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(i.task)).length === 0
                  : filteredProjects.every(p => getProjectTasks(p.id).filter(t => t.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(t)).length === 0)
              ) ? (
                <div className="text-center py-10 text-gray-400 text-sm">All tasks completed! </div>
              ) : (
                (
                  user.role === Role.DESIGNER
                    ? assignedTasks
                        .filter(i => i.task.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(i.task))
                        .map(({ task, project }) => ({ ...task, projectName: project.name, project }))
                    : filteredProjects.flatMap(project => 
                        getProjectTasks(project.id)
                          .filter(t => t.status !== TaskStatus.DONE && !shouldHideCompletedApprovedTask(t))
                          .map(task => ({ ...task, projectName: project.name, project }))
                      )
                )
                  .sort((a, b) => {
                  let comparison = 0;
                  if (taskSort.field === 'activity') {
                    comparison = getTaskRecentTimestamp(a, a.project) - getTaskRecentTimestamp(b, b.project);
                  } else if (taskSort.field === 'dueDate') {
                    comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                  } else if (taskSort.field === 'title') {
                    comparison = a.title.localeCompare(b.title);
                  }
                  return taskSort.order === 'desc' ? -comparison : comparison;
                })
                .map(task => {
                  const assignee = users.find(u => u.id === task.assigneeId);
                  return (
                    <div 
                      key={task.id}
                      className="p-3 rounded-lg border border-gray-50 hover:border-amber-200 hover:bg-amber-50/30 transition-all cursor-pointer group relative"
                    >
                      <div onClick={() => onSelectTask?.(task, task.project)}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate group-hover:text-amber-600">{task.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-gray-500 truncate">{task.projectName}</p>
                              <span className="text-xs text-gray-300">•</span>
                              <p className="text-xs text-blue-500 font-medium truncate">{assignee?.name || 'Unassigned'}</p>
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {task.status}
                          </span>
                        </div>
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-xs text-gray-400 font-medium">Due: {formatDateToIndian(task.dueDate)}</span>
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span className="text-xs font-bold text-gray-500">{calculateTaskProgress(task)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 3: All Pending Approvals */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-auto max-h-[500px] lg:h-[600px] lg:max-h-none">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-rose-500" />
                Pending Approvals
              </h3>
              <div className="flex items-center gap-2">
                <SortButton 
                  currentField="activity"
                  currentOrder={projectSort.order}
                  onSort={(_, order) => setProjectSort(prev => ({ ...prev, order }))}
                  fields={[{ value: 'activity', label: 'Recent' }]}
                />
                <span className="text-sm font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                  {filteredProjects.reduce((acc, p) => acc + getPendingApprovals(p).length, 0)}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {filteredProjects.every(p => getPendingApprovals(p).length === 0) ? (
                <div className="text-center py-10 text-gray-400 text-sm">No pending approvals</div>
              ) : (
                filteredProjects.flatMap(project => 
                  getPendingApprovals(project).map(app => ({ ...app, project }))
                )
                .sort((a, b) => {
                  const comparison = getProjectRecentTimestamp(a.project) - getProjectRecentTimestamp(b.project);
                  return projectSort.order === 'desc' ? -comparison : comparison;
                })
                .map((app, idx) => (
                  <div 
                    key={idx}
                    onClick={() => {
                      if (app.type === 'task' && app.task) {
                        onSelectTask?.(app.task, app.project);
                      } else {
                        // For document approvals open the project and switch to Documents tab
                        onSelectProject?.(app.project, { initialTab: 'documents' });
                      }
                    }}
                    className="p-3 rounded-lg border border-gray-50 hover:border-rose-200 hover:bg-rose-50/30 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 mt-0.5 ${
                        app.type === 'task' ? 'text-blue-500' : 
                        app.type === 'doc' ? 'text-purple-500' : 'text-amber-500'
                      }`}>
                        {app.type === 'task' ? <List className="w-4 h-4" /> : 
                         app.type === 'doc' ? <FileText className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate group-hover:text-rose-600">{app.label}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{app.projectName}</p>
                      </div>
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* VENDOR: Task List View - Real-time sync */}
      {user.role === Role.VENDOR && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 lg:col-span-3" data-section="vendor-tasks">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-800">
                Your Active Tasks 
                <span className="ml-2 text-sm text-gray-400 font-normal">Real-time synced</span>
              </h3>
              <SortButton 
                currentField={vendorTaskSort.field}
                currentOrder={vendorTaskSort.order}
                onSort={(field, order) => setVendorTaskSort({ field, order })}
                fields={[
                  { value: 'activity', label: 'Recent' },
                  { value: 'dueDate', label: 'Due Date' },
                  { value: 'title', label: 'Title' }
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 text-sm font-semibold">
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
                      let comparison = 0;
                      if (vendorTaskSort.field === 'activity') {
                        const ta = getTaskRecentTimestamp(a.task, a.project);
                        const tb = getTaskRecentTimestamp(b.task, b.project);
                        comparison = ta - tb;
                      } else if (vendorTaskSort.field === 'dueDate') {
                        comparison = new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime();
                      } else if (vendorTaskSort.field === 'title') {
                        comparison = a.task.title.localeCompare(b.task.title);
                      }
                      return vendorTaskSort.order === 'desc' ? -comparison : comparison;
                    })
                    .map(({ task, project }) => (
                    <tr 
                      key={task.id} 
                      className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900" onClick={() => onSelectTask?.(task, project)}>{task.title}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm" onClick={() => onSelectTask?.(task, project)}>{project.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm" onClick={() => onSelectTask?.(task, project)}>
                        {formatDateToIndian(task.dueDate)}
                      </td>
                      <td className="px-4 py-3 flex items-center justify-between">
                        <span className={`px-2.5 py-1 rounded-md text-sm font-semibold uppercase transition-colors
                          ${task.status === TaskStatus.IN_PROGRESS 
                            ? 'bg-blue-100 text-blue-700' 
                            : task.status === TaskStatus.TODO
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                          }`} onClick={() => onSelectTask?.(task, project)}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">All caught up! </td>
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