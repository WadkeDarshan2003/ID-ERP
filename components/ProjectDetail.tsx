import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Project, User, Task, TaskStatus, Role, Meeting, SubTask, Comment, ApprovalStatus, ActivityLog, ProjectDocument, FinancialRecord } from '../types';
import { generateProjectTasks } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_ORDER } from '../constants'; // Imported from constants
import KanbanBoard from './KanbanBoard';
import { 
  Calendar, DollarSign, Plus, CheckCircle, 
  ChevronRight, Wand2, Lock, Clock, FileText,
  Layout, ListChecks, ArrowRight, User as UserIcon, X,
  MessageSquare, ThumbsUp, ThumbsDown, Send, Shield, History, Layers, Link2, AlertCircle, Tag, Upload, Ban, PauseCircle, PlayCircle,
  File as FileIcon
} from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';

interface ProjectDetailProps {
  project: Project;
  users: User[];
  onUpdateProject: (updatedProject: Project) => void;
  onBack: () => void;
}

const ROW_HEIGHT = 48; // Fixed height for Gantt rows

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, users, onUpdateProject, onBack }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents'>('plan');
  const [planView, setPlanView] = useState<'list' | 'gantt' | 'kanban'>('list'); // Sub-view for Plan
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [showTaskErrors, setShowTaskErrors] = useState(false);
  
  // Comment State
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Phase 1: Discovery State
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [newMeeting, setNewMeeting] = useState<Partial<Meeting>>({});
  const [showMeetingErrors, setShowMeetingErrors] = useState(false);

  // Documents State
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState<{name: string, sharedWith: Role[]}>({ name: '', sharedWith: [] });
  const [showDocErrors, setShowDocErrors] = useState(false);

  // Financials State
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [newTransaction, setNewTransaction] = useState<Partial<FinancialRecord>>({
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      status: 'pending',
      amount: undefined
  });
  const [showTransactionErrors, setShowTransactionErrors] = useState(false);

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [editingTask?.comments]);

  // If Vendor, default to 'plan' tab if they try to access others, or initial load
  useEffect(() => {
    if (user?.role === Role.VENDOR && (activeTab === 'discovery' || activeTab === 'timeline' || activeTab === 'financials')) {
        setActiveTab('plan');
    }
  }, [user?.role, activeTab]);

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

  // --- Helper: Notifications ---
  const notifyStakeholders = (title: string, message: string, excludeUserId?: string) => {
      // Find all Admins
      const admins = users.filter(u => u.role === Role.ADMIN);
      // Find Lead Designer
      const designer = users.find(u => u.id === project.leadDesignerId);
      
      const recipients = [...admins, designer].filter((u): u is User => !!u && u.id !== excludeUserId);
      const uniqueRecipients = Array.from(new Set(recipients.map(u => u.id)));
      
      uniqueRecipients.forEach(id => {
          addNotification(title, message, 'info', id, project.id);
      });
  };

  const notifyUser = (userId: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      if (userId && userId !== user.id) {
          addNotification(title, message, type, userId, project.id);
      }
  };

  // --- Helper: Activity Log ---
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

  // --- Helper: Status Logic ---
  const isTaskFrozen = (status?: TaskStatus) => {
    return status === TaskStatus.ABORTED || status === TaskStatus.ON_HOLD;
  };

  const isTaskBlocked = (task: Partial<Task>) => {
    // If frozen, it's effectively blocked from interaction
    if (isTaskFrozen(task.status)) return true;

    if (!task.dependencies || task.dependencies.length === 0) return false;
    const parentTasks = project.tasks.filter(t => task.dependencies?.includes(t.id));
    // Blocked if ANY parent is NOT Done
    return parentTasks.some(t => t.status !== TaskStatus.DONE);
  };

  const getBlockingTasks = (task: Partial<Task>) => {
    if (!task.dependencies) return [];
    return project.tasks.filter(t => task.dependencies?.includes(t.id) && t.status !== TaskStatus.DONE);
  };

  const getTaskProgress = (task: Task | Partial<Task>) => {
    if (!task.subtasks || task.subtasks.length === 0) {
      return task.status === TaskStatus.DONE ? 100 : 0;
    }
    const completed = task.subtasks.filter(s => s.isCompleted).length;
    return Math.round((completed / task.subtasks.length) * 100);
  };

  // Automated Status Derivation
  // Updated to consider approvals for DONE status
  const deriveStatus = (task: Task | Partial<Task>, currentStatus: TaskStatus = TaskStatus.TODO): TaskStatus => {
     // If locked by Admin, don't auto-change
     if (currentStatus === TaskStatus.ABORTED || currentStatus === TaskStatus.ON_HOLD) {
         return currentStatus;
     }

     const subtasks = task.subtasks || [];
     if (subtasks.length === 0) {
         // If no subtasks, rely on current status (buttons trigger changes)
         // But ensure we don't regress from Done unless intended
         return currentStatus;
     }

     const completedCount = subtasks.filter(s => s.isCompleted).length;
     
     if (completedCount === 0) return TaskStatus.TODO;
     
     if (completedCount === subtasks.length) {
         // Check Approvals
         const clientApproved = task.approvals?.completion?.client?.status === 'approved';
         const designerApproved = task.approvals?.completion?.designer?.status === 'approved';
         
         if (clientApproved && designerApproved) {
             return TaskStatus.DONE;
         }
         return TaskStatus.REVIEW; // Needs approval to go to DONE
     }
     
     return TaskStatus.IN_PROGRESS;
  };

  const getInputClass = (isError: boolean, disabled: boolean = false) => `
    w-full p-2 border rounded-lg transition-all focus:outline-none placeholder-gray-400
    ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-900'}
    ${isError ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

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
      addNotification('Tasks Generated', 'AI successfully created initial project tasks.', 'success');
    }
    setIsGenerating(false);
  };

  const handleAddMeeting = () => {
    if (!newMeeting.title || !newMeeting.date) {
      setShowMeetingErrors(true);
      addNotification('Validation Error', 'Title and Date are required for meetings.', 'error');
      return;
    }
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
    setShowMeetingErrors(false);
  };

  const handleUploadDocument = () => {
      if (!newDoc.name) {
        setShowDocErrors(true);
        addNotification('Validation Error', 'Document name is required.', 'error');
        return;
      }
      const doc: ProjectDocument = {
          id: Math.random().toString(36).substr(2,9),
          name: newDoc.name,
          type: 'image', // Mock default
          url: `https://picsum.photos/seed/${newDoc.name}/800/600`,
          uploadedBy: user.id,
          uploadDate: new Date().toISOString(),
          sharedWith: newDoc.sharedWith.length > 0 ? newDoc.sharedWith : [Role.ADMIN, Role.DESIGNER, Role.CLIENT]
      };
      
      const log = logActivity('Document Uploaded', `Uploaded ${doc.name}`);
      onUpdateProject({
          ...project,
          documents: [...(project.documents || []), doc],
          activityLog: [log, ...(project.activityLog || [])]
      });
      setIsDocModalOpen(false);
      setNewDoc({ name: '', sharedWith: [] });
      setShowDocErrors(false);
  };

  const handleAddTransaction = () => {
     if (!newTransaction.amount || !newTransaction.description || !newTransaction.category || !newTransaction.date) {
        setShowTransactionErrors(true);
        addNotification("Validation Error", "Please fill all required fields", "error");
        return;
     }

     const record: FinancialRecord = {
        id: Math.random().toString(36).substr(2, 9),
        date: newTransaction.date,
        description: newTransaction.description,
        amount: Number(newTransaction.amount),
        type: newTransaction.type as 'income' | 'expense',
        status: newTransaction.status as any,
        category: newTransaction.category
     };
     
     const log = logActivity('Financial', `Added ${record.type}: $${record.amount} for ${record.description}`);
     onUpdateProject({
        ...project,
        financials: [...project.financials, record],
        activityLog: [log, ...(project.activityLog || [])]
     });
     
     setIsTransactionModalOpen(false);
     setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        status: 'pending',
        amount: undefined
     });
     setShowTransactionErrors(false);
     addNotification("Success", "Transaction recorded successfully", "success");
  };

  const handleDependencyChange = (dependencyId: string, isChecked: boolean) => {
     if (!editingTask || isTaskFrozen(editingTask.status)) return;
     let currentDeps = editingTask.dependencies || [];
     if (isChecked) {
        currentDeps = [...currentDeps, dependencyId];
     } else {
        currentDeps = currentDeps.filter(d => d !== dependencyId);
     }
     
     // Auto-update Start Date based on Dependencies
     let newStartDate = editingTask.startDate;
     if (currentDeps.length > 0) {
        const depTasks = project.tasks.filter(t => currentDeps.includes(t.id));
        const maxDueDate = depTasks.reduce((max, t) => {
           return new Date(t.dueDate) > new Date(max) ? t.dueDate : max;
        }, depTasks[0]?.dueDate || '');
        
        if (maxDueDate) {
           newStartDate = maxDueDate;
        }
     }

     setEditingTask({ ...editingTask, dependencies: currentDeps, startDate: newStartDate });
  };

  const handleSaveTask = () => {
    // Validation
    if (!editingTask?.title || !editingTask.startDate || !editingTask.dueDate) {
       setShowTaskErrors(true);
       addNotification('Validation Error', 'Please complete all required fields.', 'error');
       return;
    }

    if (isTaskFrozen(editingTask.status) && !isAdmin) {
       addNotification("Action Denied", "This task is frozen and cannot be modified.", "error");
       return;
    }
    
    // Default structure for new tasks
    const defaultApprovals = {
       start: { client: { status: 'pending' }, designer: { status: 'pending' } },
       completion: { client: { status: 'pending' }, designer: { status: 'pending' } }
    };

    // Calculate Status Automatically if not frozen by admin
    let finalStatus = editingTask.status || TaskStatus.TODO;
    if (!isTaskFrozen(finalStatus)) {
        finalStatus = deriveStatus(editingTask, finalStatus);
    }

    const taskData: Task = {
      id: editingTask.id || Math.random().toString(36).substr(2, 9),
      title: editingTask.title,
      description: editingTask.description,
      status: finalStatus,
      category: editingTask.category || 'General',
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
        addNotification("Dependency Error", "A task cannot depend on itself.", "error");
        return;
    }

    // Strict Dependency Check for Status Change
    if (taskData.status !== TaskStatus.TODO && !isTaskFrozen(taskData.status)) {
       const incompleteParents = getBlockingTasks(taskData);
       if (incompleteParents.length > 0) {
           addNotification("Blocked", `Cannot start task. Blocked by: ${incompleteParents.map(t => t.title).join(', ')}.`, "error");
           return;
       }
    }

    let updatedTasks = [...project.tasks];
    const index = updatedTasks.findIndex(t => t.id === taskData.id);
    let log: ActivityLog;

    const oldTask = project.tasks.find(t => t.id === taskData.id);

    if (index >= 0) {
      updatedTasks[index] = taskData;
      log = logActivity('Task Updated', `Updated task details for "${taskData.title}"`);
      
      // Notify Assignee if changed
      if (oldTask && oldTask.assigneeId !== taskData.assigneeId && taskData.assigneeId) {
          notifyUser(taskData.assigneeId, 'New Task Assignment', `You have been assigned to task '${taskData.title}' in ${project.name}`);
      }
    } else {
      updatedTasks.push(taskData);
      log = logActivity('Task Created', `Created new task "${taskData.title}"`, 'creation');
      // Notify Assignee
      if (taskData.assigneeId) {
          notifyUser(taskData.assigneeId, 'New Task Assignment', `You have been assigned to task '${taskData.title}' in ${project.name}`);
      }
    }

    onUpdateProject({ 
      ...project, 
      tasks: updatedTasks,
      activityLog: [log, ...(project.activityLog || [])]
    });
    addNotification('Task Saved', `Task "${taskData.title}" has been saved.`, 'success');
    setIsTaskModalOpen(false);
    setEditingTask(null);
    setShowTaskErrors(false);
  };

  const handleKanbanStatusUpdate = (taskId: string, newStatus: TaskStatus) => {
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (isTaskFrozen(task.status)) {
        addNotification("Action Blocked", "Task is frozen (Aborted or On Hold).", "error");
        return;
    }

    // STRICT: Check Approvals before DONE
    if (newStatus === TaskStatus.DONE) {
         const clientApproved = task.approvals?.completion?.client?.status === 'approved';
         const designerApproved = task.approvals?.completion?.designer?.status === 'approved';
         
         if (!clientApproved || !designerApproved) {
             addNotification('Approval Required', 'Both Client and Designer must approve completion before marking as Done.', 'warning');
             return;
         }
    }

    // Check Dependencies for ANY status that implies progress (Anything other than TODO)
    if (newStatus !== TaskStatus.TODO && !isTaskFrozen(newStatus)) {
      const incompleteParents = getBlockingTasks(task);
      if (incompleteParents.length > 0) {
        const names = incompleteParents.map(t => t.title).join(', ');
        addNotification('Action Blocked', `Waiting for dependencies: ${names}`, 'error');
        return;
      }
    }

    const updatedTasks = project.tasks.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    
    const log = logActivity('Status Changed', `Task "${task.title}" moved to ${newStatus}`);
    
    // NOTIFICATION LOGIC
    if (newStatus === TaskStatus.DONE && user.role === Role.VENDOR) {
        notifyStakeholders('Task Completed', `${user.name} marked '${task.title}' as Done.`, user.id);
    } else if (newStatus === TaskStatus.REVIEW && user.role === Role.VENDOR) {
        notifyStakeholders('Review Request', `${user.name} submitted '${task.title}' for review.`, user.id);
    }

    onUpdateProject({
      ...project,
      tasks: updatedTasks,
      activityLog: [log, ...(project.activityLog || [])]
    });
  };

  const handleKanbanPriorityUpdate = (taskId: string, newPriority: 'low' | 'medium' | 'high') => {
      const task = project.tasks.find(t => t.id === taskId);
      if (task && isTaskFrozen(task.status)) return; // Prevent priority change if frozen

      const updatedTasks = project.tasks.map(t => 
        t.id === taskId ? { ...t, priority: newPriority } : t
      );
      onUpdateProject({ ...project, tasks: updatedTasks });
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (isTaskFrozen(task.status)) {
      addNotification("Frozen", "Task is frozen. Cannot update checklist.", "error");
      return;
    }

    if (isTaskBlocked(task)) {
      addNotification('Locked', "Cannot check off items. This task is blocked by pending dependencies.", 'warning');
      return;
    }

    const updatedSubtasks = task.subtasks.map(st => st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st);
    
    // Derive new Status from checklist
    const updatedTaskPreview = { ...task, subtasks: updatedSubtasks };
    const newStatus = deriveStatus(updatedTaskPreview, task.status);

    const updatedTasks = project.tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: updatedSubtasks,
          status: newStatus
        };
      }
      return t;
    });
    
    // Notification if status changed automatically
    if (newStatus !== task.status && newStatus === TaskStatus.REVIEW && user.role === Role.VENDOR) {
       notifyStakeholders('Task Ready for Review', `All items checked for '${task.title}' by ${user.name}`, user.id);
    }

    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  const handleQuickComplete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (isTaskFrozen(task.status)) return;

    if (isTaskBlocked(task) && task.status !== TaskStatus.DONE) {
      addNotification('Locked', "Cannot complete task. Dependencies pending.", 'error');
      return;
    }
    
    // Toggle Status based on simple flow IF NO CHECKLIST
    // If checklist exists, logic is driven by toggles mostly, but we allow manual "Submit for Review"
    let newStatus = task.status;
    
    if (task.subtasks.length === 0) {
        if (task.status === TaskStatus.TODO) newStatus = TaskStatus.IN_PROGRESS;
        else if (task.status === TaskStatus.IN_PROGRESS) newStatus = TaskStatus.REVIEW;
        else if (task.status === TaskStatus.REVIEW) {
             // Check Approvals before DONE
             const clientApproved = task.approvals?.completion?.client?.status === 'approved';
             const designerApproved = task.approvals?.completion?.designer?.status === 'approved';
             if (clientApproved && designerApproved) {
                 newStatus = TaskStatus.DONE;
             } else {
                 addNotification('Approval Required', 'Wait for Client and Designer approvals.', 'warning');
                 return;
             }
        }
        else if (task.status === TaskStatus.DONE) newStatus = TaskStatus.IN_PROGRESS; 
    } else {
        // If has checklist, button acts as "Submit for Review" if all done
        const allDone = task.subtasks.every(s => s.isCompleted);
        if (allDone && task.status === TaskStatus.IN_PROGRESS) newStatus = TaskStatus.REVIEW;
        else if (task.status === TaskStatus.REVIEW) {
             addNotification('Pending', 'Task is under review. Approvals needed.', 'info');
             return;
        }
    }
    
    handleKanbanStatusUpdate(task.id, newStatus);
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !editingTask) return;
    if (isTaskFrozen(editingTask.status)) {
        addNotification("Frozen", "Cannot comment on frozen tasks.", "error");
        return;
    }
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
    if (isTaskFrozen(editingTask.status)) return;
    
    const roleKey = (user.role === Role.CLIENT) ? 'client' : (user.role === Role.ADMIN || user.role === Role.DESIGNER) ? 'designer' : null;
    if (!roleKey) return;

    const newStatus: ApprovalStatus = action === 'approve' ? 'approved' : 'rejected';

    let updatedApprovals = {
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

    let updatedTaskStatus = editingTask.status;

    // Handle Rejection Logic
    if (action === 'reject') {
      updatedTaskStatus = stage === 'start' ? TaskStatus.TODO : TaskStatus.IN_PROGRESS;
      addNotification('Task Rejected', "Status has been reset. Please review comments.", 'warning');
      
      // Notify Assignee
      if (editingTask.assigneeId) {
          notifyUser(editingTask.assigneeId, 'Work Rejected', `${user.name} rejected ${stage} approval for '${editingTask.title}'. Please review notes.`, 'warning');
      }

    } else {
        // Check if both Approved for Completion, then set to DONE
        if (stage === 'completion') {
             const clientApproved = updatedApprovals.completion.client.status === 'approved';
             const designerApproved = updatedApprovals.completion.designer.status === 'approved';
             
             if (clientApproved && designerApproved) {
                 updatedTaskStatus = TaskStatus.DONE;
                 addNotification('Task Approved', "Task fully approved and marked as DONE.", 'success');
                 if (editingTask.assigneeId) {
                     notifyUser(editingTask.assigneeId, 'Work Approved', `Great job! '${editingTask.title}' is officially approved and done.`, 'success');
                 }
             } else {
                 addNotification('Approved', `Task completion approved by ${roleKey}. Waiting for others.`, 'success');
             }
        } else {
            addNotification('Approved', `Task ${stage} approved.`, 'success');
        }
    }

    setEditingTask({ 
      ...editingTask, 
      approvals: updatedApprovals,
      status: updatedTaskStatus
    });
  };

  const calculateFinancials = () => {
    // Calculate based on transaction STATUS
    const received = project.financials
        .filter(f => f.type === 'income' && f.status === 'paid')
        .reduce((sum, f) => sum + f.amount, 0);
    
    const pendingIncome = project.financials
        .filter(f => f.type === 'income' && (f.status === 'pending' || f.status === 'overdue'))
        .reduce((sum, f) => sum + f.amount, 0);

    const paidOut = project.financials
        .filter(f => f.type === 'expense' && f.status === 'paid')
        .reduce((sum, f) => sum + f.amount, 0);
        
    const pendingExpenses = project.financials
        .filter(f => f.type === 'expense' && (f.status === 'pending' || f.status === 'overdue'))
        .reduce((sum, f) => sum + f.amount, 0);

    return { received, pendingIncome, paidOut, pendingExpenses };
  };

  const { received, pendingIncome, paidOut, pendingExpenses } = calculateFinancials();

  // Helper sort function based on CATEGORY_ORDER
  const getCategorySortIndex = (cat: string) => {
    const index = CATEGORY_ORDER.indexOf(cat);
    return index === -1 ? 999 : index; // Unknown categories go to end
  };

  // --- DSA: Topological Sort for Gantt ---
  const ganttConfig = useMemo(() => {
    if (project.tasks.length === 0) return null;
    
    const dates = project.tasks.flatMap(t => [new Date(t.startDate).getTime(), new Date(t.dueDate).getTime()]);
    dates.push(new Date(project.startDate).getTime());
    dates.push(new Date(project.deadline).getTime());
    
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    
    const totalDuration = maxDate - minDate;
    const dayMs = 1000 * 60 * 60 * 24;
    const totalDays = Math.ceil(totalDuration / dayMs) + 5;

    return { minDate, maxDate, totalDays, dayMs };
  }, [project]);

  const ganttTasksWithPos = useMemo(() => {
    if (!ganttConfig) return [];
    
    // Group tasks by category
    const grouped = project.tasks.reduce((acc, task) => {
      acc[task.category] = acc[task.category] || [];
      acc[task.category].push(task);
      return acc;
    }, {} as Record<string, Task[]>);

    // Flatten back to array but keep grouped order based on Defined Sequence
    const sortedTasks: Task[] = [];
    
    const sortedCategories = Object.keys(grouped).sort((a, b) => getCategorySortIndex(a) - getCategorySortIndex(b));

    sortedCategories.forEach(cat => {
       const catTasks = grouped[cat].sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
       sortedTasks.push(...catTasks);
    });

    return sortedTasks.map((task, index) => {
        const start = new Date(task.startDate).getTime();
        const end = new Date(task.dueDate).getTime();
        const totalSpan = ganttConfig.maxDate - ganttConfig.minDate;
        
        const left = ((start - ganttConfig.minDate) / totalSpan) * 100;
        const width = ((end - start) / totalSpan) * 100;
        return { ...task, left, width: Math.max(width, 0.5), index };
    });
  }, [project.tasks, ganttConfig]);

  const assignedVendors = useMemo(() => {
      const vendorIds = new Set(project.tasks.map(t => t.assigneeId));
      return users.filter(u => u.role === Role.VENDOR && vendorIds.has(u.id));
  }, [project.tasks, users]);

  // Group Vendors by Specialty
  const vendorsByCategory = useMemo(() => {
      const groups: Record<string, User[]> = {};
      assignedVendors.forEach(v => {
          const category = v.specialty || 'General';
          if (!groups[category]) {
              groups[category] = [];
          }
          groups[category].push(v);
      });
      return groups;
  }, [assignedVendors]);

  // Sort vendor categories by standard order
  const sortedVendorCategories = useMemo(() => {
    return Object.keys(vendorsByCategory).sort((a, b) => getCategorySortIndex(a) - getCategorySortIndex(b));
  }, [vendorsByCategory]);

  // Derived state for Task Modal
  const isEditingFrozen = editingTask ? isTaskFrozen(editingTask.status) : false;

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {/* ... (Header and Tabs code remains unchanged until activeTab === 'plan') ... */}
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
                if(activeTab === 'plan') { setEditingTask({}); setIsTaskModalOpen(true); setShowTaskErrors(false); }
                if(activeTab === 'documents') setIsDocModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add {activeTab === 'discovery' ? 'Meeting' : activeTab === 'plan' ? 'Task' : activeTab === 'documents' ? 'Document' : 'Item'}
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 border-b border-gray-200 bg-white">
        <div className="flex gap-8">
          {[
            { id: 'discovery', label: '1. Discovery', icon: FileText, hidden: isVendor },
            { id: 'plan', label: '2. Plan', icon: Layout },
            { id: 'documents', label: 'Documents', icon: FileIcon },
            { id: 'financials', label: '3. Financials', icon: DollarSign, hidden: !canViewFinancials },
            { id: 'timeline', label: 'Timeline', icon: History, hidden: isVendor },
            { id: 'team', label: 'Team', icon: UserIcon }
          ].map((tab) => {
             if (tab.hidden) return null;
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
        {activeTab === 'discovery' && !isVendor && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* ... (Existing Discovery UI - No Changes) ... */}
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
            {/* ... (View Switcher and Views code - no structural changes, just ensure Category order is used from props/constants correctly) ... */}
             <div className="flex bg-white rounded-lg border border-gray-200 p-1 w-fit shadow-sm">
              {[
                { id: 'list', label: 'List View', icon: ListChecks },
                { id: 'kanban', label: 'Priority Board', icon: Layers },
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

            {/* KANBAN VIEW (Priorities) */}
            {planView === 'kanban' && (
              <div className="flex-1 overflow-x-auto min-h-[500px]">
                <KanbanBoard 
                  tasks={project.tasks} 
                  users={users} 
                  onUpdateTaskStatus={handleKanbanStatusUpdate}
                  onUpdateTaskPriority={handleKanbanPriorityUpdate}
                  onEditTask={(task) => { setEditingTask(task); setIsTaskModalOpen(true); setShowTaskErrors(false); }}
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
                     <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400"></span> Conflict</div>
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-auto relative">
                   <div className="min-w-[1200px] p-6 relative">
                      {/* Grid Background */}
                      <div className="absolute inset-0 pointer-events-none pl-[30%] pt-[40px] pr-6 pb-6 flex">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="flex-1 border-r border-dashed border-gray-100 h-full"></div>
                        ))}
                      </div>

                      {/* Header */}
                      <div className="flex border-b border-gray-200 pb-2 mb-2 sticky top-0 bg-white z-20">
                        <div className="w-[30%] font-semibold text-sm text-gray-700 pl-2">Task Details</div>
                        <div className="w-[70%] flex justify-between text-xs text-gray-400 px-2 font-mono">
                           <span>{new Date(ganttConfig.minDate).toLocaleDateString()}</span>
                           <span>{new Date(ganttConfig.maxDate).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Timeline Area */}
                      <div className="relative mt-2">
                        {/* Dependency Lines Layer */}
                        <svg 
                            className="absolute top-0 right-0 w-[70%] h-full pointer-events-none z-0"
                            viewBox={`0 0 100 ${ganttTasksWithPos.length * ROW_HEIGHT}`}
                            preserveAspectRatio="none"
                        >
                            {ganttTasksWithPos.flatMap(task => 
                                task.dependencies.map(depId => {
                                    const parent = ganttTasksWithPos.find(t => t.id === depId);
                                    if (!parent) return null;
                                    
                                    const x1 = parent.left + parent.width; 
                                    const y1 = (parent.index * ROW_HEIGHT) + (ROW_HEIGHT / 2);
                                    const x2 = task.left; 
                                    const y2 = (task.index * ROW_HEIGHT) + (ROW_HEIGHT / 2);
                                    const isConflict = x1 > x2;

                                    const pathD = `M ${x1} ${y1} C ${x1 + 2} ${y1}, ${x2 - 2} ${y2}, ${x2} ${y2}`;

                                    return (
                                        <g key={`${parent.id}-${task.id}`}>
                                          <path 
                                              d={pathD}
                                              stroke={isConflict ? "#ef4444" : "#9CA3AF"} 
                                              strokeWidth={isConflict ? "2" : "1.5"}
                                              fill="none"
                                              vectorEffect="non-scaling-stroke"
                                              className={isConflict ? "opacity-80" : "opacity-30"}
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
                          {ganttTasksWithPos.map((task, idx) => {
                             const isNewCategory = idx === 0 || ganttTasksWithPos[idx - 1].category !== task.category;
                             const progress = getTaskProgress(task);
                             const frozen = isTaskFrozen(task.status);
                             
                             return (
                             <React.Fragment key={task.id}>
                               {isNewCategory && (
                                 <div className="bg-gray-100/50 px-2 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 w-full mb-1 mt-2">
                                   {task.category}
                                 </div>
                               )}
                               <div 
                                 className="flex items-center group hover:bg-gray-50/50 rounded"
                                 style={{ height: ROW_HEIGHT }}
                               >
                                 <div className="w-[30%] pr-4 pl-2 flex flex-col justify-center border-r border-transparent group-hover:border-gray-100">
                                   <div 
                                     onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); setShowTaskErrors(false); }}
                                     className="text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 flex items-center gap-2"
                                   >
                                     {task.title}
                                     {isTaskBlocked(task) && <Lock className="w-3 h-3 text-red-400" />}
                                     {frozen && <Ban className="w-3 h-3 text-red-600" />}
                                   </div>
                                   <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
                                     <span>{getAssigneeName(task.assigneeId)}</span>
                                     <span className="font-mono">{progress}%</span>
                                   </div>
                                 </div>
                                 <div className="w-[70%] relative h-6 rounded-md">
                                    <div 
                                      className={`absolute h-full rounded shadow-sm flex items-center px-2 cursor-pointer
                                        ${task.status === 'Done' ? 'bg-green-500 opacity-80' : 'bg-blue-500 opacity-80'}
                                        ${task.status === 'Review' ? 'bg-purple-500 opacity-80' : ''}
                                        ${task.status === 'Overdue' ? 'bg-red-500 opacity-80' : ''}
                                        ${isTaskBlocked(task) ? 'bg-gray-400 opacity-50' : ''}
                                        ${frozen ? 'bg-gray-800 opacity-70' : ''}
                                        hover:opacity-100 transition-opacity z-20
                                      `}
                                      style={{ left: `${task.left}%`, width: `${task.width}%` }}
                                      onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); setShowTaskErrors(false); }}
                                    >
                                      {/* Progress overlay in bar */}
                                      <div 
                                        className="absolute left-0 top-0 bottom-0 bg-white/20" 
                                        style={{ width: `${progress}%` }}
                                      ></div>
                                      <span className="relative text-[9px] text-white truncate font-medium w-full">{task.width > 10 ? task.title : ''}</span>
                                    </div>
                                 </div>
                               </div>
                             </React.Fragment>
                           )})}
                        </div>
                      </div>
                   </div>
                 </div>
              </div>
            )}

            {/* LIST VIEW (Legacy Grid) */}
            {planView === 'list' && (
              <div className="space-y-8">
                {/* Sort groups by defined Category Order */}
                {Object.entries(
                  project.tasks.reduce((acc, task) => {
                    acc[task.category] = acc[task.category] || [];
                    acc[task.category].push(task);
                    return acc;
                  }, {} as Record<string, Task[]>)
                )
                .sort((a, b) => getCategorySortIndex(a[0]) - getCategorySortIndex(b[0]))
                .map(([category, tasks]) => (
                  <div key={category}>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-1 flex items-center gap-2">
                       <Tag className="w-4 h-4" /> {category}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {tasks.map(task => {
                        const blocked = isTaskBlocked(task) && task.status !== TaskStatus.DONE;
                        const frozen = isTaskFrozen(task.status);
                        const progress = getTaskProgress(task);
                        const isMyTask = user.id === task.assigneeId;

                        return (
                        <div key={task.id} className={`bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all ${blocked || frozen ? 'opacity-75 bg-gray-50' : ''}`}>
                            <div className="flex justify-between items-start mb-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase
                                ${task.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                {task.priority}
                              </span>
                              <div className="flex items-center gap-2">
                                {frozen ? (
                                    <span title="Frozen by Admin" className="flex items-center gap-1 text-xs text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                        <Ban className="w-3 h-3" /> {task.status}
                                    </span>
                                ) : (
                                    <>
                                        {blocked && <span title="Blocked by dependency"><Lock className="w-4 h-4 text-red-400" /></span>}
                                        {/* Quick Complete Checkbox for Assignee - Only if NOT frozen */}
                                        {isMyTask && !blocked && !frozen && (
                                        <button 
                                            onClick={(e) => handleQuickComplete(e, task)} 
                                            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                                            ${task.status === TaskStatus.DONE ? 'bg-green-500 border-green-500' : 
                                                task.status === TaskStatus.REVIEW ? 'bg-purple-500 border-purple-500' : 'border-gray-300 hover:border-blue-500'}
                                            `}
                                            title="Advance Status"
                                        >
                                            {task.status === TaskStatus.DONE && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                                            {task.status === TaskStatus.REVIEW && <Clock className="w-3.5 h-3.5 text-white" />}
                                        </button>
                                        )}
                                        <button onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); setShowTaskErrors(false); }} className="text-xs text-gray-400 hover:text-gray-900 ml-2">View</button>
                                    </>
                                )}
                              </div>
                            </div>
                            <h4 className="font-bold text-gray-800 mb-1 cursor-pointer hover:text-blue-600" onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); setShowTaskErrors(false); }}>{task.title}</h4>
                            <p className="text-xs text-gray-500 mb-4">
                                {new Date(task.startDate).toLocaleDateString()} - {new Date(task.dueDate).toLocaleDateString()}
                            </p>
                            
                            {/* Progress Bar */}
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                              <div 
                                className={`h-1.5 rounded-full ${task.status === TaskStatus.DONE ? 'bg-green-500' : task.status === 'Review' ? 'bg-purple-500' : frozen ? 'bg-gray-500' : 'bg-blue-500'}`} 
                                style={{ width: `${progress}%` }} 
                              />
                            </div>

                            {/* Status Icons */}
                            <div className="flex gap-2 mb-3">
                              {task.status === TaskStatus.REVIEW && <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded">Under Review</span>}
                              {task.status === TaskStatus.OVERDUE && <span className="text-xs bg-red-100 text-red-700 px-1 rounded">Overdue</span>}
                              
                              {task.approvals.start.client.status === 'approved' && <span className="w-2 h-2 rounded-full bg-green-500" title="Client Start Approved"></span>}
                              {task.approvals.completion.client.status === 'approved' && <span className="w-2 h-2 rounded-full ring-2 ring-green-500 bg-white" title="Client End Approved"></span>}
                              {task.comments.length > 0 && <span className="flex items-center text-xs text-gray-400"><MessageSquare className="w-3 h-3 mr-1"/>{task.comments.length}</span>}
                            </div>

                            <div className="space-y-2 mb-4">
                              {task.subtasks.slice(0, 3).map(st => (
                                <div key={st.id} className="flex items-center gap-2 text-sm text-gray-600">
                                  <div 
                                    onClick={() => (canEditProject || isMyTask) && toggleSubtask(task.id, st.id)}
                                    className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center
                                    ${st.isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300'}
                                    ${blocked || frozen ? 'cursor-not-allowed opacity-50' : ''}`}
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
                      )})}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ... (Documents, Financials, Timeline, Team Tabs - No changes needed) ... */}
        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
           <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-lg font-bold text-gray-800">Project Documents</h3>
                    <p className="text-sm text-gray-500">Shared files, layouts, and contracts.</p>
                 </div>
                 {/* Filter Info */}
                 {!canEditProject && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Viewing as {user.role}</span>
                 )}
              </div>

              {/* Docs Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                 {/* Upload Button */}
                 {canEditProject && (
                   <button 
                     onClick={() => setIsDocModalOpen(true)}
                     className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-6 hover:bg-gray-50 hover:border-gray-400 transition-all text-gray-400 hover:text-gray-600 bg-white"
                   >
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-sm font-bold">Upload File</span>
                   </button>
                 )}

                 {/* Files */}
                 {(project.documents || [])
                    .filter(doc => doc.sharedWith.includes(user.role as any) || user.role === Role.ADMIN)
                    .map(doc => (
                    <div key={doc.id} className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                       <div className="h-32 bg-gray-100 flex items-center justify-center overflow-hidden">
                          {doc.type === 'image' ? (
                              <img src={doc.url} alt={doc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                              <FileText className="w-12 h-12 text-gray-400" />
                          )}
                       </div>
                       <div className="p-3">
                          <p className="text-sm font-bold text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                          <div className="flex justify-between items-center mt-2">
                             <span className="text-xs text-gray-400">{new Date(doc.uploadDate).toLocaleDateString()}</span>
                             <img src={getAssigneeAvatar(doc.uploadedBy)} className="w-5 h-5 rounded-full" title="Uploaded by" alt=""/>
                          </div>
                          <div className="mt-2 flex gap-1">
                             {doc.sharedWith.map(role => (
                                <span key={role} className="text-[9px] uppercase bg-gray-100 text-gray-500 px-1 rounded">{role.substr(0,1)}</span>
                             ))}
                          </div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* PHASE 3: FINANCIALS */}
        {activeTab === 'financials' && canViewFinancials && (
          <div className="max-w-4xl mx-auto space-y-8">
            <h3 className="text-lg font-bold text-gray-800">Phase 3: Financial Management</h3>
            
            <div className="grid grid-cols-2 gap-6">
               <div className="bg-green-50 p-6 rounded-xl border border-green-100 relative overflow-hidden">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-green-800">Total Received (Client)</p>
                    <ArrowRight className="w-5 h-5 text-green-300" />
                 </div>
                 <h3 className="text-3xl font-bold text-green-700">${received.toLocaleString()}</h3>
                 <p className="text-xs text-green-600 mt-1 font-medium">Pending Invoices: ${pendingIncome.toLocaleString()}</p>
                 {/* Budget Progress Indicator */}
                 <div className="mt-4 pt-4 border-t border-green-200/50">
                     <div className="flex justify-between text-[10px] text-green-800 mb-1 uppercase font-bold">
                        <span>Budget Collected</span>
                        <span>{Math.round((received / project.budget) * 100)}%</span>
                     </div>
                     <div className="w-full bg-green-200 h-1.5 rounded-full">
                        <div className="bg-green-600 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${Math.min((received/project.budget)*100, 100)}%` }}></div>
                     </div>
                  </div>
               </div>
               
               <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-red-800">Total Paid Out (Vendors)</p>
                    <ArrowRight className="w-5 h-5 text-red-300" />
                 </div>
                 <h3 className="text-3xl font-bold text-red-700">${paidOut.toLocaleString()}</h3>
                 <p className="text-xs text-red-600 mt-1 font-medium">Pending Bills: ${pendingExpenses.toLocaleString()}</p>
                 <div className="mt-4 pt-4 border-t border-red-200/50">
                     <p className="text-xs text-red-500">
                        Tracks cash outflow to vendors and material suppliers.
                     </p>
                 </div>
               </div>
            </div>
            {/* ... Transaction Table ... */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800">Transaction Ledger</h3>
                    <div className="flex gap-2">
                    <button className="text-xs bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 text-gray-700">Filter</button>
                    {canEditProject && (
                        <button 
                            onClick={() => setIsTransactionModalOpen(true)}
                            className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-800 font-bold"
                        >
                            New Entry
                        </button>
                    )}
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
                    {project.financials.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center py-6 text-gray-400">No transactions recorded.</td>
                        </tr>
                    )}
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
                            ${fin.status === 'paid' ? 'bg-green-100 text-green-700' : 
                              fin.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
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
        {activeTab === 'timeline' && !isVendor && (
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
                  <div className="flex items-center gap-4 border-b border-gray-50 pb-2">
                     <img src={getAssigneeAvatar(project.clientId)} className="w-12 h-12 rounded-full" alt="" />
                     <div>
                        <p className="font-bold text-gray-900">{getAssigneeName(project.clientId)}</p>
                        <p className="text-xs text-gray-500">Client</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-4 border-b border-gray-50 pb-2">
                     <img src={getAssigneeAvatar(project.leadDesignerId)} className="w-12 h-12 rounded-full" alt="" />
                     <div>
                        <p className="font-bold text-gray-900">{getAssigneeName(project.leadDesignerId)}</p>
                        <p className="text-xs text-gray-500">Lead Designer</p>
                     </div>
                  </div>
                  
                  {sortedVendorCategories.length > 0 && (
                     <>
                        <div className="pt-4 space-y-6">
                            {sortedVendorCategories.map(category => (
                                <div key={category}>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-1 flex items-center gap-2">
                                        <Tag className="w-3 h-3"/> {category}
                                    </h4>
                                    <div className="grid grid-cols-1 gap-3">
                                        {vendorsByCategory[category].map(v => (
                                            <div key={v.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                                                <img src={v.avatar} className="w-10 h-10 rounded-full border border-gray-200" alt="" />
                                                <div>
                                                    <p className="font-bold text-gray-800 text-sm">{v.name}</p>
                                                    <p className="text-xs text-gray-500">{v.company || 'Independent'}</p>
                                                </div>
                                                <div className="ml-auto">
                                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                                                        {project.tasks.filter(t => t.assigneeId === v.id).length} Tasks
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                     </>
                  )}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* ... (Modals remain unchanged) ... */}
      {/* Financial Transaction Modal */}
      {isTransactionModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           {/* ... (Same as before) ... */}
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
              <h3 className="text-lg font-bold mb-4 text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5"/> Record Transaction
              </h3>
              <div className="space-y-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Amount <span className="text-red-500">*</span></label>
                    <div className="relative mt-1">
                        <span className="absolute left-3 top-2 text-gray-400">$</span>
                        <input 
                            type="number" 
                            className={`${getInputClass(showTransactionErrors && !newTransaction.amount)} pl-7`}
                            placeholder="0.00"
                            value={newTransaction.amount || ''} 
                            onChange={e => setNewTransaction({...newTransaction, amount: parseFloat(e.target.value)})}
                        />
                    </div>
                 </div>

                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Description <span className="text-red-500">*</span></label>
                    <input 
                        type="text" 
                        className={`${getInputClass(showTransactionErrors && !newTransaction.description)} mt-1`}
                        placeholder="e.g. Initial Deposit, Paint Supplies"
                        value={newTransaction.description || ''} 
                        onChange={e => setNewTransaction({...newTransaction, description: e.target.value})}
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                        <div className="flex gap-2 mt-1">
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, type: 'income'})}
                                className={`flex-1 py-2 text-sm font-bold rounded ${newTransaction.type === 'income' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-gray-50 text-gray-500'}`}
                            >Income</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                                className={`flex-1 py-2 text-sm font-bold rounded ${newTransaction.type === 'expense' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-gray-50 text-gray-500'}`}
                            >Expense</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                        <input 
                            type="date" 
                            className={`${getInputClass(showTransactionErrors && !newTransaction.date)} mt-1`}
                            value={newTransaction.date}
                            onChange={e => setNewTransaction({...newTransaction, date: e.target.value})}
                        />
                    </div>
                 </div>

                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                    <select 
                        className={`${getInputClass(showTransactionErrors && !newTransaction.category)} mt-1`}
                        value={newTransaction.category || ''}
                        onChange={e => setNewTransaction({...newTransaction, category: e.target.value})}
                    >
                        <option value="">Select Category...</option>
                        {newTransaction.type === 'income' ? (
                            <>
                                <option value="Retainer">Retainer</option>
                                <option value="Milestone 1">Milestone 1</option>
                                <option value="Milestone 2">Milestone 2</option>
                                <option value="Final Payment">Final Payment</option>
                                <option value="Reimbursement">Reimbursement</option>
                            </>
                        ) : (
                            <>
                                <option value="Materials">Materials</option>
                                <option value="Labor">Labor</option>
                                <option value="Permits/Fees">Permits/Fees</option>
                                <option value="Furniture">Furniture</option>
                                <option value="Misc">Misc</option>
                            </>
                        )}
                    </select>
                 </div>

                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                    <select 
                        className={`${getInputClass(false)} mt-1`}
                        value={newTransaction.status}
                        onChange={e => setNewTransaction({...newTransaction, status: e.target.value as any})}
                    >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                    </select>
                 </div>

                 <div className="pt-2 flex gap-3">
                    <button onClick={() => setIsTransactionModalOpen(false)} className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={handleAddTransaction} className="flex-1 py-2 bg-gray-900 text-white rounded font-bold hover:bg-gray-800">Add Entry</button>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Document Upload Modal (Same as before) */}
      {isDocModalOpen && createPortal(
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
               <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900"><Upload className="w-5 h-5"/> Upload Document</h3>
               <div className="space-y-4">
                  <input 
                    type="text" placeholder="File Name (e.g. FloorPlan.pdf)" 
                    className={getInputClass(showDocErrors && !newDoc.name)}
                    value={newDoc.name} onChange={e => setNewDoc({...newDoc, name: e.target.value})}
                  />
                  {/* ... rest of doc modal ... */}
                  <div>
                     <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Share With:</label>
                     <div className="space-y-2">
                        {[Role.CLIENT, Role.VENDOR, Role.DESIGNER].map(role => (
                           <label key={role} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                              <input 
                                type="checkbox" 
                                checked={newDoc.sharedWith.includes(role)}
                                onChange={e => {
                                   if (e.target.checked) setNewDoc({...newDoc, sharedWith: [...newDoc.sharedWith, role]});
                                   else setNewDoc({...newDoc, sharedWith: newDoc.sharedWith.filter(r => r !== role)});
                                }}
                              />
                              <span className="capitalize text-gray-800">{role}</span>
                           </label>
                        ))}
                     </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-300 text-center text-sm text-gray-500">
                     <p>Drag and drop file here (Mock)</p>
                  </div>

                  <div className="flex gap-2 pt-2">
                     <button onClick={() => setIsDocModalOpen(false)} className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                     <button onClick={handleUploadDocument} className="flex-1 py-2 bg-gray-900 text-white rounded font-bold hover:bg-gray-800">Upload</button>
                  </div>
               </div>
            </div>
         </div>,
         document.body
      )}

      {/* Meeting Modal (Same as before) */}
      {isMeetingModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-fade-in">
              <h3 className="text-lg font-bold mb-4 text-gray-900">Log New Meeting</h3>
              <div className="space-y-4">
                 <input 
                   type="text" placeholder="Meeting Title" 
                   className={getInputClass(showMeetingErrors && !newMeeting.title)}
                   value={newMeeting.title || ''} onChange={e => setNewMeeting({...newMeeting, title: e.target.value})}
                 />
                 <input 
                   type="date" 
                   className={getInputClass(showMeetingErrors && !newMeeting.date)}
                   value={newMeeting.date || ''} onChange={e => setNewMeeting({...newMeeting, date: e.target.value})}
                 />
                 <select 
                   className={getInputClass(false)}
                   value={newMeeting.type || 'Discovery'} onChange={e => setNewMeeting({...newMeeting, type: e.target.value as any})}
                 >
                   <option>Discovery</option>
                   <option>Site Visit</option>
                   <option>Progress</option>
                   <option>Vendor Meet</option>
                 </select>
                 <textarea 
                   placeholder="Meeting Notes..." className="w-full p-2 border rounded h-32 bg-white text-gray-900 border-gray-300"
                   value={newMeeting.notes || ''} onChange={e => setNewMeeting({...newMeeting, notes: e.target.value})}
                 />
                 <button onClick={handleAddMeeting} className="w-full bg-gray-900 text-white py-2 rounded font-bold">Save Meeting Record</button>
                 <button onClick={() => setIsMeetingModalOpen(false)} className="w-full text-gray-500 py-2">Cancel</button>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Task/Gantt Modal (Same as before) */}
      {isTaskModalOpen && editingTask && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           {/* ... Task Modal Logic ... */}
           <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col animate-fade-in overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                   <h3 className="text-lg font-bold text-gray-900">{editingTask.id ? 'Edit Task Details' : 'Create New Task'}</h3>
                   {editingTask.id && <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">ID: {editingTask.id}</span>}
                </div>
                <button onClick={() => setIsTaskModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X/></button>
              </div>

              {/* Dependency Warning */}
              {isTaskBlocked(editingTask) && (
                 <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-bold">Dependency Locked:</span>
                    <span>This task is blocked by pending dependencies: {getBlockingTasks(editingTask).map(t => t.title).join(', ')}.</span>
                 </div>
              )}

              {/* Frozen Warning */}
              {isEditingFrozen && (
                  <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between shadow-md">
                      <div className="flex items-center gap-2">
                        <Ban className="w-5 h-5 text-red-400" />
                        <span className="font-bold uppercase tracking-wide">Task Frozen: {editingTask.status}</span>
                      </div>
                      <span className="text-xs opacity-70">Interaction disabled by Admin.</span>
                  </div>
              )}

              {/* Modal Body: Split View */}
              <div className={`flex-1 flex overflow-hidden ${isEditingFrozen ? 'pointer-events-none opacity-80 bg-gray-50' : ''}`}>
                 
                 {/* LEFT: Task Info Form */}
                 <div className="w-1/2 p-6 overflow-y-auto border-r border-gray-100 bg-white">
                    <div className="space-y-4">
                       {/* ADMIN ACTIONS */}
                       {isAdmin && (
                           <div className="bg-gray-900 p-3 rounded-lg pointer-events-auto">
                               <p className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1"><Shield className="w-3 h-3"/> Admin Actions</p>
                               <div className="flex gap-2">
                                   {editingTask.status !== TaskStatus.ON_HOLD && (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: TaskStatus.ON_HOLD})}
                                           className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <PauseCircle className="w-3 h-3"/> Put On Hold
                                       </button>
                                   )}
                                   {editingTask.status === TaskStatus.ON_HOLD && (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, editingTask.status)})}
                                           className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <PlayCircle className="w-3 h-3"/> Resume Task
                                       </button>
                                   )}

                                   {editingTask.status !== TaskStatus.ABORTED && (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: TaskStatus.ABORTED})}
                                           className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <Ban className="w-3 h-3"/> Abort Task
                                       </button>
                                   )}
                                   {editingTask.status === TaskStatus.ABORTED && (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, editingTask.status)})}
                                           className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <History className="w-3 h-3"/> Restore
                                       </button>
                                   )}
                               </div>
                           </div>
                       )}

                       <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Title <span className="text-red-500">*</span></label>
                          {canEditProject ? (
                            <input 
                              type="text" 
                              className={`${getInputClass(showTaskErrors && !editingTask.title, isEditingFrozen)} font-semibold mt-1`}
                              value={editingTask.title || ''} onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                              disabled={isEditingFrozen}
                            />
                          ) : (
                            <p className="font-bold text-gray-800 mt-1">{editingTask.title}</p>
                          )}
                       </div>

                       <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                          {canEditProject ? (
                            <select 
                              className={`${getInputClass(false, isEditingFrozen)} mt-1`}
                              value={editingTask.category || 'General'} onChange={e => setEditingTask({...editingTask, category: e.target.value})}
                              disabled={isEditingFrozen}
                            >
                              {CATEGORY_ORDER.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          ) : (
                             <span className="block mt-1 text-sm bg-gray-100 w-fit px-2 py-1 rounded text-gray-800">{editingTask.category || 'General'}</span>
                          )}
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Start Date <span className="text-red-500">*</span></label>
                            {canEditProject ? (
                               <input 
                                  type="date" 
                                  className={`${getInputClass(showTaskErrors && !editingTask.startDate, isEditingFrozen)} mt-1`} 
                                  value={editingTask.startDate || ''} 
                                  onChange={e => setEditingTask({...editingTask, startDate: e.target.value})} 
                                  disabled={isEditingFrozen}
                               />
                            ) : <p className="text-sm mt-1 text-gray-800">{editingTask.startDate}</p>}
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Due Date <span className="text-red-500">*</span></label>
                            {canEditProject ? (
                               <input 
                                  type="date" 
                                  className={`${getInputClass(showTaskErrors && !editingTask.dueDate, isEditingFrozen)} mt-1`} 
                                  value={editingTask.dueDate || ''} 
                                  onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} 
                                  disabled={isEditingFrozen}
                               />
                            ) : <p className="text-sm mt-1 text-gray-800">{editingTask.dueDate}</p>}
                          </div>
                       </div>

                        {/* Dependencies Selection */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                             <Link2 className="w-3 h-3 text-gray-400" />
                             <label className="text-xs font-bold text-gray-500 uppercase">Dependencies</label>
                          </div>
                          {canEditProject ? (
                            <div className={`mt-1 p-2 border rounded max-h-24 overflow-y-auto bg-white border-gray-200 ${isEditingFrozen ? 'opacity-50' : ''}`}>
                              {project.tasks.filter(t => t.id !== editingTask.id).length > 0 ? (
                                  project.tasks.filter(t => t.id !== editingTask.id).map(t => (
                                    <label key={t.id} className="flex items-center gap-2 mb-1 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={(editingTask.dependencies || []).includes(t.id)}
                                            onChange={(e) => handleDependencyChange(t.id, e.target.checked)}
                                            disabled={isEditingFrozen}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 truncate">{t.title}</span>
                                        <span className="text-xs text-gray-400 ml-auto">Ends: {t.dueDate}</span>
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
                                            {t.status !== TaskStatus.DONE && <span className="text-red-500 font-bold ml-1">(Pending)</span>}
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
                                 className={`${getInputClass(false, isEditingFrozen)} flex-1`}
                                 value={editingTask.assigneeId || ''} onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})}
                                 disabled={isEditingFrozen}
                               >
                                  <option value="">Unassigned</option>
                                  {users.filter(u => u.role === Role.DESIGNER || u.role === Role.VENDOR).map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                               </select>
                             ) : <p className="flex-1 text-sm bg-gray-50 p-2 rounded text-gray-800">{getAssigneeName(editingTask.assigneeId || '')}</p>}

                             {canEditProject ? (
                               <select 
                                 className={`w-32 p-2 border rounded border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 ${isEditingFrozen ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                                 value={editingTask.priority || 'medium'} onChange={e => setEditingTask({...editingTask, priority: e.target.value as any})}
                                 disabled={isEditingFrozen}
                               >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                               </select>
                             ) : <span className="p-2 border rounded bg-gray-50 uppercase text-xs font-bold flex items-center text-gray-800">{editingTask.priority}</span>}
                          </div>
                       </div>
                       
                       {/* Status Display - Removed generic dropdown */}
                       <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Current Status</label>
                          <div className={`mt-1 w-full p-2 border rounded bg-gray-50 text-gray-700 font-bold flex justify-between items-center ${isEditingFrozen ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                              <span>{editingTask.status || TaskStatus.TODO}</span>
                              <span className="text-xs font-normal text-gray-400 italic">
                                  {isEditingFrozen ? 'Frozen by Admin' : 'Auto-updated via progress'}
                              </span>
                          </div>
                       </div>

                       {/* Subtasks */}
                       <div className="pt-4 border-t border-gray-100">
                         <div className="flex justify-between items-center mb-2">
                           <label className="text-xs font-bold text-gray-700 uppercase">Checklist</label>
                           {canEditProject && !isEditingFrozen && (
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
                                   disabled={(!canEditProject && user.id !== editingTask.assigneeId) || isTaskBlocked(editingTask) || isEditingFrozen}
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
                                      disabled={isEditingFrozen}
                                      onChange={(e) => {
                                         const newSubs = [...(editingTask.subtasks || [])];
                                         newSubs[idx].title = e.target.value;
                                         setEditingTask({...editingTask, subtasks: newSubs});
                                      }}
                                      className="flex-1 p-1 border-b border-transparent focus:border-gray-300 outline-none text-sm bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                                    />
                                 ) : <span className={`flex-1 text-sm ${st.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>{st.title}</span>}
                                 
                                 {canEditProject && !isEditingFrozen && (
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
                    {/* ... (Approvals & Comments UI unchanged) ... */}
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
                                      isClient && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
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
                                      (isLeadDesigner || isAdmin) && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
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
                                      isClient && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
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
                                      (isLeadDesigner || isAdmin) && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
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

                       <div className={`relative ${isEditingFrozen ? 'opacity-50 pointer-events-none' : ''}`}>
                          <input 
                            type="text" 
                            className="w-full p-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white text-gray-900"
                            placeholder="Type a message..."
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                            disabled={isEditingFrozen}
                          />
                          <button 
                             onClick={handleAddComment}
                             disabled={isEditingFrozen}
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
                {/* Only Show Save if NOT frozen or if ADMIN */}
                {(!isEditingFrozen || isAdmin) && (
                    <button onClick={handleSaveTask} className="px-6 py-2 text-sm font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 shadow-sm">
                        {editingTask.id ? 'Save Changes' : 'Create Task'}
                    </button>
                )}
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProjectDetail;