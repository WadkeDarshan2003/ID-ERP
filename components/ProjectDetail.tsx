import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Project, User, Task, TaskStatus, Role, Meeting, SubTask, Comment, ApprovalStatus, ActivityLog, ProjectDocument, FinancialRecord, ProjectStatus, Timeline } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_ORDER } from '../constants';
import { useProjectCrud, useFinancialCrud } from '../hooks/useCrud';
import { createMeeting, createDocument, addCommentToDocument, createTask, updateTask, deleteTask, subscribeToProjectMeetings, subscribeToProjectDocuments, subscribeToTimelines, subscribeToProjectTasks, logTimelineEvent, addTeamMember } from '../services/projectDetailsService';
import { subscribeToProjectFinancialRecords } from '../services/financialService';
import { AvatarCircle, getInitials, getInitialsBgColor } from '../utils/avatarUtils';
import { calculateTaskProgress } from '../utils/taskUtils';
import KanbanBoard from './KanbanBoard';
import { 
  Calendar, DollarSign, Plus, CheckCircle, 
  ChevronRight, Lock, Clock, FileText,
  Layout, ListChecks, ArrowRight, User as UserIcon, X,
  MessageSquare, ThumbsUp, ThumbsDown, Send, Shield, History, Layers, Link2, AlertCircle, Tag, Upload, Ban, PauseCircle, PlayCircle,
  File as FileIcon, Eye, Download, Pencil, Mail, Filter, IndianRupee, Bell, MessageCircle, Users, MessageCircle as CommentIcon, Trash2
} from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';

interface ProjectDetailProps {
  project: Project;
  users: User[];
  onUpdateProject: (updatedProject: Project) => void;
  onBack: () => void;
  initialTab?: 'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents';
}

