import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, User, Task, TaskStatus, Role, Meeting, SubTask, Comment, ApprovalStatus, ActivityLog } from '../types';
import { generateProjectTasks } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import KanbanBoard from './KanbanBoard';
import { 
  Calendar, DollarSign, Plus, CheckCircle, 
  ChevronRight, Wand2, Lock, Clock, FileText,
  Layout, ListChecks, ArrowRight, User as UserIcon, X,
  MessageSquare, ThumbsUp, ThumbsDown, Send, Shield, History, Layers, Link2, AlertTriangle
} from 'lucide-react';

interface ProjectDetailProps {
  project: Project;
  users: User[];
  onUpdateProject: (updatedProject: Project) => void;
  onBack: () => void;
}

const ROW_HEIGHT = 48; // Fixed height for Gantt rows

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, users, onUpdateProject, onBack }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'discovery' | 'plan' | 'financials' | 'team' | 'timeline'>('discovery');
  const [planView, setPlanView] = useState<'list' | 'gantt' | 'kanban'>('list'); // Sub-view for Plan
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  
  // Comment State
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Phase 1: Discovery State
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [newMeeting, setNewMeeting] = useState<Partial<Meeting>>({});

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [editingTask?.comments]);

  if (!user) return null;

  // --- Permissions Logic ---
  const isClient = user.role === Role.CLIENT;
  const isVendor = user.role === Role.VENDOR;
  const isAdmin = user.role === Role.ADMIN;
  const isLeadDesigner = user.role === Role.DESIGNER && project.leadDesignerId === user.id;

  const canEditProject = isAdmin || isLeadDesigner;
  const canViewFinancials = !isVendor; 
  const canUseAI = canEditProject;

  const getAssigneeName = (id: string) => users.find(u => u.id === id)?.name || 'Unassigned';
  const getAssigneeAvatar = (id: string) => users.find(u => u.id === id)?.avatar || '';

  // --- Helper: Add Activity Log ---
  const logActivity = (action: string, details: string, type: ActivityLog['type'] = 'info') => {
    const log: ActivityLog = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      action,
      details,
      timestamp: new Date().toISOString(),
      type
    };
    return log;
  };

  // --- Handlers ---

  const handleGenerateTasks = async () => {
    if (!canUseAI) return;
    setIsGenerating(true);
    const newTasks = await generateProjectTasks(project.description, project.id);
    if (newTasks.length > 0) {
      const log = logActivity('AI Generation', `Generated ${newTasks.length} tasks via AI assistant`, 'creation');
      onUpdateProject({
        ...project,
        tasks: [...project.tasks, ...newTasks],
        activityLog: [log, ...(project.activityLog || [])]
      });
    }
    setIsGenerating(false);
  };

  const handleAddMeeting = () => {
    if (!newMeeting.title || !newMeeting.date) return;
    const meeting: Meeting = {
      id: Math.random().toString(36).substr(2, 9),
      title: newMeeting.title,
      date: newMeeting.date,
      attendees: newMeeting.attendees || [],
      notes: newMeeting.notes || '',
      type: newMeeting.type as any || 'Discovery'
    };
    const log = logActivity('Meeting Logged', `Logged new meeting: ${meeting.title}`);
    onUpdateProject({ 
      ...project, 
      meetings: [...project.meetings, meeting],
      activityLog: [log, ...(project.activityLog || [])]
    });
    setIsMeetingModalOpen(false);
    setNewMeeting({});
  };

  const handleSaveTask = () => {
    if (!editingTask?.title || !editingTask.startDate || !editingTask.dueDate) return;
    
    // Default structure for new tasks
    const defaultApprovals = {
       start: { client: { status: 'pending' }, designer: { status: 'pending' } },
       completion: { client: { status: 'pending' }, designer: { status: 'pending' } }
    };

    const taskData: Task = {
      id: editingTask.id || Math.random().toString(36).substr(2, 9),
      title: editingTask.title,
      description: editingTask.description,
      status: editingTask.status || TaskStatus.TODO,
      assigneeId: editingTask.assigneeId || '',
      startDate: editingTask.startDate,
      dueDate: editingTask.dueDate,
      priority: editingTask.priority || 'medium',
      dependencies: editingTask.dependencies || [],
      subtasks: editingTask.subtasks || [],
      comments: editingTask.comments || [],
      approvals: editingTask.approvals as any || defaultApprovals
    };

    // Cycle Detection Check
    if (taskData.dependencies.includes(taskData.id)) {
        alert("A task cannot depend on itself.");
        return;
    }

    let updatedTasks = [...project.tasks];
    const index = updatedTasks.findIndex(t => t.id === taskData.id);
    let log: ActivityLog;

    if (index >= 0) {
      updatedTasks[index] = taskData;
      log = logActivity('Task Updated', `Updated task details for "${taskData.title}"`);
    } else {
      updatedTasks.push(taskData);
      log = logActivity('Task Created', `Created new task "${taskData.title}"`, 'creation');
    }

    onUpdateProject({ 
      ...project, 
      tasks: updatedTasks,
      activityLog: [log, ...(project.activityLog || [])]
    });
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleKanbanStatusUpdate = (taskId: string, newStatus: TaskStatus) => {
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Check Dependencies for Kanban Move
    if (newStatus === TaskStatus.IN_PROGRESS || newStatus === TaskStatus.DONE) {
      const parentTasks = project.tasks.filter(t => task.dependencies.includes(t.id));
      const incompleteParents = parentTasks.filter(t => t.status !== TaskStatus.DONE);
      
      if (incompleteParents.length > 0) {
        // Validation Failed
        const names = incompleteParents.map(t => t.title).join(', ');
        alert(`Cannot start this task. Waiting for dependencies: ${names}`);
        return;
      }
    }

    const updatedTasks = project.tasks.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    
    const log = logActivity('Status Changed', `Task "${task.title}" moved to ${newStatus}`);
    onUpdateProject({
      ...project,
      tasks: updatedTasks,
      activityLog: [log, ...(project.activityLog || [])]
    });
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    let taskTitle = '';
    const updatedTasks = project.tasks.map(t => {
      if (t.id === taskId) {
        taskTitle = t.title;
        return {
          ...t,
          subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st)
        };
      }
      return t;
    });
    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !editingTask) return;
    const comment: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      text: newComment,
      timestamp: new Date().toISOString()
    };
    
    setEditingTask({
      ...editingTask,
      comments: [...(editingTask.comments || []), comment]
    });
    setNewComment('');
  };

  const handleApproval = (stage: 'start' | 'completion', action: 'approve' | 'reject') => {
    if (!editingTask || !editingTask.approvals) return;
    
    const roleKey = (user.role === Role.CLIENT) ? 'client' : (user.role === Role.ADMIN || user.role === Role.DESIGNER) ? 'designer' : null;
    if (!roleKey) return;

    const newStatus: ApprovalStatus = action === 'approve' ? 'approved' : 'rejected';

    const updatedApprovals = {
      ...editingTask.approvals,
      [stage]: {
        ...editingTask.approvals[stage],
        [roleKey]: {
          status: newStatus,
          updatedBy: user.id,
          timestamp: new Date().toISOString()
        }
      }
    };

    setEditingTask({ ...editingTask, approvals: updatedApprovals });
  };

  const calculateFinancials = () => {
    const income = project.financials.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount, 0);
    const expense = project.financials.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0);
    return { income, expense, balance: income - expense };
  };

  const { income, expense } = calculateFinancials();

  // --- DSA: Topological Sort for Gantt ---
  // Sorts tasks so that dependencies (parents) generally appear above children
  const getTopologicallySortedTasks = (tasks: Task[]): Task[] => {
    const visited = new Set<string>();
    const sorted: Task[] = [];
    const tempVisited = new Set<string>(); // For cycle detection if needed, but we just skip for UI

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      if (tempVisited.has(taskId)) return; // Cycle detected, safe exit

      tempVisited.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        // Visit children (tasks that depend on THIS task) first? 
        // No, for Gantt waterfall, we want Parents -> Children.
        // So we visit dependencies first.
        task.dependencies.forEach(depId => visit(depId));
        visited.add(taskId);
        sorted.push(task);
      }
    };

    tasks.forEach(t => visit(t.id));
    return sorted;
  };

  // Gantt Chart Calculations
  const ganttConfig = useMemo(() => {
    if (project.tasks.length === 0) return null;
    
    // Find min start and max end
    const dates = project.tasks.flatMap(t => [new Date(t.startDate).getTime(), new Date(t.dueDate).getTime()]);
    // Add project bounds
    dates.push(new Date(project.startDate).getTime());
    dates.push(new Date(project.deadline).getTime());
    
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    
    const totalDuration = maxDate - minDate;
    const dayMs = 1000 * 60 * 60 * 24;
    const totalDays = Math.ceil(totalDuration / dayMs) + 5; // buffer

    return { minDate, maxDate, totalDays, dayMs };
  }, [project]);

  const ganttTasksWithPos = useMemo(() => {
    if (!ganttConfig) return [];
    
    // Use Topological sort to order rows better
    const sortedTasks = getTopologicallySortedTasks(project.tasks);

    return sortedTasks.map((task, index) => {
        const start = new Date(task.startDate).getTime();
        const end = new Date(task.dueDate).getTime();
        const totalSpan = ganttConfig.maxDate - ganttConfig.minDate;
        
        const left = ((start - ganttConfig.minDate) / totalSpan) * 100;
        const width = ((end - start) / totalSpan) * 100;
        return { ...task, left, width: Math.max(width, 0.5), index };
    });
  }, [project.tasks, ganttConfig]);

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium 
                ${project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                {project.status}
              </span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Due: {project.deadline}</span>
              {!isVendor && (
                <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> Budget: ${project.budget.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {activeTab === 'plan' && canUseAI && (
            <button 
              onClick={handleGenerateTasks}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <Wand2 className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Thinking...' : 'AI Suggest Tasks'}
            </button>
          )}
          {canEditProject && (
            <button 
              onClick={() => {
                if(activeTab === 'discovery') setIsMeetingModalOpen(true);
                if(activeTab === 'plan') { setEditingTask({}); setIsTaskModalOpen(true); }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add {activeTab === 'discovery' ? 'Meeting' : activeTab === 'plan' ? 'Task' : activeTab === 'financials' ? 'Record' : 'Member'}
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 border-b border-gray-200 bg-white">
        <div className="flex gap-8">
          {[
            { id: 'discovery', label: '1. Discovery', icon: FileText },
            { id: 'plan', label: '2. Plan', icon: Layout },
            { id: 'financials', label: '3. Financials', icon: DollarSign },
            { id: 'timeline', label: 'Timeline', icon: History },
            { id: 'team', label: 'Team', icon: UserIcon }
          ].map((tab) => {
             if (tab.id === 'financials' && !canViewFinancials) return null;
             return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id 
                    ? 'border-gray-900 text-gray-900' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
             );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        
        {/* PHASE 1: DISCOVERY & MEETINGS */}
        {activeTab === 'discovery' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Phase 1: Project Discovery</h3>
              <p className="text-sm text-gray-500 mb-6">Track all client meetings, site visits, and initial requirements gathering here.</p>
              
              <div className="space-y-4">
                {project.meetings.length === 0 ? (
                   <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-lg">
                      <p className="text-gray-400">No meetings recorded yet.</p>
                   </div>
                ) : project.meetings.map(meeting => (
                  <div key={meeting.id} className="flex gap-4 p-4 border border-gray-100 rounded-lg hover:shadow-md transition-shadow bg-white">
                    <div className="flex-shrink-0 w-16 text-center pt-1">
                      <div className="text-xs font-bold text-gray-500 uppercase">{new Date(meeting.date).toLocaleString('default', { month: 'short' })}</div>
                      <div className="text-xl font-bold text-gray-900">{new Date(meeting.date).getDate()}</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                         <h4 className="font-bold text-gray-800">{meeting.title}</h4>
                         <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{meeting.type}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap bg-gray-50 p-3 rounded">{meeting.notes}</p>
                      <div className="mt-3 flex gap-2">
                        {meeting.attendees.map((att, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{att}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PHASE 2: PLANNING (GANTT, KANBAN, LIST) */}
        {activeTab === 'plan' && (
          <div className="space-y-6 h-full flex flex-col">
            {/* View Switcher */}
            <div className="flex bg-white rounded-lg border border-gray-200 p-1 w-fit shadow-sm">
              {[
                { id: 'list', label: 'List View', icon: ListChecks },
                { id: 'kanban', label: 'Board', icon: Layers },
                { id: 'gantt', label: 'Gantt Chart', icon: Clock }
              ].map(view => (
                <button
                  key={view.id}
                  onClick={() => setPlanView(view.id as any)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${planView === view.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  <view.icon className="w-3.5 h-3.5" />
                  {view.label}
                </button>
              ))}
            </div>

            {/* KANBAN VIEW */}
            {planView === 'kanban' && (
              <div className="flex-1 overflow-x-auto min-h-[500px]">
                <KanbanBoard 
                  tasks={project.tasks} 
                  users={users} 
                  onUpdateTaskStatus={handleKanbanStatusUpdate}
                  onEditTask={(task) => { setEditingTask(task); setIsTaskModalOpen(true); }}
                />
              </div>
            )}

            {/* GANTT VIEW (Detailed) */}
            {planView === 'gantt' && ganttConfig && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
                 <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                   <h3 className="font-bold text-gray-800">Timeline & Dependencies</h3>
                   <div className="flex items-center gap-6 text-xs text-gray-500">
                     <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Task</div>
                     <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Done</div>
                     <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-300"></span> Dependency</div>
                     <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400"></span> Schedule Conflict</div>
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-auto relative">
                   <div className="min-w-[1200px] p-6 relative">
                      {/* Grid Background */}
                      <div className="absolute inset-0 pointer-events-none pl-[25%] pt-[40px] pr-6 pb-6 flex">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="flex-1 border-r border-dashed border-gray-100 h-full"></div>
                        ))}
                      </div>

                      {/* Header */}
                      <div className="flex border-b border-gray-200 pb-2 mb-2 sticky top-0 bg-white z-20">
                        <div className="w-1/4 font-semibold text-sm text-gray-700 pl-2">Task Details</div>
                        <div className="w-3/4 flex justify-between text-xs text-gray-400 px-2 font-mono">
                           <span>{new Date(ganttConfig.minDate).toLocaleDateString()}</span>
                           <span>Week 1</span>
                           <span>Week 2</span>
                           <span>Week 3</span>
                           <span>{new Date(ganttConfig.maxDate).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Timeline Area */}
                      <div className="relative mt-2">
                        {/* Dependency Lines Layer */}
                        <svg 
                            className="absolute top-0 right-0 w-3/4 h-full pointer-events-none z-0"
                            viewBox={`0 0 100 ${ganttTasksWithPos.length * ROW_HEIGHT}`}
                            preserveAspectRatio="none"
                        >
                            {/* Simple line markers or paths. preserveAspectRatio="none" means x is 0-100, y is 0-totalPixelHeight */}
                            {ganttTasksWithPos.flatMap(task => 
                                task.dependencies.map(depId => {
                                    const parent = ganttTasksWithPos.find(t => t.id === depId);
                                    if (!parent) return null;
                                    
                                    // Coordinates in SVG space
                                    // x is 0-100 (percentage mapped)
                                    // y is pixels
                                    const x1 = parent.left + parent.width; 
                                    const y1 = (parent.index * ROW_HEIGHT) + (ROW_HEIGHT / 2);
                                    const x2 = task.left; 
                                    const y2 = (task.index * ROW_HEIGHT) + (ROW_HEIGHT / 2);

                                    // Simple bezier curve
                                    const pathD = `M ${x1} ${y1} C ${x1 + 2} ${y1}, ${x2 - 2} ${y2}, ${x2} ${y2}`;
                                    
                                    // Visual Check: Is Parent End Date > Child Start Date? (Simple check via X coordinates)
                                    // If x1 > x2, it means parent ends after child starts. This is a conflict.
                                    const isConflict = x1 > x2;

                                    return (
                                        <g key={`${parent.id}-${task.id}`}>
                                          <path 
                                              d={pathD}
                                              stroke={isConflict ? "#ef4444" : "#9CA3AF"} 
                                              strokeWidth={isConflict ? "2" : "1.5"}
                                              fill="none"
                                              vectorEffect="non-scaling-stroke"
                                              className={isConflict ? "opacity-80" : "opacity-40"}
                                              strokeDasharray={isConflict ? "4 2" : "none"}
                                          />
                                          <circle cx={x2} cy={y2} r="1" fill={isConflict ? "#ef4444" : "#9CA3AF"} vectorEffect="non-scaling-stroke"/>
                                        </g>
                                    );
                                })
                            )}
                        </svg>

                        {/* Rows */}
                        <div className="relative z-10 space-y-0">
                          {ganttTasksWithPos.map(task => (
                             <div 
                               key={task.id} 
                               className="flex items-center group hover:bg-gray-50/50 rounded"
                               style={{ height: ROW_HEIGHT }}
                             >
                               <div className="w-1/4 pr-4 pl-2 flex flex-col justify-center border-r border-transparent group-hover:border-gray-100">
                                 <div 
                                   onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}
                                   className="text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 flex items-center gap-2"
                                 >
                                   {task.title}
                                 </div>
                                 <div className="text-[10px] text-gray-400">
                                   {getAssigneeName(task.assigneeId)}
                                 </div>
                               </div>
                               <div className="w-3/4 relative h-6 rounded-md">
                                  <div 
                                    className={`absolute h-full rounded shadow-sm flex items-center px-2 cursor-pointer
                                      ${task.status === 'Done' ? 'bg-green-500 opacity-80' : 'bg-blue-500 opacity-80'}
                                      hover:opacity-100 transition-opacity z-20
                                    `}
                                    style={{ left: `${task.left}%`, width: `${task.width}%` }}
                                    onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}
                                  >
                                    <span className="text-[9px] text-white truncate font-medium w-full">{task.width > 10 ? task.title : ''}</span>
                                  </div>
                               </div>
                             </div>
                           ))}
                        </div>
                      </div>
                   </div>
                 </div>
              </div>
            )}

            {/* LIST VIEW (Legacy Grid) */}
            {planView === 'list' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {project.tasks.map(task => (
                   <div key={task.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase
                          ${task.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                          {task.priority}
                        </span>
                        <button onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }} className="text-xs text-gray-400 hover:text-gray-900">View</button>
                      </div>
                      <h4 className="font-bold text-gray-800 mb-1">{task.title}</h4>
                      <p className="text-xs text-gray-500 mb-4">{new Date(task.startDate).toLocaleDateString()} - {new Date(task.dueDate).toLocaleDateString()}</p>
                      
                      {/* Status Check */}
                      <div className="flex gap-2 mb-3">
                         {task.approvals.start.client.status === 'approved' && <span className="w-2 h-2 rounded-full bg-green-500" title="Client Start Approved"></span>}
                         {task.approvals.completion.client.status === 'approved' && <span className="w-2 h-2 rounded-full ring-2 ring-green-500 bg-white" title="Client End Approved"></span>}
                         {task.comments.length > 0 && <span className="flex items-center text-xs text-gray-400"><MessageSquare className="w-3 h-3 mr-1"/>{task.comments.length}</span>}
                      </div>

                      {/* Subtasks Preview */}
                      <div className="space-y-2 mb-4">
                        {task.subtasks.slice(0, 3).map(st => (
                          <div key={st.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <div 
                              onClick={() => canEditProject && toggleSubtask(task.id, st.id)}
                              className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center
                              ${st.isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                            >
                              {st.isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                            <span className={st.isCompleted ? 'line-through text-gray-400' : ''}>{st.title}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                         <img src={getAssigneeAvatar(task.assigneeId) || 'https://via.placeholder.com/30'} className="w-6 h-6 rounded-full" alt="" />
                         <span className="text-xs text-gray-500">{getAssigneeName(task.assigneeId)}</span>
                      </div>
                   </div>
                 ))}
              </div>
            )}
          </div>
        )}

        {/* PHASE 3: FINANCIALS */}
        {activeTab === 'financials' && canViewFinancials && (
          <div className="max-w-4xl mx-auto space-y-8">
            <h3 className="text-lg font-bold text-gray-800">Phase 3: Financial Management</h3>
            
            <div className="grid grid-cols-2 gap-6">
               <div className="bg-green-50 p-6 rounded-xl border border-green-100">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-green-800">Total Received (Client)</p>
                    <ArrowRight className="w-5 h-5 text-green-300" />
                 </div>
                 <h3 className="text-3xl font-bold text-green-700">${income.toLocaleString()}</h3>
                 <p className="text-xs text-green-600 mt-1">Pending Invoices: $12,500</p>
               </div>
               
               <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-red-800">Total Paid Out (Vendors)</p>
                    <ArrowRight className="w-5 h-5 text-red-300" />
                 </div>
                 <h3 className="text-3xl font-bold text-red-700">${expense.toLocaleString()}</h3>
                 <p className="text-xs text-red-600 mt-1">Pending Bills: $4,200</p>
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                 <h3 className="font-semibold text-gray-800">Transaction Ledger</h3>
                 <div className="flex gap-2">
                    <button className="text-xs bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50">Filter</button>
                    <button className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-800">New Entry</button>
                 </div>
              </div>
              <table className="w-full text-sm text-left">
                <thead className="bg-white text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium">Flow</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {project.financials.map(fin => (
                    <tr key={fin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-600">{fin.date}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fin.description}</td>
                      <td className="px-6 py-4">
                        {fin.type === 'income' ? (
                           <span className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase"><ArrowRight className="w-3 h-3 rotate-180" /> In</span>
                        ) : (
                           <span className="flex items-center gap-1 text-red-600 text-xs font-bold uppercase"><ArrowRight className="w-3 h-3" /> Out</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium capitalize
                          ${fin.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {fin.status}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${fin.type === 'income' ? 'text-green-600' : 'text-gray-900'}`}>
                        ${fin.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
           <div className="max-w-3xl mx-auto">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
               <h3 className="text-lg font-bold text-gray-800 mb-6">Project Activity History</h3>
               <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
                  {(!project.activityLog || project.activityLog.length === 0) && (
                     <div className="pl-6 text-gray-400 italic">No activity recorded yet.</div>
                  )}
                  {project.activityLog?.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(log => (
                    <div key={log.id} className="relative pl-8">
                      {/* Timeline Dot */}
                      <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm
                        ${log.type === 'creation' ? 'bg-purple-500' : log.type === 'success' ? 'bg-green-500' : 'bg-blue-400'}`} 
                      />
                      
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                         <div>
                            <p className="font-bold text-gray-800 text-sm">{log.action}</p>
                            <p className="text-gray-600 text-sm mt-0.5">{log.details}</p>
                            <div className="flex items-center gap-2 mt-2">
                               <img src={getAssigneeAvatar(log.userId)} className="w-5 h-5 rounded-full" alt="" />
                               <span className="text-xs text-gray-400">{getAssigneeName(log.userId)}</span>
                            </div>
                         </div>
                         <span className="text-xs text-gray-400 mt-2 sm:mt-0 font-mono">
                            {new Date(log.timestamp).toLocaleString()}
                         </span>
                      </div>
                    </div>
                  ))}
               </div>
             </div>
           </div>
        )}
        
        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200">
               <h3 className="font-bold text-gray-800 mb-4">Project Stakeholders</h3>
               <div className="space-y-4">
                  <div className="flex items-center gap-4">
                     <img src={getAssigneeAvatar(project.clientId)} className="w-12 h-12 rounded-full" alt="" />
                     <div>
                        <p className="font-bold text-gray-900">{getAssigneeName(project.clientId)}</p>
                        <p className="text-xs text-gray-500">Client</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <img src={getAssigneeAvatar(project.leadDesignerId)} className="w-12 h-12 rounded-full" alt="" />
                     <div>
                        <p className="font-bold text-gray-900">{getAssigneeName(project.leadDesignerId)}</p>
                        <p className="text-xs text-gray-500">Lead Designer</p>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* Meeting Modal */}
      {isMeetingModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-fade-in">
              <h3 className="text-lg font-bold mb-4">Log New Meeting</h3>
              <div className="space-y-4">
                 <input 
                   type="text" placeholder="Meeting Title" className="w-full p-2 border rounded"
                   value={newMeeting.title || ''} onChange={e => setNewMeeting({...newMeeting, title: e.target.value})}
                 />
                 <input 
                   type="date" className="w-full p-2 border rounded"
                   value={newMeeting.date || ''} onChange={e => setNewMeeting({...newMeeting, date: e.target.value})}
                 />
                 <select 
                   className="w-full p-2 border rounded"
                   value={newMeeting.type || 'Discovery'} onChange={e => setNewMeeting({...newMeeting, type: e.target.value as any})}
                 >
                   <option>Discovery</option>
                   <option>Site Visit</option>
                   <option>Progress</option>
                   <option>Vendor Meet</option>
                 </select>
                 <textarea 
                   placeholder="Meeting Notes..." className="w-full p-2 border rounded h-32"
                   value={newMeeting.notes || ''} onChange={e => setNewMeeting({...newMeeting, notes: e.target.value})}
                 />
                 <button onClick={handleAddMeeting} className="w-full bg-gray-900 text-white py-2 rounded font-bold">Save Meeting Record</button>
                 <button onClick={() => setIsMeetingModalOpen(false)} className="w-full text-gray-500 py-2">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {/* Task/Gantt Modal */}
      {isTaskModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col animate-fade-in overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                   <h3 className="text-lg font-bold text-gray-900">{editingTask.id ? 'Edit Task Details' : 'Create New Task'}</h3>
                   {editingTask.id && <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">ID: {editingTask.id}</span>}
                </div>
                <button onClick={() => setIsTaskModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X/></button>
              </div>

              {/* Modal Body: Split View */}
              <div className="flex-1 flex overflow-hidden">
                 
                 {/* LEFT: Task Info Form */}
                 <div className="w-1/2 p-6 overflow-y-auto border-r border-gray-100">
                    <div className="space-y-4">
                       <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Title</label>
                          {canEditProject ? (
                            <input 
                              type="text" className="w-full p-2 border rounded mt-1 font-semibold"
                              value={editingTask.title || ''} onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                            />
                          ) : (
                            <p className="font-bold text-gray-800 mt-1">{editingTask.title}</p>
                          )}
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Start Date</label>
                            {canEditProject ? (
                               <input type="date" className="w-full p-2 border rounded mt-1" value={editingTask.startDate || ''} onChange={e => setEditingTask({...editingTask, startDate: e.target.value})} />
                            ) : <p className="text-sm mt-1">{editingTask.startDate}</p>}
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Due Date</label>
                            {canEditProject ? (
                               <input type="date" className="w-full p-2 border rounded mt-1" value={editingTask.dueDate || ''} onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} />
                            ) : <p className="text-sm mt-1">{editingTask.dueDate}</p>}
                          </div>
                       </div>

                        {/* Dependencies Selection */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                             <Link2 className="w-3 h-3 text-gray-400" />
                             <label className="text-xs font-bold text-gray-500 uppercase">Dependencies (Depends on)</label>
                          </div>
                          {canEditProject ? (
                            <div className="mt-1 p-2 border rounded max-h-24 overflow-y-auto bg-white border-gray-200">
                              {project.tasks.filter(t => t.id !== editingTask.id).length > 0 ? (
                                  project.tasks.filter(t => t.id !== editingTask.id).map(t => (
                                    <label key={t.id} className="flex items-center gap-2 mb-1 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={(editingTask.dependencies || []).includes(t.id)}
                                            onChange={(e) => {
                                                const currentDeps = editingTask.dependencies || [];
                                                // Prevent self-dependency (simple check)
                                                if (t.id === editingTask.id) return;
                                                
                                                const newDeps = e.target.checked 
                                                    ? [...currentDeps, t.id]
                                                    : currentDeps.filter(d => d !== t.id);
                                                setEditingTask({ ...editingTask, dependencies: newDeps });
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 truncate">{t.title}</span>
                                    </label>
                                  ))
                              ) : <p className="text-xs text-gray-400 italic">No other tasks available</p>}
                            </div>
                          ) : (
                             <div className="mt-1 text-sm text-gray-600">
                                {(editingTask.dependencies || []).length > 0 ? (
                                    project.tasks.filter(t => (editingTask.dependencies || []).includes(t.id)).map(t => (
                                        <div key={t.id} className="flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 mb-1">
                                            <Link2 className="w-3 h-3 text-gray-400"/> {t.title}
                                        </div>
                                    ))
                                ) : <span className="text-gray-400 italic text-xs">No dependencies</span>}
                             </div>
                          )}
                        </div>

                       <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Assignee & Priority</label>
                          <div className="flex gap-4 mt-1">
                             {canEditProject ? (
                               <select 
                                 className="flex-1 p-2 border rounded"
                                 value={editingTask.assigneeId || ''} onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})}
                               >
                                  <option value="">Unassigned</option>
                                  {users.filter(u => u.role === Role.DESIGNER || u.role === Role.VENDOR).map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                               </select>
                             ) : <p className="flex-1 text-sm bg-gray-50 p-2 rounded">{getAssigneeName(editingTask.assigneeId || '')}</p>}

                             {canEditProject ? (
                               <select 
                                 className="w-32 p-2 border rounded"
                                 value={editingTask.priority || 'medium'} onChange={e => setEditingTask({...editingTask, priority: e.target.value as any})}
                               >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                               </select>
                             ) : <span className="p-2 border rounded bg-gray-50 uppercase text-xs font-bold flex items-center">{editingTask.priority}</span>}
                          </div>
                       </div>
                       
                       {canEditProject && (
                         <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                            <select 
                               className="w-full p-2 border rounded mt-1"
                               value={editingTask.status || TaskStatus.TODO}
                               onChange={e => setEditingTask({...editingTask, status: e.target.value as TaskStatus})}
                            >
                               {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>
                       )}

                       {/* Subtasks */}
                       <div className="pt-4 border-t border-gray-100">
                         <div className="flex justify-between items-center mb-2">
                           <label className="text-xs font-bold text-gray-700 uppercase">Checklist</label>
                           {canEditProject && (
                             <button 
                               onClick={() => {
                                  const newSub: SubTask = { id: Math.random().toString(), title: 'New Item', isCompleted: false };
                                  setEditingTask({ ...editingTask, subtasks: [...(editingTask.subtasks || []), newSub] });
                               }}
                               className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                             ><Plus className="w-3 h-3"/> Add</button>
                           )}
                         </div>
                         <div className="space-y-2">
                            {editingTask.subtasks?.map((st, idx) => (
                              <div key={st.id} className="flex items-center gap-2">
                                 <input 
                                   type="checkbox" 
                                   checked={st.isCompleted} 
                                   disabled={!canEditProject && user.id !== editingTask.assigneeId}
                                   onChange={() => {
                                      const newSubs = [...(editingTask.subtasks || [])];
                                      newSubs[idx].isCompleted = !newSubs[idx].isCompleted;
                                      setEditingTask({...editingTask, subtasks: newSubs});
                                   }}
                                 />
                                 {canEditProject ? (
                                   <input 
                                      type="text" 
                                      value={st.title}
                                      onChange={(e) => {
                                         const newSubs = [...(editingTask.subtasks || [])];
                                         newSubs[idx].title = e.target.value;
                                         setEditingTask({...editingTask, subtasks: newSubs});
                                      }}
                                      className="flex-1 p-1 border-b border-transparent focus:border-gray-300 outline-none text-sm"
                                    />
                                 ) : <span className={`flex-1 text-sm ${st.isCompleted ? 'line-through text-gray-400' : ''}`}>{st.title}</span>}
                                 
                                 {canEditProject && (
                                   <button 
                                     onClick={() => {
                                       const newSubs = editingTask.subtasks?.filter(s => s.id !== st.id);
                                       setEditingTask({...editingTask, subtasks: newSubs});
                                     }}
                                     className="text-gray-300 hover:text-red-500"
                                   >
                                     <X className="w-4 h-4" />
                                   </button>
                                 )}
                              </div>
                            ))}
                            {(!editingTask.subtasks || editingTask.subtasks.length === 0) && <p className="text-xs text-gray-400 italic">No checklist items</p>}
                         </div>
                       </div>
                    </div>
                 </div>

                 {/* RIGHT: Approvals & Comments */}
                 <div className="w-1/2 flex flex-col bg-gray-50/50">
                    
                    {/* Approvals Section */}
                    {editingTask.approvals && (
                      <div className="p-4 border-b border-gray-200 bg-white">
                        <div className="flex items-center gap-2 mb-3">
                           <Shield className="w-4 h-4 text-gray-500" />
                           <h4 className="text-xs font-bold text-gray-700 uppercase">Approvals</h4>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                           {/* Start Approval */}
                           <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <p className="text-xs font-bold text-gray-500 mb-2">1. Start Approval</p>
                              <div className="space-y-2">
                                 {/* Client Vote */}
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-600">Client</span>
                                    {editingTask.approvals.start.client.status === 'pending' ? (
                                      isClient ? (
                                        <div className="flex gap-1">
                                          <button onClick={() => handleApproval('start', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('start', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded"><ThumbsDown className="w-3 h-3"/></button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals.start.client.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {editingTask.approvals.start.client.status}
                                       </span>
                                    )}
                                 </div>
                                 {/* Designer Vote */}
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-600">Designer</span>
                                    {editingTask.approvals.start.designer.status === 'pending' ? (
                                      (isLeadDesigner || isAdmin) ? (
                                        <div className="flex gap-1">
                                          <button onClick={() => handleApproval('start', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('start', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded"><ThumbsDown className="w-3 h-3"/></button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals.start.designer.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {editingTask.approvals.start.designer.status}
                                       </span>
                                    )}
                                 </div>
                              </div>
                           </div>

                           {/* End Approval */}
                           <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <p className="text-xs font-bold text-gray-500 mb-2">2. Completion Approval</p>
                              <div className="space-y-2">
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-600">Client</span>
                                    {editingTask.approvals.completion.client.status === 'pending' ? (
                                      isClient ? (
                                        <div className="flex gap-1">
                                          <button onClick={() => handleApproval('completion', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('completion', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded"><ThumbsDown className="w-3 h-3"/></button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals.completion.client.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {editingTask.approvals.completion.client.status}
                                       </span>
                                    )}
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-600">Designer</span>
                                    {editingTask.approvals.completion.designer.status === 'pending' ? (
                                      (isLeadDesigner || isAdmin) ? (
                                        <div className="flex gap-1">
                                          <button onClick={() => handleApproval('completion', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('completion', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded"><ThumbsDown className="w-3 h-3"/></button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals.completion.designer.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {editingTask.approvals.completion.designer.status}
                                       </span>
                                    )}
                                 </div>
                              </div>
                           </div>
                        </div>
                      </div>
                    )}

                    {/* Comments Section */}
                    <div className="flex-1 flex flex-col p-4 overflow-hidden">
                       <div className="flex items-center gap-2 mb-3">
                           <MessageSquare className="w-4 h-4 text-gray-500" />
                           <h4 className="text-xs font-bold text-gray-700 uppercase">Comments</h4>
                       </div>
                       
                       <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                          {editingTask.comments?.length === 0 && <p className="text-center text-xs text-gray-400 py-4">No comments yet. Start the discussion!</p>}
                          {editingTask.comments?.map(comment => {
                             const isMe = comment.userId === user.id;
                             return (
                               <div key={comment.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                                  <img src={getAssigneeAvatar(comment.userId)} className="w-6 h-6 rounded-full bg-gray-200 flex-shrink-0" alt=""/>
                                  <div className={`p-2 rounded-lg max-w-[85%] text-sm ${isMe ? 'bg-blue-100 text-blue-900' : 'bg-white border border-gray-200 text-gray-700'}`}>
                                     <p>{comment.text}</p>
                                     <p className="text-[10px] opacity-60 mt-1 text-right">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                  </div>
                               </div>
                             );
                          })}
                          <div ref={commentsEndRef} />
                       </div>

                       <div className="relative">
                          <input 
                            type="text" 
                            className="w-full p-2 pr-10 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                            placeholder="Type a message..."
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                          />
                          <button 
                             onClick={handleAddComment}
                             className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800"
                          >
                             <Send className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                <button onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                <button onClick={handleSaveTask} className="px-6 py-2 text-sm font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 shadow-sm">
                  {editingTask.id ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;