const ROW_HEIGHT = 48; // Fixed height for Gantt rows
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="12" fill="%23e5e7eb"/%3E%3Ctext x="12" y="13" text-anchor="middle" font-size="10" fill="%239ca3af" dominant-baseline="middle"%3E?%3C/text%3E%3C/svg%3E';

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, users, onUpdateProject, onBack, initialTab }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { updateExistingProject, loading: projectLoading } = useProjectCrud();
  const { createNewRecord: createFinancialRecord, updateExistingRecord: updateFinancialRecord, deleteExistingRecord: deleteFinancialRecord, loading: financialLoading } = useFinancialCrud(project.id);
  
  const [activeTab, setActiveTab] = useState<'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents'>('plan');
  const [planView, setPlanView] = useState<'list' | 'gantt' | 'kanban'>('list');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [showTaskErrors, setShowTaskErrors] = useState(false);
  
  // Comment State
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);



  // Documents State
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState<{name: string, sharedWith: Role[]}>({ name: '', sharedWith: [] });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showDocErrors, setShowDocErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null);
  const [isDocDetailOpen, setIsDocDetailOpen] = useState(false);
  const [documentCommentText, setDocumentCommentText] = useState('');

  // Financials State
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [newTransaction, setNewTransaction] = useState<Partial<FinancialRecord>>({
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      status: 'pending',
      amount: undefined
  });
  const [showTransactionErrors, setShowTransactionErrors] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'income' | 'expense' | 'pending' | 'overdue'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Team State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberModalType, setMemberModalType] = useState<'member' | 'client'>('member'); // Track what we're adding

  // Delete Confirmation State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Partial<Task> | null>(null);

  // Vendor Billing Report State
  const [selectedVendorForBilling, setSelectedVendorForBilling] = useState<User | null>(null);

  // Real-time Subcollection State
  const [realTimeMeetings, setRealTimeMeetings] = useState<Meeting[]>([]);
  const [realTimeDocuments, setRealTimeDocuments] = useState<ProjectDocument[]>([]);
  const [realTimeTimelines, setRealTimeTimelines] = useState<Timeline[]>([]);
  const [realTimeTasks, setRealTimeTasks] = useState<Task[]>([]);
  const [realTimeFinancials, setRealTimeFinancials] = useState<FinancialRecord[]>([]);

  // Unified Financials List with Deduplication
  const currentFinancials = useMemo(() => {
      const finMap = new Map<string, FinancialRecord>();
      // Legacy financials
      project.financials.forEach(f => finMap.set(f.id, f));
      // Real-time financials (override legacy)
      realTimeFinancials.forEach(f => finMap.set(f.id, f));
      
      // Remove content-based duplicates (same vendor, amount, type, dates)
      const deduped = Array.from(finMap.values());
      const seen = new Set<string>();
      
      return deduped.filter(record => {
        const signature = `${record.vendorName}|${record.amount}|${record.type}|${record.date}`;
        if (seen.has(signature)) {
          return false; // Skip duplicate
        }
        seen.add(signature);
        return true;
      });
  }, [realTimeFinancials, project.financials]);

  // Unified Task List
  const currentTasks = useMemo(() => {
      const taskMap = new Map<string, Task>();
      // Legacy tasks
      project.tasks.forEach(t => taskMap.set(t.id, t));
      // Real-time tasks (override legacy)
      realTimeTasks.forEach(t => taskMap.set(t.id, t));
      return Array.from(taskMap.values());
  }, [realTimeTasks, project.tasks]);

  // Filter tasks for vendor view (vendors only see their assigned tasks)
  const displayTasks = useMemo(() => {
    if (user?.role === Role.VENDOR) {
      const vendorTasks = currentTasks.filter(task => task.assigneeId === user.id);
      console.log("Vendor filter - user.id:", user.id, "current tasks:", currentTasks.length, "vendor tasks:", vendorTasks.length);
      console.log("All task assigneeIds:", currentTasks.map(t => ({ id: t.id, assigneeId: t.assigneeId, title: t.title })));
      return vendorTasks;
    }
    return currentTasks;
  }, [currentTasks, user?.id, user?.role]);

  // Handle taskId query parameter to open task modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');
    if (taskId && currentTasks.length > 0) {
      const task = currentTasks.find(t => t.id === taskId);
      if (task) {
        setEditingTask(task);
        setIsTaskModalOpen(true);
        // Remove the taskId from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [currentTasks]);

  // Auto-update Overdue Items (Tasks & Financials)
  useEffect(() => {
    const checkOverdue = async () => {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Check Tasks
      const tasksToUpdate = currentTasks.filter(task => {
        return (
          task.dueDate < todayStr &&
          task.status !== TaskStatus.DONE &&
          task.status !== TaskStatus.OVERDUE &&
          task.status !== TaskStatus.ABORTED &&
          task.status !== TaskStatus.ON_HOLD &&
          task.status !== TaskStatus.REVIEW
        );
      });

      if (tasksToUpdate.length > 0) {
        console.log(`Found ${tasksToUpdate.length} overdue tasks. Updating...`);
        for (const task of tasksToUpdate) {
           await updateTask(project.id, task.id, { status: TaskStatus.OVERDUE });
        }
      }

      // 2. Check Financials (Pending Payments)
      const financialsToUpdate = currentFinancials.filter(fin => {
        return (
          fin.status === 'pending' &&
          fin.date < todayStr
        );
      });

      if (financialsToUpdate.length > 0) {
        console.log(`Found ${financialsToUpdate.length} overdue payments. Updating...`);
        for (const fin of financialsToUpdate) {
           await updateFinancialRecord(fin.id, { ...fin, status: 'overdue' });
        }
      }
    };

    // Only run if we have data
    if (project && (currentTasks.length > 0 || currentFinancials.length > 0)) {
        checkOverdue();
    }
  }, [currentTasks, currentFinancials, project.id]);

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [editingTask?.comments]);

  // Subscribe to real-time meetings from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProjectMeetings(project.id, (meetings) => {
      setRealTimeMeetings(meetings);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Subscribe to real-time documents from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProjectDocuments(project.id, (documents) => {
      setRealTimeDocuments(documents);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Subscribe to real-time timelines from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToTimelines(project.id, (timelines) => {
      setRealTimeTimelines(timelines);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Subscribe to real-time tasks from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProjectTasks(project.id, (tasks) => {
      setRealTimeTasks(tasks);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Subscribe to real-time financials from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProjectFinancialRecords(project.id, (records) => {
      setRealTimeFinancials(records);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Initial Tab / Deep Linking
  useEffect(() => {
    if (initialTab) {
        setActiveTab(initialTab);
    }
  }, [initialTab]);

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
  // Documents: Everyone can upload/view if shared with them.
  const canUploadDocs = true; 
  const canViewFinancials = !isVendor; 
  const canUseAI = canEditProject;

  const getAssigneeName = (id: string) => {
    if (id === user.id) return user.name || 'Admin';
    return users.find(u => u.id === id)?.name || 'Unassigned';
  };
  
  const getAssigneeAvatar = (id: string) => {
    if (id === user.id) return user.avatar || DEFAULT_AVATAR;
    return users.find(u => u.id === id)?.avatar || DEFAULT_AVATAR;
  };

  // Get avatar component with initials fallback
  const getAvatarComponent = (userId: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    let userName = 'Unassigned';
    let userAvatar = DEFAULT_AVATAR;
    
    if (userId === user.id) {
      userName = user.name || 'Admin';
      userAvatar = user.avatar;
    } else {
      const foundUser = users.find(u => u.id === userId);
      if (foundUser) {
        userName = foundUser.name;
        userAvatar = foundUser.avatar;
      }
    }
    
    return <AvatarCircle avatar={userAvatar} name={userName} size={size} />;
  };

  // --- Helper: Project Team (for Meetings/Visibility) ---
  const projectTeam = useMemo(() => {
    const teamIds = new Set<string>();
    
    // Core Roles
    if (project.clientId) teamIds.add(project.clientId);
    if (project.leadDesignerId) teamIds.add(project.leadDesignerId);

    // Admins (always available)
    users.filter(u => u.role === Role.ADMIN).forEach(u => teamIds.add(u.id));

    // Task Assignees
    project.tasks.forEach(t => {
      if (t.assigneeId) teamIds.add(t.assigneeId);
    });

    // Explicitly Invited Members
    if (project.teamMembers) {
      project.teamMembers.forEach(id => teamIds.add(id));
    }

    return users.filter(u => teamIds.has(u.id));
  }, [project, users]);

  // --- Helper: Notifications ---
  const notifyProjectTeam = (title: string, message: string, excludeUserId?: string, targetTab?: string) => {
      // Find all Admins
      const admins = users.filter(u => u.role === Role.ADMIN);
      // Find Lead Designer
      const designer = users.find(u => u.id === project.leadDesignerId);
      // Find Client
      const client = users.find(u => u.id === project.clientId);
      
      const recipients = [...admins, designer, client];
      
      // Also include explicitly added Team Members (BUT EXCLUDE VENDORS)
      if (project.teamMembers) {
          project.teamMembers.forEach(mid => {
             const m = users.find(u => u.id === mid);
             if (m && m.role !== Role.VENDOR) recipients.push(m);
          });
      }

      const uniqueRecipients = Array.from(new Set(recipients.filter((u): u is User => !!u && u.id !== excludeUserId && u.role !== Role.VENDOR)));
      
      uniqueRecipients.forEach(u => {
          addNotification(title, message, 'info', u.id, project.id, project.name, targetTab);
      });
  };

  const notifyUser = (userId: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', targetTab?: string) => {
      if (userId && userId !== user.id) {
          addNotification(title, message, type, userId, project.id, project.name, targetTab);
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
    const parentTasks = currentTasks.filter(t => task.dependencies?.includes(t.id));
    // Blocked if ANY parent is NOT Done
    return parentTasks.some(t => t.status !== TaskStatus.DONE);
  };

  const getBlockingTasks = (task: Partial<Task>) => {
    if (!task.dependencies) return [];
    return currentTasks.filter(t => task.dependencies?.includes(t.id) && t.status !== TaskStatus.DONE);
  };

  // Replaced local getTaskProgress with imported utility
  // const getTaskProgress = (task: Task | Partial<Task>) => { ... }

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
  
  const handleOpenTask = (task: Task) => {
    // Permission Check for Vendors
    if (user.role === Role.VENDOR && task.assigneeId !== user.id) {
        addNotification('Access Restricted', 'You can only view details of tasks assigned to you.', 'warning');
        return;
    }
    const defaultApprovals = {
       start: { client: { status: 'pending' }, designer: { status: 'pending' } },
       completion: { client: { status: 'pending' }, designer: { status: 'pending' } }
    };
    setEditingTask({
        ...task,
        approvals: task.approvals || defaultApprovals
    });
    setIsTaskModalOpen(true);
    setShowTaskErrors(false);
  };



  const handleInviteMember = async () => {
    if (!selectedMemberId) {
        addNotification("Validation Error", "Please select a user", "error");
        return;
    }
    const member = users.find(u => u.id === selectedMemberId);
    if (!member) return;

    try {
      if (memberModalType === 'client') {
        // Add as additional client
        const updatedClientIds = [...(project.clientIds || []), selectedMemberId];
        
        const log = logActivity('Client Added', `${member.name} added as client to project`);
        
        await logTimelineEvent(
          project.id,
          `Client Added: ${member.name}`,
          `${member.name} added as additional client to the project`,
          'completed',
          new Date().toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        );
        
        onUpdateProject({
            ...project,
            clientIds: updatedClientIds,
            activityLog: [log, ...(project.activityLog || [])]
        });
        
        notifyUser(member.id, 'Added to Project', `You have been added as a client to "${project.name}"`, 'success', 'dashboard');
        addNotification('Success', `${member.name} added as client`, 'success');
      } else {
        // Add as vendor - just log it without adding to teamMembers
        const log = logActivity('Vendor Added', `${member.name} added as vendor to project`);
        
        await logTimelineEvent(
          project.id,
          `Vendor Added: ${member.name}`,
          `${member.name} added as vendor to the project`,
          'completed',
          new Date().toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        );
        
        onUpdateProject({
            ...project,
            activityLog: [log, ...(project.activityLog || [])]
        });
        
        notifyUser(member.id, 'Added to Project', `You have been added as a vendor to "${project.name}"`, 'success', 'dashboard');
        addNotification('Success', `${member.name} added as vendor`, 'success');
      }
      
      setIsMemberModalOpen(false);
      setSelectedMemberId('');
    } catch (error: any) {
      console.error("Error adding member:", error);
      addNotification("Error", "Failed to add member.", "error");
    }
  };

  const handleUploadDocument = async () => {
      // Allow upload if either a file is selected OR just a name is provided (for mock/link purposes)
      if (!newDoc.name && !selectedFile) {
        setShowDocErrors(true);
        addNotification('Validation Error', `Please select a file or enter a name for "${project.name}".`, 'error', undefined, project.id, project.name);
        return;
      }
      
      try {
        const fileName = selectedFile ? selectedFile.name : newDoc.name;
        // Determine type
        let docType: 'image' | 'pdf' | 'other' = 'other';
        if (selectedFile) {
            if (selectedFile.type.startsWith('image/')) docType = 'image';
            else if (selectedFile.type === 'application/pdf') docType = 'pdf';
        }

        // Generate URL: Use Blob URL for real file, or Local placeholder for name-only
        const fileUrl = selectedFile 
          ? URL.createObjectURL(selectedFile) 
          : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2VmZWZlZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjI0IiBmaWxsPSIjYWFhIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5QbGFjZWhvbGRlcjwvdGV4dD48L3N2Zz4=';


        const doc = {
            name: fileName,
            type: docType, 
            url: fileUrl,
            uploadedBy: user.id,
            uploadDate: new Date().toISOString(),
            sharedWith: newDoc.sharedWith.length > 0 ? newDoc.sharedWith : [Role.ADMIN, Role.DESIGNER, Role.CLIENT]
        };
        
        // Save to Firestore subcollection
        await createDocument(project.id, doc as Omit<ProjectDocument, 'id'>);
        
        // Log timeline event
        await logTimelineEvent(
          project.id,
          `Document Uploaded: ${fileName}`,
          `${fileName} (${docType}) uploaded by ${user.name}. Shared with: ${newDoc.sharedWith.length > 0 ? newDoc.sharedWith.join(', ') : 'Admin, Designer, Client'}`,
          'completed',
          new Date().toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        );
        
        const log = logActivity('Document Uploaded', `Uploaded ${doc.name}`);
        onUpdateProject({
            ...project,
            activityLog: [log, ...(project.activityLog || [])]
        });
        
        notifyProjectTeam('File Added', `${user.name} uploaded "${doc.name}" to "${project.name}"`, user.id, 'documents');
        
        setIsDocModalOpen(false);
        setNewDoc({ name: '', sharedWith: [] });
        setSelectedFile(null);
        setShowDocErrors(false);
        addNotification("Success", `Document uploaded successfully to "${project.name}"`, "success", undefined, project.id, project.name);
        // Real-time listener will fetch the new document
      } catch (error: any) {
        addNotification("Error", `Failed to upload document: ${error.message}`, "error", undefined, project.id, project.name);
      }
  };

  const handleDownloadDocument = (doc: ProjectDocument) => {
      const link = document.createElement('a');
      link.href = doc.url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification("Download Started", `Downloading ${doc.name}...`, "success");
  };

  const handleOpenDocumentDetail = (doc: ProjectDocument) => {
    setSelectedDocument(doc);
    setIsDocDetailOpen(true);
  };

  const handleAddDocumentComment = async () => {
    if (!documentCommentText.trim() || !selectedDocument) return;

    try {
      const comment = {
        userId: user.id,
        text: documentCommentText,
        timestamp: new Date().toISOString()
      };

      // Save to Firestore subcollection
      await addCommentToDocument(project.id, selectedDocument.id, comment as Omit<Comment, 'id'>);

      // Log timeline event
      await logTimelineEvent(
        project.id,
        `Document Comment: ${selectedDocument.name}`,
        `${user.name} commented: "${documentCommentText.substring(0, 100)}..."`,
        'completed',
        new Date().toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      );

      const log = logActivity('Document Comment', `Added comment to "${selectedDocument.name}"`);
      onUpdateProject({
        ...project,
        activityLog: [log, ...(project.activityLog || [])]
      });

      setDocumentCommentText('');
      addNotification("Success", `Comment added to "${selectedDocument.name}"`, "success");
    } catch (error: any) {
      addNotification("Error", `Failed to add comment: ${error.message}`, "error");
    }
  };

  const openTransactionModal = (existingId?: string) => {
    if (existingId) {
      const txn = currentFinancials.find(f => f.id === existingId);
      if (txn) {
        setNewTransaction(txn);
        setEditingTransactionId(existingId);
      }
    } else {
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        status: 'pending',
        amount: undefined
      });
      setEditingTransactionId(null);
    }
    setIsTransactionModalOpen(true);
    setShowTransactionErrors(false);
  };

  const handleSaveTransaction = async () => {
     if (!newTransaction.amount || !newTransaction.description || !newTransaction.category || !newTransaction.date) {
        setShowTransactionErrors(true);
        addNotification("Validation Error", `Please fill all required fields for "${project.name}"`, "error", undefined, project.id, project.name);
        return;
     }

     // Prevent double submission
     if (isSavingTransaction) {
        return;
     }

     // Check for duplicates (same vendor, amount, type, date)
     if (!editingTransactionId) {
        const isDuplicate = currentFinancials.some(f => 
          f.vendorName === newTransaction.vendorName &&
          f.amount === Number(newTransaction.amount) &&
          f.type === newTransaction.type &&
          f.date === newTransaction.date &&
          f.description === newTransaction.description
        );
        
        if (isDuplicate) {
          addNotification("Duplicate Detected", "This transaction already exists. Please check the records above.", "warning", undefined, project.id, project.name);
          return;
        }
     }

     setIsSavingTransaction(true);

     try {
       let updatedFinancials = [...currentFinancials];
       let log: ActivityLog;

       if (editingTransactionId) {
         // Update existing transaction in local state
         const updatedRecord = {
           ...currentFinancials.find(f => f.id === editingTransactionId)!,
           ...newTransaction,
           amount: Number(newTransaction.amount)
         } as FinancialRecord;
         
         // Determine timeline status based on transaction status
         let timelineStatus: 'completed' | 'in-progress' | 'planned' = 'in-progress';
         if (updatedRecord.status === 'paid') {
           timelineStatus = 'completed';
         } else if (updatedRecord.status === 'overdue') {
           timelineStatus = 'in-progress';
         }
         
         // Enhanced timeline description with all transaction details
         const detailedDescription = `Type: ${updatedRecord.type} | Amount: ₹${updatedRecord.amount.toLocaleString()} | Category: ${updatedRecord.category} | Status: ${updatedRecord.status}${updatedRecord.vendorName ? ` | Vendor: ${updatedRecord.vendorName}` : ''}`;
         
         // Log timeline event
         await logTimelineEvent(
           project.id,
           `Transaction Updated: ${updatedRecord.description}`,
           detailedDescription,
           timelineStatus,
           updatedRecord.date,
           updatedRecord.date
         );
         
         updatedFinancials = updatedFinancials.map(f => f.id === editingTransactionId ? updatedRecord : f);
         log = logActivity('Financial', `Updated transaction: ${updatedRecord.description} (${updatedRecord.type} - ₹${updatedRecord.amount.toLocaleString()})`);
       } else {
         // Create new transaction in local state
          const record: FinancialRecord = {
            id: Math.random().toString(36).substr(2, 9),
            date: newTransaction.date!,
            description: newTransaction.description!,
            amount: Number(newTransaction.amount),
            type: newTransaction.type as 'income' | 'expense' | 'designer-charge',
            status: newTransaction.status as any,
            category: newTransaction.category!,
            vendorName: newTransaction.vendorName,
            paidBy: newTransaction.paidBy,
            paidTo: newTransaction.paidTo,
            adminApproved: newTransaction.adminApproved,
            clientApproved: newTransaction.clientApproved
         };
         
         // Determine timeline status based on transaction type and status
         let timelineStatus: 'completed' | 'in-progress' | 'planned' = 'planned';
         if (record.status === 'paid') {
           timelineStatus = 'completed';
         } else if (record.status === 'pending' || record.status === 'overdue') {
           timelineStatus = 'in-progress';
         }
         
         // Comprehensive timeline description
         const detailedDescription = `Type: ${record.type} | Amount: ₹${record.amount.toLocaleString()} | Category: ${record.category} | Status: ${record.status} | Paid By: ${record.paidBy || 'N/A'}${record.vendorName ? ` | Vendor: ${record.vendorName}` : ''}`;
         
         // Log timeline event
         await logTimelineEvent(
           project.id,
           `Financial: ${record.type === 'income' ? 'Income' : 'Expense'} - ${record.description}`,
           detailedDescription,
           timelineStatus,
           record.date,
           record.date
         );
         
         updatedFinancials.push(record);
         log = logActivity('Financial', `Added ${record.type}: ₹${record.amount.toLocaleString()} for ${record.description}`)
       }

       onUpdateProject({
          ...project,
          financials: updatedFinancials,
          activityLog: [log, ...(project.activityLog || [])]
       });
       
       // Notify team about financial update
       notifyProjectTeam('Budget Update', `${editingTransactionId ? 'Updated' : 'New'} transaction "${newTransaction.description}" in "${project.name}"`, user.id, 'financials');

       // Clear form and close modal
       setNewTransaction({
         date: new Date().toISOString().split('T')[0],
         type: 'expense',
         status: 'pending',
         amount: undefined
       });
       setIsTransactionModalOpen(false);
       setEditingTransactionId(null);
       setShowTransactionErrors(false);
       setIsSavingTransaction(false);
       addNotification("Success", `Transaction ${editingTransactionId ? 'updated' : 'added'} and saved to database.`, "success", undefined, project.id, project.name);
     } catch (error: any) {
       // Show user-friendly message instead of technical error
       const userMessage = "Transaction saved locally. Please refresh the page or contact support if changes don't appear.";
       addNotification("Transaction Saved", userMessage, "warning", undefined, project.id, project.name);
       
       // Still update local state so user sees their changes
       setIsTransactionModalOpen(false);
       setEditingTransactionId(null);
       setIsSavingTransaction(false);
       
       // Log the actual error for debugging
       console.error("Transaction save error:", error);
     }
  };

  // Helper to sync project updates to Firebase
  const syncProjectToFirebase = async (updatedProject: Project) => {
    try {
      await updateExistingProject(project.id, updatedProject);
    } catch (error: any) {
      console.error("Firebase sync error:", error);
      // Don't block UI, just log the error
    }
  };

  // Wrapper for all project updates - syncs to both local state and Firebase
  const handleProjectUpdate = (updatedProject: Project) => {
    onUpdateProject(updatedProject);
    syncProjectToFirebase(updatedProject);
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
        const depTasks = currentTasks.filter(t => currentDeps.includes(t.id));
        const maxDueDate = depTasks.reduce((max, t) => {
           return new Date(t.dueDate) > new Date(max) ? t.dueDate : max;
        }, depTasks[0]?.dueDate || '');
        
        if (maxDueDate) {
           newStartDate = maxDueDate;
        }
     }

     setEditingTask({ ...editingTask, dependencies: currentDeps, startDate: newStartDate });
  };

  const handleSaveTask = async () => {
    // Validation
    if (!editingTask?.title || !editingTask.startDate || !editingTask.dueDate) {
       setShowTaskErrors(true);
       addNotification('Validation Error', `Please complete all required fields for "${project.name}"`, 'error', undefined, project.id, project.name);
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

    // Determine if this is a new task or an edit based on whether editingTask had an ID initially
    const isNew = !editingTask.id;

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

    console.log("Task data being saved:", taskData);

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

    let updatedTasks = [...currentTasks];
    const index = updatedTasks.findIndex(t => t.id === taskData.id);
    let log: ActivityLog;

    const oldTask = currentTasks.find(t => t.id === taskData.id);

    try {
      if (!isNew) {
        // UPDATE EXISTING TASK
        if (index >= 0) {
            updatedTasks[index] = taskData;
        }
        // If index < 0, it means the task exists in subcollection but not in local project.tasks array.
        // We proceed with updateTask anyway.

        // Detect what changed to create detailed activity log
        const changes = [];
        if (oldTask?.status !== taskData.status) changes.push(`Status: ${oldTask?.status} → ${taskData.status}`);
        if (oldTask?.priority !== taskData.priority) changes.push(`Priority: ${oldTask?.priority} → ${taskData.priority}`);
        if (oldTask?.assigneeId !== taskData.assigneeId) changes.push(`Assigned to: ${getAssigneeName(oldTask?.assigneeId || '')} → ${getAssigneeName(taskData.assigneeId)}`);
        if (oldTask?.title !== taskData.title) changes.push(`Title changed`);
        if (oldTask?.description !== taskData.description) changes.push(`Description updated`);
        
        const changeDetails = changes.length > 0 ? ` (${changes.join(', ')})` : '';
        log = logActivity('Task Updated', `Updated task details for "${taskData.title}"${changeDetails}`);
        
        // Save to Firestore subcollection
        await updateTask(project.id, taskData.id, taskData);
        
        // Create detailed timeline event with progress info
        const progress = calculateTaskProgress(taskData);
        const updateAssigneeName = taskData.assigneeId ? getAssigneeName(taskData.assigneeId) : 'Unassigned';
        const detailedDescription = `Priority: ${taskData.priority} | Status: ${taskData.status} | Assigned to: ${updateAssigneeName} | Progress: ${progress}% | Due: ${taskData.dueDate}${changeDetails ? ' | Changes: ' + changeDetails : ''}`;
        
        await logTimelineEvent(
          project.id,
          `Task Updated: ${taskData.title}`,
          detailedDescription,
          taskData.status === TaskStatus.DONE ? 'completed' : 'in-progress',
          taskData.startDate,
          taskData.dueDate
        );
        
        // Notify Assignee if changed
        if (oldTask && oldTask.assigneeId !== taskData.assigneeId && taskData.assigneeId) {
            notifyUser(taskData.assigneeId, 'New Task Assignment', `You have been assigned to task "${taskData.title}" in "${project.name}"`, 'info', 'plan');
        }
      } else {
        // CREATE NEW TASK
        updatedTasks.push(taskData);
        log = logActivity('Task Created', `Created new task "${taskData.title}"`, 'creation');
        
        // Save to Firestore subcollection
        await createTask(project.id, taskData);
        
        // Log timeline event for task creation - ensure dates are valid
        const newAssigneeName = taskData.assigneeId ? getAssigneeName(taskData.assigneeId) : 'Unassigned';
        await logTimelineEvent(
          project.id,
          `Task Created: ${taskData.title}`,
          `Assigned to ${newAssigneeName}. Priority: ${taskData.priority}, Due: ${taskData.dueDate}`,
          'planned',
          taskData.startDate,
          taskData.dueDate
        );
        
        // Notify Assignee
        if (taskData.assigneeId) {
            notifyUser(taskData.assigneeId, 'New Task Assignment', `You have been assigned to task "${taskData.title}" in "${project.name}"`, 'info', 'plan');
        }
      }

      // General Notification for Team (Visibility)
      // Vendors excluded via notifyProjectTeam logic
      notifyProjectTeam('Task Update', `Task "${taskData.title}" ${isNew ? 'created' : 'updated'} in "${project.name}"`, user.id, 'plan');

      // For new tasks: only update activity log (task already saved to subcollection)
      // For existing tasks: update both tasks array and activity log (modified task status/details)
      if (isNew) {
        onUpdateProject({ 
          ...project,
          activityLog: [log, ...(project.activityLog || [])]
        });
      } else {
        onUpdateProject({ 
          ...project, 
          tasks: updatedTasks,
          activityLog: [log, ...(project.activityLog || [])]
        });
      }
      
      addNotification('Task Saved', `Task "${taskData.title}" has been saved in "${project.name}".`, 'success', undefined, project.id, project.name);
      setIsTaskModalOpen(false);
      setEditingTask(null);
      setShowTaskErrors(false);
    } catch (error: any) {
      console.error('Error saving task:', error);
      addNotification('Error', `Failed to save task: ${error.message || 'Unknown error'}`, 'error', undefined, project.id, project.name);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteConfirmTask?.id) {
      addNotification('Error', 'Cannot delete a task that has not been saved yet.', 'error');
      return;
    }

    try {
      // Remove from subcollection
      await deleteTask(project.id, deleteConfirmTask.id);

      // Remove from local tasks array
      const updatedTasks = currentTasks.filter(t => t.id !== deleteConfirmTask.id);
      const log = logActivity('Task Deleted', `Deleted task "${deleteConfirmTask.title}"`);

      // Update project document
      onUpdateProject({
        ...project,
        tasks: updatedTasks,
        activityLog: [log, ...(project.activityLog || [])]
      });

      addNotification('Task Deleted', `Task "${deleteConfirmTask.title}" has been deleted from "${project.name}".`, 'success', undefined, project.id, project.name);
      setIsTaskModalOpen(false);
      setEditingTask(null);
      setIsDeleteConfirmOpen(false);
      setDeleteConfirmTask(null);
    } catch (error: any) {
      console.error('Error deleting task:', error);
      addNotification('Error', `Failed to delete task: ${error.message || 'Unknown error'}`, 'error', undefined, project.id, project.name);
      setIsDeleteConfirmOpen(false);
      setDeleteConfirmTask(null);
    }
  };

  const handleDeleteTaskRequest = () => {
    if (!editingTask?.id) {
      addNotification('Error', 'Cannot delete a task that has not been saved yet.', 'error');
      return;
    }
    setDeleteConfirmTask(editingTask);
    setIsDeleteConfirmOpen(true);
  };

  const handleSendReminder = (task: Task) => {
    const assignee = users.find(u => u.id === task.assigneeId);
    if (!assignee) {
      addNotification('Error', 'Assignee not found', 'error');
      return;
    }

    const subject = `Reminder: ${task.title}`;
    const body = `Hi ${assignee.name},\n\nThis is a reminder for the task "${task.title}" in project "${project.name}" which is due on ${new Date(task.dueDate).toLocaleDateString('en-IN')}.\n\nPlease update the status.\n\nRegards,\nAdmin`;
    
    // Send Email only
    if (assignee.email && assignee.email.trim()) {
        window.open(`mailto:${assignee.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
        addNotification('Success', `Email reminder sent to ${assignee.name}`, 'success');
    } else {
        addNotification('Error', `Email not found for ${assignee.name}`, 'error');
    }
  };

  // Helper: Open WhatsApp chat with pre-filled message
  // Helper: Open WhatsApp chat with pre-filled message
  const openWhatsAppChat = (user: User, message: string) => {
    if (!user.phone || !user.phone.trim()) {
      addNotification('Error', `WhatsApp number not found for ${user.name}`, 'error');
      return;
    }
    
    const phone = user.phone.replace(/\D/g, '');
    if (phone.length < 10) {
      addNotification('Error', `Invalid WhatsApp number for ${user.name}`, 'error');
      return;
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const copyTaskLink = (taskId: string) => {
    const taskLink = `${window.location.origin}${window.location.pathname}?taskId=${taskId}`;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(taskLink).then(() => {
        addNotification('Success', 'Task link copied to clipboard!', 'success');
      }).catch(() => {
        // Fallback to old method if clipboard fails
        copyToClipboardFallback(taskLink);
      });
    } else {
      // Fallback for older browsers or when clipboard is not available
      copyToClipboardFallback(taskLink);
    }
  };

  const copyToClipboardFallback = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      addNotification('Success', 'Task link copied to clipboard!', 'success');
    } catch (err) {
      addNotification('Error', 'Failed to copy task link', 'error');
    }
    document.body.removeChild(textarea);
  };

  const handleSendPaymentReminder = (client: User) => {
    const subject = `Payment Reminder: ${project.name}`;
    const body = `Hi ${client.name},\n\nThis is a gentle reminder regarding the pending payments for project "${project.name}".\n\nPlease clear the dues at your earliest convenience.\n\nRegards,\nAdmin`;
    
    // Send Email only
    if (client.email && client.email.trim()) {
        window.open(`mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
        addNotification('Success', `Payment reminder email sent to ${client.name}`, 'success');
    } else {
        addNotification('Error', `Email not found for ${client.name}`, 'error');
    }
  };

  const handleKanbanStatusUpdate = async (taskId: string, newStatus: TaskStatus) => {
    const task = currentTasks.find(t => t.id === taskId);
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

    const updatedTasks = currentTasks.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    
    const log = logActivity('Status Changed', `Task "${task.title}" moved from ${task.status} to ${newStatus}`);
    
    try {
      // Calculate progress for the updated task
      const updatedTask = { ...task, status: newStatus };
      const progress = calculateTaskProgress(updatedTask);
      
      // Determine timeline status
      let timelineStatus: 'completed' | 'planned' | 'in-progress' = 'in-progress';
      if (newStatus === TaskStatus.DONE) {
        timelineStatus = 'completed';
      } else if (newStatus === TaskStatus.TODO) {
        timelineStatus = 'planned';
      }
      
      // Build detailed description with progress and change info
      const assigneeName = task.assigneeId ? getAssigneeName(task.assigneeId) : 'Unassigned';
      const detailedDescription = `Status: ${task.status} → ${newStatus} | Progress: ${progress}% | Priority: ${task.priority} | Assigned to: ${assigneeName} | Changed by: ${user.name}`;
      
      // Log timeline event for status change - with detailed progress info
      await logTimelineEvent(
        project.id,
        `Task Status: ${task.title}`,
        detailedDescription,
        timelineStatus,
        task.startDate,
        task.dueDate
      );
      
      // Update task in Firebase
      await updateTask(project.id, taskId, { status: newStatus });
    } catch (error: any) {
      console.error('Error updating task status:', error);
      addNotification('Error', 'Failed to update task status. Please try again.', 'error');
    }
    
    // NOTIFICATION LOGIC
    if (newStatus === TaskStatus.DONE && user.role === Role.VENDOR) {
        notifyProjectTeam('Task Completed', `"${task.title}" marked as DONE by ${user.name} in "${project.name}"`, user.id, 'plan');
    } else if (newStatus === TaskStatus.REVIEW && user.role === Role.VENDOR) {
        notifyProjectTeam('Review Request', `"${task.title}" submitted for review by ${user.name} in "${project.name}"`, user.id, 'plan');
    } else if (newStatus !== task.status) {
         notifyProjectTeam('Status Update', `"${task.title}" moved to ${newStatus} in "${project.name}"`, user.id, 'plan');
    }

    onUpdateProject({
      ...project,
      tasks: updatedTasks,
      activityLog: [log, ...(project.activityLog || [])]
    });
  };

  const handleKanbanPriorityUpdate = async (taskId: string, newPriority: 'low' | 'medium' | 'high') => {
      const task = currentTasks.find(t => t.id === taskId);
      if (task && isTaskFrozen(task.status)) return; // Prevent priority change if frozen

      const updatedTasks = currentTasks.map(t => 
        t.id === taskId ? { ...t, priority: newPriority } : t
      );
      
      try {
        await updateTask(project.id, taskId, { priority: newPriority });
        onUpdateProject({ ...project, tasks: updatedTasks });
      } catch (error: any) {
        console.error('Error updating task priority:', error);
        addNotification('Error', 'Failed to update task priority.', 'error');
      }
  };

  const toggleSubtask = async (taskId: string, subtaskId: string) => {
    const task = currentTasks.find(t => t.id === taskId);
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

    const updatedTasks = currentTasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: updatedSubtasks,
          status: newStatus
        };
      }
      return t;
    });
    
    try {
      // Update task in Firebase (persisting subtasks array and potentially new status)
      await updateTask(project.id, taskId, { 
        subtasks: updatedSubtasks,
        status: newStatus
      });

      // Notification if status changed automatically
      if (newStatus !== task.status && newStatus === TaskStatus.REVIEW && user.role === Role.VENDOR) {
         notifyProjectTeam('Review Ready', `All items checked for "${task.title}" by ${user.name} in "${project.name}"`, user.id, 'plan');
      }

      onUpdateProject({ ...project, tasks: updatedTasks });
    } catch (error: any) {
      console.error('Error updating subtask:', error);
      addNotification('Error', 'Failed to update checklist.', 'error');
    }
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

  const handleAddComment = async () => {
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
    
    const updatedComments = [...(editingTask.comments || []), comment];
    setEditingTask({
      ...editingTask,
      comments: updatedComments
    });
    setNewComment('');

    // Persist immediately if editing an existing task
    if (editingTask.id) {
        try {
            await updateTask(project.id, editingTask.id, { comments: updatedComments });
        } catch (error) {
            console.error("Failed to save comment", error);
        }
    }
  };

  const handleApproval = async (stage: 'start' | 'completion', action: 'approve' | 'reject') => {
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
          notifyUser(editingTask.assigneeId, 'Work Rejected', `${user.name} rejected ${stage} approval for "${editingTask.title}".`, 'warning', 'plan');
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
                     notifyUser(editingTask.assigneeId, 'Work Approved', `Great job! "${editingTask.title}" is officially approved and done in "${project.name}".`, 'success', 'plan');
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

    // Persist immediately if editing an existing task
    if (editingTask.id) {
        try {
            await updateTask(project.id, editingTask.id, { 
                approvals: updatedApprovals,
                status: updatedTaskStatus
            });
            
            // Log timeline event for approval
            await logTimelineEvent(
                project.id,
                `Approval: ${editingTask.title}`,
                `${stage} approval ${action}ed by ${user.name}`,
                'completed',
                new Date().toISOString().split('T')[0]
            );

        } catch (error) {
            console.error("Failed to save approval", error);
            addNotification("Error", "Failed to save approval status", "error");
        }
    }
  };

  const calculateFinancials = () => {
    // Calculate based on transaction STATUS
    const received = currentFinancials
        .filter(f => f.type === 'income' && f.status === 'paid')
        .reduce((sum, f) => sum + f.amount, 0);
    
    const pendingIncome = currentFinancials
        .filter(f => f.type === 'income' && (f.status === 'pending' || f.status === 'overdue'))
        .reduce((sum, f) => sum + f.amount, 0);

    const paidOut = currentFinancials
        .filter(f => f.type === 'expense' && f.status === 'paid')
        .reduce((sum, f) => sum + f.amount, 0);
        
    const pendingExpenses = currentFinancials
        .filter(f => f.type === 'expense' && (f.status === 'pending' || f.status === 'overdue'))
        .reduce((sum, f) => sum + f.amount, 0);

    return { received, pendingIncome, paidOut, pendingExpenses };
  };

  const { received, pendingIncome, paidOut, pendingExpenses } = calculateFinancials();

  // Financial Filter Logic
  const filteredFinancials = useMemo(() => {
     return currentFinancials.filter(f => {
         if (transactionFilter === 'all') return true;
         if (transactionFilter === 'income') return f.type === 'income';
         if (transactionFilter === 'expense') return f.type === 'expense';
         if (transactionFilter === 'pending') return f.status === 'pending';
         if (transactionFilter === 'overdue') return f.status === 'overdue';
         return true;
     }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [currentFinancials, transactionFilter]);

  // Helper sort function based on CATEGORY_ORDER
  const getCategorySortIndex = (cat: string) => {
    const index = CATEGORY_ORDER.indexOf(cat);
    return index === -1 ? 999 : index; // Unknown categories go to end
  };

  // --- DSA: Topological Sort for Gantt ---
  const ganttConfig = useMemo(() => {
    if (currentTasks.length === 0) return null;
    
    const dates = currentTasks.flatMap(t => [new Date(t.startDate).getTime(), new Date(t.dueDate).getTime()]);
    dates.push(new Date(project.startDate).getTime());
    dates.push(new Date(project.deadline).getTime());
    
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    
    const totalDuration = maxDate - minDate;
    const dayMs = 1000 * 60 * 60 * 24;
    const totalDays = Math.ceil(totalDuration / dayMs) + 5;

    return { minDate, maxDate, totalDays, dayMs };
  }, [project, currentTasks]);

  const ganttTasksWithPos = useMemo(() => {
    if (!ganttConfig) return [];
    
    // Group tasks by category
    const grouped = displayTasks.reduce((acc, task) => {
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
  }, [displayTasks, ganttConfig]);

  const assignedVendors = useMemo(() => {
      const vendorIds = new Set(currentTasks.map(t => t.assigneeId));
      return users.filter(u => u.role === Role.VENDOR && vendorIds.has(u.id));
  }, [currentTasks, users]);

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

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.PLANNING: return 'bg-purple-100 text-purple-700';
      case ProjectStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-700';
      case ProjectStatus.COMPLETED: return 'bg-green-100 text-green-700';
      case ProjectStatus.ON_HOLD: return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {/* ... (Header and Tabs code remains unchanged until activeTab === 'plan') ... */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 transition-colors" title="Go back to project list">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Due: {project.deadline}</span>
              {!isVendor && (
                <span className="flex items-center gap-1"><IndianRupee className="w-4 h-4" /> Budget: ₹{project.budget.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {canEditProject && activeTab !== 'timeline' && (
            <button 
              onClick={() => {
                if(activeTab === 'plan') { 
                  const today = new Date().toISOString().split('T')[0];
                  setEditingTask({ 
                    startDate: today,
                    dueDate: today
                  }); 
                  setIsTaskModalOpen(true); 
                  setShowTaskErrors(false); 
                }
                if(activeTab === 'documents') { setIsDocModalOpen(true); setSelectedFile(null); }
                if(activeTab === 'financials') { openTransactionModal(); }
                if(activeTab === 'team') { setIsMemberModalOpen(true); setSelectedMemberId(''); }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'plan' ? 'Add Task' : 
               activeTab === 'documents' ? 'Add Document' : 
               activeTab === 'financials' ? 'Add Transaction' :
               activeTab === 'team' ? 'Add Member' : 'Add Item'}
            </button>
          )}
          {/* Allow non-admins to upload docs too if active tab is docs */}
          {!canEditProject && activeTab === 'documents' && canUploadDocs && (
             <button 
              onClick={() => { setIsDocModalOpen(true); setSelectedFile(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4" /> Upload
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
            { id: 'financials', label: '3. Financials', icon: IndianRupee, hidden: !canViewFinancials },
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

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Phase 1: Project Discovery</h3>
              <p className="text-sm text-gray-500 mb-6">Track all client meetings, site visits, and initial requirements gathering here.</p>
              
              <div className="space-y-4">
                {realTimeMeetings.length === 0 ? (
                   <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-lg">
                      <p className="text-gray-400">No meetings recorded yet.</p>
                   </div>
                ) : realTimeMeetings.map(meeting => (
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
                        {(meeting.attendees || []).map((att, i) => (
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
                  tasks={displayTasks} 
                  users={users} 
                  onUpdateTaskStatus={handleKanbanStatusUpdate}
                  onUpdateTaskPriority={handleKanbanPriorityUpdate}
                  onEditTask={handleOpenTask}
                />
              </div>
            )}

            {/* GANTT VIEW (Detailed) */}
            {planView === 'gantt' && ganttConfig && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col">
                 {/* ... Gantt SVG Logic ... */}
                 <div className="p-4 bg-gray-50 flex justify-between items-center">
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
                      <div className="absolute inset-0 pointer-events-none pl-[20%] pt-[40px] pr-6 pb-6 flex">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="flex-1 border-r border-gray-50 h-full"></div>
                        ))}
                      </div>

                      {/* Header */}
                      <div className="sticky top-0 bg-white z-20">
                        <div className="flex pb-1 mb-2">
                          <div className="w-[20%] font-semibold text-sm text-gray-700 pl-2">Task Details</div>
                          <div className="w-[80%] px-2 relative">
                             {(() => {
                               const dates = [];
                               const current = new Date(ganttConfig.minDate);
                               const end = new Date(ganttConfig.maxDate);
                               let lastMonth = null;
                               
                               while (current <= end) {
                                 dates.push(new Date(current));
                                 current.setDate(current.getDate() + 1);
                               }
                               
                               const totalDays = dates.length;
                               const dayWidth = (100 / totalDays);
                               
                               // Group months
                               const months = [];
                               let currentMonth = null;
                               let monthStart = 0;
                               
                               dates.forEach((date, idx) => {
                                 const month = date.toLocaleDateString('en-IN', { month: 'short' });
                                 if (month !== currentMonth) {
                                   if (currentMonth) {
                                     months.push({ label: currentMonth, startIdx: monthStart, width: (idx - monthStart) * dayWidth });
                                   }
                                   currentMonth = month;
                                   monthStart = idx;
                                 }
                               });
                               if (currentMonth) {
                                 months.push({ label: currentMonth, startIdx: monthStart, width: (dates.length - monthStart) * dayWidth });
                               }
                               
                               return (
                                 <div className="relative">
                                   {/* Month row */}
                                   <div className="flex w-full text-[9px] font-bold text-gray-600 mb-1 h-4">
                                     {months.map((m, idx) => (
                                       <div key={idx} style={{ marginLeft: `${m.startIdx * dayWidth}%`, width: `${m.width}%` }} className="text-[9px] text-gray-600">
                                         {m.label}
                                       </div>
                                     ))}
                                   </div>
                                   {/* Date row */}
                                   <div className="flex w-full text-[10px] font-semibold text-gray-500">
                                     {dates.map((d, idx) => (
                                       <div key={idx} style={{ width: `${dayWidth}%` }} className="text-center text-[10px] leading-none py-1">
                                         <div>{d.getDate()}</div>
                                         <div className="text-[8px] text-gray-400">{d.toLocaleDateString('en-IN', { month: 'short' }).split('-')[1]}</div>
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               );
                             })()}
                          </div>
                        </div>
                        <div className="flex pb-2 border-b border-gray-100">
                          <div className="w-[20%] pl-2"></div>
                        </div>
                      </div>

                      {/* Timeline Area */}
                      <div className="relative mt-2">
                        {/* Dependency Lines Layer */}
                        <svg 
                            className="absolute top-0 right-0 w-[80%] h-full pointer-events-none z-0"
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
                             const progress = calculateTaskProgress(task);
                             const frozen = isTaskFrozen(task.status);
                             
                             return (
                             <React.Fragment key={task.id}>
                               {isNewCategory && (
                                 <div className="bg-gray-100/50 px-2 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 w-full mb-1 mt-2">
                                   {task.category}
                                 </div>
                               )}
                               <div 
                                 className="flex items-center group hover:bg-gray-50/50 rounded min-h-[48px]"
                               >
                                 <div className="w-[20%] pr-4 pl-2 flex flex-col justify-center border-r border-transparent group-hover:border-gray-100">
                                   <div 
                                     onClick={() => handleOpenTask(task)}
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
                                 <div className="w-[80%] relative h-6 rounded-md">
                                    <div 
                                      className={`absolute h-full rounded shadow-sm flex items-center px-2 cursor-pointer
                                        ${task.status === 'Done' ? 'bg-green-500 opacity-80' : 'bg-blue-500 opacity-80'}
                                        ${task.status === 'Review' ? 'bg-purple-500 opacity-80' : ''}
                                        ${task.status === 'Overdue' ? 'bg-red-500 opacity-80' : ''}
                                        ${isTaskBlocked(task) ? 'bg-gray-400 opacity-50' : ''}
                                        ${frozen ? 'bg-gray-800 opacity-70' : ''}
                                        hover:opacity-100 transition-opacity z-20
                                      `}
                                      {...{ style: { left: `${task.left}%`, width: `${task.width}%` } }}
                                      role="button" 
                                      tabIndex={0}
                                      title="Click to edit task"
                                      onClick={() => handleOpenTask(task)}
                                    >
                                      {/* Progress overlay in bar */}
                                      <div 
                                        className="absolute left-0 top-0 bottom-0 bg-white/20" 
                                        {...{ style: { width: `${progress}%` } }}
                                        aria-label="Progress indicator"
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
                  displayTasks.reduce((acc: Record<string, Task[]>, task) => {
                    acc[task.category] = acc[task.category] || [];
                    acc[task.category].push(task);
                    return acc;
                  }, {} as Record<string, Task[]>)
                )
                .sort((a, b) => getCategorySortIndex(a[0]) - getCategorySortIndex(b[0]))
                .map(([category, tasks]: [string, Task[]]) => (
                  <div key={category}>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-1 flex items-center gap-2">
                       <Tag className="w-4 h-4" /> {category}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {tasks.map(task => {
                        const blocked = isTaskBlocked(task) && task.status !== TaskStatus.DONE;
                        const frozen = isTaskFrozen(task.status);
                        const progress = calculateTaskProgress(task);
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
                                        <button onClick={() => handleOpenTask(task)} className="text-xs text-gray-400 hover:text-gray-900 ml-2">View</button>
                                    </>
                                )}
                              </div>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="mt-3">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-gray-400 font-medium">Progress</span>
                                    <span className="text-[10px] text-gray-600 font-bold">{progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div 
                                        className={`h-1.5 rounded-full transition-all duration-500 ${task.status === TaskStatus.DONE ? 'bg-green-500' : frozen ? 'bg-gray-400' : 'bg-blue-500'}`}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                            
                            <h4 className="font-bold text-gray-800 mb-1 cursor-pointer hover:text-blue-600" onClick={() => handleOpenTask(task)}>{task.title}</h4>
                            <p className="text-xs text-gray-500 mb-4">
                                {new Date(task.startDate).toLocaleDateString('en-IN')} - {new Date(task.dueDate).toLocaleDateString('en-IN')}
                            </p>
                            
                            {/* Progress Bar (Duplicate removed) */}

                            {/* Status Icons */}
                            <div className="flex gap-2 mb-3 flex-wrap">
                              {task.status === TaskStatus.REVIEW && (
                                <>
                                  {task.approvals?.completion?.client?.status === 'approved' && task.approvals?.completion?.designer?.status === 'approved' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Approved by Both</span>
                                  )}
                                  {task.approvals?.completion?.client?.status === 'approved' && !task.approvals?.completion?.designer?.status && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Waiting for Designer Approval</span>
                                  )}
                                  {task.approvals?.completion?.designer?.status === 'approved' && !task.approvals?.completion?.client?.status && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Waiting for Client Approval</span>
                                  )}
                                  {!task.approvals?.completion?.client?.status && !task.approvals?.completion?.designer?.status && (
                                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Under Review</span>
                                  )}
                                  {task.approvals?.completion?.client?.status === 'rejected' && (
                                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Rejected by Client</span>
                                  )}
                                  {task.approvals?.completion?.designer?.status === 'rejected' && (
                                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Rejected by Designer</span>
                                  )}
                                </>
                              )}
                              {task.status === TaskStatus.OVERDUE && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Overdue</span>}
                            </div>

                            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-2">
                              {task.subtasks.map(st => (
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

                            {/* Action Buttons - Bottom Right */}
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                              <div className="flex items-center gap-2">
                                {getAvatarComponent(task.assigneeId, 'sm')}
                                <span className="text-xs text-gray-500">{getAssigneeName(task.assigneeId)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {user.role === Role.ADMIN && (
                                    <>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleSendReminder(task); }}
                                            className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                            title="Send Email Reminder"
                                        >
                                            <Bell className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyTaskLink(task.id);
                                          }}
                                          className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                          title="Copy task link"
                                        >
                                          <Link2 className="w-4 h-4" />
                                        </button>
                                        {(() => {
                                          const assignee = users.find(u => u.id === task.assigneeId);
                                          return assignee && assignee.phone ? (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const message = `Hi ${assignee.name},\n\nTask: "${task.title}"\nProject: "${project.name}"\nDue: ${new Date(task.dueDate).toLocaleDateString('en-IN')}\n\nPlease update the status.`;
                                              openWhatsAppChat(assignee, message);
                                              }}
                                              className="text-gray-400 hover:text-green-600 p-1 rounded-full hover:bg-green-50 transition-colors"
                                              title={`Chat on WhatsApp: ${assignee.phone}`}
                                            >
                                              <MessageCircle className="w-4 h-4" />
                                            </button>
                                          ) : null;
                                        })()}
                                    </>
                                )}
                                {/* Share link for Vendors & Designers (Non-Admin) */}
                                {(user.role === Role.VENDOR || user.role === Role.DESIGNER) && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyTaskLink(task.id);
                                        }}
                                        className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                        title="Copy task link"
                                      >
                                        <Link2 className="w-4 h-4" />
                                      </button>
                                      {(() => {
                                        const assignee = users.find(u => u.id === task.assigneeId);
                                        return assignee && assignee.phone ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const message = `Hi ${assignee.name},\n\nTask: "${task.title}"\nProject: "${project.name}"\nDue: ${new Date(task.dueDate).toLocaleDateString('en-IN')}\n\nPlease check the task details and update the status.`;
                                            openWhatsAppChat(assignee, message);
                                            }}
                                            className="text-gray-400 hover:text-green-600 p-1 rounded-full hover:bg-green-50 transition-colors"
                                            title={`Share on WhatsApp: ${assignee.phone}`}
                                          >
                                            <MessageCircle className="w-4 h-4" />
                                          </button>
                                        ) : null;
                                      })()}
                                    </>
                                )}
                                {/* Comments Count */}
                                {task.comments.length > 0 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenTask(task); }}
                                    className="text-gray-400 hover:text-gray-700 p-0.5 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-0.5"
                                    title={`${task.comments.length} comment${task.comments.length !== 1 ? 's' : ''}`}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span className="text-[10px] font-medium">{task.comments.length}</span>
                                  </button>
                                )}
                              </div>
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
                 {/* Upload Button - Available to all authorized roles */}
                 {canUploadDocs && (
                   <button 
                     onClick={() => { setIsDocModalOpen(true); setSelectedFile(null); }}
                     className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-6 hover:bg-gray-50 hover:border-gray-400 transition-all text-gray-400 hover:text-gray-600 bg-white"
                   >
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-sm font-bold">Upload File</span>
                   </button>
                 )}

                 {/* Files */}
                 {(realTimeDocuments || [])
                    .filter(doc => doc.sharedWith.includes(user.role as any) || user.role === Role.ADMIN)
                    .map(doc => (
                    <div key={doc.id} className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                       {/* Overlay Actions */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                          <button 
                            className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100" 
                            title="Comments"
                            onClick={() => handleOpenDocumentDetail(doc)}
                          >
                             <MessageSquare className="w-4 h-4" />
                          </button>
                          <button 
                            className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100" 
                            title="View"
                            onClick={() => window.open(doc.url, '_blank')}
                          >
                             <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100" 
                            title="Download"
                            onClick={() => handleDownloadDocument(doc)}
                          >
                             <Download className="w-4 h-4" />
                          </button>
                       </div>
                       
                       <div className="h-32 bg-gray-100 flex items-center justify-center overflow-hidden">
                          {doc.type === 'image' ? (
                              <img src={doc.url || DEFAULT_AVATAR} alt={doc.name} className="w-full h-full object-cover" />
                          ) : (
                              <FileText className="w-12 h-12 text-gray-400" />
                          )}
                       </div>
                       <div className="p-3">
                          <p className="text-sm font-bold text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                          <div className="flex justify-between items-center mt-2">
                             <span className="text-xs text-gray-400">{new Date(doc.uploadDate).toLocaleDateString('en-IN')}</span>
                             <img src={getAssigneeAvatar(doc.uploadedBy)} className="w-5 h-5 rounded-full" title="Uploaded by" alt=""/>
                          </div>
                          <div className="mt-2 flex gap-1">
                             {doc.sharedWith.map(role => (
                                <span key={role} className="text-[9px] uppercase bg-gray-100 text-gray-500 px-1 rounded">{role.substr(0,1)}</span>
                             ))}
                          </div>
                          {doc.comments && doc.comments.length > 0 && (
                            <div className="mt-2 text-xs text-blue-600 font-medium">
                              {doc.comments.length} {doc.comments.length === 1 ? 'comment' : 'comments'}
                            </div>
                          )}
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
            
            {/* NEW: Budget Overview Section */}
            <div className="bg-gray-900 text-white p-6 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="text-gray-400 text-xs font-bold uppercase mb-1">Total Project Budget</p>
                        {canEditProject && (
                            <button 
                                onClick={() => {
                                    const amount = prompt("Enter additional budget amount:");
                                    if (amount && !isNaN(parseFloat(amount))) {
                                        const additional = parseFloat(amount);
                                        const newBudget = project.budget + additional;
                                        
                                        // Set initialBudget on first increase if not already set
                                        const updatedProject = {
                                            ...project,
                                            budget: newBudget,
                                            initialBudget: project.initialBudget || project.budget
                                        };
                                        
                                        // Update project with new budget
                                        onUpdateProject(updatedProject);
                                        
                                        // Log timeline event for budget increase
                                        logTimelineEvent(
                                            project.id,
                                            `Budget Increased: ₹${additional.toLocaleString()}`,
                                            `Budget increased by ₹${additional.toLocaleString()} by ${user.name}. Previous: ₹${project.budget.toLocaleString()} | New Total: ₹${newBudget.toLocaleString()} | Paid By: Client | Status: Paid`,
                                            'completed',
                                            new Date().toISOString().split('T')[0],
                                            new Date().toISOString().split('T')[0]
                                        );
                                        
                                        // Log activity
                                        logActivity('Budget', `Budget increased by ₹${additional.toLocaleString()} by ${user.name}. New Total: ₹${newBudget.toLocaleString()}`);
                                        
                                        addNotification({
                                            id: Date.now().toString(),
                                            message: `Budget increased by ₹${additional.toLocaleString()}. New Total: ₹${newBudget.toLocaleString()}`,
                                            type: 'success',
                                            read: false,
                                            timestamp: new Date(),
                                            recipientId: project.clientId,
                                            projectId: project.id,
                                            projectName: project.name
                                        });
                                    }
                                }}
                                className="text-[10px] bg-gray-800 hover:bg-gray-700 text-emerald-400 px-2 py-0.5 rounded border border-gray-700 transition-colors flex items-center gap-1"
                                title="Add to Project Budget"
                            >
                                <Plus className="w-3 h-3" /> Add Funds
                            </button>
                        )}
                    </div>
                    <h2 className="text-4xl font-bold tracking-tight">₹{project.budget.toLocaleString()}</h2>
                    {project.initialBudget && project.budget > project.initialBudget && (
                        <div className="mt-3 space-y-1">
                            <p className="text-xs text-gray-400">Initial Budget: ₹{project.initialBudget.toLocaleString()}</p>
                            <p className="text-xs text-emerald-400 font-medium">
                                Additional Budget: ₹{(project.budget - project.initialBudget).toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>
                <div className="text-left md:text-right">
                    <p className="text-gray-400 text-xs font-bold uppercase mb-1">Remaining Budget</p>
                     {/* Remaining = Budget - Total Expenses (Paid + Pending) to reflect actual committed cost against budget */}
                    <h2 className={`text-2xl font-bold ${project.budget - (paidOut + pendingExpenses) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        ₹{(project.budget - (paidOut + pendingExpenses)).toLocaleString()}
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-1">Budget - (Paid + Pending Expenses)</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
               <div className="bg-green-50 p-6 rounded-xl border border-green-100 relative overflow-hidden">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-green-800">Total Received (Client)</p>
                    <ArrowRight className="w-5 h-5 text-green-300" />
                 </div>
                 <h3 className="text-3xl font-bold text-green-700">₹{received.toLocaleString()}</h3>
                 <p className="text-xs text-green-600 mt-1 font-medium">Pending Invoices: ₹{pendingIncome.toLocaleString()}</p>
                 {/* Budget Progress Indicator */}
                 <div className="mt-4 pt-4 border-t border-green-200/50">
                     <div className="flex justify-between text-[10px] text-green-800 mb-1 uppercase font-bold">
                        <span>Budget Collected</span>
                        <span>{Math.round((received / project.budget) * 100)}%</span>
                     </div>
                     <div className="w-full bg-green-200 h-1.5 rounded-full">
                        <div 
                          className="bg-green-600 h-1.5 rounded-full transition-all duration-1000" 
                          {...{ style: { width: `${Math.min((received/project.budget)*100, 100)}%` } }}
                          aria-label={`Budget collected: ${Math.round((received / project.budget) * 100)}%`}
                        ></div>
                     </div>
                  </div>
               </div>
               
               <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-red-800">Total Paid Out (Vendors)</p>
                    <ArrowRight className="w-5 h-5 text-red-300" />
                 </div>
                 <h3 className="text-3xl font-bold text-red-700">₹{paidOut.toLocaleString()}</h3>
                 <p className="text-xs text-red-600 mt-1 font-medium">Pending Bills: ₹{pendingExpenses.toLocaleString()}</p>
                 <div className="mt-4 pt-4 border-t border-red-200/50">
                     <p className="text-xs text-red-500">
                        Tracks cash outflow to vendors and material suppliers.
                     </p>
                 </div>
               </div>
            </div>

            {/* Detailed Financial Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-800">Financial Summary & Analysis</h3>
              </div>
              <div className="p-6 space-y-6">
                {/* Income Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    Income Breakdown
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                      <p className="text-xs text-green-600 font-bold uppercase mb-1">Received</p>
                      <p className="text-xl font-bold text-green-700">₹{received.toLocaleString()}</p>
                      <p className="text-xs text-green-600 mt-1">{Math.round((received / project.budget) * 100)}% of budget</p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                      <p className="text-xs text-yellow-600 font-bold uppercase mb-1">Pending</p>
                      <p className="text-xl font-bold text-yellow-700">₹{pendingIncome.toLocaleString()}</p>
                      <p className="text-xs text-yellow-600 mt-1">Awaiting payment</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-xs text-blue-600 font-bold uppercase mb-1">Total Expected</p>
                      <p className="text-xl font-bold text-blue-700">₹{(received + pendingIncome).toLocaleString()}</p>
                      <p className="text-xs text-blue-600 mt-1">{Math.round(((received + pendingIncome) / project.budget) * 100)}% of budget</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-600 font-bold uppercase mb-1">Shortfall</p>
                      <p className={`text-xl font-bold ${project.budget - (received + pendingIncome) < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                        ₹{(project.budget - (received + pendingIncome)).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Remaining to collect</p>
                    </div>
                  </div>
                </div>

                {/* Expense Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    Expense Breakdown
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                      <p className="text-xs text-red-600 font-bold uppercase mb-1">Paid Out</p>
                      <p className="text-xl font-bold text-red-700">₹{paidOut.toLocaleString()}</p>
                      <p className="text-xs text-red-600 mt-1">{Math.round((paidOut / project.budget) * 100)}% of budget</p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                      <p className="text-xs text-yellow-600 font-bold uppercase mb-1">Pending</p>
                      <p className="text-xl font-bold text-yellow-700">₹{pendingExpenses.toLocaleString()}</p>
                      <p className="text-xs text-yellow-600 mt-1">Awaiting payment</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-xs text-blue-600 font-bold uppercase mb-1">Total Committed</p>
                      <p className="text-xl font-bold text-blue-700">₹{(paidOut + pendingExpenses).toLocaleString()}</p>
                      <p className="text-xs text-blue-600 mt-1">{Math.round(((paidOut + pendingExpenses) / project.budget) * 100)}% of budget</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-600 font-bold uppercase mb-1">Remaining</p>
                      <p className={`text-xl font-bold ${project.budget - (paidOut + pendingExpenses) < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                        ₹{(project.budget - (paidOut + pendingExpenses)).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Available budget</p>
                    </div>
                  </div>
                </div>

                {/* Profit/Loss Analysis */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    Profit & Loss Analysis
                  </h4>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-purple-200">
                      <span className="text-sm text-gray-700">Income (Received)</span>
                      <span className="font-bold text-green-700">+₹{received.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-purple-200">
                      <span className="text-sm text-gray-700">Expenses (Paid Out)</span>
                      <span className="font-bold text-red-700">-₹{paidOut.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm font-bold text-gray-800">Current Profit/Loss</span>
                      <span className={`text-lg font-bold ${received - paidOut >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {received - paidOut >= 0 ? '+' : ''}₹{(received - paidOut).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Project Health Indicator */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-700">Project Financial Health</h4>
                  <div className="space-y-3">
                    {/* Budget Utilization */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-gray-600">Budget Utilization</span>
                        <span className="text-xs font-bold text-gray-700">{Math.round(((paidOut + pendingExpenses) / project.budget) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            ((paidOut + pendingExpenses) / project.budget) > 0.9 ? 'bg-red-500' :
                            ((paidOut + pendingExpenses) / project.budget) > 0.7 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(((paidOut + pendingExpenses) / project.budget) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Income Collection */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-gray-600">Income Collection Rate</span>
                        <span className="text-xs font-bold text-gray-700">{Math.round(((received) / project.budget) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${Math.min((received / project.budget) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Margin Health */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-gray-600">Profit Margin</span>
                        <span className={`text-xs font-bold ${received - paidOut >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {received > 0 ? Math.round(((received - paidOut) / received) * 100) : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${received - paidOut >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.max(Math.min(Math.abs((received - paidOut) / received) * 100, 100), 0)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Transaction Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[300px]">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800">Transaction Ledger</h3>
                    <div className="flex gap-2 relative">
                        {/* Filter Button */}
                        <button 
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`text-xs border px-3 py-1.5 rounded-lg hover:bg-white text-gray-700 flex items-center gap-2 font-medium transition-colors ${transactionFilter !== 'all' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300'}`}
                        >
                            <Filter className="w-3.5 h-3.5"/> 
                            <span className="capitalize">{transactionFilter === 'all' ? 'Filter' : transactionFilter}</span>
                        </button>
                        
                        {/* Filter Dropdown */}
                        {isFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
                                <div className="absolute right-0 top-9 bg-white shadow-xl border border-gray-100 rounded-lg p-1.5 z-20 w-36 flex flex-col gap-0.5 animate-fade-in">
                                    {['all', 'income', 'expense', 'pending', 'overdue'].map(f => (
                                        <button 
                                            key={f}
                                            onClick={() => { setTransactionFilter(f as any); setIsFilterOpen(false); }}
                                            className={`text-left text-xs px-3 py-2 rounded-md capitalize font-medium ${transactionFilter === f ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        {/* Removed duplicate New Entry button as per request */}
                    </div>
                </div>
                <table className="w-full text-sm text-left">
                <thead className="bg-white text-gray-500 border-b border-gray-100">
                    <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium">Flow</th>
                    <th className="px-6 py-3 font-medium">Paid By</th>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                    <th className="px-6 py-3 font-medium"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredFinancials.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-center py-10 text-gray-400">
                                {currentFinancials.length === 0 ? 'No transactions recorded.' : 'No transactions match filters.'}
                            </td>
                        </tr>
                    )}
                    {filteredFinancials.map(fin => (
                    <tr key={fin.id} className="hover:bg-gray-50 group transition-colors">
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{fin.date}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <div>{fin.description}</div>
                        </td>
                        <td className="px-6 py-4">
                        {fin.type === 'income' ? (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase"><ArrowRight className="w-3 h-3 rotate-180" /> In</span>
                        ) : fin.type === 'expense' ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-bold uppercase"><ArrowRight className="w-3 h-3" /> Out</span>
                        ) : (
                            <span className="flex items-center gap-1 text-purple-600 text-xs font-bold uppercase">Design Fee</span>
                        )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                            fin.paidBy === 'client' ? 'bg-blue-100 text-blue-700' :
                            fin.paidBy === 'vendor' ? 'bg-purple-100 text-purple-700' :
                            fin.paidBy === 'designer' ? 'bg-orange-100 text-orange-700' :
                            fin.paidBy === 'admin' ? 'bg-red-100 text-red-700' :
                            fin.type === 'income' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {fin.paidBy === 'client' ? 'Client' :
                             fin.paidBy === 'vendor' ? 'Vendor' :
                             fin.paidBy === 'designer' ? 'Designer' :
                             fin.paidBy === 'admin' ? 'Admin' :
                             fin.type === 'income' ? 'Client' :
                             fin.type === 'expense' ? 'Project' :
                             'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-700 text-sm font-medium">
                          {fin.vendorName || '-'}
                        </td>
                        <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium capitalize
                            ${fin.status === 'paid' ? 'bg-green-100 text-green-700' : 
                              fin.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {fin.status}
                        </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-bold whitespace-nowrap ${fin.type === 'income' ? 'text-green-600' : 'text-gray-900'}`}>
                        ₹{fin.amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canEditProject && (
                             <button 
                               onClick={() => openTransactionModal(fin.id)}
                               className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-blue-50 rounded-full"
                               title="Edit Transaction"
                             >
                                <Pencil className="w-4 h-4" />
                             </button>
                          )}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>

            {/* Vendor Billing Report Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-800">{isVendor ? 'My Payment Records' : 'Vendor Billing Report'}</h3>
              </div>
              
              {currentFinancials.filter(f => {
                const isVendorRecord = (f.type === 'expense' && f.paidBy === 'vendor') || (f.type === 'income' && f.paidBy === 'vendor');
                // If vendor, only show their own records
                if (isVendor) {
                  return isVendorRecord && f.vendorName === user.name;
                }
                // If admin/client, show all vendor records
                return isVendorRecord;
              }).length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-400">
                  {isVendor ? 'No payment records for you yet.' : 'No vendor transactions recorded yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-bold text-gray-700">Vendor</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Type</th>
                        <th className="px-4 py-2 text-right font-bold text-gray-700">Amount</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Admin Approval</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Client Approval</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentFinancials.filter(f => {
                        const isVendorRecord = (f.type === 'expense' && f.paidBy === 'vendor') || (f.type === 'income' && f.paidBy === 'vendor');
                        if (isVendor) {
                          return isVendorRecord && f.vendorName === user.name;
                        }
                        return isVendorRecord;
                      }).map((expense, idx) => (
                        <tr key={expense.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{expense.vendorName || 'Unknown'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${expense.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {expense.type === 'income' ? 'In' : 'Out'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">₹{expense.amount.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <input 
                                type="checkbox" 
                                checked={expense.adminApproved === true}
                                disabled={!canEditProject || expense.adminApproved}
                                title="Admin approval checkbox"
                                aria-label="Approve as admin"
                                onChange={(e) => {
                                  if (e.target.checked && !expense.adminApproved) {
                                    const updatedProject = {
                                      ...project,
                                      financials: currentFinancials.map(f => 
                                        f.id === expense.id ? {...f, adminApproved: true} : f
                                      )
                                    };
                                    onUpdateProject(updatedProject);
                                    addNotification({
                                      id: Date.now().toString(),
                                      message: `Admin approval approved for vendor ${expense.vendorName}`,
                                      type: 'success',
                                      read: false,
                                      timestamp: new Date(),
                                      recipientId: project.clientId,
                                      projectId: project.id,
                                      projectName: project.name
                                    });
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 cursor-pointer hover:border-gray-400 disabled:cursor-not-allowed"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <input 
                                type="checkbox" 
                                checked={expense.clientApproved === true}
                                disabled={!canEditProject || expense.clientApproved}
                                title="Client approval checkbox"
                                aria-label="Approve as client"
                                onChange={(e) => {
                                  if (e.target.checked && !expense.clientApproved) {
                                    const updatedProject = {
                                      ...project,
                                      financials: currentFinancials.map(f => 
                                        f.id === expense.id ? {...f, clientApproved: true} : f
                                      )
                                    };
                                    onUpdateProject(updatedProject);
                                    addNotification({
                                      id: Date.now().toString(),
                                      message: `Client approval approved for vendor ${expense.vendorName}`,
                                      type: 'success',
                                      read: false,
                                      timestamp: new Date(),
                                      recipientId: project.clientId,
                                      projectId: project.id,
                                      projectName: project.name
                                    });
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 cursor-pointer hover:border-gray-400 disabled:cursor-not-allowed"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              expense.adminApproved && expense.clientApproved ? 'bg-green-100 text-green-700' :
                              expense.adminApproved ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {expense.adminApproved && expense.clientApproved ? 'Approved' :
                               expense.adminApproved ? 'Admin OK' :
                               'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && !isVendor && (
           <div className="max-w-3xl mx-auto">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
               <h3 className="text-lg font-bold text-gray-800 mb-6">Project Timeline</h3>
               <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
                  {(!realTimeTimelines || realTimeTimelines.length === 0) && (
                     <div className="pl-6 text-gray-400 italic">No timeline events yet. Add milestones to track project progress.</div>
                  )}
                  {realTimeTimelines?.sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).map(timeline => (
                    <div key={timeline.id} className="relative pl-8">
                      {/* Timeline Dot */}
                      <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm
                        ${timeline.status === 'completed' ? 'bg-green-500' : timeline.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-400'}`} 
                      />
                      
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                         <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">{timeline.title || timeline.milestone}</p>
                            <p className="text-gray-600 text-sm mt-0.5">{timeline.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                               <span className={`text-xs px-2 py-1 rounded-full font-medium
                                 ${timeline.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                   timeline.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 
                                   'bg-gray-100 text-gray-700'}`}>
                                 {timeline.status}
                               </span>
                            </div>
                         </div>
                         <span className="text-xs text-gray-400 mt-2 sm:mt-0 font-mono">
                            {new Date(timeline.startDate).toLocaleDateString('en-IN')}
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
                  {/* Primary Client */}
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                     <div className="flex items-center gap-4">
                        {getAvatarComponent(project.clientId, 'md')}
                        <div>
                            <p className="font-bold text-gray-900">{getAssigneeName(project.clientId)}</p>
                            <p className="text-xs text-gray-500">Primary Client</p>
                        </div>
                     </div>
                     {user.role === Role.ADMIN && (
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => {
                                    const client = users.find(u => u.id === project.clientId);
                                    if (client) handleSendPaymentReminder(client);
                                }}
                                className="text-gray-400 hover:text-green-600 p-2 rounded-full hover:bg-green-50 transition-colors"
                                title="Send Payment Reminder Email"
                            >
                                <IndianRupee className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const projectLink = `${window.location.origin}${window.location.pathname}?projectId=${project.id}`;
                                navigator.clipboard.writeText(projectLink).then(() => {
                                  addNotification('Success', 'Project link copied to clipboard', 'success');
                                }).catch(() => {
                                  addNotification('Error', 'Failed to copy link', 'error');
                                });
                              }}
                              className="text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition-colors"
                              title="Copy project link"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                        </div>
                     )}
                  </div>

                  {/* Additional Clients */}
                  {project.clientIds && project.clientIds.length > 0 && (
                     <div className="pt-2 space-y-3">
                         <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Additional Clients</h4>
                         {project.clientIds.map(clientId => {
                            const client = users.find(u => u.id === clientId);
                            if (!client) return null;
                            return (
                                <div key={client.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                                    <AvatarCircle avatar={client.avatar} name={client.name} size="sm" />
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800 text-sm">{client.name}</p>
                                        <p className="text-xs text-gray-500">Client</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {user.role === Role.ADMIN && (
                                            <>
                                                <button 
                                                    onClick={() => handleSendPaymentReminder(client)}
                                                    className="text-gray-400 hover:text-green-600 p-1.5 rounded-full hover:bg-green-50 transition-colors"
                                                    title="Send Payment Reminder Email"
                                                >
                                                    <IndianRupee className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    const projectLink = `${window.location.origin}${window.location.pathname}?projectId=${project.id}`;
                                                    navigator.clipboard.writeText(projectLink).then(() => {
                                                      addNotification('Success', 'Project link copied to clipboard', 'success');
                                                    }).catch(() => {
                                                      addNotification('Error', 'Failed to copy link', 'error');
                                                    });
                                                  }}
                                                  className="text-gray-400 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50 transition-colors"
                                                  title="Copy project link"
                                                >
                                                  <Link2 className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        )}
                                        {canEditProject && (
                                            <button 
                                                onClick={() => {
                                                    const updated = {
                                                        ...project,
                                                        clientIds: (project.clientIds || []).filter(id => id !== clientId)
                                                    };
                                                    onUpdateProject(updated);
                                                    addNotification({
                                                        id: Date.now().toString(),
                                                        message: `Client ${client.name} removed from project`,
                                                        type: 'success',
                                                        read: false,
                                                        timestamp: new Date(),
                                                        recipientId: project.clientId,
                                                        projectId: project.id,
                                                        projectName: project.name
                                                    });
                                                }}
                                                className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
                                                title="Remove Client"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                         })}
                     </div>
                  )}

                  <div className="flex items-center gap-4 border-b border-gray-50 pb-2">
                     {getAvatarComponent(project.leadDesignerId, 'md')}
                     <div>
                        <p className="font-bold text-gray-900">{getAssigneeName(project.leadDesignerId)}</p>
                        <p className="text-xs text-gray-500">Lead Designer</p>
                     </div>
                  </div>
                  
                  {/* Explicitly Added Members */}
                  {project.teamMembers && project.teamMembers.length > 0 && (
                     <div className="pt-2 space-y-3">
                         <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Team Members</h4>
                         {project.teamMembers.map(memberId => {
                            const member = users.find(u => u.id === memberId);
                            if (!member) return null;
                            return (
                                <div key={member.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                                    <AvatarCircle avatar={member.avatar} name={member.name} size="sm" />
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">{member.name}</p>
                                        <p className="text-xs text-gray-500">{member.role}</p>
                                    </div>
                                </div>
                            );
                         })}
                     </div>
                  )}

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
                                            <div 
                                                key={v.id} 
                                                onClick={() => {
                                                  // Only allow vendors to click on their own record
                                                  if (!isVendor || v.id === user.id) {
                                                    setSelectedVendorForBilling(v);
                                                  }
                                                }}
                                                className={`flex items-center gap-3 p-2 rounded-lg transition-colors border border-transparent ${
                                                  isVendor && v.id !== user.id 
                                                    ? 'opacity-60 cursor-default' 
                                                    : 'hover:bg-gray-50 hover:border-gray-100 cursor-pointer group'
                                                }`}
                                                title={isVendor && v.id !== user.id ? "You can only view your own billing report" : "Click to view billing report"}
                                            >
                                                <AvatarCircle avatar={v.avatar} name={v.name} size="sm" />
                                                <div>
                                                    <p className="font-bold text-gray-800 text-sm">{v.name}</p>
                                                    <p className="text-xs text-gray-500">{v.company || 'Independent'}</p>
                                                </div>
                                                <div className="ml-auto flex items-center gap-2">
                                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                                                        {project.tasks.filter(t => t.assigneeId === v.id).length} Tasks
                                                    </span>
                                                    {!isVendor || v.id === user.id ? (
                                                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                                                    ) : null}
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
      {/* Invite Member Modal */}
      {isMemberModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
               <h3 className="text-lg font-bold mb-4 text-gray-900 flex items-center gap-2"><UserIcon className="w-5 h-5"/> Add to Project</h3>
               <div className="space-y-4">
                  {/* Type Selector */}
                  <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                      <button 
                          onClick={() => { setMemberModalType('client'); setSelectedMemberId(''); }}
                          className={`flex-1 py-2 rounded font-medium text-xs transition-colors ${memberModalType === 'client' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                          Add Client
                      </button>
                      <button 
                          onClick={() => { setMemberModalType('member'); setSelectedMemberId(''); }}
                          className={`flex-1 py-2 rounded font-medium text-xs transition-colors ${memberModalType === 'member' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                          Add Vendor
                      </button>
                  </div>

                  <div>
                      <label className="text-xs font-bold text-gray-500 uppercase">Select {memberModalType === 'client' ? 'Client' : 'Vendor'}</label>
                      <div className="relative mt-1">
                          <select 
                              className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                              value={selectedMemberId}
                              onChange={(e) => setSelectedMemberId(e.target.value)}
                              title={`Select a ${memberModalType === 'client' ? 'client' : 'vendor'} to add`}
                              aria-label={`Select ${memberModalType === 'client' ? 'client' : 'vendor'}`}
                          >
                              <option value="">Select a person...</option>
                              {memberModalType === 'client' 
                                ? users
                                    .filter(u => 
                                        u.role === Role.CLIENT &&
                                        u.id !== project.clientId &&
                                        !(project.clientIds || []).includes(u.id)
                                    )
                                    .map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name}
                                        </option>
                                    ))
                                : users
                                    .filter(u => 
                                        u.role === Role.VENDOR
                                    )
                                    .map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name}
                                        </option>
                                    ))
                              }
                          </select>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                          {memberModalType === 'client' 
                            ? 'Select a client to add as additional contact for this project.' 
                            : 'Select a vendor to add to this project.'}
                      </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                      <button onClick={() => { setIsMemberModalOpen(false); setSelectedMemberId(''); }} className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                      <button onClick={handleInviteMember} className="flex-1 py-2 bg-gray-900 text-white rounded font-bold hover:bg-gray-800">Add {memberModalType === 'client' ? 'Client' : 'Vendor'}</button>
                  </div>
               </div>
           </div>
        </div>,
        document.body
      )}

      {/* Financial Transaction Modal */}
      {isTransactionModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           {/* ... (Same as before) ... */}
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 animate-fade-in scrollbar-thin">
              <h3 className="text-lg font-bold mb-3 text-gray-900 flex items-center gap-2">
                <IndianRupee className="w-5 h-5"/> {editingTransactionId ? 'Edit Transaction' : 'Record Transaction'}
              </h3>
              <div className="space-y-3">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Amount <span className="text-red-500">*</span></label>
                    <div className="relative mt-1">
                        <span className="absolute left-3 top-2 text-gray-400">₹</span>
                        <input 
                            type="number" 
                            className={`${getInputClass(showTransactionErrors && !newTransaction.amount)} pl-7`}
                            placeholder="0.00"
                            title="Enter transaction amount"
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
                        title="Enter transaction description"
                        value={newTransaction.description || ''} 
                        onChange={e => setNewTransaction({...newTransaction, description: e.target.value})}
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                        <div className="flex gap-2 mt-1">
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, type: 'income'})}
                                className={`flex-1 py-1.5 text-xs font-bold rounded ${newTransaction.type === 'income' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-gray-50 text-gray-500'}`}
                            >Income</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                                className={`flex-1 py-1.5 text-xs font-bold rounded ${newTransaction.type === 'expense' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-gray-50 text-gray-500'}`}
                            >Expense</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                        <input 
                            type="date" 
                            className={`${getInputClass(showTransactionErrors && !newTransaction.date)} mt-1 text-xs`}
                            title="Select transaction date"
                            value={newTransaction.date}
                            onChange={e => setNewTransaction({...newTransaction, date: e.target.value})}
                        />
                    </div>
                 </div>

                 {newTransaction.type === 'expense' && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Paid By</label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'client'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'}`}
                            >Client</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'vendor'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'vendor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'}`}
                            >Vendor</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'designer'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'designer' ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}`}
                            >Designer</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'admin'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500'}`}
                            >Admin</button>
                        </div>
                      </div>
                      {newTransaction.paidBy === 'client' && (
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Select Client</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select a client from the list"
                          >
                              <option value="">Select a client...</option>
                              {users.filter(u => u.role === Role.CLIENT).map(client => (
                                <option key={client.id} value={client.name}>
                                  {client.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {newTransaction.paidBy === 'vendor' && (
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select a vendor from the list"
                          >
                              <option value="">Select a vendor...</option>
                              {users.filter(u => u.role === Role.VENDOR).map(vendor => (
                                <option key={vendor.id} value={vendor.name}>
                                  {vendor.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {newTransaction.paidBy === 'designer' && (
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Select Designer</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select a designer from the list"
                          >
                              <option value="">Select a designer...</option>
                              {users.filter(u => u.role === Role.DESIGNER).map(designer => (
                                <option key={designer.id} value={designer.name}>
                                  {designer.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </>
                 )}

                 {newTransaction.type === 'income' && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Received By</label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'designer'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'designer' ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}`}
                            >Designer</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'vendor'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'vendor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'}`}
                            >Vendor</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'admin'})}
                                className={`py-1 px-2 text-xs font-bold rounded ${newTransaction.paidBy === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500'}`}
                            >Admin</button>
                        </div>
                      </div>
                      {newTransaction.paidBy === 'vendor' && (
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select a vendor from the list"
                          >
                              <option value="">Select a vendor...</option>
                              {users.filter(u => u.role === Role.VENDOR).map(vendor => (
                                <option key={vendor.id} value={vendor.name}>
                                  {vendor.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {newTransaction.paidBy === 'designer' && (
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Select Designer</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select a designer from the list"
                          >
                              <option value="">Select a designer...</option>
                              {users.filter(u => u.role === Role.DESIGNER).map(designer => (
                                <option key={designer.id} value={designer.name}>
                                  {designer.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </>
                 )}

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                        <select 
                            className={`${getInputClass(showTransactionErrors && !newTransaction.category)} mt-1 text-xs`}
                            value={newTransaction.category || ''}
                            onChange={e => setNewTransaction({...newTransaction, category: e.target.value})}
                            aria-label="Transaction category"
                        >
                            <option value="">Select...</option>
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
                            className={`${getInputClass(false)} mt-1 text-xs`}
                            value={newTransaction.status}
                            onChange={e => setNewTransaction({...newTransaction, status: e.target.value as any})}
                            aria-label="Transaction status"
                        >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                        </select>
                    </div>
                 </div>

                 <div className="pt-2 flex gap-3">
                    <button onClick={() => {
                      setIsTransactionModalOpen(false);
                      setShowTransactionErrors(false);
                      setEditingTransactionId(null);
                    }} className="flex-1 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed" disabled={isSavingTransaction} title="Close transaction modal">Cancel</button>
                    <button onClick={handleSaveTransaction} disabled={isSavingTransaction} className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all" title="Save transaction entry">
                      {isSavingTransaction ? 'Saving...' : (editingTransactionId ? 'Update Entry' : 'Add Entry')}
                    </button>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Document Upload Modal */}
      {isDocModalOpen && createPortal(
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
               <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900"><Upload className="w-5 h-5"/> Upload Document</h3>
               <div className="space-y-4">
                  <input 
                    type="text" placeholder="Document Name (e.g. FloorPlan.pdf)" 
                    className={getInputClass(showDocErrors && !newDoc.name && !selectedFile)}
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

                  <div 
                    className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300 text-center text-sm text-gray-500 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer relative"
                    onClick={() => fileInputRef.current?.click()}
                  >
                     {selectedFile ? (
                       <div className="flex flex-col items-center">
                          <FileIcon className="w-8 h-8 text-blue-500 mb-2" />
                          <p className="font-bold text-gray-800">{selectedFile.name}</p>
                          <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                       </div>
                     ) : (
                       <div className="flex flex-col items-center">
                          <Upload className="w-8 h-8 text-gray-300 mb-2" />
                          <p>Click to select file</p>
                          <p className="text-xs text-gray-400 mt-1">or drag and drop here</p>
                       </div>
                     )}
                     <input 
                       type="file" 
                       ref={fileInputRef}
                       onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setSelectedFile(file);
                       }}
                       className="hidden"
                       title="Select file to upload"
                     />
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
                <button onClick={() => setIsTaskModalOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close task modal"><X/></button>
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
                                   {editingTask.status === TaskStatus.ON_HOLD ? (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, TaskStatus.IN_PROGRESS)})}
                                           className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <PlayCircle className="w-3 h-3"/> Resume Task
                                       </button>
                                   ) : (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: TaskStatus.ON_HOLD})}
                                           className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <PauseCircle className="w-3 h-3"/> Put On Hold
                                       </button>
                                   )}

                                   {editingTask.status === TaskStatus.ABORTED ? (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, TaskStatus.IN_PROGRESS)})}
                                           className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <History className="w-3 h-3"/> Restore
                                       </button>
                                   ) : (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: TaskStatus.ABORTED})}
                                           className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <Ban className="w-3 h-3"/> Abort Task
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
                              placeholder="Task title"
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
                              value={editingTask.category || 'General'} 
                              onChange={e => setEditingTask({...editingTask, category: e.target.value})}
                              disabled={isEditingFrozen}
                              aria-label="Task category"
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
                                  title="Start date"
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
                                  title="Due date"
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
                              {currentTasks.filter(t => t.id !== editingTask.id).length > 0 ? (
                                  currentTasks.filter(t => t.id !== editingTask.id).map(t => (
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
                                    currentTasks.filter(t => (editingTask.dependencies || []).includes(t.id)).map(t => (
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
                                 value={editingTask.assigneeId || ''} 
                                 onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})}
                                 disabled={isEditingFrozen}
                                 aria-label="Task assignee"
                               >
                                  <option value="">Unassigned</option>
                                  {users.filter(u => u.role === Role.DESIGNER || u.role === Role.VENDOR).map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                               </select>
                             ) : <p className="flex-1 text-sm bg-gray-50 p-2 rounded text-gray-800">{getAssigneeName(editingTask.assigneeId || '')}</p>}

                             {/* Task Link & WhatsApp Share Button */}
                             {editingTask.id && (
                               <>
                                 <button
                                   onClick={() => {
                                     copyTaskLink(editingTask.id);
                                   }}
                                   className="px-3 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded text-blue-700 flex items-center gap-2 transition-colors text-sm font-medium"
                                   title="Copy task link"
                                 >
                                   <Link2 className="w-4 h-4" />
                                   Copy Link
                                 </button>
                                 {editingTask.assigneeId && (() => {
                                   const assignee = users.find(u => u.id === editingTask.assigneeId);
                                   return assignee && assignee.phone ? (
                                     <button
                                       onClick={() => {
                                         const message = `Hi ${assignee.name},\n\nTask: "${editingTask.title}"\nProject: "${project.name}"\nDue: ${new Date(editingTask.dueDate || '').toLocaleDateString('en-IN')}\nStatus: ${editingTask.status}\n\nPlease check the task details.`;
                                         openWhatsAppChat(assignee, message);
                                       }}
                                       className="px-3 py-2 border border-green-200 bg-green-50 hover:bg-green-100 rounded text-green-700 flex items-center gap-2 transition-colors text-sm font-medium"
                                       title={`Share on WhatsApp: ${assignee.phone}`}
                                     >
                                       <MessageCircle className="w-4 h-4" />
                                       WhatsApp
                                     </button>
                                   ) : null;
                                 })()}
                               </>
                             )}

                             {canEditProject ? (
                               <select 
                                 className={`w-32 p-2 border rounded border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 ${isEditingFrozen ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                                 value={editingTask.priority || 'medium'} onChange={e => setEditingTask({...editingTask, priority: e.target.value as any})}
                                 disabled={isEditingFrozen}
                                 aria-label="Task priority"
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
                          <div className={`mt-1 w-full p-2 border rounded bg-gray-50 text-gray-700 font-bold flex justify-between items-center flex-wrap gap-2 ${isEditingFrozen ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                              <span>{editingTask.status || TaskStatus.TODO}</span>
                              {editingTask.status === TaskStatus.REVIEW && (
                                <div className="flex gap-1 flex-wrap">
                                  {editingTask.approvals?.completion?.client?.status === 'approved' && editingTask.approvals?.completion?.designer?.status === 'approved' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-normal">Approved by Both</span>
                                  )}
                                  {editingTask.approvals?.completion?.client?.status === 'approved' && !editingTask.approvals?.completion?.designer?.status && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-normal">Waiting for Designer Approval</span>
                                  )}
                                  {editingTask.approvals?.completion?.designer?.status === 'approved' && !editingTask.approvals?.completion?.client?.status && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-normal">Waiting for Client Approval</span>
                                  )}
                                  {!editingTask.approvals?.completion?.client?.status && !editingTask.approvals?.completion?.designer?.status && (
                                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-normal">Under Review</span>
                                  )}
                                  {editingTask.approvals?.completion?.client?.status === 'rejected' && (
                                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-normal">Rejected by Client</span>
                                  )}
                                  {editingTask.approvals?.completion?.designer?.status === 'rejected' && (
                                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-normal">Rejected by Designer</span>
                                  )}
                                </div>
                              )}
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
                         <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                            {editingTask.subtasks?.map((st, idx) => (
                              <div key={st.id} className="flex items-center gap-2">
                                 <input 
                                   type="checkbox" 
                                   checked={st.isCompleted} 
                                   title="Toggle subtask completion"
                                   aria-label="Toggle subtask completion"
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
                                      placeholder="Subtask title"
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
                                     title="Delete subtask"
                                     aria-label="Delete subtask"
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
                                          <button onClick={() => handleApproval('start', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve start"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('start', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject start"><ThumbsDown className="w-3 h-3"/></button>
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
                                          <button onClick={() => handleApproval('start', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve start"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('start', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject start"><ThumbsDown className="w-3 h-3"/></button>
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
                                          <button onClick={() => handleApproval('completion', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve completion"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('completion', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject completion"><ThumbsDown className="w-3 h-3"/></button>
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
                                          <button onClick={() => handleApproval('completion', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve completion"><ThumbsUp className="w-3 h-3"/></button>
                                          <button onClick={() => handleApproval('completion', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject completion"><ThumbsDown className="w-3 h-3"/></button>
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
                                  {getAvatarComponent(comment.userId, 'sm')}
                                  <div className={`p-2 rounded-lg max-w-[85%] text-sm ${isMe ? 'bg-blue-100 text-blue-900' : 'bg-white border border-gray-200 text-gray-700'}`}>
                                     <p className="text-[10px] font-bold opacity-70 mb-1">{getAssigneeName(comment.userId)}</p>
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
                             title="Send comment"
                          >
                             <Send className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-white">
                <div>
                  {/* Delete button for admins - only show for existing tasks */}
                  {isAdmin && editingTask.id && (
                    <button 
                      onClick={handleDeleteTaskRequest}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                      title="Delete this task permanently"
                    >
                      <Ban className="w-4 h-4" /> Delete Task
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg" title="Cancel">Cancel</button>
                  {/* Only Show Save if NOT frozen or if ADMIN */}
                  {(!isEditingFrozen || isAdmin) && (
                      <button onClick={handleSaveTask} className="px-6 py-2 text-sm font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 shadow-sm" title="Save task">
                          {editingTask.id ? 'Save Changes' : 'Create Task'}
                      </button>
                  )}
                </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Document Detail Modal with Comments */}
      {isDocDetailOpen && selectedDocument && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[90vh] flex flex-col animate-fade-in overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-3">
                   <FileText className="w-5 h-5 text-gray-400" />
                   <div>
                     <h3 className="font-bold text-gray-900">{selectedDocument.name}</h3>
                     <p className="text-xs text-gray-500">Uploaded {new Date(selectedDocument.uploadDate).toLocaleDateString('en-IN')}</p>
                   </div>
                </div>
                <button onClick={() => setIsDocDetailOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close document modal"><X className="w-5 h-5" /></button>
              </div>

              {/* Preview */}
              <div className="flex-1 overflow-hidden bg-gray-50 flex items-center justify-center">
                 {selectedDocument.type === 'image' ? (
                   <img src={selectedDocument.url || DEFAULT_AVATAR} alt={selectedDocument.name} className="max-h-full max-w-full object-contain" />
                 ) : (
                   <div className="text-center">
                     <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                     <p className="text-gray-500 text-sm">{selectedDocument.type.toUpperCase()} File</p>
                     <button 
                       onClick={() => window.open(selectedDocument.url, '_blank')}
                       className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                     >
                       Open in New Tab
                     </button>
                   </div>
                 )}
              </div>

              {/* Comments Section */}
              <div className="border-t border-gray-100 flex flex-col h-48 bg-white">
                 <div className="flex-1 overflow-y-auto p-4 space-y-3">
                   <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">Comments ({selectedDocument.comments?.length || 0})</h4>
                   {selectedDocument.comments && selectedDocument.comments.length === 0 ? (
                     <p className="text-center text-xs text-gray-400 py-4">No comments yet. Start discussing!</p>
                   ) : (
                     selectedDocument.comments?.map(comment => (
                       <div key={comment.id} className="flex gap-2">
                          {getAvatarComponent(comment.userId, 'sm')}
                          <div className="flex-1">
                             <p className="text-[10px] font-bold text-gray-700">{getAssigneeName(comment.userId)}</p>
                             <p className="text-xs text-gray-600 mt-0.5">{comment.text}</p>
                             <p className="text-[9px] text-gray-400 mt-1">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                          </div>
                       </div>
                     ))
                   )}
                 </div>

                 {/* Comment Input */}
                 <div className="p-3 border-t border-gray-100 flex gap-2">
                   <input
                     type="text"
                     placeholder="Add a comment..."
                     value={documentCommentText}
                     onChange={e => setDocumentCommentText(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && handleAddDocumentComment()}
                     className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                   />
                   <button
                     onClick={handleAddDocumentComment}
                     disabled={!documentCommentText.trim()}
                     className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                     title="Send comment"
                   >
                     <Send className="w-4 h-4" />
                   </button>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && deleteConfirmTask && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-red-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delete Task?</h2>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete the task <span className="font-bold text-gray-900">"{deleteConfirmTask.title}"</span>? 
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">
                  <span className="font-bold">⚠️ Warning:</span> This task will be removed from the project immediately. All associated data will be lost.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 rounded-b-xl">
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteConfirmTask(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Cancel deletion"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTask}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                title="Confirm task deletion"
              >
                <Ban className="w-4 h-4" /> Delete Task
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Vendor Billing Report Modal */}
      {selectedVendorForBilling && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <AvatarCircle avatar={selectedVendorForBilling.avatar} name={selectedVendorForBilling.name} size="md" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedVendorForBilling.name}</h2>
                  <p className="text-sm text-gray-500">Billing Report</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVendorForBilling(null)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Close vendor billing panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {currentFinancials.filter(f => 
                    ((f.type === 'expense' && f.paidBy === 'vendor') || (f.type === 'income' && f.paidBy === 'vendor')) && 
                    f.vendorName === selectedVendorForBilling.name
                ).length === 0 ? (
                    <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                        No billing records found for this vendor.
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3 text-center">Type</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {currentFinancials
                                    .filter(f => 
                                        ((f.type === 'expense' && f.paidBy === 'vendor') || (f.type === 'income' && f.paidBy === 'vendor')) && 
                                        f.vendorName === selectedVendorForBilling.name
                                    )
                                    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(fin => (
                                    <tr key={fin.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fin.date}</td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{fin.description}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${fin.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {fin.type === 'income' ? 'In' : 'Out'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">₹{fin.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize
                                                ${fin.status === 'paid' ? 'bg-green-100 text-green-700' : 
                                                  fin.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                                                  'bg-red-100 text-red-700'}`}>
                                                {fin.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            {/* Footer Summary */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <div className="text-sm text-gray-500">
                    Total Transactions: {currentFinancials.filter(f => ((f.type === 'expense' && f.paidBy === 'vendor') || (f.type === 'income' && f.paidBy === 'vendor')) && f.vendorName === selectedVendorForBilling.name).length}
                </div>
                <div className="text-lg font-bold text-gray-900">
                    Net Total: ₹{currentFinancials
                        .filter(f => ((f.type === 'expense' && f.paidBy === 'vendor') || (f.type === 'income' && f.paidBy === 'vendor')) && f.vendorName === selectedVendorForBilling.name)
                        .reduce((acc, curr) => curr.type === 'income' ? acc + curr.amount : acc - curr.amount, 0)
                        .toLocaleString()}
                </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProjectDetail;