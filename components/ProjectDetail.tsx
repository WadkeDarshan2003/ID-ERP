import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Project, User, Task, TaskStatus, Role, Meeting, SubTask, Comment, ApprovalStatus, ActivityLog, ProjectDocument, FinancialRecord, ProjectStatus, Timeline } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_ORDER } from '../constants';
import { useProjectCrud, useFinancialCrud } from '../hooks/useCrud';
import { createMeeting, updateMeeting, deleteMeeting, createDocument, addCommentToDocument, deleteDocument, updateDocument, createTask, updateTask, deleteTask, subscribeToProjectMeetings, subscribeToProjectDocuments, subscribeToTimelines, subscribeToProjectTasks, logTimelineEvent, addTeamMember, addCommentToMeeting, deleteCommentFromMeeting, subscribeToMeetingComments } from '../services/projectDetailsService';
import { subscribeToProjectFinancialRecords, updateProjectFinancialRecord, createProjectFinancialRecord } from '../services/financialService';
import { sendTaskReminder, sendPaymentReminder } from '../services/emailService';
import { sendProjectWelcomeEmail, sendDocumentApprovalEmail, sendTaskApprovalEmail, sendMeetingNotificationEmail, sendTaskAssignmentNotificationEmail, sendTaskStartApprovalNotificationEmail, sendTaskCompletionApprovalNotificationEmail, sendTaskCommentNotificationEmail, sendDocumentCommentNotificationEmail, sendDocumentAdminApprovalNotificationEmail, sendDocumentClientApprovalNotificationEmail, sendFinancialApprovalNotificationEmail, sendMeetingCommentNotificationEmail, sendDocumentUploadNotificationEmail } from '../services/emailTriggerService';
import { syncAllVendorsEarnings } from '../services/firebaseService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { uploadFile } from '../services/storageService';
import { AvatarCircle, getInitials } from '../utils/avatarUtils';
import { calculateTaskProgress, deriveStatus, formatRelativeTime, formatDateToIndian, formatIndianToISO } from '../utils/taskUtils';
import KanbanBoard from './KanbanBoard';
import MeetingForm from './MeetingForm';
import Spinner from './Spinner';
import { 
  Calendar, DollarSign, Plus, CheckCircle, 
  ChevronRight, Lock, Clock, FileText,
  Layout, ListChecks, ArrowRight, User as UserIcon, X, FolderKanban,
  MessageSquare, ThumbsUp, ThumbsDown, Send, Shield, History, Layers, Link2, AlertCircle, Tag, Upload, Ban, PauseCircle, PlayCircle,
  File as FileIcon, Eye, EyeOff, Download, Pencil, Mail, Filter, IndianRupee, Bell, MessageCircle, Users, MessageCircle as CommentIcon, Trash2, Edit3, Check, Wallet
} from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useLoading } from '../contexts/LoadingContext';

interface ProjectDetailProps {
  project: Project;
  projects?: Project[]; // Add projects prop for filtering context
  users: User[];
  onUpdateProject: (updatedProject: Project) => void;
  onBack: () => void;
  initialTab?: 'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents' | 'meetings';
  initialTask?: Task;
  onCloseTask?: () => void;
}

const ROW_HEIGHT = 48; // Fixed height for Gantt rows
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="12" fill="%23e5e7eb"/%3E%3C/svg%3E';

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, projects = [], users, onUpdateProject, onBack, initialTab, initialTask, onCloseTask }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { updateExistingProject, deleteExistingProject, loading: projectLoading } = useProjectCrud();
  const { createNewRecord: createFinancialRecord, updateExistingRecord: updateFinancialRecord, deleteExistingRecord: deleteFinancialRecord, loading: financialLoading } = useFinancialCrud(project.id);
  const { showLoading, hideLoading } = useLoading();

  // Helper to recalculate and update project budget in Firestore
  const syncProjectBudget = async (projectId: string, financials: FinancialRecord[]) => {
    try {
      // Calculate budget as total income minus total expense
      const totalIncome = financials.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount, 0);
      const totalExpense = financials.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0);
      const newBudget = totalIncome - totalExpense;
      await updateDoc(doc(db, 'projects', projectId), { budget: newBudget });
      if (process.env.NODE_ENV !== 'production') console.log('✅ Project budget synced:', newBudget);
    } catch (error) {
      console.error('❌ Error syncing project budget:', error);
      // Don't throw - allow operation to continue even if sync fails
    }
  };

  // Wrap financial record changes to also sync vendor earnings and project budget
  const createFinancialRecordAndSync = async (record: Omit<FinancialRecord, 'id'>) => {
    try {
      // show loader for financial operations
      showLoading('Saving transaction...');
      const id = await createFinancialRecord(record);
      const newRecord = { ...record, id } as FinancialRecord;
      // Sync after successful creation
      await Promise.all([
        syncAllVendorsEarnings(user?.tenantId),
        syncProjectBudget(project.id, [...currentFinancials, newRecord])
      ]);
      return id;
    } catch (error) {
      console.error('❌ Error creating financial record:', error);
      throw error;
    }
    finally {
      hideLoading();
    }
  };
  const updateFinancialRecordAndSync = async (recordId: string, updates: Partial<FinancialRecord>) => {
    try {
      await updateFinancialRecord(recordId, updates);
      // Sync after successful update
      await Promise.all([
        syncAllVendorsEarnings(user?.tenantId),
        syncProjectBudget(project.id, currentFinancials)
      ]);
    } catch (error) {
      console.error('❌ Error updating financial record:', error);
      throw error;
    }
  };
  const deleteFinancialRecordAndSync = async (recordId: string) => {
    try {
      await deleteFinancialRecord(recordId);
      // Sync after successful deletion
      await Promise.all([
        syncAllVendorsEarnings(user?.tenantId),
        syncProjectBudget(project.id, currentFinancials)
      ]);
    } catch (error) {
      console.error('❌ Error deleting financial record:', error);
      throw error;
    }
  };
  
  const [activeTab, setActiveTab] = useState<'discovery' | 'plan' | 'financials' | 'team' | 'timeline' | 'documents' | 'meetings'>(() => {
    if (initialTab) return initialTab;
    const saved = localStorage.getItem('last_project_tab');
    if (saved && ['discovery', 'plan', 'financials', 'team', 'timeline', 'documents', 'meetings'].includes(saved)) {
      return saved as any;
    }
    return 'discovery';
  });

  // Save active tab to localStorage
  useEffect(() => {
    localStorage.setItem('last_project_tab', activeTab);
  }, [activeTab]);

  const [planView, setPlanView] = useState<'list' | 'gantt' | 'kanban'>('list');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(!!initialTask);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(initialTask || null);
  const [isProjectHeaderLoaded, setIsProjectHeaderLoaded] = useState(true);

  // Handle closing task modal and returning to dashboard if needed
  const prevIsTaskModalOpen = useRef(isTaskModalOpen);
  useEffect(() => {
    if (prevIsTaskModalOpen.current && !isTaskModalOpen && onCloseTask) {
      onCloseTask();
    }
    prevIsTaskModalOpen.current = isTaskModalOpen;
  }, [isTaskModalOpen, onCloseTask]);

  const [showTaskErrors, setShowTaskErrors] = useState(false);
  const [mobileTaskTab, setMobileTaskTab] = useState<'details' | 'activity'>('details');
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const [isSavingTask, setIsSavingTask] = useState(false);
  
  // Comments State
  const [newComment, setNewComment] = useState('');
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Email/Action Loading States
  const [sendingEmailFor, setSendingEmailFor] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);



  // Documents State
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState<{name: string, type: 'image' | 'pdf' | 'other', sharedWith: string[], attachToTaskId?: string}>({ name: '', type: 'other', sharedWith: [] });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showDocErrors, setShowDocErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null);
  const [isDocDetailOpen, setIsDocDetailOpen] = useState(false);
  const [documentCommentText, setDocumentCommentText] = useState('');
  const [isSendingDocumentComment, setIsSendingDocumentComment] = useState(false);
  // Admin: edit sharedWith for existing documents
  const [isShareEditOpen, setIsShareEditOpen] = useState(false);
  const [editingSharedDoc, setEditingSharedDoc] = useState<ProjectDocument | null>(null);
  const [tempSharedWith, setTempSharedWith] = useState<string[]>([]);
  const [isTaskDocModalOpen, setIsTaskDocModalOpen] = useState(false);

  // Financials State
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [newTransaction, setNewTransaction] = useState<Partial<FinancialRecord>>({
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      status: 'pending',
      amount: undefined
  });
  const [customCategory, setCustomCategory] = useState(''); // For "Others" option in income categories
  const [receivedByName, setReceivedByName] = useState(''); // For income transactions - who received the payment
  const [receivedByRole, setReceivedByRole] = useState<'client' | 'vendor' | 'designer' | 'admin' | 'other' | 'client-received' | 'vendor-received' | 'designer-received' | 'admin-received' | 'other-received' | ''>(''); // Track selected role for received by
  const [paidByName, setPaidByName] = useState(''); // For income transactions - name of who paid
  const [showTransactionErrors, setShowTransactionErrors] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'income' | 'expense' | 'pending' | 'overdue'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Team State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberModalType, setMemberModalType] = useState<'member' | 'vendor' | 'client' | 'designer'>('member'); // Track what we're adding

  // Meeting Form State
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  
  // Meeting Comments State
  const [meetingComments, setMeetingComments] = useState<Record<string, Comment[]>>({});
  const [newMeetingComment, setNewMeetingComment] = useState<Record<string, string>>({});
  const [sendingMeetingComment, setSendingMeetingComment] = useState<Record<string, boolean>>({});

  // Delete Confirmation State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Partial<Task> | null>(null);
  const [isProjectDeleteConfirmOpen, setIsProjectDeleteConfirmOpen] = useState(false);
  const [isTransactionDeleteConfirmOpen, setIsTransactionDeleteConfirmOpen] = useState(false);
  const [deleteConfirmTransactionId, setDeleteConfirmTransactionId] = useState<string | null>(null);
  const [isMeetingDeleteConfirmOpen, setIsMeetingDeleteConfirmOpen] = useState(false);
  const [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null);
  const [isDocDeleteConfirmOpen, setIsDocDeleteConfirmOpen] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<ProjectDocument | null>(null);
  const [isLeadDesignerRemovalConfirmOpen, setIsLeadDesignerRemovalConfirmOpen] = useState(false);

  // Vendor Billing Report State
  const [selectedVendorForBilling, setSelectedVendorForBilling] = useState<User | null>(null);
  // Designer Details State
  const [selectedDesignerForDetails, setSelectedDesignerForDetails] = useState<User | null>(null);
  // Designer Charges Percent: sync with project, admin can edit and persist
  const [designerChargesPercent, setDesignerChargesPercent] = useState<number>(project.designerChargePercentage ?? 0);
  const [isEditingDesignerCharges, setIsEditingDesignerCharges] = useState(false);

  // Keep local state in sync with project prop
  useEffect(() => {
    setDesignerChargesPercent(project.designerChargePercentage ?? 0);
  }, [project.designerChargePercentage]);

  // Handler to persist designerChargesPercent to project (admin only)
  const handleDesignerChargesBlur = () => {
    if (!isAdmin) return;
    if (designerChargesPercent !== (project.designerChargePercentage ?? 0)) {
      onUpdateProject({ ...project, designerChargePercentage: designerChargesPercent });
      addNotification('Designer Charges Updated', 'Designer Charges percent saved.', 'success', undefined, project.id, project.name);
    }
  };


  // Additional Budget Modal State
  const [isAdditionalBudgetModalOpen, setIsAdditionalBudgetModalOpen] = useState(false);
  const [additionalBudgetAmount, setAdditionalBudgetAmount] = useState('');
  const [additionalBudgetDescription, setAdditionalBudgetDescription] = useState('');

  // Real-time Subcollection State
  const [realTimeMeetings, setRealTimeMeetings] = useState<Meeting[]>([]);
  const [realTimeDocuments, setRealTimeDocuments] = useState<ProjectDocument[]>([]);
  const [realTimeTimelines, setRealTimeTimelines] = useState<Timeline[]>([]);
  const [realTimeTasks, setRealTimeTasks] = useState<Task[]>([]);
  const [realTimeFinancials, setRealTimeFinancials] = useState<FinancialRecord[]>([]);

  // Use only real-time financials
  const currentFinancials = realTimeFinancials;

  // Replace usages of createFinancialRecord, updateFinancialRecord, deleteFinancialRecord with the wrapped versions below where needed

  // Use only real-time tasks
  const currentTasks = realTimeTasks;

  // Filter tasks for vendor view (vendors only see their assigned tasks)
  const displayTasks = useMemo(() => {
    if (user?.role === Role.VENDOR) {
      const vendorTasks = currentTasks.filter(task => task.assigneeId === user.id);
      if (process.env.NODE_ENV !== 'production') console.log("Vendor filter - user.id:", user.id, "current tasks:", currentTasks.length, "vendor tasks:", vendorTasks.length);
      if (process.env.NODE_ENV !== 'production') console.log("All task assigneeIds:", currentTasks.map(t => ({ id: t.id, assigneeId: t.assigneeId, title: t.title })));
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

  // Handle meetingId query parameter to open meeting modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const meetingId = params.get('meetingId');
    if (meetingId && realTimeMeetings.length > 0) {
      const meeting = realTimeMeetings.find(m => m.id === meetingId);
      if (meeting) {
        setActiveTab('discovery');
        setEditingMeeting(meeting);
        setIsMeetingModalOpen(true);
        // Remove the meetingId from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [realTimeMeetings]);

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
      // Subscribe to comments for each meeting
      meetings.forEach(meeting => {
        subscribeToMeetingComments(project.id, meeting.id, (comments) => {
          setMeetingComments(prev => ({
            ...prev,
            [meeting.id]: comments
          }));
        });
      });
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

  // Keep selected document in sync with real-time updates (for comments, approvals, etc.)
  useEffect(() => {
    if (isDocDetailOpen && selectedDocument) {
      const updatedDoc = realTimeDocuments.find(d => d.id === selectedDocument.id);
      if (updatedDoc) {
        setSelectedDocument(updatedDoc);
      }
    }
  }, [realTimeDocuments, isDocDetailOpen, selectedDocument?.id]);

  // Subscribe to real-time tasks from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProjectTasks(project.id, (tasks) => {
      setRealTimeTasks(tasks);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Keep editing task in sync with real-time updates (for approvals, status, etc.)
  useEffect(() => {
    if (isTaskModalOpen && editingTask && editingTask.id) {
      const updatedTask = realTimeTasks.find(t => t.id === editingTask.id);
      if (updatedTask) {
        setEditingTask(updatedTask);
      }
    }
  }, [realTimeTasks, isTaskModalOpen, editingTask?.id]);

  // Subscribe to real-time financials from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProjectFinancialRecords(project.id, (records) => {
      setRealTimeFinancials(records);
    });
    return () => unsubscribe();
  }, [project.id]);

  // Sync total allocated budget (initial + additional) to project budget field
  useEffect(() => {
    const syncBudgetFromFinancials = async () => {
      try {
        // Calculate total budget: Estimated + Additional (same as totalAdditionalBudget calculation)
        const totalAdditionalBudgetAmount = currentFinancials
          .filter(f => f.type === 'income' && f.category === 'Additional Budget')
          .reduce((sum, f) => sum + f.amount, 0);
        const newBudget = (project.initialBudget || project.budget) + totalAdditionalBudgetAmount;
        
        // Update Firestore project doc
        await updateDoc(doc(db, 'projects', project.id), { budget: newBudget });
        
        // Update local state immediately for instant UI feedback
        onUpdateProject({ ...project, budget: newBudget });
        
        // Project budget updated in real-time (logging removed for production cleanliness)
      } catch (error) {
        console.error('❌ Error syncing project budget in real-time:', error);
      }
    };

    // Sync whenever financials change
    if (currentFinancials.length > 0 || project.financials.length > 0) {
      syncBudgetFromFinancials();
    }
  }, [currentFinancials, project.id]);

  // Initial Tab / Deep Linking
  useEffect(() => {
    if (initialTab) {
        setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Scroll active tab into view
  useEffect(() => {
    if (tabsContainerRef.current) {
      const activeTabElement = tabsContainerRef.current.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement;
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

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

  const canEditProject = isAdmin;
  // Documents: Everyone can upload/view if shared with them.
  const canUploadDocs = true; 
  const canViewFinancials = !isVendor; 
  const canUseAI = canEditProject;

  // Swipe Logic
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      const tabs = [
        { id: 'discovery', hidden: isVendor },
        { id: 'plan', hidden: false },
        { id: 'documents', hidden: false },
        { id: 'financials', hidden: !canViewFinancials },
        { id: 'timeline', hidden: isVendor },
        { id: 'team', hidden: false }
      ].filter(t => !t.hidden).map(t => t.id);

      const currentIndex = tabs.indexOf(activeTab);
      if (isLeftSwipe && currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1] as any);
      }
      if (isRightSwipe && currentIndex > 0) {
        setActiveTab(tabs[currentIndex - 1] as any);
      }
    }
  };

  const getAssigneeName = (id: string, storedName?: string) => {
    if (!id) return 'Unknown User';
    if (id === user.id) return user.name || 'You';
    
    // If the name was stored with the comment, use it (most reliable)
    if (storedName && storedName.trim()) return storedName;
    
    // Check in users array
    const foundUser = users.find(u => u.id === id);
    if (foundUser?.name) return foundUser.name;
    
    // Check if it's the lead designer
    if (id === project.leadDesignerId) {
      const designer = users.find(u => u.id === id);
      if (designer?.name) return designer.name;
    }
    
    // Check if it's the client
    if (id === project.clientId) {
      const client = users.find(u => u.id === id);
      if (client?.name) return client.name;
    }
    
    // Fallback: return a generic name
    return 'Unknown User';
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
      userAvatar = user.avatar || DEFAULT_AVATAR;
    } else {
      const foundUser = users.find(u => u.id === userId);
      if (foundUser) {
        userName = foundUser.name;
        userAvatar = foundUser.avatar || DEFAULT_AVATAR;
      }
    }
    
    // pass role when available so avatar colors match user role
    const foundUser = users.find(u => u.id === userId) || (userId === user.id ? user : undefined);
    const roleProp = foundUser?.role ? String(foundUser.role).toLowerCase() : undefined;
    return <AvatarCircle avatar={userAvatar} name={userName} size={size} role={roleProp} />;
  };

  // --- Helper: Project Team (for Meetings/Visibility) ---
  const projectTeam = useMemo(() => {
    const teamIds = new Set<string>();
    

    // Core Roles
    if (project.clientId) teamIds.add(project.clientId);
    // Add additional clients
    if (project.clientIds) {
      project.clientIds.forEach(id => teamIds.add(id));
    }
    if (project.leadDesignerId) teamIds.add(project.leadDesignerId);

    // Vendors (include visible and hidden vendors so they can be shared)
    if (project.vendorIds) {
      project.vendorIds.forEach(id => teamIds.add(id));
    }
    if (project.hiddenVendors) {
      project.hiddenVendors.forEach(id => teamIds.add(id));
    }

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

  // Handle Meeting Submission
  const handleMeetingSubmit = async (meeting: Omit<Meeting, 'id'>) => {
    try {
      setIsSavingMeeting(true);
      const meetingId = await createMeeting(project.id, meeting);
      
      // Send meeting notification emails to attendees
      if (meeting.attendees && meeting.attendees.length > 0) {
        const attendeeUsers = projectTeam.filter(u => meeting.attendees.includes(u.id));
        const createdMeeting = { ...meeting, id: meetingId };
        await sendMeetingNotificationEmail(createdMeeting, attendeeUsers, project.name, project.id, 'created');
      }
      
      addNotification('Success', 'Meeting added successfully', 'success');
    } catch (error) {
      console.error('Error creating meeting:', error);
      addNotification('Error', 'Failed to add meeting', 'error');
      throw error;
    } finally {
      setIsSavingMeeting(false);
    }
  };

  // Open Share Edit modal (admin)
  const handleOpenShareEdit = (doc: ProjectDocument) => {
    try {
      setEditingSharedDoc(doc);
      setTempSharedWith(doc.sharedWith || []);
      setIsShareEditOpen(true);
    } catch (err) {
      console.error('Error opening share edit modal:', err);
    }
  };

  // Handle Meeting Update
  const handleMeetingUpdate = async (meeting: Meeting) => {
    try {
      setIsSavingMeeting(true);
      await updateMeeting(project.id, meeting.id, meeting);
      
      // Send meeting update notification emails to attendees
      if (meeting.attendees && meeting.attendees.length > 0) {
        const attendeeUsers = projectTeam.filter(u => meeting.attendees.includes(u.id));
        await sendMeetingNotificationEmail(meeting, attendeeUsers, project.name, project.id, 'updated');
      }
      
      addNotification('Success', 'Meeting updated successfully', 'success');
    } catch (error) {
      console.error('Error updating meeting:', error);
      addNotification('Error', 'Failed to update meeting', 'error');
      throw error;
    } finally {
      setIsSavingMeeting(false);
    }
  };

  // Handle Adding Comment to Meeting
  const handleAddMeetingComment = async (meetingId: string) => {
    const commentText = newMeetingComment[meetingId];
    if (!commentText || !commentText.trim()) {
      addNotification('Validation Error', 'Please enter a comment', 'error');
      return;
    }

    // Prevent duplicate sends for the same meeting
    if (sendingMeetingComment[meetingId]) return;

    try {
      setSendingMeetingComment(prev => ({ ...prev, [meetingId]: true }));
      // Find user name from users array or use current user
      let userName = user.name || 'Unknown User';
      const foundUser = users.find(u => u.id === user.id);
      if (foundUser?.name) {
        userName = foundUser.name;
      }

      const comment: Omit<Comment, 'id'> = {
        userId: user.id,
        userName: userName, // Store name for display resilience
        text: commentText,
        timestamp: new Date().toISOString()
      };
      
      await addCommentToMeeting(project.id, meetingId, comment);
      
      // Send notification to all tenant admins and meeting attendees
      const meeting = realTimeMeetings.find((m: Meeting) => m.id === meetingId);
      if (meeting) {
        const recipients: User[] = [];
        
        // Add tenant admins
        const tenantAdmins = users.filter(u => u.role === Role.ADMIN && u.tenantId === user.tenantId && u.id !== user.id);
        recipients.push(...tenantAdmins);
        
        // Add meeting attendees
        if (meeting.attendees && meeting.attendees.length > 0) {
          const attendeeUsers = users.filter(u => meeting.attendees.includes(u.id) && u.id !== user.id);
          recipients.push(...attendeeUsers);
        }
        
        // Remove duplicates
        const uniqueRecipients = recipients.filter((recipient, index, self) => 
          self.findIndex(r => r.id === recipient.id) === index
        );
        
        if (uniqueRecipients.length > 0) {
          await sendMeetingCommentNotificationEmail(
            meeting,
            { ...comment, id: 'temp' },
            userName,
            project.name,
            uniqueRecipients,
            project.id
          );
        }
      }
      
      // Clear the input
      setNewMeetingComment(prev => ({
        ...prev,
        [meetingId]: ''
      }));
      
      addNotification('Success', 'Comment added successfully', 'success');
    } catch (error: any) {
      console.error('Error adding meeting comment:', error);
      addNotification('Error', 'Failed to add comment', 'error');
    } finally {
      setSendingMeetingComment(prev => ({ ...prev, [meetingId]: false }));
    }
  };

  // Handle Deleting Comment from Meeting
  const handleDeleteMeetingComment = async (meetingId: string, commentId: string) => {
    try {
      await deleteCommentFromMeeting(project.id, meetingId, commentId);
      addNotification('Success', 'Comment deleted successfully', 'success');
    } catch (error: any) {
      console.error('Error deleting meeting comment:', error);
      addNotification('Error', 'Failed to delete comment', 'error');
    }
  };

  // Handle Deleting Meeting
  const handleDeleteMeeting = async (meetingId: string, meetingTitle: string) => {
    try {
      await deleteMeeting(project.id, meetingId);
      addNotification('Success', `Meeting "${meetingTitle}" deleted successfully`, 'success');
    } catch (error: any) {
      console.error('Error deleting meeting:', error);
      addNotification('Error', 'Failed to delete meeting', 'error');
    }
  };

  // Handle Deleting Project
  const handleDeleteProject = async () => {
    setIsProjectDeleteConfirmOpen(false);
    try {
      await deleteExistingProject(project.id);
      addNotification('Success', 'Project deleted successfully', 'success');
      onBack(); // Go back to project list
    } catch (error: any) {
      console.error('Error deleting project:', error);
      addNotification('Error', 'Failed to delete project', 'error');
    }
  };

  const openDeleteProjectConfirm = () => {
    setIsProjectDeleteConfirmOpen(true);
  };

  const handleRemoveLeadDesigner = () => {
    setIsLeadDesignerRemovalConfirmOpen(false);
    onUpdateProject({ ...project, leadDesignerId: '' });
    addNotification('Success', 'Lead Designer removed', 'success');
  };

  // --- Helper: Notifications ---
  const notifyProjectTeam = (title: string, message: string, excludeUserId?: string, targetTab?: string) => {
      // Find all Admins
      const admins = users.filter(u => u.role === Role.ADMIN);
      // Find Lead Designer
      const designer = users.find(u => u.id === project.leadDesignerId);
      // Find all Clients (combine primary and additional)
      const clientIds = Array.from(new Set([project.clientId, ...(project.clientIds || [])].filter(Boolean)));
      const clients = clientIds.map(id => users.find(u => u.id === id)).filter((u): u is User => !!u);
      
      const recipients = [...admins, designer, ...clients];
      
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

  // Helper to safely parse timestamps in this file (used for document sorting)
  const getSafeTimestamp = (date: any) => {
    if (!date) return 0;
    if (typeof date === 'string') return new Date(date).getTime();
    if (date.toDate && typeof date.toDate === 'function') return date.toDate().getTime();
    if (date instanceof Date) return date.getTime();
    return new Date(date).getTime() || 0;
  };

  const getDocumentRecentTimestamp = (doc: ProjectDocument) => {
    // ProjectDocument fields: uploadDate, approvalDate, clientApprovedDate, approvalDate, rejectionDate
    return getSafeTimestamp(
      (doc as any).approvalDate || (doc as any).clientApprovedDate || doc.uploadDate || (doc as any).approvalDate || (doc as any).rejectionDate || (doc as any).uploadDate
    );
  };

  // Replaced local getTaskProgress with imported utility
  // const getTaskProgress = (task: Task | Partial<Task>) => { ... }

  // Automated Status Derivation
  // Updated to consider approvals for DONE status
  // Now using imported utility deriveStatus


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
      start: { client: { status: 'pending' as ApprovalStatus }, admin: { status: 'pending' as ApprovalStatus } },
      completion: { client: { status: 'pending' as ApprovalStatus }, admin: { status: 'pending' as ApprovalStatus } }
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
        addNotification("Validation Error", "Please select at least one user", "error");
        return;
    }
    
    // Handle multiple selections
    const memberIds = selectedMemberId.split(',').filter(Boolean);
    
    try {
      if (memberModalType === 'client') {
        // Add as additional clients
        const newClientIds = memberIds.filter(id => 
          id !== project.clientId && !(project.clientIds || []).includes(id)
        );
        
        if (newClientIds.length === 0) {
          addNotification("Info", "All selected clients are already added", "info");
          return;
        }
        
        const updatedClientIds = [...(project.clientIds || []), ...newClientIds];
        
        newClientIds.forEach(clientId => {
          const member = users.find(u => u.id === clientId);
          const log = logActivity('Client Added', `${member?.name} added as client to project`);
          notifyUser(clientId, 'Added to Project', `You have been added as a client to "${project.name}"`, 'success', 'dashboard');
        });
        
        onUpdateProject({
            ...project,
            clientIds: updatedClientIds
        });
        
        addNotification('Success', `${newClientIds.length} client${newClientIds.length !== 1 ? 's' : ''} added`, 'success');
      } else if (memberModalType === 'member' || memberModalType === 'designer') {
        const isDesigner = memberModalType === 'designer';
        // Add as team members (vendors and designers)
        const newMemberIds = memberIds.filter(id => !(project.teamMembers || []).includes(id));
        
        if (newMemberIds.length === 0) {
          addNotification("Info", `All selected ${isDesigner ? 'designers' : 'members'} are already added`, "info");
          return;
        }
        
        const updatedTeamMembers = [...(project.teamMembers || []), ...newMemberIds];
        
        newMemberIds.forEach(memberId => {
          const member = users.find(u => u.id === memberId);
          const log = logActivity(isDesigner ? 'Designer Added' : 'Team Member Added', `${member?.name} added as ${isDesigner ? 'designer' : 'team member'} to project`);
          notifyUser(memberId, 'Added to Project', `You have been added to "${project.name}" as a ${isDesigner ? 'Designer' : 'Member'}`, 'success', 'dashboard');
        });
        
        onUpdateProject({
            ...project,
            teamMembers: updatedTeamMembers
        });
        
        addNotification('Success', `${newMemberIds.length} ${isDesigner ? 'designer' : 'member'}${newMemberIds.length !== 1 ? 's' : ''} added`, 'success');
      }
      
      setIsMemberModalOpen(false);
      setSelectedMemberId('');
    } catch (error: any) {
      console.error("Error adding member:", error);
      addNotification("Error", "Failed to add member.", "error");
    }
  };

  const [isUploadingDocument, setIsUploadingDocument] = useState(false);

  const handleUploadDocument = async () => {
      // Allow upload if either files are selected OR just a name is provided (for mock/link purposes)
      if (selectedFiles.length === 0 && !newDoc.name) {
        setShowDocErrors(true);
        addNotification('Validation Error', `Please select files or enter a name for "${project.name}".`, 'error', undefined, project.id, project.name);
        return;
      }
      
      setIsUploadingDocument(true);
      try {
        const filesToUpload: File[] = selectedFiles.length > 0 ? selectedFiles : [{ name: newDoc.name } as File];
        const createdDocIds: string[] = [];

        // Upload each file
        for (const file of filesToUpload) {
          const fileName = file.name || newDoc.name;
          
          // Determine type
          let docType: 'image' | 'pdf' | 'other' = 'other';
          if (file.type) {
            if (file.type.startsWith('image/')) docType = 'image';
            else if (file.type === 'application/pdf') docType = 'pdf';
          }

          // Generate URL: Upload to Firebase Storage for real file, or Local placeholder for name-only
          let fileUrl = '';
          
          if (file instanceof File && file.size) {
            try {
              // Create a unique path for the file
              const storagePath = `projects/${project.id}/documents/${Date.now()}_${file.name}`;
              // Upload and get download URL
              fileUrl = await uploadFile(file, storagePath);
            } catch (uploadError) {
              console.error("Upload failed, falling back to local preview:", uploadError);
              // Fallback to blob URL if upload fails (though this won't persist well)
              fileUrl = URL.createObjectURL(file);
              addNotification('Warning', `Failed to upload "${fileName}" to storage. Using local preview.`, 'warning');
            }
          } else {
            // Placeholder for name-only
            fileUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2VmZWZlZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjI0IiBmaWxsPSIjYWFhIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5QbGFjZWhvbGRlcjwvdGV4dD48L3N2Zz4=';
          }

          const doc = {
            name: fileName,
            type: docType, 
            url: fileUrl,
            uploadedBy: user.id,
            uploadDate: new Date().toISOString(),
            sharedWith: newDoc.sharedWith.length > 0 ? newDoc.sharedWith : [Role.ADMIN, Role.DESIGNER, Role.CLIENT],
            approvalStatus: 'pending'
          };
          
          // Save to Firestore subcollection
          const createdDocId = await createDocument(project.id, doc as Omit<ProjectDocument, 'id'>);
          createdDocIds.push(createdDocId);

          // Convert shared IDs to names for timeline
          const sharedNames = newDoc.sharedWith.length > 0 
            ? newDoc.sharedWith.map(id => {
                if (id === Role.ADMIN || id === Role.DESIGNER || id === Role.CLIENT) return id;
                const user = users.find(u => u.id === id);
                return user?.name || id;
              }).join(', ')
            : 'Admin, Designer, Client';

          // Log timeline event
          const now = new Date().toISOString();
          await logTimelineEvent(
            project.id,
            `Document Uploaded: ${fileName}`,
            `${fileName} (${docType}) uploaded by ${user.name}. Shared with: ${sharedNames}`,
            'completed',
            now,
            now
          );
        }

        // If attaching to a task, update the task with all document IDs
        if (newDoc.attachToTaskId && createdDocIds.length > 0) {
          // Find the task from currentTasks (works whether editing task or uploading from Documents tab)
          const targetTask = currentTasks.find(t => t.id === newDoc.attachToTaskId);
          
          if (targetTask) {
            const taskDocs = targetTask.documents || [];
            const newDocIds = createdDocIds.filter(id => !taskDocs.includes(id));
            
            if (newDocIds.length > 0) {
              const updatedDocArray = [...taskDocs, ...newDocIds];
              
              // Update Firestore
              await updateTask(project.id, targetTask.id, {
                ...targetTask,
                documents: updatedDocArray
              });
              
              // Sync editingTask state if it's the same task
              if (editingTask?.id === targetTask.id) {
                setEditingTask({
                  ...editingTask,
                  documents: updatedDocArray
                });
              }
              
              // Update project tasks array
              const updatedTasks = currentTasks.map(t => 
                t.id === targetTask.id ? {...t, documents: updatedDocArray} : t
              );
              onUpdateProject({
                ...project,
                tasks: updatedTasks
              });
            }
          }
        }

        const log = logActivity('Document Uploaded', `Uploaded ${createdDocIds.length} document(s)`);
        onUpdateProject({
            ...project,
            activityLog: [log, ...(project.activityLog || [])]
        });
        
        // Send notifications to shared users
        for (let i = 0; i < createdDocIds.length; i++) {
          const doc = {
            id: createdDocIds[i],
            name: selectedFiles[i]?.name || newDoc.name,
            type: newDoc.type,
            url: '',
            uploadedBy: user.id,
            uploadDate: new Date().toISOString(),
            sharedWith: newDoc.sharedWith.length > 0 ? newDoc.sharedWith : [Role.ADMIN, Role.DESIGNER, Role.CLIENT],
            approvalStatus: 'pending' as const
          };

          // Get recipients - admins and users in sharedWith
          const recipients: User[] = [];
          
          // Add tenant admins (who uploaded it)
          const tenantAdmins = users.filter(u => u.role === Role.ADMIN && u.tenantId === user.tenantId);
          recipients.push(...tenantAdmins);
          
          // Add users from sharedWith
          const sharedUserIds = newDoc.sharedWith.filter(id => id !== Role.ADMIN && id !== Role.DESIGNER && id !== Role.CLIENT);
          const sharedUsers = users.filter(u => sharedUserIds.includes(u.id));
          recipients.push(...sharedUsers);
          
          // Remove duplicates and the uploader
          const uniqueRecipients = recipients.filter((recipient, index, self) => 
            self.findIndex(r => r.id === recipient.id) === index && recipient.id !== user.id
          );
          
          if (uniqueRecipients.length > 0) {
            await sendDocumentUploadNotificationEmail(
              doc,
              user.name,
              project.name,
              uniqueRecipients,
              project.id
            );
          }
        }
        
        notifyProjectTeam('Files Added', `${user.name} uploaded ${createdDocIds.length} document(s) to "${project.name}"`, user.id, 'documents');
        
        setIsDocModalOpen(false);
        setNewDoc({ name: '', type: 'other', sharedWith: [] });
        setSelectedFiles([]);
        setShowDocErrors(false);
        addNotification("Success", `${createdDocIds.length} document(s) uploaded successfully to "${project.name}"`, "success", undefined, project.id, project.name);
        // Real-time listener will fetch the new documents
      } catch (error: any) {
        console.error('Document upload error:', error);
        addNotification("Error", "Unable to upload document(s). Please check file size and try again.", "error", undefined, project.id, project.name);
      } finally {
        setIsUploadingDocument(false);
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

  const handleDeleteDocument = (doc: ProjectDocument) => {
    setDeletingDoc(doc);
    setIsDocDeleteConfirmOpen(true);
  };

  const confirmDeleteDocument = async () => {
    if (!deletingDoc) return;
    const doc = deletingDoc;

    try {
      await deleteDocument(project.id, doc.id);
      
      // Remove document ID from all tasks that have it attached
      const updatedTasks = currentTasks.map(task => {
        if (task.documents?.includes(doc.id)) {
          return {
            ...task,
            documents: task.documents.filter(docId => docId !== doc.id)
          };
        }
        return task;
      });
      
      // Update editingTask if it had this document
      if (editingTask?.documents?.includes(doc.id)) {
        setEditingTask({
          ...editingTask,
          documents: editingTask.documents.filter(docId => docId !== doc.id)
        });
      }
      
      // Update all affected tasks in Firestore
      const affectedTasks = updatedTasks.filter(t => t.documents && t.documents.length !== currentTasks.find(ct => ct.id === t.id)?.documents?.length);
      for (const task of affectedTasks) {
        await updateTask(project.id, task.id, { documents: task.documents });
      }
      
      // Update project state
      onUpdateProject({
        ...project,
        tasks: updatedTasks
      });
      
      addNotification("Success", `Document "${doc.name}" deleted successfully`, "success");
      setIsDocDetailOpen(false);
    } catch (error) {
      console.error('Error deleting document:', error);
      addNotification("Error", "Failed to delete document", "error");
    } finally {
      setIsDocDeleteConfirmOpen(false);
      setDeletingDoc(null);
    }
  };

  const handleOpenDocumentDetail = (doc: ProjectDocument) => {
    // Get the latest document data from realTimeDocuments to ensure comments are up-to-date
    const latestDoc = realTimeDocuments.find(d => d.id === doc.id) || doc;
    setSelectedDocument(latestDoc);
    setIsDocDetailOpen(true);
  };

  const handleApproveDocument = async (doc: ProjectDocument) => {
    if (processingAction) return;
    setProcessingAction(`approve-doc-${doc.id}`);
    try {
      await updateDocument(project.id, doc.id, {
        approvalStatus: 'approved',
        approvedBy: user.id,
        approvalDate: new Date().toISOString()
      });
      
      // Show loader for at least 500ms for visibility
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send approval email to document recipients and team
      const recipientIds = new Set<string>();
      // Include lead designer and uploader
      if (project.leadDesignerId) recipientIds.add(project.leadDesignerId);
      if (doc.uploadedBy) recipientIds.add(doc.uploadedBy);
      // Include anyone the document is explicitly shared with
      (doc.sharedWith || []).forEach(id => recipientIds.add(id));
      // Include client only if the document was shared with them
      if (project.clientId && doc.sharedWith?.includes(project.clientId)) recipientIds.add(project.clientId);
      // Include all tenant admins
      users.filter(u => u.role === Role.ADMIN && u.tenantId === user.tenantId).forEach(u => recipientIds.add(u.id));

      const relevantUsers = users.filter(u => recipientIds.has(u.id));

      if (relevantUsers.length > 0) {
        await sendDocumentAdminApprovalNotificationEmail(
          doc,
          user.name || 'Unknown User',
          relevantUsers,
          project.name,
          project.id,
          'approved'
        );
      }
      
      addNotification("Success", `Document "${doc.name}" approved`, "success");
    } catch (error) {
      console.error('Error approving document:', error);
      addNotification("Error", "Failed to approve document", "error");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleRejectDocument = async (doc: ProjectDocument) => {
    if (processingAction) return;
    setProcessingAction(`reject-doc-${doc.id}`);
    try {
      await updateDocument(project.id, doc.id, {
        approvalStatus: 'rejected',
        rejectedBy: user.id,
        rejectionDate: new Date().toISOString()
      });

      // Show loader for at least 500ms for visibility
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send rejection email to document recipients and team

      const recipientIds = new Set<string>();
      // Notify admins and project owners on client action
      users.filter(u => u.role === Role.ADMIN).forEach(u => recipientIds.add(u.id));
      if (project.leadDesignerId) recipientIds.add(project.leadDesignerId);
      if (doc.uploadedBy) recipientIds.add(doc.uploadedBy);
      (doc.sharedWith || []).forEach(id => {
        if (id !== user.id) recipientIds.add(id);
      });

      const relevantUsers = users.filter(u => recipientIds.has(u.id));

      if (relevantUsers.length > 0) {
        await sendDocumentAdminApprovalNotificationEmail(
          doc,
          user.name || 'Unknown User',
          relevantUsers,
          project.name,
          project.id,
          'rejected'
        );
      }

      addNotification("Success", `Document "${doc.name}" rejected`, "success");
    } catch (error) {
      console.error('Error rejecting document:', error);
      addNotification("Error", "Failed to reject document", "error");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleClientApproveDocument = async (doc: ProjectDocument) => {
    if (processingAction) return;
    setProcessingAction(`client-approve-doc-${doc.id}`);
    try {
      await updateDocument(project.id, doc.id, {
        clientApprovalStatus: 'approved',
        clientApprovedBy: user.id,
        clientApprovedDate: new Date().toISOString()
      });

      // Show loader for at least 500ms for visibility
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send approval email to admin and document owners
      const relevantUsers = users.filter(u => {
        // Include admin/lead designer
        if (u.id === project.leadDesignerId) return true;
        // Include anyone the document is shared with (except client themselves)
        if (doc.sharedWith?.includes(u.id) && u.id !== user.id) return true;
        return false;
      });

      if (relevantUsers.length > 0) {
        await sendDocumentClientApprovalNotificationEmail(
          doc,
          user.name || 'Unknown User',
          relevantUsers,
          project.name,
          project.id,
          'approved'
        );
      }

      addNotification("Success", `Document "${doc.name}" approved by you`, "success");
    } catch (error) {
      console.error('Error approving document as client:', error);
      addNotification("Error", "Failed to approve document", "error");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleClientRejectDocument = async (doc: ProjectDocument) => {
    if (processingAction) return;
    setProcessingAction(`client-reject-doc-${doc.id}`);
    try {
      await updateDocument(project.id, doc.id, {
        clientApprovalStatus: 'rejected',
        clientApprovedBy: user.id,
        clientApprovedDate: new Date().toISOString()
      });

      // Show loader for at least 500ms for visibility
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send rejection email to admin and document owners
      const relevantUsers = users.filter(u => {
        // Include admin/lead designer
        if (u.id === project.leadDesignerId) return true;
        // Include anyone the document is shared with (except client themselves)
        if (doc.sharedWith?.includes(u.id) && u.id !== user.id) return true;
        return false;
      });

      if (relevantUsers.length > 0) {
        await sendDocumentClientApprovalNotificationEmail(
          doc,
          user.name || 'Unknown User',
          relevantUsers,
          project.name,
          project.id,
          'rejected'
        );
      }

      addNotification("Success", `Document "${doc.name}" rejected by you`, "success");
    } catch (error) {
      console.error('Error rejecting document as client:', error);
      addNotification("Error", "Failed to reject document", "error");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleAddDocumentComment = async () => {
    if (!documentCommentText.trim() || !selectedDocument) return;

    if (isSendingDocumentComment) return; // prevent duplicate sends

    try {
      setIsSendingDocumentComment(true);
      const comment = {
        userId: user.id,
        userName: user.name || 'Unknown User', // Store name for display resilience
        text: documentCommentText,
        timestamp: new Date().toISOString()
      };

      // Save to Firestore - real-time listener will update state automatically
      await addCommentToDocument(project.id, selectedDocument.id, comment as Omit<Comment, 'id'>);

      // Send comment notification email to relevant team members
      const commentWithId: Comment = {
        ...comment,
        id: Math.random().toString(36).substr(2, 9)
      };

      // Get all users who should be notified (shared users, admins, client)
      const relevantUsers = users.filter(u => {
        // Include admin/lead designer
        if (u.id === project.leadDesignerId) return true;
        // Include admins from the same tenant only
        if (u.role === Role.ADMIN && u.tenantId === user.tenantId) return true;
        // Include client
        if (u.id === project.clientId) return true;
        // Include anyone the document is shared with
        if (selectedDocument.sharedWith?.includes(u.id)) return true;
        return false;
      });

      if (relevantUsers.length > 0) {
        await sendDocumentCommentNotificationEmail(
          selectedDocument,
          commentWithId,
          user.name || 'Unknown User',
          relevantUsers,
          project.name,
          project.id
        );
      }

      // Clear input field
      setDocumentCommentText('');

      // Log timeline event
      const commentNow = new Date().toISOString();
      await logTimelineEvent(
        project.id,
        `Document Comment: ${selectedDocument.name}`,
        `${user.name} commented: "${documentCommentText.substring(0, 100)}..."`,
        'completed',
        commentNow,
        commentNow
      );

      const log = logActivity('Document Comment', `Added comment to "${selectedDocument.name}"`);
      onUpdateProject({
        ...project,
        activityLog: [log, ...(project.activityLog || [])]
      });

      addNotification("Success", `Comment added to "${selectedDocument.name}"`, "success");
    } catch (error: any) {
      console.error('Document comment error:', error);
      addNotification("Error", "Unable to add comment. Please try again.", "error");
    } finally {
      setIsSendingDocumentComment(false);
    }
  };

  const openTransactionModal = (existingId?: string) => {
    if (existingId) {
      const txn = currentFinancials.find(f => f.id === existingId);
      if (txn) {
        setNewTransaction(txn);
        setEditingTransactionId(existingId);
        // Set customCategory if the transaction category is "Others"
        if (txn.category === 'Others') {
          setCustomCategory(txn.description || '');
        } else {
          setCustomCategory('');
        }
        // Set paidByName and receivedByName for editing transactions
        if (txn.type === 'income') {
          // Use stored receivedByRole if available, otherwise determine from data
          if (txn.paidByRole) {
            setReceivedByRole(txn.paidByRole);
            setPaidByName(txn.paidTo || '');
          } else if (txn.paidByOther) {
            setReceivedByRole('other');
            setPaidByName(txn.paidByOther || '');
          } else if (txn.paidTo) {
            const paidUser = users.find(u => u.name === txn.paidTo);
            if (paidUser) {
              if (paidUser.role === Role.CLIENT) {
                setReceivedByRole('client');
              } else if (paidUser.role === Role.VENDOR) {
                setReceivedByRole('vendor');
              } else if (paidUser.role === Role.DESIGNER) {
                setReceivedByRole('designer');
              } else if (paidUser.role === Role.ADMIN) {
                setReceivedByRole('admin');
              }
            } else {
              setReceivedByRole('other');
            }
            setPaidByName(txn.paidTo || '');
          }
          // Determine receivedByRole based on transaction data
          if (txn.receivedByRole) {
            setReceivedByRole(txn.receivedByRole);
            setReceivedByName(txn.receivedBy || txn.receivedByName || '');
          } else if (txn.receivedBy) {
            const receivedUser = users.find(u => u.name === txn.receivedBy);
            if (receivedUser) {
              if (receivedUser.role === Role.VENDOR) {
                setReceivedByRole('vendor-received');
              } else if (receivedUser.role === Role.DESIGNER) {
                setReceivedByRole('designer-received');
              } else if (receivedUser.role === Role.ADMIN) {
                setReceivedByRole('admin-received');
              }
            } else {
              setReceivedByRole('other-received');
            }
            setReceivedByName(txn.receivedBy || '');
          }
        } else if (txn.type === 'expense') {
          if (txn.paidByOther) {
            setNewTransaction({...txn, paidBy: 'other' as any});
          }
          // Determine receivedByRole based on stored role or transaction data
          if (txn.receivedByRole) {
            setReceivedByRole(txn.receivedByRole);
            setReceivedByName(txn.receivedByName || txn.receivedBy || '');
          } else if (txn.receivedBy) {
            const receivedUser = users.find(u => u.name === txn.receivedBy);
            if (receivedUser) {
              // Set role based on user's role
              if (receivedUser.role === Role.CLIENT) {
                setReceivedByRole('client');
              } else if (receivedUser.role === Role.VENDOR) {
                setReceivedByRole('vendor');
              } else if (receivedUser.role === Role.DESIGNER) {
                setReceivedByRole('designer');
              } else if (receivedUser.role === Role.ADMIN) {
                setReceivedByRole('admin');
              }
            } else {
              // If receivedBy doesn't match any user, it's "Other"
              setReceivedByRole('other');
            }
            setReceivedByName(txn.receivedBy || '');
          }
        }
      }
    } else {
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        status: 'pending',
        amount: undefined,
        paymentMode: undefined
      });
      setEditingTransactionId(null);
      setPaidByName('');
      setReceivedByName('');
      setReceivedByRole('');
      setCustomCategory('');
    }
    setIsTransactionModalOpen(true);
    setShowTransactionErrors(false);
  };

  const handleSaveTransaction = async () => {
     // Use custom category if "Others" is selected
     const finalCategory = newTransaction.category === 'Others' ? customCategory : newTransaction.category;
     
     if (!newTransaction.amount || !newTransaction.description || !finalCategory || !newTransaction.date) {
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
         let updatedRecord = {
           ...currentFinancials.find(f => f.id === editingTransactionId)!,
           ...newTransaction,
           amount: Number(newTransaction.amount),
           paidBy: newTransaction.type === 'income' ? 
             (receivedByRole === 'other' ? 'other' : 
              receivedByRole === 'client' ? 'client' :
              receivedByRole === 'vendor' ? 'vendor' :
              receivedByRole === 'designer' ? 'designer' :
              receivedByRole === 'admin' ? 'admin' : newTransaction.paidBy)
             : newTransaction.paidBy,
           paidByRole: newTransaction.type === 'income' ? (
             receivedByRole === 'other' ? 'other' : 
             receivedByRole === 'client' ? 'client' :
             receivedByRole === 'vendor' ? 'vendor' :
             receivedByRole === 'designer' ? 'designer' :
             receivedByRole === 'admin' ? 'admin' : undefined
           ) : undefined,
           paidTo: newTransaction.type === 'income' ? (newTransaction.vendorName || paidByName) : (paidByName || newTransaction.paidTo),
           paidByOther: newTransaction.type === 'income' ? 
             (receivedByRole === 'other' ? paidByName : newTransaction.paidByOther)
             : newTransaction.paidByOther,
           receivedBy: newTransaction.type === 'income' ?
             (receivedByRole === 'vendor-received' || receivedByRole === 'designer-received' || receivedByRole === 'admin-received' || receivedByRole === 'other-received' || receivedByRole === 'admin' || receivedByRole === 'client' || receivedByRole === 'vendor' || receivedByRole === 'designer' ? receivedByName : newTransaction.receivedBy)
             : (receivedByName || newTransaction.receivedBy),
           receivedByRole: 
             receivedByRole === 'client-received' ? 'client-received' :
             receivedByRole === 'vendor-received' ? 'vendor-received' :
             receivedByRole === 'designer-received' ? 'designer-received' :
             receivedByRole === 'admin-received' ? 'admin-received' :
             receivedByRole === 'other-received' ? 'other-received' :
             receivedByRole === 'client' ? 'client-received' :
             receivedByRole === 'vendor' ? 'vendor-received' :
             receivedByRole === 'designer' ? 'designer-received' :
             receivedByRole === 'admin' ? 'admin-received' :
             receivedByRole === 'other' ? 'other-received' : undefined
           ,
           receivedByName: newTransaction.type === 'expense' ? receivedByName : (newTransaction.type === 'income' ? receivedByName : newTransaction.receivedByName)
         } as FinancialRecord;

         // --- FIX: If payment is now received/paid, always set status to 'paid' ---
         if (
           (updatedRecord.type === 'income' && updatedRecord.status === 'paid') ||
           (updatedRecord.type === 'expense' && updatedRecord.status === 'paid')
         ) {
           updatedRecord.status = 'paid';
         }

         // Determine timeline status based on transaction status
         let timelineStatus: 'completed' | 'in-progress' | 'planned' = 'in-progress';
         if (updatedRecord.status === 'paid') {
           timelineStatus = 'completed';
         } else if (updatedRecord.status === 'overdue') {
           timelineStatus = 'in-progress';
         }

         // Enhanced timeline description with all transaction details
         const detailedDescription = `Type: ${updatedRecord.type} | Amount: ₹${updatedRecord.amount.toLocaleString()} | Category: ${updatedRecord.category} | Mode: ${updatedRecord.paymentMode || 'N/A'} | Status: ${updatedRecord.status}${updatedRecord.vendorName ? ` | Vendor: ${updatedRecord.vendorName}` : ''}`;

         // Log timeline event
         await logTimelineEvent(
           project.id,
           `Transaction Updated: ${updatedRecord.description}`,
           detailedDescription,
           timelineStatus,
           new Date().toISOString(),
           new Date().toISOString()
         );

         updatedFinancials = updatedFinancials.map(f => f.id === editingTransactionId ? updatedRecord : f);
         log = logActivity('Financial', `Updated transaction: ${updatedRecord.description} (${updatedRecord.type} - ₹${updatedRecord.amount.toLocaleString()})`);
       } else {
         // Create new transaction in local state
           const record: FinancialRecord = {
            id: Math.random().toString(36).substr(2, 9),
            date: newTransaction.date!,
            timestamp: new Date().toISOString(),
            description: newTransaction.description!,
            amount: Number(newTransaction.amount),
            type: newTransaction.type as 'income' | 'expense' | 'designer-charge',
            status: (newTransaction.status || 'pending') as any,
            category: finalCategory,
            vendorName: newTransaction.vendorName,
            paidBy: newTransaction.type === 'income' ? 
              (receivedByRole === 'other' ? 'other' : 
               receivedByRole === 'client' ? 'client' :
               receivedByRole === 'vendor' ? 'vendor' :
               receivedByRole === 'designer' ? 'designer' :
               receivedByRole === 'admin' ? 'admin' : undefined)
              : newTransaction.paidBy,
            paidByRole: newTransaction.type === 'income' ? (
              receivedByRole === 'other' ? 'other' : 
              receivedByRole === 'client' ? 'client' :
              receivedByRole === 'vendor' ? 'vendor' :
              receivedByRole === 'designer' ? 'designer' :
              receivedByRole === 'admin' ? 'admin' : undefined
            ) : undefined,
            paidTo: newTransaction.type === 'income' ? (newTransaction.vendorName || paidByName) : newTransaction.paidTo,
            paidByOther: newTransaction.type === 'income' ? 
              (receivedByRole === 'other' ? paidByName : newTransaction.paidByOther)
              : newTransaction.paidByOther,
            receivedBy: newTransaction.type === 'income' ?
              (receivedByRole === 'vendor-received' || receivedByRole === 'designer-received' || receivedByRole === 'admin-received' || receivedByRole === 'other-received' || receivedByRole === 'admin' || receivedByRole === 'client' || receivedByRole === 'vendor' || receivedByRole === 'designer' ? receivedByName : undefined)
              : (receivedByName || newTransaction.receivedBy),
            receivedByRole: 
              receivedByRole === 'client-received' ? 'client-received' :
              receivedByRole === 'vendor-received' ? 'vendor-received' :
              receivedByRole === 'designer-received' ? 'designer-received' :
              receivedByRole === 'admin-received' ? 'admin-received' :
              receivedByRole === 'other-received' ? 'other-received' :
              receivedByRole === 'client' ? 'client-received' :
              receivedByRole === 'vendor' ? 'vendor-received' :
              receivedByRole === 'designer' ? 'designer-received' :
              receivedByRole === 'admin' ? 'admin-received' :
              receivedByRole === 'other' ? 'other-received' : undefined
            ,
            receivedByName: newTransaction.type === 'expense' ? receivedByName : (newTransaction.type === 'income' ? receivedByName : undefined),
            paymentMode: newTransaction.paymentMode,
            adminApproved: newTransaction.adminApproved,
            clientApproved: newTransaction.clientApproved,
            // Add approval flags for additional budgets
            isAdditionalBudget: newTransaction.type === 'income' && finalCategory === 'Additional Budget',
            clientApprovalForAdditionalBudget: newTransaction.type === 'income' && finalCategory === 'Additional Budget' 
              ? (newTransaction.clientApprovalForAdditionalBudget || 'pending')
              : undefined,
            adminApprovalForAdditionalBudget: newTransaction.type === 'income' && finalCategory === 'Additional Budget'
              ? (newTransaction.adminApprovalForAdditionalBudget || 'pending')
              : undefined,
            // Add approval flags for received payments
            isClientPayment: newTransaction.type === 'income' && finalCategory !== 'Additional Budget',
            clientApprovalForPayment: newTransaction.type === 'income' && finalCategory !== 'Additional Budget'
              ? (newTransaction.clientApprovalForPayment || 'pending')
              : undefined,
            adminApprovalForPayment: newTransaction.type === 'income' && finalCategory !== 'Additional Budget'
              ? (newTransaction.adminApprovalForPayment || 'pending')
              : undefined
         };         // Determine timeline status based on transaction type and status
         let timelineStatus: 'completed' | 'in-progress' | 'planned' = 'planned';
         if (record.status === 'paid') {
           timelineStatus = 'completed';
         } else if (record.status === 'pending' || record.status === 'overdue') {
           timelineStatus = 'in-progress';
         }
         
         // Comprehensive timeline description
         const detailedDescription = `Type: ${record.type} | Amount: ₹${record.amount.toLocaleString()} | Category: ${record.category} | Mode: ${record.paymentMode || 'N/A'} | Status: ${record.status} | Paid By: ${record.paidBy || 'N/A'}${record.vendorName ? ` | Vendor: ${record.vendorName}` : ''}`;
         
         // Log timeline event
         await logTimelineEvent(
           project.id,
           `Financial: ${record.type === 'income' ? 'Income' : 'Expense'} - ${record.description}`,
           detailedDescription,
           timelineStatus,
           new Date().toISOString(),
           new Date().toISOString()
         );
         
         updatedFinancials.push(record);
         log = logActivity('Financial', `Added ${record.type}: ₹${record.amount.toLocaleString()} for ${record.description}`)
       }

       // Save to Firestore
       try {
         if (editingTransactionId) {
           // Update existing transaction in Firestore
           const recordToUpdate = updatedFinancials.find(f => f.id === editingTransactionId);
           if (recordToUpdate) {
             await updateProjectFinancialRecord(project.id, editingTransactionId, recordToUpdate);
           }
         } else {
           // Create new transaction in Firestore
           const newRecord = updatedFinancials[updatedFinancials.length - 1];
           const recordId = await createProjectFinancialRecord(project.id, {
             date: newRecord.date,
             timestamp: newRecord.timestamp,
             description: newRecord.description,
             amount: newRecord.amount,
             type: newRecord.type,
             status: newRecord.status,
             category: newRecord.category,
             vendorName: newRecord.vendorName,
             paidBy: newRecord.paidBy,
             paidByRole: newRecord.paidByRole,
             paidTo: newRecord.paidTo,
             paidByOther: newRecord.paidByOther,
             receivedBy: newRecord.receivedBy,
             receivedByRole: newRecord.receivedByRole,
             receivedByName: newRecord.receivedByName,
             paymentMode: newRecord.paymentMode,
             adminApproved: newRecord.adminApproved,
             clientApproved: newRecord.clientApproved,
             isAdditionalBudget: newRecord.isAdditionalBudget,
             clientApprovalForAdditionalBudget: newRecord.clientApprovalForAdditionalBudget,
             adminApprovalForAdditionalBudget: newRecord.adminApprovalForAdditionalBudget,
             isClientPayment: newRecord.isClientPayment,
             clientApprovalForPayment: newRecord.clientApprovalForPayment,
             adminApprovalForPayment: newRecord.adminApprovalForPayment
           });
           // Update the record with the generated ID
           newRecord.id = recordId;
         }
       } catch (dbError) {
         console.error('Database save error:', dbError);
         throw new Error('Failed to save transaction to database');
       }

       onUpdateProject({
          ...project,
          financials: editingTransactionId ? project.financials : updatedFinancials,
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
       setPaidByName('');
       setReceivedByName('');
       setReceivedByRole('');
       setCustomCategory('');
       addNotification("Success", `Transaction ${editingTransactionId ? 'updated' : 'added'} and saved to database.`, "success", undefined, project.id, project.name);
     } catch (error: any) {
       // Show user-friendly message instead of technical error
       const userMessage = error.message?.includes('database') 
         ? "Failed to save transaction. Please try again."
         : "Transaction saved locally. Please refresh the page or contact support if changes don't appear.";
       addNotification("Error", userMessage, "error", undefined, project.id, project.name);
       
       // Still update local state so user sees their changes
       setIsTransactionModalOpen(false);
       setEditingTransactionId(null);
       setIsSavingTransaction(false);
       setPaidByName('');
       setReceivedByName('');
       setReceivedByRole('');
       setCustomCategory('');
       
       // Log the actual error for debugging
       console.error("Transaction save error:", error);
     }
  };

  // Remove handleProjectUpdate and syncProjectToFirebase (no longer needed for financials)

  // Handle approval for additional budgets
  const handleApproveAdditionalBudget = async (transactionId: string, approvalType: 'client' | 'admin', status: 'approved' | 'rejected') => {
    if (processingAction) return;
    setProcessingAction(`approve-budget-${transactionId}-${approvalType}-${status}`);
    try {
      const key = approvalType === 'client' ? 'clientApprovalForAdditionalBudget' : 'adminApprovalForAdditionalBudget';
      
      // Check if record exists in real-time collection
      const isRealTime = realTimeFinancials.some(f => f.id === transactionId);

      if (isRealTime) {
        // Write directly to Firebase subcollection
        await updateProjectFinancialRecord(project.id, transactionId, {
          [key]: status
        });
      }

      // Get the updated transaction from current financials to check if both approved
      const txn = currentFinancials.find(f => f.id === transactionId);
      if (txn) {
        // Construct updated txn for logic check since state might not be updated yet
        const updatedTxn = { ...txn, [key]: status };
        
        const statusText = status === 'approved' ? 'Approved' : 'Rejected';
        const roleText = approvalType === 'client' ? 'Client' : 'Admin';
        
        // Check if both will be approved after this update
        const clientApproved = approvalType === 'client' ? status === 'approved' : updatedTxn.clientApprovalForAdditionalBudget === 'approved';
        const adminApproved = approvalType === 'admin' ? status === 'approved' : updatedTxn.adminApprovalForAdditionalBudget === 'approved';
        const isBothApproved = clientApproved && adminApproved;
        
        // If both approved, update the project budget
        if (isBothApproved && txn.status !== 'paid') {
          const newBudget = project.budget + txn.amount;
          
          // Prepare updates
          let updatedProject = {
            ...project,
            budget: newBudget,
            initialBudget: project.initialBudget || project.budget
          };

          onUpdateProject(updatedProject);
          
          // Also mark the transaction as paid in subcollection if needed
          if (isRealTime) {
            await updateProjectFinancialRecord(project.id, transactionId, { status: 'paid' });
          }
        }
        
        await logTimelineEvent(
          project.id,
          isBothApproved ? `Additional Budget Approved: ₹${txn.amount.toLocaleString()}` : `Additional Budget ${statusText}`,
          isBothApproved 
            ? `Budget increased by ₹${txn.amount.toLocaleString()}. Both Client and Admin have approved. New Total: ₹${(project.budget + txn.amount).toLocaleString()}`
            : `${roleText} ${status === 'approved' ? 'approved' : 'rejected'} additional budget of ₹${txn.amount.toLocaleString()}`,
          isBothApproved ? 'completed' : 'in-progress',
          new Date().toISOString(),
          new Date().toISOString()
        );

        // Send email notification to relevant users
        const relevantUsers = users.filter(u => {
          if (u.id === project.leadDesignerId) return true;
          if (u.id === project.clientId) return true;
          // Include all tenant admins
          if (u.role === Role.ADMIN && u.tenantId === user.tenantId) return true;
          return false;
        });

        if (relevantUsers.length > 0) {
          await sendFinancialApprovalNotificationEmail(
            txn,
            user.name || 'Unknown User',
            relevantUsers,
            project.name,
            project.id,
            status,
            approvalType,
            'additional-budget'
          );
        }
      }

      addNotification("Success", `Additional budget ${status === 'approved' ? 'approved' : 'rejected'} by ${approvalType === 'client' ? 'Client' : 'Admin'}`, "success", undefined, project.id, project.name);
    } catch (error: any) {
      console.error('Approval error:', error);
      addNotification("Error", "Unable to process approval. Please try again.", "error", undefined, project.id, project.name);
    } finally {
      setProcessingAction(null);
    }
  };

  // Handle approval for received payments
  const handleApprovePayment = async (transactionId: string, approvalType: 'client' | 'admin', status: 'approved' | 'rejected') => {
    if (processingAction) return;
    setProcessingAction(`approve-payment-${transactionId}-${approvalType}-${status}`);
    try {
      const key = approvalType === 'client' ? 'clientApprovalForPayment' : 'adminApprovalForPayment';
      
      // Check if record exists in real-time collection
      const isRealTime = realTimeFinancials.some(f => f.id === transactionId);

      if (isRealTime) {
        // Write directly to Firebase subcollection
        await updateProjectFinancialRecord(project.id, transactionId, {
          [key]: status
        });
      }

      // Log timeline event
      const txn = currentFinancials.find(f => f.id === transactionId);
      if (txn) {
        const statusText = status === 'approved' ? 'Confirmed' : 'Disputed';
        const roleText = approvalType === 'client' ? 'Client' : 'Admin';
        const approvalNow = new Date().toISOString();
        await logTimelineEvent(
          project.id,
          `Payment ${statusText}`,
          `${roleText} ${status === 'approved' ? 'confirmed' : 'disputed'} payment of ₹${txn.amount.toLocaleString()} for ${txn.description}`,
          status === 'approved' ? 'completed' : 'in-progress',
          approvalNow,
          approvalNow
        );

        // Send email notification to relevant users
        const relevantUsers = users.filter(u => {
          if (u.id === project.leadDesignerId) return true;
          if (u.id === project.clientId) return true;
          // Include all tenant admins
          if (u.role === Role.ADMIN && u.tenantId === user.tenantId) return true;
          return false;
        });

        if (relevantUsers.length > 0) {
          await sendFinancialApprovalNotificationEmail(
            txn,
            user.name || 'Unknown User',
            relevantUsers,
            project.name,
            project.id,
            status,
            approvalType,
            'payment'
          );
        }
      }

      addNotification("Success", `Payment ${status === 'approved' ? 'confirmed' : 'disputed'} by ${approvalType === 'client' ? 'Client' : 'Admin'}`, "success", undefined, project.id, project.name);
    } catch (error: any) {
      console.error('Approval error:', error);
      addNotification("Error", "Unable to process approval. Please try again.", "error", undefined, project.id, project.name);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleApproveExpense = useCallback(async (transactionId: string, approvalType: 'client' | 'admin', isApproved: boolean) => {
    if (processingAction) return;
    setProcessingAction(`approve-expense-${transactionId}-${approvalType}-${isApproved}`);
    const key = approvalType === 'client' ? 'clientApproved' : 'adminApproved';
    
    try {
      // Check if record exists in real-time collection
      const isRealTime = realTimeFinancials.some(f => f.id === transactionId);

      if (isRealTime) {
        // Write directly to Firebase subcollection
        await updateProjectFinancialRecord(project.id, transactionId, {
          [key]: isApproved
        });
      }

      // Get the transaction for email notification
      const txn = currentFinancials.find(f => f.id === transactionId);
      if (txn) {
        // Send email notification to relevant users
        const relevantUsers = users.filter(u => {
          if (u.id === project.leadDesignerId) return true;
          if (u.id === project.clientId) return true;
          // Include all tenant admins
          if (u.role === Role.ADMIN && u.tenantId === user.tenantId) return true;
          return false;
        });

        if (relevantUsers.length > 0) {
          await sendFinancialApprovalNotificationEmail(
            txn,
            user.name || 'Unknown User',
            relevantUsers,
            project.name,
            project.id,
            isApproved ? 'approved' : 'rejected',
            approvalType,
            'expense'
          );
        }
      }

      const actionText = isApproved ? 'approved' : 'rejected';
      const roleText = approvalType === 'client' ? 'client' : 'admin';
      addNotification("Success", `Expense ${actionText} by ${roleText}`, "success", undefined, project.id, project.name);
    } catch (error) {
      console.error('Approval error:', error);
      addNotification("Error", "Unable to process approval. Please try again.", "error", undefined, project.id, project.name);
    } finally {
      setProcessingAction(null);
    }
  }, [project.id, addNotification, realTimeFinancials, currentFinancials, project.leadDesignerId, project.clientId, users, user.name, processingAction]);

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

    setIsSavingTask(true);

    try {
    const defaultApprovals = {
       start: { client: { status: 'pending' }, admin: { status: 'pending' } },
       completion: { client: { status: 'pending' }, admin: { status: 'pending' } }
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
    if (process.env.NODE_ENV !== 'production') console.log("Task data being saved:", taskData);

    // Cycle Detection Check
    if (taskData.dependencies?.includes(taskData.id)) {
        addNotification("Dependency Error", "A task cannot depend on itself.", "error");
        return;
    }

    // Strict Dependency Check for Status Change
    if (taskData.status !== TaskStatus.TODO && !isTaskFrozen(taskData.status)) {
       // Exception: If task is fully approved (all 4), allow moving to DONE even if dependencies are pending
       // This handles cases where work was done out of order but approved by Admin/Client
       const isFullyApproved = 
          taskData.approvals?.start?.client?.status === 'approved' &&
          taskData.approvals?.start?.admin?.status === 'approved' &&
          taskData.approvals?.completion?.client?.status === 'approved' &&
          taskData.approvals?.completion?.admin?.status === 'approved';

       if (!isFullyApproved) {
           const incompleteParents = getBlockingTasks(taskData);
           if (incompleteParents.length > 0) {
               addNotification("Blocked", `Cannot start task. Blocked by: ${incompleteParents.map(t => t.title).join(', ')}.`, "error");
               return;
           }
       }
    }

    let updatedTasks = [...currentTasks];
    const index = updatedTasks.findIndex(t => t.id === taskData.id);
    let log: ActivityLog;

    const oldTask = currentTasks.find(t => t.id === taskData.id);

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
          new Date().toISOString(),
          new Date().toISOString()
        );
        
        // Notify Assignee if changed
        if (oldTask && oldTask.assigneeId !== taskData.assigneeId && taskData.assigneeId) {
            const newAssignee = users.find(u => u.id === taskData.assigneeId);
            if (newAssignee) {
              // Send task assignment notification with link
              await sendTaskAssignmentNotificationEmail(taskData, newAssignee, project.name, project.id, 'updated');
            }
            notifyUser(taskData.assigneeId, 'Task Reassignment', `You have been assigned to task "${taskData.title}" in "${project.name}"`, 'info', 'plan');
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
          new Date().toISOString(),
          new Date().toISOString()
        );
        
        // Send email notification to assignee
        if (taskData.assigneeId) {
          const assignee = users.find(u => u.id === taskData.assigneeId);
          if (assignee) {
            // Send new detailed notification with task link (single notification)
            await sendTaskAssignmentNotificationEmail(taskData, assignee, project.name, project.id, 'created');
          }
          
          // In-app notification
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
      
      // Add visibility delay for spinner
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error('Error saving task:', error);
      addNotification('Error', 'Unable to save task. Please check your input and try again.', 'error', undefined, project.id, project.name);
    } finally {
      setIsSavingTask(false);
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
      addNotification('Error', 'Unable to delete task. Please try again.', 'error', undefined, project.id, project.name);
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

  const handleSendReminder = async (task: Task) => {
    const assignee = users.find(u => u.id === task.assigneeId);
    if (!assignee) {
      addNotification('Error', 'Assignee not found', 'error');
      return;
    }

    if (!assignee.email || !assignee.email.trim()) {
      addNotification('Error', `Email not found for ${assignee.name}`, 'error');
      return;
    }

    setSendingEmailFor(task.id);
    showLoading('Sending reminder...');
    try {
      const result = await sendTaskReminder(
        assignee.email,
        assignee.name,
        task.title,
        project.name,
        task.dueDate
      );

      if (result.success) {
        addNotification('Success', `Email reminder sent to ${assignee.name}`, 'success');
      } else {
        addNotification('Error', result.error || 'Failed to send email', 'error');
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      addNotification('Error', 'Failed to send email reminder', 'error');
    } finally {
      setSendingEmailFor(null);
        hideLoading();
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
        addNotification('Success', 'Task link copied to clipboard!', 'success', user?.id, project.id, project.name);
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
      addNotification('Success', 'Task link copied to clipboard!', 'success', user?.id, project.id, project.name);
    } catch (err) {
      addNotification('Error', 'Failed to copy task link', 'error', user?.id, project.id, project.name);
    }
    document.body.removeChild(textarea);
  };

  const handleSendPaymentReminder = async (client: User) => {
    if (!client.email || !client.email.trim()) {
      addNotification('Error', `Email not found for ${client.name}`, 'error');
      return;
    }

    showLoading('Sending payment reminder...');
    try {
      const result = await sendPaymentReminder(
        client.email,
        client.name,
        project.name
      );

      if (result.success) {
        addNotification('Success', `Payment reminder sent to ${client.name}`, 'success');
      } else {
        addNotification('Error', result.error || 'Failed to send email', 'error');
      }
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      addNotification('Error', 'Failed to send payment reminder', 'error');
    }
      finally {
        hideLoading();
      }
  };

  const handleTaskCompletion = async (task: Task) => {
    if (isTaskFrozen(task.status)) {
      addNotification("Action Blocked", "Task is frozen.", "error");
      return;
    }

    // 1. Mark all subtasks as completed
    const updatedSubtasks = task.subtasks?.map(st => ({ ...st, isCompleted: true })) || [];
    
    // 2. Determine new status: If not in REVIEW, go to REVIEW. If in REVIEW, go to DONE.
    // Exception: If user is Admin, maybe force DONE? User said "task goes to review".
    // We will stick to the flow: TODO/IN_PROGRESS -> REVIEW -> DONE.
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
        addNotification('Success', `Task marked as ${newStatus}`, 'success');
    } catch (error) {
        console.error('Error completing task:', error);
        addNotification('Error', 'Failed to complete task', 'error');
    }
  };

  const handleKanbanStatusUpdate = async (taskId: string, newStatus: TaskStatus) => {
    console.log('🚀 handleKanbanStatusUpdate called for task:', taskId, 'new status:', newStatus);
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) {
      console.log('❌ Task not found:', taskId);
      return;
    }

    console.log('📋 Found task:', task.title, 'current status:', task.status);

    if (isTaskFrozen(task.status)) {
        console.log('❌ Task is frozen, cannot update');
        addNotification("Action Blocked", "Task is frozen (Aborted or On Hold).", "error");
        return;
    }

    // STRICT: Check Approvals before DONE - DISABLED per user request for simple "Mark as Done"
    /*
    if (newStatus === TaskStatus.DONE) {
         console.log('🔍 Checking approvals before marking as DONE');
         const startClient = task.approvals?.start?.client?.status === 'approved';
         const startAdmin = task.approvals?.start?.admin?.status === 'approved';
         const completionClient = task.approvals?.completion?.client?.status === 'approved';
         const completionAdmin = task.approvals?.completion?.admin?.status === 'approved';
         console.log('📋 Approvals - Start Client:', startClient, 'Start Admin:', startAdmin, 'Completion Client:', completionClient, 'Completion Admin:', completionAdmin);
         
         if (!startClient || !startAdmin || !completionClient || !completionAdmin) {
             console.log('❌ Missing required approvals');
             addNotification('Approval Required', 'All 4 approvals (Start & Completion from both Client & Admin) are required.', 'warning');
             return;
         }
    }
    */

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
        new Date().toISOString(),
        new Date().toISOString()
      );
      
      // Update task in Firebase
      await updateTask(project.id, taskId, { status: newStatus });

      // Send completion approval notification if task reaches 100% progress
      if (newStatus === TaskStatus.REVIEW || (newStatus === TaskStatus.DONE && task.status !== TaskStatus.DONE)) {
        // Get project-specific clients and all admins to notify them for completion approval
        const projectClientIds = [project.clientId, ...(project.clientIds || [])].filter(Boolean);
        const clientAndAdmin = users.filter(u => 
          u.role === Role.ADMIN || 
          (u.role === Role.CLIENT && projectClientIds.includes(u.id))
        );
        if (clientAndAdmin.length > 0) {
          await sendTaskCompletionApprovalNotificationEmail(task, clientAndAdmin, project.name, project.id);
        }
      }

      // AUTOMATIC PROJECT STATUS UPDATE
      // If a task moves to IN_PROGRESS, check if we should advance the project phase
      let newProjectStatus = project.status;
      if (newStatus === TaskStatus.IN_PROGRESS) {
          if (task.category === 'Design and Planning' && project.status === ProjectStatus.DISCOVERY) {
              newProjectStatus = ProjectStatus.PLANNING;
          } else if (task.category === 'Execution' && (project.status === ProjectStatus.DISCOVERY || project.status === ProjectStatus.PLANNING)) {
              newProjectStatus = ProjectStatus.EXECUTION;
          }

          if (newProjectStatus !== project.status) {
              await updateExistingProject(project.id, { status: newProjectStatus });
              addNotification('Phase Updated', `Project automatically moved to ${newProjectStatus}`, 'success');
          }
      }

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

    // Determine if we have a new status from the auto-update logic above
    // We need to re-evaluate newProjectStatus variable scope or just re-calculate/use a let variable
    // To be safe and clean, let's assume the local state update should reflect the change if it happened.
    // Since I used a local variable 'newProjectStatus' inside the try block, I need to make sure it's accessible or I just check the logic again.
    // Actually, I can't easily access 'newProjectStatus' from the try block if I defined it there.
    // Let's refactor slightly to ensure we pass the correct status to onUpdateProject.
    
    // RE-CALCULATE for local state (to avoid scope issues with the try-block variable)
    let finalProjectStatus = project.status;
    if (newStatus === TaskStatus.IN_PROGRESS) {
         if (task.category === 'Design and Planning' && project.status === ProjectStatus.DISCOVERY) {
              finalProjectStatus = ProjectStatus.PLANNING;
          } else if (task.category === 'Execution' && (project.status === ProjectStatus.DISCOVERY || project.status === ProjectStatus.PLANNING)) {
              finalProjectStatus = ProjectStatus.EXECUTION;
          }
    }

    onUpdateProject({
      ...project,
      status: finalProjectStatus,
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
    console.log('🟢 Quick Complete clicked for task:', task.title, 'by user:', user.name, 'Current status:', task.status);
    
    if (isTaskFrozen(task.status)) {
      console.log('❌ Task is frozen, cannot proceed');
      return;
    }

    if (isTaskBlocked(task) && task.status !== TaskStatus.DONE) {
      console.log('❌ Task is blocked by dependencies');
      addNotification('Locked', "Cannot complete task. Dependencies pending.", 'error');
      return;
    }
    
    // Toggle Status based on simple flow IF NO CHECKLIST
    // If checklist exists, logic is driven by toggles mostly, but we allow manual "Submit for Review"
    let newStatus = task.status;
    
    console.log('🔄 Processing status change. Has subtasks:', task.subtasks.length > 0, 'Current status:', task.status);
    
    if (task.subtasks.length === 0) {
        console.log('🔹 No subtasks - using simple flow');
        if (task.status === TaskStatus.TODO) newStatus = TaskStatus.IN_PROGRESS;
        else if (task.status === TaskStatus.IN_PROGRESS) newStatus = TaskStatus.REVIEW;
        else if (task.status === TaskStatus.REVIEW) {
             // Check Approvals before DONE
             const clientApproved = task.approvals?.completion?.client?.status === 'approved';
             const adminApproved = task.approvals?.completion?.admin?.status === 'approved';
             console.log('🔍 Checking approvals - Client:', clientApproved, 'Admin:', adminApproved);
             if (clientApproved && adminApproved) {
                 newStatus = TaskStatus.DONE;
             } else {
                 addNotification('Approval Required', 'Wait for Client and Admin approvals.', 'warning');
                 console.log('⏸️ Approvals needed, cannot mark as done');
                 return;
             }
        }
        else if (task.status === TaskStatus.DONE) newStatus = TaskStatus.IN_PROGRESS; 
    } else {
        console.log('🔸 Has subtasks - using checklist flow');
        // If has checklist, button acts as "Submit for Review" if all done
        const allDone = task.subtasks.every(s => s.isCompleted);
        console.log('📋 All subtasks done:', allDone);
        if (allDone && task.status === TaskStatus.IN_PROGRESS) newStatus = TaskStatus.REVIEW;
        else if (task.status === TaskStatus.REVIEW) {
             addNotification('Pending', 'Task is under review. Approvals needed.', 'info');
             console.log('⏸️ Task under review, cannot change status');
             return;
        }
    }
    
    console.log('✅ Status will change from', task.status, 'to', newStatus);
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
      userName: user.name || 'Unknown User', // Store name for display resilience
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
            
            // Send comment notification email to relevant team members
            // Get all users involved with this task (assignee and team members)
            const relevantUsers = users.filter(u => {
              // Include task assignee
              if (u.id === editingTask.assigneeId) return true;
              // Include project admins
              if (u.id === project.leadDesignerId) return true;
              // Include admins from the same tenant only
              if (u.role === Role.ADMIN && u.tenantId === user.tenantId) return true;
              // Include client
              if (u.id === project.clientId) return true;
              return false;
            });
            
            if (relevantUsers.length > 0) {
              await sendTaskCommentNotificationEmail(
                editingTask as Task,
                comment,
                user.name || 'Unknown User',
                relevantUsers,
                project.name,
                project.id
              );
            }
        } catch (error) {
            console.error("Failed to save comment", error);
        }
    }
  };

  const handleApproval = async (stage: 'start' | 'completion', action: 'approve' | 'reject' | 'revoke', targetRole?: 'client' | 'admin' | 'designer') => {
    if (!editingTask || !editingTask.approvals) return;
    if (isTaskFrozen(editingTask.status)) return;
    
    // Prevent duplicate submissions
    const approvalId = `${stage}-${action}-${targetRole || (isClient ? 'client' : 'admin')}`;
    if (processingApproval) return;
    setProcessingApproval(approvalId);

    try {
      // For revoke, only admins can revoke
      if (action === 'revoke') {
        if (!isAdmin) {
          addNotification('Access Denied', 'Only admins can revoke approvals', 'error');
          return;
        }
        if (!targetRole) return;
      
        // Check if both have approved - if so, prevent revocation
        const clientApproved = editingTask.approvals?.[stage]?.client?.status === 'approved';
        const adminApproved = editingTask.approvals?.[stage]?.admin?.status === 'approved';
        
        if (clientApproved && adminApproved) {
          addNotification('Locked', 'Cannot revoke approvals once both parties have approved.', 'error');
          return;
        }
        
        const updatedApprovals = {
          ...editingTask.approvals,
          [stage]: {
            ...editingTask.approvals[stage],
            [targetRole]: {
              status: 'pending' as ApprovalStatus,
              updatedBy: user.id,
              timestamp: new Date().toISOString()
            }
          }
        };
        
        setEditingTask({ 
          ...editingTask, 
          approvals: updatedApprovals
        });
        
        if (editingTask.id) {
          try {
            if (process.env.NODE_ENV !== 'production') console.log(`🔄 Revoking ${stage}/${targetRole} approval...`);
            if (process.env.NODE_ENV !== 'production') console.log(`📝 Updated approvals:`, updatedApprovals);
            
            await updateTask(project.id, editingTask.id, { 
              approvals: updatedApprovals
            });
            if (process.env.NODE_ENV !== 'production') console.log(`✅ Approval updated in Firebase`);
            
            const revokeNow = new Date().toISOString();
            await logTimelineEvent(
              project.id,
              `Approval Revoked: ${editingTask.title}`,
              `${stage} approval revoked for ${targetRole} by ${user.name}`,
              'in-progress',
              revokeNow,
              revokeNow
            );
            if (process.env.NODE_ENV !== 'production') console.log(`✅ Timeline event logged`);
            
            addNotification('Approval Revoked', `${targetRole} approval for ${stage} stage revoked.`, 'info');
          } catch (error) {
            console.error("Failed to revoke approval", error);
            addNotification("Error", "Failed to revoke approval", "error");
          }
        }
        return;
      }
      
      const roleKey = (user.role === Role.CLIENT) ? 'client' : (user.role === Role.ADMIN) ? 'admin' : null;
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
          // Check if ALL 4 Approved, then set to DONE
          const startClient = updatedApprovals.start?.client?.status === 'approved';
          const startAdmin = updatedApprovals.start?.admin?.status === 'approved';
          const completionClient = updatedApprovals.completion?.client?.status === 'approved';
          const completionAdmin = updatedApprovals.completion?.admin?.status === 'approved';

          if (startClient && startAdmin && completionClient && completionAdmin) {
               updatedTaskStatus = TaskStatus.DONE;
               addNotification('Task Approved', "Task fully approved and marked as DONE.", 'success');
               if (editingTask.assigneeId) {
                   notifyUser(editingTask.assigneeId, 'Work Approved', `Great job! "${editingTask.title}" is officially approved and done in "${project.name}".`, 'success', 'plan');
                   // Send task approval email
                   const assignee = projectTeam.find(u => u.id === editingTask.assigneeId);
                   if (assignee && assignee.email && editingTask.title) {
                     await sendTaskApprovalEmail(editingTask.title, assignee, project.name, user.name, 'completion', project.id, editingTask.id);
                   }
               }
          } else if (stage === 'completion') {
               addNotification('Approved', `Task completion approved by ${roleKey}. Waiting for others.`, 'success');
               // Send approval email for this stage
               if (editingTask.assigneeId) {
                 const assignee = projectTeam.find(u => u.id === editingTask.assigneeId);
                 if (assignee && assignee.email && editingTask.title) {
                   await sendTaskApprovalEmail(editingTask.title, assignee, project.name, user.name, 'completion', project.id, editingTask.id);
                 }
               }
          } else {
              addNotification('Approved', `Task ${stage} approved.`, 'success');
              // Send approval email for this stage
              if (editingTask.assigneeId) {
                const assignee = projectTeam.find(u => u.id === editingTask.assigneeId);
                if (assignee && assignee.email && editingTask.title) {
                  await sendTaskApprovalEmail(editingTask.title, assignee, project.name, user.name, stage, project.id, editingTask.id);
                }
              }
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
              
              // Update parent component's task list to refresh Kanban board
              const updatedTaskList = currentTasks.map(t => 
                  t.id === editingTask.id 
                      ? { ...t, approvals: updatedApprovals, status: updatedTaskStatus as TaskStatus }
                      : t
              ) as Task[];
              onUpdateProject({ ...project, tasks: updatedTaskList });
              
              const approvalNow = new Date().toISOString();
              // Log timeline event for approval
              await logTimelineEvent(
                  project.id,
                  `Approval: ${editingTask.title}`,
                  `${stage} approval ${action}ed by ${user.name}`,
                  'completed',
                  approvalNow,
                  approvalNow
              );

          } catch (error) {
              console.error("Failed to save approval", error);
              addNotification("Error", "Failed to save approval status", "error");
          }
      }
      
      // Add visibility delay for spinner
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setProcessingApproval(null);
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

    // Calculate additional budget from actual transactions (paid only)
    const additionalBudgetReceived = currentFinancials
        .filter(f => f.type === 'income' && f.category === 'Additional Budget' && f.status === 'paid')
        .reduce((sum, f) => sum + f.amount, 0);

    // Calculate total additional budget from transactions (paid + pending)
    const totalAdditionalBudget = currentFinancials
        .filter(f => f.type === 'income' && f.category === 'Additional Budget')
        .reduce((sum, f) => sum + f.amount, 0);

    return { received, pendingIncome, paidOut, pendingExpenses, additionalBudgetReceived, totalAdditionalBudget };
  };

  const { received, pendingIncome, paidOut, pendingExpenses, additionalBudgetReceived, totalAdditionalBudget } = calculateFinancials();

  // Financial Filter Logic
  const filteredFinancials = useMemo(() => {
     return currentFinancials.filter(f => {
         if (transactionFilter === 'all') return true;
         if (transactionFilter === 'income') return f.type === 'income';
         if (transactionFilter === 'expense') return f.type === 'expense';
         if (transactionFilter === 'pending') return f.status === 'pending';
         if (transactionFilter === 'overdue') return f.status === 'overdue';
         return true;
     }).sort((a,b) => {
         // Sort by timestamp (descending - most recent first)
         const timeA = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.date).getTime();
         const timeB = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.date).getTime();
         return timeB - timeA; // Descending order
     });
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

  // Combine assigned vendors with team member vendors (treat all equally)
  const allProjectVendors = useMemo(() => {
    const vendorSet = new Map<string, User>();
    
    // Add vendors from assigned tasks
    assignedVendors.forEach(v => vendorSet.set(v.id, v));
    
    // Add vendors from team members (no special filtering)
    if (project.teamMembers) {
      project.teamMembers.forEach(memberId => {
        const member = users.find(u => u.id === memberId);
        if (member && member.role === Role.VENDOR) {
          vendorSet.set(member.id, member);
        }
      });
    }
    
    return Array.from(vendorSet.values());
  }, [assignedVendors, project.teamMembers, users]);

  // Filter vendors based on visibility settings (clients shouldn't see hidden vendors)
  const visibleVendors = useMemo(() => {
      if (isAdmin || isLeadDesigner) {
        // Admins and designers see all vendors
        return allProjectVendors;
      }
      // Clients and others don't see hidden vendors
      const hiddenVendorIds = project.hiddenVendors || [];
      return allProjectVendors.filter(v => !hiddenVendorIds.includes(v.id));
  }, [allProjectVendors, project.hiddenVendors, isAdmin, isLeadDesigner]);

  // Group Vendors by Specialty
  const vendorsByCategory = useMemo(() => {
      const groups: Record<string, User[]> = {};
      visibleVendors.forEach(v => {
          const category = v.specialty || 'General';
          if (!groups[category]) {
              groups[category] = [];
          }
          groups[category].push(v);
      });
      return groups;
  }, [visibleVendors]);

  // Sort vendor categories by standard order
  const sortedVendorCategories = useMemo(() => {
    return Object.keys(vendorsByCategory).sort((a, b) => getCategorySortIndex(a) - getCategorySortIndex(b));
  }, [vendorsByCategory]);

  // Sync editingTask documents array with real-time documents and tasks
  useEffect(() => {
    if (editingTask && editingTask.id) {
      // Find the latest version of this task from currentTasks
      const latestTask = currentTasks.find(t => t.id === editingTask.id);
      
      // If documents array has changed in currentTasks, update editingTask
      if (latestTask && JSON.stringify(latestTask.documents) !== JSON.stringify(editingTask.documents)) {
        setEditingTask(prev => prev && prev.id === editingTask.id ? {
          ...prev,
          documents: latestTask.documents
        } : prev);
      }
    }
  }, [currentTasks, editingTask?.id]);

  // Helper: Get count of valid documents (those that actually exist in realTimeDocuments)
  const getValidDocumentCount = (documentIds?: string[]): number => {
    if (!documentIds || documentIds.length === 0) return 0;
    return documentIds.filter(docId => realTimeDocuments.some(doc => doc.id === docId)).length;
  };

  // Helper: Filter to only valid documents (those that exist in realTimeDocuments)
  const getValidDocuments = (documentIds?: string[]) => {
    if (!documentIds || documentIds.length === 0) return [];
    return realTimeDocuments.filter(doc => documentIds.includes(doc.id));
  };

  // Derived state for Task Modal
  const isEditingFrozen = editingTask ? isTaskFrozen(editingTask.status) : false;

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

  const getNextStatus = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.DISCOVERY: return ProjectStatus.PLANNING;
      case ProjectStatus.PLANNING: return ProjectStatus.EXECUTION;
      case ProjectStatus.EXECUTION: return ProjectStatus.COMPLETED;
      default: return null;
    }
  };

  const handleAdvanceStatus = async () => {
    const next = getNextStatus(project.status);
    if (!next) return;
    
    if (window.confirm(`Are you sure you want to move the project from ${project.status} to ${next}?`)) {
      try {
        await updateExistingProject(project.id, { status: next });
        addNotification('Phase Updated', `Project moved to ${next} phase`, 'success');
      } catch (error: any) {
        console.error('Error updating status:', error);
        addNotification('Error', 'Failed to update project status', 'error');
      }
    }
  };

  const handleToggleHold = async () => {
    if (project.status === ProjectStatus.ON_HOLD) {
        // Resume Logic: Check if any Execution tasks are started/done to decide where to resume
        const hasExecutionActivity = currentTasks.some(t => t.category === 'Execution' && (t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.DONE));
        const resumeStatus = hasExecutionActivity ? ProjectStatus.EXECUTION : ProjectStatus.PLANNING;
        
        if (window.confirm(`Resume project to ${resumeStatus}?`)) {
            try {
                await updateExistingProject(project.id, { status: resumeStatus });
                addNotification('Project Resumed', `Project resumed to ${resumeStatus}`, 'success');
            } catch (e) {
                console.error(e);
                addNotification('Error', 'Failed to resume project', 'error');
            }
        }
    } else {
        // Hold Logic
        if (window.confirm('Are you sure you want to put this project ON HOLD?')) {
            try {
                await updateExistingProject(project.id, { status: ProjectStatus.ON_HOLD });
                addNotification('Project On Hold', 'Project status set to On Hold', 'warning');
            } catch (e) {
                console.error(e);
                addNotification('Error', 'Failed to update status', 'error');
            }
        }
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {/* Project Details Header - Mobile Optimized */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-2 flex flex-col md:flex-row items-start md:items-center justify-between sticky top-0 z-10 shadow-sm gap-3 md:gap-0">
        {!isProjectHeaderLoaded && (
          <div className="w-full space-y-3">
            <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse"></div>
            <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
          </div>
        )}
        {isProjectHeaderLoaded && (
          <>
            <div className="flex items-start gap-3 md:gap-4 w-full md:w-auto flex-1">
              <button onClick={onBack} className="text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0 mt-1" title="Go back to project list">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{project.name}</h1>
                  {isAdmin && (
                    <button 
                      onClick={openDeleteProjectConfirm}
                      className="md:hidden flex items-center gap-2 px-2 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0"
                      title="Delete Project"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm md:text-xs text-gray-500 mt-4 md:mt-3">
                  {isAdmin && (
                    <button
                      onClick={handleToggleHold}
                      className={`text-sm md:text-xs font-bold flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors whitespace-nowrap ${
                        project.status === ProjectStatus.ON_HOLD 
                          ? 'text-green-600 bg-green-50 border-green-100 hover:bg-green-100' 
                          : 'text-orange-600 bg-orange-50 border-orange-100 hover:bg-orange-100'
                      }`}
                      title={project.status === ProjectStatus.ON_HOLD ? "Resume Project" : "Put Project On Hold"}
                    >
                      {project.status === ProjectStatus.ON_HOLD ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                      {project.status === ProjectStatus.ON_HOLD ? "Resume" : "Hold"}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-base md:text-sm text-gray-600 mt-3 md:mt-3">
                  <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="w-4 h-4 flex-shrink-0" /> Due: {formatDateToIndian(project.deadline)}</span>
                  {!isVendor && (
                    <span className="flex items-center gap-1 whitespace-nowrap"><Wallet className="w-4 h-4 flex-shrink-0" /> Budget: ₹{project.budget.toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 md:gap-3 w-full md:w-auto flex-shrink-0">
              {isAdmin && (
                <button 
                  onClick={openDeleteProjectConfirm}
                  className="hidden md:flex items-center gap-2 px-3 md:px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm md:text-xs font-medium whitespace-nowrap"
                  title="Delete Project"
                >
                  <Trash2 className="w-5 h-5 flex-shrink-0" />
                  <span className="hidden md:inline">Delete</span>
                </button>
              )}
              {canEditProject && activeTab !== 'timeline' && (
                <>
                  {/* Desktop Button */}
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
                      if(activeTab === 'documents') { setIsDocModalOpen(true); setSelectedFiles([]); }
                      if(activeTab === 'financials') { openTransactionModal(); }
                      if(activeTab === 'team') { setIsMemberModalOpen(true); setSelectedMemberId(''); }
                      if(activeTab === 'discovery') { setIsMeetingModalOpen(true); }
                    }}
                    className="hidden md:flex items-center gap-2 px-3 md:px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm md:text-xs font-medium whitespace-nowrap flex-1 md:flex-none justify-center md:justify-start"
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {activeTab === 'plan' ? 'Add Task' : 
                       activeTab === 'documents' ? 'Add Document' : 
                       activeTab === 'financials' ? 'Add Transaction' :
                       activeTab === 'team' ? 'Add Member' :
                       activeTab === 'discovery' ? 'Add Meeting' : 'Add Item'}
                    </span>
                  </button>

                  {/* Mobile Floating Action Button */}
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
                      if(activeTab === 'documents') { setIsDocModalOpen(true); setSelectedFiles([]); }
                      if(activeTab === 'financials') { openTransactionModal(); }
                      if(activeTab === 'team') { setIsMemberModalOpen(true); setSelectedMemberId(''); }
                      if(activeTab === 'discovery') { setIsMeetingModalOpen(true); }
                    }}
                    className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-gray-900 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-gray-800 transition-transform active:scale-95"
                    aria-label="Add Item"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </>
              )}
              {/* Allow non-admins to upload docs too if active tab is docs */}
              {!canEditProject && activeTab === 'documents' && canUploadDocs && (
                 <button 
                  onClick={() => { setIsDocModalOpen(true); setSelectedFiles([]); }}
                  className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm md:text-xs font-medium whitespace-nowrap flex-1 md:flex-none justify-center md:justify-start"
                >
                  <Upload className="w-4 h-4 flex-shrink-0" /> 
                  <span className="hidden md:inline">Upload</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Navigation Tabs - Mobile Optimized */}
      <div ref={tabsContainerRef} className="bg-gray-50 overflow-x-auto md:overflow-hidden [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded [&:hover::-webkit-scrollbar-thumb]:bg-gray-400 hover:[scrollbar-color:rgb(107_114_128)_transparent]" style={{scrollbarWidth: 'thin', scrollbarColor: 'transparent transparent'}}>
        <div className="flex gap-1 md:gap-6 px-4 md:px-6 min-w-max md:min-w-0 md:w-full md:justify-center">
          {[
            { id: 'discovery', label: 'Meetings', icon: FileText, hidden: isVendor },
            { id: 'plan', label: 'WIP', icon: Layout },
            { id: 'documents', label: 'Documents', icon: FileIcon },
            { id: 'financials', label: 'Financials', icon: IndianRupee, hidden: !canViewFinancials },
            { id: 'timeline', label: 'Timeline', icon: History, hidden: isVendor },
            { id: 'team', label: 'Team', icon: Users }
          ].map((tab) => {
             if (tab.hidden) return null;
             return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1 md:gap-1 pt-1 pb-0.5 md:pt-2 md:pb-1 px-3 md:px-5 text-base md:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 md:flex-shrink ${
                  activeTab === tab.id ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className={`inline-flex items-center gap-1 pb-1 ${activeTab === tab.id ? 'border-b-2 border-gray-900' : ''}`}>
                  <tab.icon className="w-4 h-4 md:w-4 md:h-4 flex-shrink-0" />
                  {tab.label}
                </span>
              </button>
             );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 border-t border-gray-200"
      >
        
        {/* PHASE 1: MEETINGS */}
        {activeTab === 'discovery' && !isVendor && (
          <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6">

            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-3 md:gap-0">
                <div className="w-full">
                  <h3 className="text-lg md:text-xl font-bold text-gray-800">Meetings</h3>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mt-2">
                    <div className="flex items-center gap-2 text-base md:text-sm text-gray-600">
                      <Calendar className="w-5 h-5 md:w-4 md:h-4 flex-shrink-0" />
                      <span className="font-medium">{realTimeMeetings.length} Meeting{realTimeMeetings.length !== 1 ? 's' : ''} Held</span>
                    </div>
                    {realTimeMeetings.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="whitespace-nowrap">Latest: {formatDateToIndian(realTimeMeetings[0]?.date || '')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 md:space-y-4">
                {realTimeMeetings.length === 0 ? (
                   <div className="text-center py-8 md:py-10 border-2 border-dashed border-gray-100 rounded-lg">
                     <p className="text-base md:text-sm text-gray-400">No meetings recorded yet.</p>
                   </div>
                ) : realTimeMeetings.map(meeting => (
                  <div key={meeting.id} className="border border-gray-100 rounded-lg hover:shadow-md transition-shadow bg-white overflow-hidden">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 md:p-5">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                           <div className="flex items-center gap-2 flex-wrap">
                             <h4 className="font-bold text-lg md:text-base text-gray-800 break-words">{meeting.title}</h4>
                             <span className="bg-gray-100 text-gray-600 text-sm md:text-xs px-2 py-1 rounded whitespace-nowrap">{formatDateToIndian(meeting.date)}</span>
                           </div>
                           <div className="flex items-center gap-2 flex-shrink-0">
                             <span className="bg-purple-100 text-purple-700 text-sm md:text-xs px-2 py-0.5 rounded-full whitespace-nowrap">{meeting.type}</span>
                             {canEditProject && (
                               <>
                                 <button
                                   onClick={() => {
                                     setEditingMeeting(meeting);
                                     setIsMeetingModalOpen(true);
                                   }}
                                   className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                                   title="Edit meeting"
                                 >
                                   <Edit3 className="w-4 h-4" />
                                 </button>
                                 <button
                                   onClick={() => {
                                     setDeletingMeeting(meeting);
                                     setIsMeetingDeleteConfirmOpen(true);
                                   }}
                                   className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                                   title="Delete meeting"
                                 >
                                   <Trash2 className="w-4 h-4" />
                                 </button>
                               </>
                             )}
                           </div>
                        </div>
                        <p className="text-base md:text-sm text-gray-600 mt-2 whitespace-pre-wrap bg-gray-50 p-3 md:p-4 rounded overflow-hidden">{meeting.notes}</p>
                        <div className="mt-3 md:mt-4 flex gap-2 flex-wrap">
                          {(meeting.attendees || []).map((attendeeId) => {
                            const attendee = users.find(u => u.id === attendeeId) || projectTeam.find(u => u.id === attendeeId);
                            return (
                              <span key={attendeeId} className="text-sm md:text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium whitespace-nowrap">
                                {attendee?.name || 'Unknown'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Meeting Comments Section */}
                    <div className="border-t border-gray-100 p-3 md:p-4 bg-gray-50">
                      <button 
                        onClick={() => {
                          setExpandedMeetings(prev => {
                            const next = new Set(prev);
                            if (next.has(meeting.id)) {
                              next.delete(meeting.id);
                            } else {
                              next.add(meeting.id);
                            }
                            return next;
                          });
                        }}
                        className="flex items-center gap-2 w-full hover:bg-gray-100 p-2 rounded transition-colors"
                      >
                        <span className={`transform transition-transform ${expandedMeetings.has(meeting.id) ? 'rotate-90' : ''}`}>
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        </span>
                        <h5 className="text-sm md:text-xs font-bold text-gray-700">Comments ({(meetingComments[meeting.id] || []).length})</h5>
                      </button>
                      
                      {/* Existing Comments Section - Collapsible */}
                      {expandedMeetings.has(meeting.id) && (
                        <div className="mt-2 md:mt-3">
                      
      {/* Existing Comments */}
                          <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
                        {(meetingComments[meeting.id] || []).map(comment => {
                          // Priority order for finding author name:
                          // 1. Use stored userName if it's valid and not "Unknown User"
                          // 2. Try to find in current user
                          // 3. Try to find in users array
                          // 4. Try to find in projectTeam
                          // 5. Fallback to Unknown User
                          let authorName = 'Unknown User';
                          
                          // Step 1: Check stored userName
                          if (comment.userName && comment.userName.trim() && comment.userName !== 'Unknown User') {
                            authorName = comment.userName;
                          }
                          // Step 2: If still Unknown User, check if it's current user
                          else if (comment.userId === user.id && user.name) {
                            authorName = user.name;
                          }
                          // Step 3: Try to find in users array
                          else if (comment.userId) {
                            const commentAuthor = users.find(u => u.id === comment.userId);
                            if (commentAuthor?.name) {
                              authorName = commentAuthor.name;
                            }
                            // Step 4: Try to find in projectTeam as fallback
                            else {
                              const teamMember = projectTeam.find(u => u.id === comment.userId);
                              if (teamMember?.name) {
                                authorName = teamMember.name;
                              }
                            }
                          }
                          
                          const isDone = comment.status === 'done';
                          return (
                            <div key={comment.id} className={`p-3 ${isDone ? 'opacity-60' : ''}`}>
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1">
                                  <p className={`text-sm md:text-xs font-semibold text-gray-800 ${isDone ? 'line-through' : ''}`}>{authorName}</p>
                                  <p className={`text-sm md:text-xs text-gray-700 mt-1 ${isDone ? 'line-through text-gray-500' : ''}`}>{comment.text}</p>
                                </div>
                                {(user.id === comment.userId || canEditProject) && (
                                  <button
                                    onClick={() => {
                                      // Toggle done status
                                      const newStatus = isDone ? ('pending' as const) : ('done' as const);
                                      const updatedComment = { ...comment, status: newStatus };
                                      // Update locally
                                      setMeetingComments(prev => ({
                                        ...prev,
                                        [meeting.id]: (prev[meeting.id] || []).map(c => c.id === comment.id ? updatedComment : c)
                                      }));
                                    }}
                                    className={`p-1 flex-shrink-0 rounded transition-colors ${isDone ? 'text-green-600 hover:text-green-700 bg-green-50' : 'text-gray-400 hover:text-green-600'}`}
                                    title={isDone ? 'Mark as pending' : 'Mark as done'}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <p className={`text-sm md:text-xs text-gray-500 mt-2 ${isDone ? 'line-through' : ''}`}>{formatRelativeTime(comment.timestamp)}</p>
                            </div>
                          );
                        })}
                        </div>
                        </div>
                      )}

                      {/* Comment Input - Always Visible */}
                      <div className="flex gap-1 mt-2 md:mt-3">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                            value={newMeetingComment[meeting.id] || ''}
                            onChange={(e) => setNewMeetingComment(prev => ({
                              ...prev,
                              [meeting.id]: e.target.value
                            }))}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter' && !sendingMeetingComment[meeting.id]) {
                                handleAddMeetingComment(meeting.id);
                              }
                            }}
                            disabled={!!sendingMeetingComment[meeting.id]}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
                        />
                          <button
                            onClick={() => handleAddMeetingComment(meeting.id)}
                            className="p-2 text-gray-500 hover:text-purple-600 transition-colors"
                            title="Post comment"
                            disabled={!!sendingMeetingComment[meeting.id]}
                          >
                            {sendingMeetingComment[meeting.id] ? (
                              <Spinner size="sm" className="text-gray-700" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
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
          <div className="space-y-6 h-full flex flex-col p-4 md:p-6">
            {/* ... (View Switcher and Views code - no structural changes, just ensure Category order is used from props/constants correctly) ... */}
             <div className="flex bg-white rounded-lg border border-gray-200 p-1.5 w-fit shadow-sm">
              {[
                { id: 'list', label: 'List View', icon: ListChecks },
                { id: 'kanban', label: 'Priority Board', icon: Layers },
                { id: 'gantt', label: 'Gantt Chart', icon: Clock }
              ].map(view => (
                <button
                  key={view.id}
                  onClick={() => setPlanView(view.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                    ${planView === view.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  <view.icon className="w-4 h-4" />
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
                  onCompleteTask={handleTaskCompletion}
                />
              </div>
            )}

            {/* GANTT VIEW (Detailed) */}
            {planView === 'gantt' && ganttConfig && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[600px]">
                 {/* ... Gantt SVG Logic ... */}
                 <div className="p-4 md:p-5 bg-gray-50 flex justify-between items-center">
                   <h3 className="font-bold text-base md:text-lg text-gray-800">Timeline & Dependencies</h3>
                   <div className="flex items-center gap-6 text-sm md:text-xs text-gray-500">
                     <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Task</div>
                     <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Done</div>
                     <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-300"></span> Dependency</div>
                     <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400"></span> Conflict</div>
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-auto relative">
                   {(() => {
                     // Calculate all dates for the Gantt chart
                     const dates: Date[] = [];
                     const current = new Date(ganttConfig.minDate);
                     const end = new Date(ganttConfig.maxDate);
                     
                     while (current <= end) {
                       dates.push(new Date(current));
                       current.setDate(current.getDate() + 1);
                     }
                     
                     const DAY_WIDTH = 40; // Fixed width per day in pixels
                     const TASK_COLUMN_WIDTH = 250; // Fixed width for task details column
                     const totalTimelineWidth = dates.length * DAY_WIDTH;
                     const totalWidth = TASK_COLUMN_WIDTH + totalTimelineWidth;
                     
                     // Group months for header
                     const months: { label: string; startIdx: number; dayCount: number }[] = [];
                     let currentMonth: string | null = null;
                     let monthStart = 0;
                     
                     dates.forEach((date, idx) => {
                       const month = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                       if (month !== currentMonth) {
                         if (currentMonth) {
                           months.push({ label: currentMonth, startIdx: monthStart, dayCount: idx - monthStart });
                         }
                         currentMonth = month;
                         monthStart = idx;
                       }
                     });
                     if (currentMonth) {
                       months.push({ label: currentMonth, startIdx: monthStart, dayCount: dates.length - monthStart });
                     }
                     
                     return (
                       <div style={{ minWidth: `${totalWidth}px` }} className="p-6 relative">
                         {/* Grid Background */}
                         <div className="absolute inset-0 pointer-events-none pt-[60px] pb-6 flex" style={{ paddingLeft: `${TASK_COLUMN_WIDTH}px`, paddingRight: '24px' }}>
                           {dates.map((_, i) => (
                             <div key={i} style={{ width: `${DAY_WIDTH}px`, flexShrink: 0 }} className="border-r border-gray-100 h-full"></div>
                           ))}
                         </div>

                         {/* Header */}
                         <div className="sticky top-0 bg-white z-20">
                           <div className="flex pb-1 mb-2">
                             <div style={{ width: `${TASK_COLUMN_WIDTH}px`, flexShrink: 0 }} className="font-semibold text-sm text-gray-700 pl-2">Task Details</div>
                             <div style={{ width: `${totalTimelineWidth}px` }} className="relative">
                               {/* Month row */}
                               <div className="flex w-full text-xs font-bold text-gray-600 mb-2 h-5 border-b border-gray-200">
                                 {months.map((m, idx) => (
                                   <div 
                                     key={idx} 
                                     style={{ width: `${m.dayCount * DAY_WIDTH}px`, flexShrink: 0 }} 
                                     className="text-left px-2 bg-gray-50 border-r border-gray-200"
                                   >
                                     {m.label}
                                   </div>
                                 ))}
                               </div>
                               {/* Date row */}
                               <div className="flex w-full">
                                 {dates.map((d, idx) => (
                                   <div 
                                     key={idx} 
                                     style={{ width: `${DAY_WIDTH}px`, flexShrink: 0 }} 
                                     className={`text-center text-xs py-1 ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-red-50' : ''} ${d.getDate() === 1 ? 'border-l-2 border-gray-300' : ''}`}
                                   >
                                     <div className={`font-semibold ${d.getDay() === 0 || d.getDay() === 6 ? 'text-red-400' : 'text-gray-600'}`}>{d.getDate()}</div>
                                     <div className="text-[10px] text-gray-400">{d.toLocaleDateString('en-IN', { weekday: 'short' }).substring(0, 2)}</div>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           </div>
                           <div className="flex pb-2 border-b border-gray-100">
                             <div style={{ width: `${TASK_COLUMN_WIDTH}px` }} className="pl-2"></div>
                           </div>
                         </div>

                         {/* Timeline Area */}
                         <div className="relative mt-2">
                           {/* Dependency Lines Layer */}
                           <svg 
                               className="absolute top-0 pointer-events-none z-0"
                               style={{ left: `${TASK_COLUMN_WIDTH}px`, width: `${totalTimelineWidth}px` }}
                               viewBox={`0 0 ${totalTimelineWidth} ${ganttTasksWithPos.length * ROW_HEIGHT}`}
                               preserveAspectRatio="none"
                           >
                               {ganttTasksWithPos.flatMap(task => 
                                   (task.dependencies || []).map(depId => {
                                       const parent = ganttTasksWithPos.find(t => t.id === depId);
                                       if (!parent) return null;
                                       
                                       // Convert percentage positions to pixel positions
                                       const x1 = (parent.left + parent.width) * totalTimelineWidth / 100; 
                                       const y1 = (parent.index * ROW_HEIGHT) + (ROW_HEIGHT / 2);
                                       const x2 = task.left * totalTimelineWidth / 100; 
                                       const y2 = (task.index * ROW_HEIGHT) + (ROW_HEIGHT / 2);
                                       const isConflict = x1 > x2;

                                       const pathD = `M ${x1} ${y1} C ${x1 + 20} ${y1}, ${x2 - 20} ${y2}, ${x2} ${y2}`;

                                       return (
                                           <g key={`${parent.id}-${task.id}`}>
                                             <path 
                                                 d={pathD}
                                                 stroke={isConflict ? "#ef4444" : "#9CA3AF"} 
                                                 strokeWidth={isConflict ? "2" : "1.5"}
                                                 fill="none"
                                                 className={isConflict ? "opacity-80" : "opacity-30"}
                                                 strokeDasharray={isConflict ? "4 2" : "none"}
                                             />
                                             <circle cx={x2} cy={y2} r="3" fill={isConflict ? "#ef4444" : "#9CA3AF"}/>
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
                                    <div className="bg-gray-100/50 px-2 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 mb-1 mt-2" style={{ width: `${totalWidth}px` }}>
                                      {task.category}
                                    </div>
                                  )}
                                  <div 
                                    className="flex items-center group hover:bg-gray-50/50 rounded min-h-[56px]"
                                  >
                                    <div style={{ width: `${TASK_COLUMN_WIDTH}px`, flexShrink: 0 }} className="pr-4 pl-2 flex flex-col justify-center border-r border-gray-100">
                                      <div 
                                        onClick={() => handleOpenTask(task)}
                                        className="text-base font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 flex items-center gap-1"
                                      >
                                        {task.title}
                                        {isTaskBlocked(task) && <Lock className="w-3 h-3 text-red-400" />}
                                        {frozen && <Ban className="w-3 h-3 text-red-600" />}
                                      </div>
                                      <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                                        <span>{getAssigneeName(task.assigneeId)}</span>
                                        <span className="font-mono">{progress}%</span>
                                      </div>
                                    </div>
                                    <div style={{ width: `${totalTimelineWidth}px` }} className="relative h-6 rounded-md">
                                       <div 
                                         className={`absolute h-full rounded shadow-sm flex items-center px-2 cursor-pointer
                                           ${task.status === 'Done' ? 'bg-green-500 opacity-80' : 'bg-blue-500 opacity-80'}
                                           ${task.status === 'Review' ? 'bg-purple-500 opacity-80' : ''}
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
                                      {/* Overdue portion (red overlay) */}
                                      {task.status === TaskStatus.OVERDUE && (
                                        <div 
                                          className="absolute top-0 bottom-0 bg-red-500 opacity-80 rounded"
                                          style={{ width: '100%' }}
                                          aria-label="Overdue indicator"
                                        ></div>
                                      )}
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
                   );
                   })()}
                 </div>
              </div>
            )}

            {/* LIST VIEW */}
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
                    <h3 className="text-base font-bold text-gray-500 uppercase tracking-wide mb-4 pl-1 flex items-center gap-1">
                       <Tag className="w-4 h-4" /> {category}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {tasks.map(task => {
                        const blocked = isTaskBlocked(task) && task.status !== TaskStatus.DONE;
                        const frozen = isTaskFrozen(task.status);
                        const progress = calculateTaskProgress(task);
                        const isMyTask = user.id === task.assigneeId;
                        
                        console.log(`🔍 Task "${task.title}": isMyTask=${isMyTask}, blocked=${blocked}, frozen=${frozen}, status=${task.status}, assigneeId=${task.assigneeId}, userId=${user.id}`);

                        return (
                        <div key={task.id} className={`bg-white p-4 md:p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all ${blocked || frozen ? 'opacity-75 bg-gray-50' : ''}`}>
                            <div className="flex justify-between items-start mb-3">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium uppercase
                                ${task.priority === 'high' ? 'bg-red-100 text-red-600' : task.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'}`}>
                                {task.priority}
                              </span>
                              <div className="flex items-center gap-1">
                                {frozen ? (
                                    <span title="Frozen by Admin" className="flex items-center gap-1 text-xs text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                        <Ban className="w-3 h-3" /> {task.status}
                                    </span>
                                ) : (
                                    <>
                                        {blocked && <span title="Blocked by dependency"><Lock className="w-4 h-4 text-red-400" /></span>}
                                        <button onClick={() => handleOpenTask(task)} className="text-xs text-gray-400 hover:text-gray-900 ml-2">View</button>
                                    </>
                                )}
                              </div>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="mt-3">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm md:text-xs text-gray-400 font-medium">Progress</span>
                                    <span className="text-sm md:text-xs text-gray-600 font-bold">{progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div 
                                        className={`h-1.5 rounded-full transition-all duration-500 ${task.status === TaskStatus.DONE ? 'bg-green-500' : frozen ? 'bg-gray-400' : 'bg-blue-500'}`}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                            
                            <h4 className="font-bold text-lg text-gray-800 mb-1 cursor-pointer hover:text-blue-600" onClick={() => handleOpenTask(task)}>{task.title}</h4>
                            <p className="text-sm text-gray-500 mb-4">
                                {formatDateToIndian(task.startDate)} - {formatDateToIndian(task.dueDate)}
                            </p>
                            
                            {/* Progress Bar (Duplicate removed) */}

                            {/* Status Icons */}
                            <div className="flex gap-2 mb-3 flex-wrap">
                              {(() => {
                                // Consolidate all approval statuses to avoid duplicates
                                const clientApproved = task.approvals?.completion?.client?.status === 'approved';
                                const adminApproved = task.approvals?.completion?.admin?.status === 'approved';
                                const clientRejected = task.approvals?.completion?.client?.status === 'rejected';
                                const adminRejected = task.approvals?.completion?.admin?.status === 'rejected';
                                const designerRejected = task.approvals?.completion?.designer?.status === 'rejected';
                                const hasApprovals = task.approvals?.completion?.client || task.approvals?.completion?.admin;
                                
                                return (
                                  <>
                                    {/* Show approval status only once */}
                                    {clientApproved && adminApproved && (
                                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Approved by Both</span>
                                    )}
                                    {clientApproved && !adminApproved && !adminRejected && task.status === TaskStatus.REVIEW && (
                                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Waiting for Admin Approval</span>
                                    )}
                                    {adminApproved && !clientApproved && !clientRejected && (
                                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">{task.status === TaskStatus.REVIEW ? 'Waiting for Client Approval' : 'Client Approval Pending'}</span>
                                    )}
                                    {!clientApproved && !adminApproved && !clientRejected && !adminRejected && task.status === TaskStatus.REVIEW && hasApprovals && (
                                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{task.status === TaskStatus.REVIEW ? 'Under Review' : 'Waiting for Review'}</span>
                                    )}
                                    {clientRejected && (
                                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Rejected by Client</span>
                                    )}
                                    {adminRejected && (
                                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Rejected by Admin</span>
                                    )}
                                    {designerRejected && (
                                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Rejected by Designer</span>
                                    )}
                                    {task.status === TaskStatus.OVERDUE && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Overdue</span>}
                                  </>
                                );
                              })()}
                            </div>

                            <div className="space-y-2 mb-4 max-h-[80px] overflow-y-auto pr-2">
                              {task.subtasks.map(st => (
                                <div key={st.id} className="flex items-center gap-2 text-sm text-gray-600 transition-opacity" style={{opacity: (blocked || frozen || (!canEditProject && !isMyTask)) ? 0.5 : 1}}>
                                  <button
                                    type="button"
                                    onClick={() => (canEditProject || isMyTask) && toggleSubtask(task.id, st.id)}
                                    disabled={blocked || frozen || (!canEditProject && !isMyTask)}
                                    className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-200 ${
                                      st.isCompleted
                                        ? 'bg-green-500 border-green-500 hover:bg-green-600 hover:border-green-600'
                                        : 'border-gray-400 hover:border-green-400 hover:bg-green-50'
                                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-300`}
                                  >
                                    {st.isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
                                  </button>
                                  <span className={st.isCompleted ? 'line-through text-gray-400' : ''}>{st.title}</span>
                                </div>
                              ))}
                            </div>

                            {/* Action Buttons - Bottom Right */}
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="text-sm md:text-xs text-gray-500">{getAssigneeName(task.assigneeId)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {user.role === Role.ADMIN && (
                                    <>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleSendReminder(task); }}
                                            disabled={sendingEmailFor === task.id}
                                            className={`p-1 rounded-full transition-all ${
                                              sendingEmailFor === task.id
                                                ? 'text-blue-500 bg-blue-50 cursor-wait'
                                                : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                                            }`}
                                            title={sendingEmailFor === task.id ? "Sending email..." : "Send Email Reminder"}
                                        >
                                            {sendingEmailFor === task.id ? (
                                              <span className="inline-block animate-spin w-4 h-4">⏳</span>
                                            ) : (
                                              <Bell className="w-4 h-4" />
                                            )}
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
                                                const message = `Hi ${assignee.name},\n\nTask: "${task.title}"\nProject: "${project.name}"\nDue: ${formatDateToIndian(task.dueDate)}\n\nPlease update the status.`;
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
                                              const message = `Hi ${assignee.name},\n\nTask: "${task.title}"\nProject: "${project.name}"\nDue: ${formatDateToIndian(task.dueDate)}\n\nPlease check the task details and update the status.`;
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
           <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-xl md:text-lg font-bold text-gray-800">Project Documents</h3>
                    <p className="text-base md:text-sm text-gray-500">Shared files, layouts, and contracts.</p>
                 </div>
                 {/* Filter Info */}
                 {!canEditProject && (
                    <span className="text-sm md:text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Viewing as {user.role}</span>
                 )}
              </div>

              {/* Docs Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                 {/* Upload Button - Available to all authorized roles */}
                 {canUploadDocs && user.role !== Role.VENDOR && (
                   <button 
                     onClick={() => { setIsDocModalOpen(true); setSelectedFiles([]); }}
                     className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-6 hover:bg-gray-50 hover:border-gray-400 transition-all text-gray-400 hover:text-gray-600 bg-white"
                   >
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-base md:text-sm font-bold">Upload File</span>
                   </button>
                 )}

                 {/* Files */}
                 {(realTimeDocuments || [])
                    .filter(doc => {
                      // Only show to Admin/Designer if pending
                      if (doc.approvalStatus === 'pending') {
                        return user.role === Role.ADMIN || user.role === Role.DESIGNER || doc.uploadedBy === user.id;
                      }
                      // Approved: show to shared users, client, vendor
                      if (doc.approvalStatus === 'approved') {
                        return (Array.isArray(doc.sharedWith) && doc.sharedWith.includes(user.id)) || user.role === Role.ADMIN || doc.uploadedBy === user.id;
                      }
                      // Rejected: only show to admin/designer/uploader
                      if (doc.approvalStatus === 'rejected') {
                        return user.role === Role.ADMIN || user.role === Role.DESIGNER || doc.uploadedBy === user.id;
                      }
                      // Fallback: only show to admin
                      return user.role === Role.ADMIN;
                    })
                    .sort((a, b) => {
                      return getDocumentRecentTimestamp(b) - getDocumentRecentTimestamp(a);
                    })
                    .map(doc => (
                    <div key={doc.id} className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                       {/* Overlay Actions */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10 pointer-events-none group-hover:pointer-events-auto">
                          <div className="grid grid-cols-3 gap-2">
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
                            {(doc.uploadedBy === user.id || canEditProject) && (
                              <button 
                                className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50" 
                                title="Delete"
                                onClick={() => handleDeleteDocument(doc)}
                              >
                                 <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {user.role === Role.ADMIN && (
                              <button
                                className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100"
                                title="Edit Share"
                                onClick={(e) => { e.stopPropagation(); handleOpenShareEdit(doc); }}
                              >
                                <Users className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {user.role === Role.ADMIN && doc.approvalStatus === 'pending' && (
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                className="p-2 bg-white rounded-full text-green-600 hover:bg-green-50" 
                                title="Approve"
                                onClick={() => handleApproveDocument(doc)}
                                disabled={processingAction === `approve-doc-${doc.id}`}
                              >
                                 {processingAction === `approve-doc-${doc.id}` ? <Spinner size="md" color="currentColor" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button 
                                className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50" 
                                title="Reject"
                                onClick={() => handleRejectDocument(doc)}
                                disabled={processingAction === `reject-doc-${doc.id}`}
                              >
                                 {processingAction === `reject-doc-${doc.id}` ? <Spinner size="md" color="currentColor" /> : <X className="w-4 h-4" />}
                              </button>
                            </div>
                          )}
                          {user.role === Role.CLIENT && doc.approvalStatus === 'approved' && doc.clientApprovalStatus !== 'approved' && (
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                className="p-2 bg-white rounded-full text-green-600 hover:bg-green-50" 
                                title="Approve as Client"
                                onClick={() => handleClientApproveDocument(doc)}
                                disabled={processingAction === `client-approve-doc-${doc.id}`}
                              >
                                 {processingAction === `client-approve-doc-${doc.id}` ? <Spinner size="md" color="currentColor" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button 
                                className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50" 
                                title="Reject as Client"
                                onClick={() => handleClientRejectDocument(doc)}
                                disabled={processingAction === `client-reject-doc-${doc.id}`}
                              >
                                 {processingAction === `client-reject-doc-${doc.id}` ? <Spinner size="md" color="currentColor" /> : <X className="w-4 h-4" />}
                              </button>
                            </div>
                          )}
                       </div>
                       
                       <div className="h-32 bg-gray-100 flex items-center justify-center overflow-hidden relative group">
                          {doc.type === 'image' ? (
                              <img 
                                src={doc.url || DEFAULT_AVATAR} 
                                alt={doc.name} 
                                className="w-full h-full object-cover" 
                                onError={(e) => {
                                  e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48L3BvbHlsaW5lPjwvc3ZnPg=='; // Fallback to icon
                                  e.currentTarget.className = "w-12 h-12 opacity-50"; // Adjust styling for icon
                                  e.currentTarget.parentElement?.classList.add("flex", "items-center", "justify-center");
                                }}
                              />
                          ) : doc.type === 'pdf' ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
                                 <FileText className="w-12 h-12 text-red-400 mb-2" />
                                 <span className="text-sm font-bold text-red-600 uppercase">PDF</span>
                              </div>
                          ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                                 <FileText className="w-12 h-12 text-blue-400 mb-2" />
                                 <span className="text-sm font-bold text-blue-600 uppercase">{doc.type}</span>
                              </div>
                          )}
                       </div>
                       <div className="p-3">
                          {/* Row 1: Document name and date */}
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-lg md:text-sm font-bold text-gray-800 flex-1 truncate" title={doc.name}>{doc.name}</p>
                            <span className="text-sm md:text-xs text-gray-400 whitespace-nowrap">{formatDateToIndian(doc.uploadDate)}</span>
                          </div>
                          
                          {/* Row 2: Shared with people */}
                          <div className="mt-2 flex gap-1 flex-wrap">
                              {(Array.isArray(doc.sharedWith) ? doc.sharedWith : []).map(userId => {
                                const sharedUser = users.find(u => u.id === userId);
                                if (!sharedUser?.name) return null; // don't show placeholder when name missing
                                return (
                                  <span key={userId} className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold" title={sharedUser.name}>
                                    {sharedUser.name.split(' ')[0]}
                                  </span>
                                );
                              })}
                          </div>
                          
                          {/* Row 3: Approval Status Indicators */}
                          <div className="flex flex-col gap-1 mt-2">
                            <div className="flex-none w-auto">
                              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${doc.approvalStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : doc.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>Admin: {doc.approvalStatus === 'pending' ? 'Pending' : doc.approvalStatus === 'approved' ? 'Approved' : 'Rejected'}</span>
                            </div>
                            {doc.approvalStatus === 'approved' && doc.clientApprovalStatus && (
                              <div className="flex-none w-auto">
                                <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${doc.clientApprovalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{doc.clientApprovedBy ? users.find(u => u.id === doc.clientApprovedBy)?.name || 'Client' : 'Client'}: {doc.clientApprovalStatus === 'approved' ? 'Approved' : 'Rejected'}</span>
                              </div>
                            )}
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
          <div className="w-full mx-auto space-y-8 p-4 md:p-6">
            <h3 className="text-lg md:text-base font-bold text-gray-800">Financial Management</h3>
            
            {/* NEW: Budget Overview Section */}
            <div className="bg-gray-900 text-white p-4 md:p-8 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="text-gray-400 text-sm md:text-xs font-bold uppercase mb-1">Total Project Budget</p>
                        {canEditProject && (
                            <button 
                                onClick={() => {
                                    setIsAdditionalBudgetModalOpen(true);
                                    setAdditionalBudgetAmount('');
                                    setAdditionalBudgetDescription('');
                                }}
                                className="text-xs bg-gray-800 hover:bg-gray-700 text-emerald-400 px-3 py-1 rounded border border-gray-700 transition-colors flex items-center gap-1"
                                title="Add to Project Budget"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Funds
                            </button>
                        )}
                    </div>
                    <h2 className="text-4xl md:text-3xl font-bold tracking-tight">₹{((project.initialBudget || project.budget) + totalAdditionalBudget).toLocaleString()}</h2>
                    {totalAdditionalBudget > 0 && (
                        <div className="mt-3 space-y-1">
                            <p className="text-sm md:text-xs text-gray-400">Initial Budget: ₹{(project.initialBudget || project.budget).toLocaleString()}</p>
                            <p className="text-sm md:text-xs text-emerald-400 font-medium">
                                Additional Budget: ₹{totalAdditionalBudget.toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>
                <div className="text-left md:text-right">
                    <p className="text-gray-400 text-sm md:text-xs font-bold uppercase mb-1">Remaining Budget</p>
                     {/* Remaining = Budget - Total Expenses (Paid + Pending) to reflect actual committed cost against budget */}
                    <h2 className={`text-3xl md:text-2xl font-bold ${((project.initialBudget || project.budget) + totalAdditionalBudget) - (paidOut + pendingExpenses) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        ₹{(((project.initialBudget || project.budget) + totalAdditionalBudget) - (paidOut + pendingExpenses)).toLocaleString()}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Budget - (Paid + Pending Expenses)</p>
                </div>
            </div>

            {/* Detailed Financial Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 md:px-6 md:py-5 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-base md:text-sm text-gray-800">Financial Summary & Analysis</h3>
              </div>
              <div className="p-4 md:p-6 space-y-6">
                {/* Income Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-base md:text-sm font-bold text-gray-700 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    Income Breakdown
                  </h4>
                  {(() => {
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                        <div className="p-4 md:p-6 bg-blue-50 rounded-lg border border-blue-100">
                          <p className="text-sm md:text-xs text-blue-600 font-bold uppercase mb-1">Estimated</p>
                          <p className="text-2xl md:text-xl font-bold text-blue-700">₹{(project.initialBudget || project.budget).toLocaleString()}</p>
                        </div>
                        <div className="p-4 md:p-6 bg-purple-50 rounded-lg border border-purple-100">
                          <p className="text-sm md:text-xs text-purple-600 font-bold uppercase mb-1">Additional</p>
                          <p className="text-2xl md:text-xl font-bold text-purple-700">₹{totalAdditionalBudget.toLocaleString()}</p>
                        </div>
                        <div className="p-4 md:p-6 bg-green-50 rounded-lg border border-green-100">
                          <p className="text-sm md:text-xs text-green-600 font-bold uppercase mb-1">Received</p>
                          <p className="text-2xl md:text-xl font-bold text-green-700">₹{received.toLocaleString()}</p>
                          <p className="text-sm md:text-xs text-green-600 mt-1">{Math.round((received / ((project.initialBudget || project.budget) + totalAdditionalBudget)) * 100) || 0}% of budget</p>
                        </div>
                        <div className="p-4 md:p-6 bg-red-50 rounded-lg border border-red-100">
                          <p className="text-sm md:text-xs text-red-600 font-bold uppercase mb-1">Expense</p>
                          <p className="text-2xl md:text-xl font-bold text-red-700">₹{paidOut.toLocaleString()}</p>
                          <p className="text-sm md:text-xs text-red-600 mt-1">{Math.round((paidOut / ((project.initialBudget || project.budget) + totalAdditionalBudget)) * 100) || 0}% of budget</p>
                        </div>
                        <div className={`p-4 md:p-6 rounded-lg border ${received - paidOut >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                          <p className={`text-sm md:text-xs font-bold uppercase mb-1 ${received - paidOut >= 0 ? 'text-green-600' : 'text-red-600'}`}>Profit/Loss</p>
                          <p className={`text-2xl md:text-xl font-bold ${received - paidOut >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {received - paidOut >= 0 ? '+' : ''}₹{(received - paidOut).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-4 md:p-6 bg-orange-50 rounded-lg border border-orange-100">
                          <p className="text-sm md:text-xs text-orange-600 font-bold uppercase mb-1">Not Received</p>
                          <p className={`text-2xl md:text-xl font-bold ${(((project.initialBudget || project.budget) + totalAdditionalBudget) - received) < 0 ? 'text-red-700' : 'text-orange-700'}`}>
                            ₹{(((project.initialBudget || project.budget) + totalAdditionalBudget) - received).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-4 md:p-6 bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-sm md:text-xs text-gray-600 font-bold uppercase mb-1">Total</p>
                          <p className="text-2xl md:text-xl font-bold text-gray-700">₹{((project.initialBudget || project.budget) + totalAdditionalBudget).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            
            {/* Transaction Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[300px]">
                <div className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800 text-lg md:text-base">Transaction Ledger</h3>
                    <div className="flex gap-2 relative">
                        {/* Filter Button */}
                        <button 
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`text-sm md:text-xs border px-3 py-1.5 rounded-lg hover:bg-white text-gray-700 flex items-center gap-1.5 font-medium transition-colors ${transactionFilter !== 'all' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300'}`}
                        >
                            <Filter className="w-3.5 h-3.5"/> 
                            <span className="capitalize hidden sm:inline">{transactionFilter === 'all' ? 'Filter' : transactionFilter}</span>
                        </button>
                        
                        {/* Filter Dropdown */}
                        {isFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
                                <div className="absolute right-0 top-9 bg-white shadow-xl border border-gray-100 rounded-lg p-1 z-20 w-32 flex flex-col gap-0.5 animate-fade-in">
                                    {['all', 'income', 'expense', 'pending', 'overdue'].map(f => (
                                        <button 
                                            key={f}
                                            onClick={() => { setTransactionFilter(f as any); setIsFilterOpen(false); }}
                                            className={`text-left text-xs px-2.5 py-1.5 rounded capitalize font-medium ${transactionFilter === f ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm text-left">
                <thead className="bg-white text-gray-600 border-b border-gray-100 sticky top-0 z-10">
                    <tr>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-left">Date</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap">Paid By</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-left">Received By</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-center">Type</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-center">Mode</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-center">Status</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-center">Amount</th>
                    <th className="px-4 py-2 font-semibold whitespace-nowrap text-center">Approvals</th>
                    <th className="px-2 py-2 font-semibold text-center w-8"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredFinancials.length === 0 && (
                        <tr>
                            <td colSpan={9} className="text-center py-8 text-gray-400 text-sm">
                                {currentFinancials.length === 0 ? 'No transactions recorded.' : 'No transactions match filters.'}
                            </td>
                        </tr>
                    )}
                    {filteredFinancials.map(fin => (
                    <tr key={fin.id} className="hover:bg-gray-50 group transition-colors">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-sm md:text-xs text-left">
                          {fin.date}
                          {fin.timestamp && (
                            <div className="text-gray-400 text-xs mt-0.5">
                              {new Date(fin.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2" style={{maxWidth: '150px'}}>
                          <div className="flex flex-col gap-0.5">
                            <div className="font-bold text-gray-900 text-sm md:text-xs">
                              {fin.paidByOther ? fin.paidByOther.includes('(') ? fin.paidByOther.split('(')[0].trim() : fin.paidByOther : (
                                fin.paidBy === 'admin' ? (fin.vendorName ? fin.vendorName : '-') :
                                fin.type === 'income' ? (fin.paidTo ? fin.paidTo : '-') : (fin.vendorName ? fin.vendorName : '-')
                              )}
                            </div>
                            {fin.type === 'expense' && (
                              <span className="text-gray-600 break-words text-sm md:text-xs">{fin.description}</span>
                            )}
                            <div className="flex items-center gap-1 text-sm md:text-xs">
                              <span className="text-gray-400">|</span>
                              <span className={`flex-shrink-0 font-medium ${
                                fin.paidBy === 'client' ? 'text-blue-700' :
                                fin.paidBy === 'vendor' ? 'text-purple-700' :
                                fin.paidBy === 'designer' ? 'text-orange-700' :
                                fin.paidBy === 'admin' ? 'text-red-700' :
                                fin.paidBy === 'other' ? 'text-gray-700' :
                                fin.type === 'income' ? 'text-green-700' :
                                'text-gray-700'
                              }`}>
                                {fin.paidBy === 'client' ? 'Client' :
                                 fin.paidBy === 'vendor' ? 'Vendor' :
                                 fin.paidBy === 'designer' ? 'Designer' :
                                 fin.paidBy === 'admin' ? 'Admin' :
                                 fin.paidBy === 'other' ? (fin.paidByOther && fin.paidByOther.includes('(') ? fin.paidByOther.split('(')[1].replace(')', '').trim() : 'Other') :
                                 fin.type === 'income' ? 'Client' :
                                 fin.type === 'expense' ? 'Proj' :
                                 'N/A'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2" style={{maxWidth: '150px'}}>
                          <div className="flex flex-col gap-0.5">
                            {/* Extract name from "Name (Role)" format */}
                            <div className="font-bold text-gray-900 text-sm md:text-xs">
                              {fin.receivedByRole === 'admin-received' ? (fin.receivedByName ? fin.receivedByName : '-') :
                               fin.receivedBy ? (
                                fin.receivedBy.includes('(') ? fin.receivedBy.split('(')[0].trim() : fin.receivedBy
                              ) : (fin.paidTo ? fin.paidTo : (fin.vendorName ? fin.vendorName : '-'))}
                            </div>
                            <div className="flex flex-col gap-1 text-sm md:text-xs">
                              {fin.type !== 'expense' && (
                                <span className="text-gray-600 break-words text-sm md:text-xs">{fin.description}</span>
                              )}
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400">|</span>
                                <span className={`flex-shrink-0 font-medium text-sm md:text-xs ${
                                  fin.receivedByRole === 'admin-received' ? 'text-red-700' :
                                  fin.receivedByRole === 'vendor-received' ? 'text-purple-700' :
                                  fin.receivedByRole === 'designer-received' ? 'text-orange-700' :
                                  fin.receivedByRole === 'client-received' ? 'text-blue-700' :
                                  fin.receivedByRole === 'other-received' ? 'text-gray-700' :
                                  fin.receivedBy ? (
                                    (() => {
                                      const receivedUser = users.find(u => u.name === (fin.receivedBy?.includes('(') ? fin.receivedBy.split('(')[0].trim() : fin.receivedBy));
                                      const role = receivedUser?.role || (fin.receivedBy?.includes('(') ? fin.receivedBy.split('(')[1].replace(')', '').trim() : '');
                                      if (role === Role.CLIENT || role === 'Client') return 'text-blue-700';
                                      if (role === Role.VENDOR || role === 'Vendor') return 'text-purple-700';
                                      if (role === Role.DESIGNER || role === 'Designer') return 'text-orange-700';
                                      if (role === Role.ADMIN || role === 'Admin') return 'text-red-700';
                                      return fin.type === 'income' ? 'text-green-700' : 'text-gray-700';
                                    })()
                                  ) : (fin.type === 'income' ? 'text-green-700' : 'text-gray-700')
                                }`}>
                                  {/* Extract role from "Name (Role)" format */}
                                  {fin.receivedByRole === 'admin-received' ? 'Admin' :
                                   fin.receivedByRole === 'vendor-received' ? 'Vendor' :
                                   fin.receivedByRole === 'designer-received' ? 'Designer' :
                                   fin.receivedByRole === 'client-received' ? 'Client' :
                                   fin.receivedByRole === 'other-received' ? 'Other' :
                                   fin.receivedBy && fin.receivedBy.includes('(') ? (
                                    fin.receivedBy.split('(')[1].replace(')', '').trim()
                                  ) : (fin.type === 'income' ? (projectTeam.find(m => m.name === fin.receivedBy)?.role || 'Team Member') : (projectTeam.find(m => m.name === fin.receivedBy)?.role || '-'))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center">
                        {fin.type === 'income' ? (
                          <span className="flex items-center justify-center gap-0.5 text-green-600 text-sm md:text-xs font-bold"><ArrowRight className="w-2.5 h-2.5 rotate-180" /> Received</span>
                        ) : fin.type === 'expense' ? (
                          <span className="flex items-center justify-center gap-0.5 text-red-600 text-sm md:text-xs font-bold"><ArrowRight className="w-2.5 h-2.5" /> Paid</span>
                        ) : (
                          <span className="text-purple-600 text-sm md:text-xs font-bold">Design</span>
                        )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center text-sm md:text-xs text-gray-600 capitalize">
                          {fin.paymentMode ? fin.paymentMode.replace('_', ' ') : '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-sm md:text-xs font-bold capitalize
                          ${fin.status === 'paid' ? 'bg-green-100 text-green-700' : 
                            fin.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {fin.status === 'paid' ? 'Paid' : fin.status === 'overdue' ? 'Overdue' : 'Pending'}
                        </span>
                        </td>
                        <td className={`px-4 py-2 font-semibold whitespace-nowrap text-sm md:text-xs text-center ${fin.type === 'income' ? 'text-green-600' : 'text-gray-900'}`}>
                        ₹{fin.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {/* Detect if this should be an additional budget based on category */}
                          {(fin.isAdditionalBudget || (fin.type === 'income' && fin.category === 'Additional Budget')) && (
                            <div className="flex items-center gap-3">
                              {/* Client Approval */}
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-blue-600">C:</span>
                                {(fin.clientApprovalForAdditionalBudget === 'approved' || fin.clientApproved === true) && (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                )}
                                {(fin.clientApprovalForAdditionalBudget === 'rejected') && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                )}
                                {(fin.clientApprovalForAdditionalBudget === 'pending' || (!fin.clientApprovalForAdditionalBudget && !fin.clientApproved)) && user?.role === Role.CLIENT && (
                                  <div className="flex gap-0.5">
                                    <button 
                                      onClick={() => handleApproveAdditionalBudget(fin.id, 'client', 'approved')}
                                      className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Approve"
                                      disabled={processingAction === `approve-budget-${fin.id}-client-approved`}
                                    >
                                      {processingAction === `approve-budget-${fin.id}-client-approved` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                    </button>
                                    <button 
                                      onClick={() => handleApproveAdditionalBudget(fin.id, 'client', 'rejected')}
                                      className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Reject"
                                      disabled={processingAction === `approve-budget-${fin.id}-client-rejected`}
                                    >
                                      {processingAction === `approve-budget-${fin.id}-client-rejected` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                    </button>
                                  </div>
                                )}
                                {(fin.clientApprovalForAdditionalBudget === 'pending' || (!fin.clientApprovalForAdditionalBudget && !fin.clientApproved)) && user?.role !== Role.CLIENT && (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </div>
                              
                              <span className="text-gray-300">|</span>
                              
                              {/* Admin Approval */}
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-purple-600">A:</span>
                                {(fin.adminApprovalForAdditionalBudget === 'approved' || fin.adminApproved === true) && (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                )}
                                {(fin.adminApprovalForAdditionalBudget === 'rejected') && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                )}
                                {(fin.adminApprovalForAdditionalBudget === 'pending' || (!fin.adminApprovalForAdditionalBudget && !fin.adminApproved)) && user?.role === Role.ADMIN && (
                                  <div className="flex gap-0.5">
                                    <button 
                                      onClick={() => handleApproveAdditionalBudget(fin.id, 'admin', 'approved')}
                                      className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Approve"
                                      disabled={processingAction === `approve-budget-${fin.id}-admin-approved`}
                                    >
                                      {processingAction === `approve-budget-${fin.id}-admin-approved` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                    </button>
                                    <button 
                                      onClick={() => handleApproveAdditionalBudget(fin.id, 'admin', 'rejected')}
                                      className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Reject"
                                      disabled={processingAction === `approve-budget-${fin.id}-admin-rejected`}
                                    >
                                      {processingAction === `approve-budget-${fin.id}-admin-rejected` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                    </button>
                                  </div>
                                )}
                                {(fin.adminApprovalForAdditionalBudget === 'pending' || (!fin.adminApprovalForAdditionalBudget && !fin.adminApproved)) && user?.role !== Role.ADMIN && (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Approval Status for Received Payments */}
                          {(fin.isClientPayment || (fin.type === 'income' && fin.category !== 'Additional Budget')) && (
                            <div className="flex items-center gap-3">
                              {/* Client Payment Approval */}
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-blue-600">C:</span>
                                {(fin.clientApprovalForPayment === 'approved' || fin.clientApproved === true) && (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                )}
                                {(fin.clientApprovalForPayment === 'rejected') && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                )}
                                {(fin.clientApprovalForPayment === 'pending' || (!fin.clientApprovalForPayment && !fin.clientApproved)) && user?.role === Role.CLIENT && (
                                  <div className="flex gap-0.5">
                                    <button 
                                      onClick={() => handleApprovePayment(fin.id, 'client', 'approved')}
                                      className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Confirm payment"
                                      disabled={processingAction === `approve-payment-${fin.id}-client-approved`}
                                    >
                                      {processingAction === `approve-payment-${fin.id}-client-approved` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                    </button>
                                    <button 
                                      onClick={() => handleApprovePayment(fin.id, 'client', 'rejected')}
                                      className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Dispute payment"
                                      disabled={processingAction === `approve-payment-${fin.id}-client-rejected`}
                                    >
                                      {processingAction === `approve-payment-${fin.id}-client-rejected` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                    </button>
                                  </div>
                                )}
                                {(fin.clientApprovalForPayment === 'pending' || (!fin.clientApprovalForPayment && !fin.clientApproved)) && user?.role !== Role.CLIENT && (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </div>
                              
                              <span className="text-gray-300">|</span>
                              
                              {/* Admin Payment Approval */}
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-purple-600">A:</span>
                                {(fin.adminApprovalForPayment === 'approved' || fin.adminApproved === true) && (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                )}
                                {(fin.adminApprovalForPayment === 'rejected') && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                )}
                                {(fin.adminApprovalForPayment === 'pending' || (!fin.adminApprovalForPayment && !fin.adminApproved)) && user?.role === Role.ADMIN && (
                                  <div className="flex gap-0.5">
                                    <button 
                                      onClick={() => handleApprovePayment(fin.id, 'admin', 'approved')}
                                      className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Approve payment"
                                      disabled={processingAction === `approve-payment-${fin.id}-admin-approved`}
                                    >
                                      {processingAction === `approve-payment-${fin.id}-admin-approved` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                    </button>
                                    <button 
                                      onClick={() => handleApprovePayment(fin.id, 'admin', 'rejected')}
                                      className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Reject payment"
                                      disabled={processingAction === `approve-payment-${fin.id}-admin-rejected`}
                                    >
                                      {processingAction === `approve-payment-${fin.id}-admin-rejected` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                    </button>
                                  </div>
                                )}
                                {(fin.adminApprovalForPayment === 'pending' || (!fin.adminApprovalForPayment && !fin.adminApproved)) && user?.role !== Role.ADMIN && (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Approval Status for Expenses */}
                          {fin.type === 'expense' && (
                            <div className="flex items-center gap-3">
                              {/* Client Approval for Expenses */}
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-blue-600">C:</span>
                                {fin.clientApproved === true && (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                )}
                                {fin.clientApproved === false && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                )}
                                {fin.clientApproved === undefined && user?.role === Role.CLIENT && (
                                  <div className="flex gap-0.5">
                                    <button 
                                      onClick={() => handleApproveExpense(fin.id, 'client', true)}
                                      className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Approve expense"
                                      disabled={processingAction === `approve-expense-${fin.id}-client-true`}
                                    >
                                      {processingAction === `approve-expense-${fin.id}-client-true` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                    </button>
                                    <button 
                                      onClick={() => handleApproveExpense(fin.id, 'client', false)}
                                      className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Reject expense"
                                      disabled={processingAction === `approve-expense-${fin.id}-client-false`}
                                    >
                                      {processingAction === `approve-expense-${fin.id}-client-false` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                    </button>
                                  </div>
                                )}
                                {fin.clientApproved === undefined && user?.role !== Role.CLIENT && (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </div>
                              
                              <span className="text-gray-300">|</span>
                              
                              {/* Admin Approval for Expenses */}
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-purple-600">A:</span>
                                {fin.adminApproved === true && (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                )}
                                {fin.adminApproved === false && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                )}
                                {fin.adminApproved === undefined && user?.role === Role.ADMIN && (
                                  <div className="flex gap-0.5">
                                    <button 
                                      onClick={() => handleApproveExpense(fin.id, 'admin', true)}
                                      className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Approve expense"
                                      disabled={processingAction === `approve-expense-${fin.id}-admin-true`}
                                    >
                                      {processingAction === `approve-expense-${fin.id}-admin-true` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                    </button>
                                    <button 
                                      onClick={() => handleApproveExpense(fin.id, 'admin', false)}
                                      className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                      title="Reject expense"
                                      disabled={processingAction === `approve-expense-${fin.id}-admin-false`}
                                    >
                                      {processingAction === `approve-expense-${fin.id}-admin-false` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                    </button>
                                  </div>
                                )}
                                {fin.adminApproved === undefined && user?.role !== Role.ADMIN && (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </div>
                            </div>
                          )}
                          {!fin.isAdditionalBudget && !fin.isClientPayment && fin.type !== 'expense' && (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canEditProject && (
                              <button 
                                onClick={() => openTransactionModal(fin.id)}
                                className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-50 rounded"
                                title="Edit Transaction"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setDeleteConfirmTransactionId(fin.id);
                                  setIsTransactionDeleteConfirmOpen(true);
                                }}
                                className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
                                title="Delete Transaction"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
                </div>
            </div>

            {/* Vendor Billing Report Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-800 text-lg md:text-base">{isVendor ? 'My Payment Records' : 'Vendor Billing Report'}</h3>
              </div>
              
              {currentFinancials.filter(f => {
                // Get all vendors (users with VENDOR role)
                const vendorUsers = users.filter(u => u.role === Role.VENDOR);
                const vendorNames = new Set(vendorUsers.map(v => v.name));
                
                const cleanName = (name?: string) => {
                    if (!name) return '';
                    return name.includes('(') ? name.split('(')[0].trim() : name.trim();
                };

                if (isVendor) {
                  // Show all transactions related to this vendor (vendor paid OR vendor received)
                  return f.vendorName === user.name || 
                         cleanName(f.receivedByName) === user.name || 
                         cleanName(f.paidByOther) === user.name ||
                         f.paidTo === user.name ||
                         f.receivedBy === user.name;
                }
                // If admin/client, show all vendor-related transactions
                // Check if the cleaned name matches any known vendor
                const isVendorReceived = f.receivedByName && vendorNames.has(cleanName(f.receivedByName));
                const isVendorPaid = f.paidByOther && vendorNames.has(cleanName(f.paidByOther));
                const isVendorReceivedByRole = f.receivedByRole === 'vendor-received';
                
                return (!!f.vendorName && vendorNames.has(f.vendorName)) || 
                       f.paidBy === 'vendor' ||
                       isVendorReceived ||
                       isVendorPaid ||
                       isVendorReceivedByRole;
              }).length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-400">
                  {isVendor ? 'No payment records for you yet.' : 'No vendor transactions recorded yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-bold text-gray-700 text-sm md:text-sm">Date</th>
                        <th className="px-4 py-2 font-bold text-gray-700 text-sm md:text-sm">Paid By</th>
                        <th className="px-4 py-2 font-bold text-gray-700 text-left text-sm md:text-sm">Received By (Vendor)</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-700 text-sm md:text-sm">Description</th>
                        <th className="px-4 py-2 text-right font-bold text-gray-700 text-sm md:text-sm">Amount</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700 text-sm md:text-sm">Admin Approval</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700 text-sm md:text-sm">Client Approval</th>
                        <th className="px-4 py-2 text-center font-bold text-gray-700 text-sm md:text-sm">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentFinancials.filter(f => {
                        const vendorUsers = users.filter(u => u.role === Role.VENDOR);
                        const vendorNames = new Set(vendorUsers.map(v => v.name));
                        
                        const cleanName = (name?: string) => {
                            if (!name) return '';
                            return name.includes('(') ? name.split('(')[0].trim() : name.trim();
                        };

                        if (isVendor) {
                          return f.vendorName === user.name || 
                                 cleanName(f.receivedByName) === user.name || 
                                 cleanName(f.paidByOther) === user.name ||
                                 f.paidTo === user.name ||
                                 f.receivedBy === user.name;
                        }
                        
                        const isVendorReceived = f.receivedByName && vendorNames.has(cleanName(f.receivedByName));
                        const isVendorPaid = f.paidByOther && vendorNames.has(cleanName(f.paidByOther));
                        const isVendorReceivedByRole = f.receivedByRole === 'vendor-received';

                        return (!!f.vendorName && vendorNames.has(f.vendorName)) || 
                               f.paidBy === 'vendor' ||
                               isVendorReceived ||
                               isVendorPaid ||
                               isVendorReceivedByRole;
                      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((expense, idx) => (
                        <tr key={expense.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-sm md:text-xs text-left">{expense.date}</td>
                          <td className="px-4 py-2">
                            <div className="flex flex-col gap-0.5">
                              <div className="font-bold text-gray-900 text-sm md:text-xs">{expense.type === 'income' ? (expense.paidTo || expense.paidByOther || '-') : (expense.vendorName || '-')}</div>
                              <div className="flex items-center gap-1 text-sm md:text-xs">
                                <span className="text-gray-400">|</span>
                                <span className={`flex-shrink-0 font-medium text-sm md:text-xs ${
                                  expense.paidBy === 'client' ? 'text-blue-700' :
                                  expense.paidBy === 'vendor' ? 'text-purple-700' :
                                  expense.paidBy === 'designer' ? 'text-orange-700' :
                                  expense.paidBy === 'admin' ? 'text-red-700' :
                                  'text-gray-700'
                                }`}>
                                  {expense.type === 'income' ? (
                                    (() => {
                                      const paidByUser = users.find(u => u.name === (expense.paidTo || expense.paidByOther));
                                      return paidByUser?.role === Role.CLIENT ? 'Client' :
                                             paidByUser?.role === Role.VENDOR ? 'Vendor' :
                                             paidByUser?.role === Role.DESIGNER ? 'Designer' :
                                             paidByUser?.role === Role.ADMIN ? 'Admin' :
                                             (expense.paidBy === 'client' ? 'Client' :
                                              expense.paidBy === 'vendor' ? 'Vendor' :
                                              expense.paidBy === 'designer' ? 'Designer' :
                                              expense.paidBy === 'admin' ? 'Admin' : 'N/A');
                                    })()
                                  ) : (
                                    expense.paidBy === 'client' ? 'Client' :
                                    expense.paidBy === 'vendor' ? 'Vendor' :
                                    expense.paidBy === 'designer' ? 'Designer' :
                                    expense.paidBy === 'admin' ? 'Admin' :
                                    'N/A'
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2" style={{maxWidth: '150px'}}>
                            <div className="flex flex-col gap-0.5">
                              <div className="font-bold text-gray-900 text-sm md:text-xs">
                                {expense.receivedBy ? (
                                  expense.receivedBy.includes('(') ? expense.receivedBy.split('(')[0].trim() : expense.receivedBy
                                ) : '-'}
                              </div>
                              <div className="flex flex-col gap-1 text-sm md:text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400">|</span>
                                  <span className={`flex-shrink-0 font-medium text-sm md:text-xs ${
                                    expense.receivedBy ? (
                                      (() => {
                                        const receivedUser = users.find(u => u.name === (expense.receivedBy?.includes('(') ? expense.receivedBy.split('(')[0].trim() : expense.receivedBy));
                                        const role = receivedUser?.role || (expense.receivedBy?.includes('(') ? expense.receivedBy.split('(')[1].replace(')', '').trim() : '');
                                        if (role === Role.CLIENT || role === 'Client') return 'text-blue-700';
                                        if (role === Role.VENDOR || role === 'Vendor') return 'text-purple-700';
                                        if (role === Role.DESIGNER || role === 'Designer') return 'text-orange-700';
                                        if (role === Role.ADMIN || role === 'Admin') return 'text-red-700';
                                        return 'text-gray-700';
                                      })()
                                    ) : 'text-gray-700'
                                  }`}>
                                    {expense.receivedBy && expense.receivedBy.includes('(') ? (
                                      expense.receivedBy.split('(')[1].replace(')', '').trim()
                                    ) : (users.find(m => m.name === expense.receivedBy)?.role || 'Vendor')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-left text-gray-700 text-sm md:text-xs">{expense.description}</td>
                          <td className="px-4 py-3 text-right text-gray-700 font-bold text-sm md:text-xs">₹{expense.amount.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <input 
                                type="checkbox" 
                                checked={expense.adminApproved === true}
                                disabled={!isAdmin}
                                title={expense.adminApproved ? "Click to revoke admin approval" : "Admin approval checkbox"}
                                aria-label="Approve or revoke as admin"
                                onChange={(e) => handleApproveExpense(expense.id, 'admin', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 cursor-pointer hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <input 
                                type="checkbox" 
                                checked={expense.clientApproved === true}
                                disabled={!isClient}
                                title={expense.clientApproved ? "Click to revoke client approval" : "Client approval checkbox"}
                                aria-label="Approve or revoke as client"
                                onChange={(e) => handleApproveExpense(expense.id, 'client', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 cursor-pointer hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-sm md:text-xs font-medium ${
                              expense.adminApproved && expense.clientApproved ? 'bg-green-100 text-green-700' :
                              expense.adminApproved ? 'bg-blue-100 text-blue-700' :
                              expense.clientApproved ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {expense.adminApproved && expense.clientApproved ? 'Approved' :
                               expense.adminApproved ? 'Admin OK' :
                               expense.clientApproved ? 'Client OK' :
                               'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Designer Charges Summary - For Designing Projects */}
              {project.type === 'Designing' && currentFinancials.filter(f => {
                const vendorUsers = users.filter(u => u.role === Role.VENDOR);
                const vendorNames = new Set(vendorUsers.map(v => v.name));
                const cleanName = (name?: string) => {
                    if (!name) return '';
                    return name.includes('(') ? name.split('(')[0].trim() : name.trim();
                };
                return (!!f.vendorName && vendorNames.has(f.vendorName)) || 
                       f.paidBy === 'vendor' ||
                       (f.receivedByName && vendorNames.has(cleanName(f.receivedByName))) ||
                       (f.paidByOther && vendorNames.has(cleanName(f.paidByOther))) ||
                       f.receivedByRole === 'vendor-received';
              }).length > 0 && (
                <div className="px-6 py-4 bg-gray-100 border-t border-gray-200">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm md:text-xs font-semibold text-gray-700">Total Vendor Transactions</span>
                      {(() => {
                        const vendorTransactions = currentFinancials.filter(f => {
                          const vendorUsers = users.filter(u => u.role === Role.VENDOR);
                          const vendorNames = new Set(vendorUsers.map(v => v.name));
                          const cleanName = (name?: string) => {
                              if (!name) return '';
                              return name.includes('(') ? name.split('(')[0].trim() : name.trim();
                          };
                          const isVendor = (!!f.vendorName && vendorNames.has(f.vendorName)) || 
                                 f.paidBy === 'vendor' ||
                                 (f.receivedByName && vendorNames.has(cleanName(f.receivedByName))) ||
                                 (f.paidByOther && vendorNames.has(cleanName(f.paidByOther))) ||
                                 f.receivedByRole === 'vendor-received';
                          // Only include if both client and admin have approved
                          return isVendor && f.clientApproved === true && f.adminApproved === true;
                        });
                        const totalVendor = vendorTransactions.reduce((sum, f) => sum + f.amount, 0);
                        return <span className="font-semibold text-gray-900 text-lg md:text-sm">₹{totalVendor.toLocaleString()}</span>;
                      })()}
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 bg-gray-100 rounded-md px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base md:text-xs font-semibold text-gray-700">Designer Charges</span>
                        {isAdmin && !isEditingDesignerCharges && (
                          <>
                            <span className="text-base md:text-xs text-gray-700">({designerChargesPercent}%)</span>
                            <button
                              className="ml-1 p-1 rounded hover:bg-gray-200"
                              title="Edit Designer Charges Percentage"
                              onClick={() => setIsEditingDesignerCharges(true)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13h3l8-8a2.828 2.828 0 10-4-4l-8 8v3h3z" /></svg>
                            </button>
                          </>
                        )}
                        {isAdmin && isEditingDesignerCharges && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={designerChargesPercent}
                              onChange={e => setDesignerChargesPercent(parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
                              aria-label="Designer Charges Percentage"
                              title="Enter designer charges percentage for vendor payments"
                              placeholder="0"
                            />
                            <span className="text-sm md:text-xs text-gray-700">%</span>
                            <button
                              className="ml-2 px-2 py-1 text-xs font-semibold rounded bg-gray-700 text-white hover:bg-gray-800 focus:outline-none border border-gray-700"
                              onClick={() => { handleDesignerChargesBlur(); setIsEditingDesignerCharges(false); }}
                              title="Save Designer Charges Percentage"
                            >Save</button>
                          </div>
                        )}
                        {!isAdmin && (
                          <span className="text-sm md:text-xs text-gray-700">({designerChargesPercent}%)</span>
                        )}
                      </div>
                    </div>
                    {/* Calculation summary row in a new row below */}
                    {(() => {
                      const vendorTransactions = currentFinancials.filter(f => {
                        const vendorUsers = users.filter(u => u.role === Role.VENDOR);
                        const vendorNames = new Set(vendorUsers.map(v => v.name));
                        const cleanName = (name?: string) => {
                            if (!name) return '';
                            return name.includes('(') ? name.split('(')[0].trim() : name.trim();
                        };
                        return (!!f.vendorName && vendorNames.has(f.vendorName)) || 
                               f.paidBy === 'vendor' ||
                               (f.receivedByName && vendorNames.has(cleanName(f.receivedByName))) ||
                               (f.paidByOther && vendorNames.has(cleanName(f.paidByOther))) ||
                               f.receivedByRole === 'vendor-received';
                      });
                      const totalVendor = vendorTransactions.reduce((sum, f) => sum + f.amount, 0);
                      const designerChargesAmount = totalVendor * (designerChargesPercent / 100);
                      const finalAmount = totalVendor + designerChargesAmount;
                      return (
                        <div className="w-full mt-2 bg-gray-100 rounded px-3 py-2 text-sm md:text-xs">
                          <div
                            className="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:justify-between"
                          >
                            <span className="block min-w-[140px] mb-1 sm:mb-0">Total Vendor Amount: <span className="font-semibold text-gray-900">₹{totalVendor.toLocaleString()}</span></span>
                            <span className="block min-w-[120px] mb-1 sm:mb-0">Designer Charges: <span className="font-semibold text-gray-700">{designerChargesPercent}%</span></span>
                            <span className="block min-w-[150px] mb-1 sm:mb-0">Calculated Charges: <span className="font-semibold text-gray-700">₹{designerChargesAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></span>
                            <span className="block min-w-[130px]">Final Amount: <span className="font-semibold text-green-700">₹{finalAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && !isVendor && (
           <div className="max-w-3xl mx-auto p-4 md:p-8">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-8 overflow-hidden">
               <h3 className="text-xl md:text-lg font-bold text-gray-800 mb-6">Project Timeline</h3>
               <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
                  {(!realTimeTimelines || realTimeTimelines.length === 0) && (
                     <div className="pl-6 text-gray-400 italic">No timeline events yet. Add milestones to track project progress.</div>
                  )}
                  {realTimeTimelines?.sort((a, b) => {
                    const timeA = new Date(a.endDate || a.startDate).getTime();
                    const timeB = new Date(b.endDate || b.startDate).getTime();
                    return timeB - timeA; // Descending order (newest first)
                  }).map(timeline => (
                    <div key={timeline.id} className="relative pl-8">
                      {/* Timeline Dot */}
                      <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm
                        ${timeline.status === 'completed' ? 'bg-green-500' : timeline.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-400'}`} 
                      />
                      
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                         <div className="flex-1">
                            <p className="font-bold text-gray-800 text-lg md:text-base">{timeline.title || timeline.milestone}</p>
                            <p className="text-gray-600 text-base md:text-sm mt-0.5">{timeline.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                               <span className={`text-sm md:text-xs px-2.5 py-1.5 rounded-full font-medium
                                 ${timeline.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                   timeline.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 
                                   'bg-gray-100 text-gray-700'}`}>
                                 {timeline.status}
                               </span>
                            </div>
                         </div>
                         <div className="text-sm md:text-xs text-gray-400 mt-2 sm:mt-0 font-mono whitespace-nowrap">
                            <div>{formatDateToIndian(timeline.endDate || timeline.startDate)}</div>
                            <div className="text-gray-300">{new Date(timeline.endDate || timeline.startDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                         </div>
                      </div>
                    </div>
                  ))}
               </div>
             </div>
           </div>
        )}
        
        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 md:p-8">
            <div className="bg-white p-4 md:p-8 rounded-xl border border-gray-200">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg md:text-base text-gray-800">Project Clients</h3>
                  {canEditProject && (
                    <button 
                      onClick={() => { setMemberModalType('client'); setSelectedMemberId(''); setIsMemberModalOpen(true); }}
                      className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1.5 font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Client
                    </button>
                  )}
               </div>
               <div className="space-y-2">
                  {(() => {
                    // Combine primary clientId and additional clientIds, removing duplicates
                    const clientIds = Array.from(new Set([project.clientId, ...(project.clientIds || [])].filter(Boolean)));
                    
                    if (clientIds.length === 0) {
                      return <p className="text-gray-500 text-sm">No clients assigned</p>;
                    }
                    
                    // Fetch and sort clients
                    const sortedClients = clientIds
                      .map(id => users.find(u => u.id === id))
                      .filter((u): u is User => !!u)
                      .sort((a, b) => a.name.localeCompare(b.name));
                    
                    return sortedClients.map((client) => {
                      return (
                        <div key={client.id} className="flex items-center justify-between border-b border-gray-50 pb-2">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-base md:text-sm font-bold text-gray-900">{client.name}</p>
                              <p className="text-xs text-gray-500">Client</p>
                            </div>
                          </div>
                          {user.role === Role.ADMIN && (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleSendPaymentReminder(client)}
                                className="text-gray-400 hover:text-green-600 p-2.5 rounded-full hover:bg-green-50 transition-colors"
                                title="Send Payment Reminder Email"
                              >
                                <IndianRupee className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => {
                                  const projectLink = `${window.location.origin}${window.location.pathname}?projectId=${project.id}`;
                                  navigator.clipboard.writeText(projectLink).then(() => {
                                    addNotification('Success', 'Project link copied to clipboard', 'success', user?.id, project.id, project.name);
                                  }).catch(() => {
                                    addNotification('Error', 'Failed to copy link', 'error', user?.id, project.id, project.name);
                                  });
                                }}
                                className="text-gray-400 hover:text-blue-600 p-2.5 rounded-full hover:bg-blue-50 transition-colors"
                                title="Copy project link"
                              >
                                <Link2 className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
               </div>

                  <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                     <div className="flex items-center gap-4">
                        <div>
                           <p className="text-base md:text-sm font-bold text-gray-900">{project.leadDesignerId ? getAssigneeName(project.leadDesignerId) : 'No Lead Designer Assigned'}</p>
                           <p className="text-sm text-gray-500">Lead Designer</p>
                        </div>
                     </div>
                     {isAdmin && project.leadDesignerId && (
                        <button 
                          onClick={() => {
                            setIsLeadDesignerRemovalConfirmOpen(true);
                          }}
                          className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                          title="Remove Lead Designer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                     )}
                  </div>
                  
                  {/* Designers */}
                  {(() => {
                    const allDesigners = project.teamMembers 
                      ? project.teamMembers
                          .map(id => users.find(u => u.id === id))
                          .filter((u): u is User => u !== undefined && u.role === Role.DESIGNER)
                          .sort((a, b) => a.name.localeCompare(b.name))
                      : [];
                    
                    return (
                      <div className="mt-8">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-1">
                           <h4 className="text-sm font-bold text-gray-500 uppercase">Designers</h4>
                           {canEditProject && (
                              <button 
                                onClick={() => { setMemberModalType('designer'); setSelectedMemberId(''); setIsMemberModalOpen(true); }}
                                className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1 font-bold"
                              >
                                <Plus className="w-3 h-3" /> Add Designer
                              </button>
                           )}
                        </div>
                        {allDesigners.length === 0 ? (
                           <p className="text-gray-400 text-xs italic mb-4">No additional designers added</p>
                        ) : (
                          <div className="space-y-3 mb-6">
                            {allDesigners.map(designer => (
                              <div key={designer.id} className="flex items-center justify-between gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                                <div className="flex-1">
                                  <p className="font-bold text-gray-800 text-base md:text-sm">{designer.name}</p>
                                  <p className="text-sm text-gray-500">{designer.role}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => setSelectedDesignerForDetails(designer)}
                                    className="text-blue-500 hover:text-blue-700 text-sm font-medium px-2 py-1 hover:bg-blue-50 rounded transition-colors"
                                    title="View designer details and projects"
                                  >
                                    View Details
                                  </button>
                                  {canEditProject && (
                                    <button 
                                      onClick={() => {
                                        const updated = {
                                          ...project,
                                          teamMembers: (project.teamMembers || []).filter(id => id !== designer.id)
                                        };
                                        onUpdateProject(updated);
                                        addNotification('Success', `${designer.name} removed from team`, 'success');
                                      }}
                                      className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                                      title="Remove Member"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="mt-8">
                     <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-1">
                        <h4 className="text-sm font-bold text-gray-500 uppercase">Vendors</h4>
                        {canEditProject && (
                           <button 
                             onClick={() => { setMemberModalType('member'); setSelectedMemberId(''); setIsMemberModalOpen(true); }}
                             className="text-[10px] bg-green-50 text-green-600 px-2.5 py-1 rounded-md hover:bg-green-100 transition-colors flex items-center gap-1 font-bold"
                           >
                             <Plus className="w-3 h-3" /> Add Vendor
                           </button>
                        )}
                     </div>
                  
                  {sortedVendorCategories.length > 0 ? (
                        <div className="pt-2 space-y-6">
                            {sortedVendorCategories.map(category => (
                                <div key={category}>
                                    <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-1 flex items-center gap-2">
                                        <Tag className="w-4 h-4"/> {category}
                                    </h4>
                                    <div className="grid grid-cols-1 gap-3">
                                        {vendorsByCategory[category].map(v => {
                                          // Calculate approved transactions for this vendor
                                          const vendorTransactions = currentFinancials.filter(f => {
                                            // Approval logic: both admin and client must approve
                                            const approved = f.adminApproved && f.clientApproved;
                                            // Vendor association logic (same as billing report)
                                            const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                                            return approved && (
                                              f.vendorName === v.name ||
                                              cleanName(f.receivedByName) === v.name ||
                                              cleanName(f.paidByOther) === v.name ||
                                              f.paidTo === v.name ||
                                              f.receivedBy === v.name
                                            );
                                          });
                                          const totalAmount = vendorTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
                                          return (
                                            <div 
                                              key={v.id} 
                                              onClick={() => {
                                                // Only allow vendors to click on their own record
                                                if (!isVendor || v.id === user.id) {
                                                setSelectedVendorForBilling(v);
                                                }
                                              }}
                                              className={`flex items-center gap-3 p-3 rounded-lg transition-colors border border-transparent ${
                                                isVendor && v.id !== user.id 
                                                ? 'opacity-60 cursor-default' 
                                                : 'hover:bg-gray-50 hover:border-gray-100 cursor-pointer group'
                                              }`}
                                              title={isVendor && v.id !== user.id ? "You can only view your own billing report" : "Click to view billing report"}
                                            >
                                              <div className="flex-1">
                                                <p className="font-bold text-gray-800 text-base md:text-sm">{v.name}</p>
                                                <p className="text-sm text-gray-500">{v.company || 'Independent'}</p>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full font-medium">
                                                  {project.tasks.filter(t => t.assigneeId === v.id).length} Tasks
                                                </span>
                                                {/* Admin can toggle vendor visibility to clients */}
                                                {isAdmin && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      const isHidden = (project.hiddenVendors || []).includes(v.id);
                                                      const updated = {
                                                        ...project,
                                                        hiddenVendors: isHidden 
                                                          ? (project.hiddenVendors || []).filter(id => id !== v.id)
                                                          : [...(project.hiddenVendors || []), v.id]
                                                      };
                                                      onUpdateProject(updated);
                                                      const action = isHidden ? 'shown' : 'hidden';
                                                      addNotification('Success', `${v.name} ${action} from clients`, 'success');
                                                    }}
                                                    className={`p-1.5 rounded transition-colors ${
                                                      (project.hiddenVendors || []).includes(v.id)
                                                        ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                                        : 'text-blue-500 hover:text-blue-700 hover:bg-blue-50'
                                                    }`}
                                                    title={(project.hiddenVendors || []).includes(v.id) ? 'Show to clients' : 'Hide from clients'}
                                                  >
                                                    {(project.hiddenVendors || []).includes(v.id) ? (
                                                      <EyeOff className="w-4 h-4" />
                                                    ) : (
                                                      <Eye className="w-4 h-4" />
                                                    )}
                                                  </button>
                                                )}
                                                {!isVendor || v.id === user.id ? (
                                                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                                                ) : null}
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                  ) : (
                     <p className="text-gray-400 text-xs italic">No vendors assigned to this project</p>
                  )}
                  </div>
            </div>
          </div>
        )}
      </div>

      {/* ... (Modals remain unchanged) ... */}

      {/* TEAM TAB: Show vendor financials and designer charges for selected vendor */}
      {activeTab === 'team' && selectedVendorForBilling && (
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg border border-gray-200 mt-8 mb-8 p-4 md:p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            Vendor Financials: <span className="text-purple-700">{selectedVendorForBilling.name}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-bold text-gray-700">Date</th>
                  <th className="px-4 py-2 font-bold text-gray-700">Description</th>
                  <th className="px-4 py-2 font-bold text-gray-700">Amount</th>
                  <th className="px-4 py-2 font-bold text-gray-700">Designer Charge</th>
                  <th className="px-4 py-2 font-bold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {currentFinancials.filter(f => {
                  // Approval logic: both admin and client must approve
                  const approved = f.adminApproved && f.clientApproved;
                  // Vendor association logic (same as billing report)
                  const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                  return approved && (
                    f.vendorName === selectedVendorForBilling.name ||
                    cleanName(f.receivedByName) === selectedVendorForBilling.name ||
                    cleanName(f.paidByOther) === selectedVendorForBilling.name ||
                    f.paidTo === selectedVendorForBilling.name ||
                    f.receivedBy === selectedVendorForBilling.name
                  );
                }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((txn, idx) => {
                  // Designer charge calculation
                  const designerPercent = project.designerChargePercentage || 0;
                  const designerCharge = Math.round((txn.amount || 0) * designerPercent / 100);
                  return (
                    <tr key={txn.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs text-left">{txn.date}</td>
                      <td className="px-4 py-3 text-gray-700">{txn.description || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-900 font-bold">₹{txn.amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-orange-700 font-bold">₹{designerCharge.toLocaleString()} <span className="text-xs text-gray-400">({designerPercent}%)</span></td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">Approved</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Invite Member Modal */}
      {isMemberModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col animate-fade-in">
               <div className="p-4 md:p-6 border-b border-gray-100 flex-shrink-0">
                   <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><UserIcon className="w-5 h-5"/> Add to Project</h3>
               </div>
               <div className="p-4 md:p-6 space-y-4 flex-1 overflow-y-auto scrollbar-thin">
                  {/* Type Selector */}
                  <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                      <button 
                          onClick={() => { setMemberModalType('client'); setSelectedMemberId(''); }}
                          className={`flex-1 py-2 rounded font-medium text-sm transition-colors ${memberModalType === 'client' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                          Client
                      </button>
                      <button 
                          onClick={() => { setMemberModalType('designer'); setSelectedMemberId(''); }}
                          className={`flex-1 py-2 rounded font-medium text-sm transition-colors ${memberModalType === 'designer' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                          Designer
                      </button>
                      <button 
                          onClick={() => { setMemberModalType('member'); setSelectedMemberId(''); }}
                          className={`flex-1 py-2 rounded font-medium text-sm transition-colors ${memberModalType === 'member' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                          Vendor
                      </button>
                  </div>

                  <div>
                      <label className="text-sm font-bold text-gray-500 uppercase">Select {memberModalType === 'client' ? 'Clients' : memberModalType === 'designer' ? 'Designers' : 'Vendors'}</label>
                      <div className={`border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto mt-2 border-gray-300`}>
                          {memberModalType === 'client' 
                            ? users
                                .filter(u => {
                                    const isClient = u.role === Role.CLIENT;
                                    const notOnProject = u.id !== project.clientId && !(project.clientIds || []).includes(u.id);
                                    
                                    if (!isClient || !notOnProject) return false;
                                    
                                    // designer restriction: only related clients
                                    if (user.role === Role.DESIGNER) {
                                        const designerProjects = (projects || []).filter(p => 
                                          p.leadDesignerId === user.id || (p.teamMembers || []).includes(user.id)
                                        );
                                        const relatedClientIds = new Set<string>();
                                        designerProjects.forEach(p => {
                                          if (p.clientId) relatedClientIds.add(p.clientId);
                                          (p.clientIds || []).forEach(cId => relatedClientIds.add(cId));
                                        });
                                        return relatedClientIds.has(u.id) || u.createdBy === user.id;
                                    }
                                    return true;
                                })
                                .length === 0 ? (
                                  <p className="text-gray-500 text-sm">No clients available to add</p>
                                ) : (
                                  users
                                    .filter(u => 
                                        u.role === Role.CLIENT &&
                                        u.id !== project.clientId &&
                                        !(project.clientIds || []).includes(u.id)
                                    )
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                    .map(u => (
                                        <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                                            <input 
                                                type="checkbox"
                                                checked={selectedMemberId.includes(u.id)}
                                                onChange={(e) => {
                                                    const current = selectedMemberId.split(',').filter(Boolean);
                                                    const newIds = e.target.checked 
                                                        ? [...current, u.id]
                                                        : current.filter(id => id !== u.id);
                                                    setSelectedMemberId(newIds.join(','));
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                                            />
                                            <span className="text-sm text-gray-700">{u.name}</span>
                                        </label>
                                    ))
                                )
                            : memberModalType === 'designer'
                            ? users
                                .filter(u => u.role === Role.DESIGNER && u.id !== project.leadDesignerId && !((project.teamMembers || []).includes(u.id)))
                                .length === 0 ? (
                                  <p className="text-gray-500 text-sm">No designers available to add</p>
                                ) : (
                                  users
                                    .filter(u => u.role === Role.DESIGNER && u.id !== project.leadDesignerId && !((project.teamMembers || []).includes(u.id)))
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                    .map(u => (
                                        <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                                            <input 
                                                type="checkbox"
                                                checked={selectedMemberId.includes(u.id)}
                                                onChange={(e) => {
                                                    const current = selectedMemberId.split(',').filter(Boolean);
                                                    const newIds = e.target.checked 
                                                        ? [...current, u.id]
                                                        : current.filter(id => id !== u.id);
                                                    setSelectedMemberId(newIds.join(','));
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                                            />
                                            <span className="text-sm text-gray-700">{u.name}</span>
                                        </label>
                                    ))
                                )
                            : users
                                .filter(u => u.role === Role.VENDOR && !((project.teamMembers || []).includes(u.id)))
                                .length === 0 ? (
                                  <p className="text-gray-500 text-sm">No vendors available to add</p>
                                ) : (
                                  users
                                    .filter(u => u.role === Role.VENDOR && !((project.teamMembers || []).includes(u.id)))
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                    .map(u => (
                                        <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                                            <input 
                                                type="checkbox"
                                                checked={selectedMemberId.includes(u.id)}
                                                onChange={(e) => {
                                                    const current = selectedMemberId.split(',').filter(Boolean);
                                                    const newIds = e.target.checked 
                                                        ? [...current, u.id]
                                                        : current.filter(id => id !== u.id);
                                                    setSelectedMemberId(newIds.join(','));
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                                            />
                                            <span className="text-sm text-gray-700">{u.name}</span>
                                        </label>
                                    ))
                                )
                          }
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                          {memberModalType === 'client' 
                            ? 'Select clients to add as additional contacts for this project.' 
                            : memberModalType === 'designer'
                            ? 'Select designers to add to this project.'
                            : 'Select vendors to add to this project.'}
                      </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                      <button onClick={() => { setIsMemberModalOpen(false); setSelectedMemberId(''); }} className="flex-1 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                      <button onClick={handleInviteMember} className="flex-1 py-2 bg-gray-900 text-white rounded font-bold hover:bg-gray-800">Add {memberModalType === 'client' ? 'Clients' : memberModalType === 'designer' ? 'Designers' : 'Vendors'}</button>
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
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in">
              {/* Fixed Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
                <h3 className="text-2xl md:text-lg font-bold text-gray-900 flex items-center gap-2">
                  <IndianRupee className="w-5 h-5"/> {editingTransactionId ? 'Edit Transaction' : 'Record Transaction'}
                </h3>
                <button
                  onClick={() => {
                    setIsTransactionModalOpen(false);
                    setShowTransactionErrors(false);
                    setEditingTransactionId(null);
                    setPaidByName('');
                    setReceivedByName('');
                    setReceivedByRole('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Close modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-3">
                 <div>
                    <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Amount <span className="text-red-500">*</span></label>
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
                    <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Description <span className="text-red-500">*</span></label>
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
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Type</label>
                        <div className="flex gap-2 mt-1">
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, type: 'income'})}
                                className={`flex-1 py-2 text-base md:text-xs font-bold rounded ${newTransaction.type === 'income' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-gray-50 text-gray-500'}`}
                            >Income</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                                className={`flex-1 py-2 text-base md:text-xs font-bold rounded ${newTransaction.type === 'expense' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-gray-50 text-gray-500'}`}
                            >Expense</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Date</label>
                        <input
                            type="date"
                            className={`${getInputClass(showTransactionErrors && !newTransaction.date)} mt-1 text-base md:text-xs`}
                            title="Select transaction date"
                            value={newTransaction.date || ''}
                            onChange={e => setNewTransaction({...newTransaction, date: e.target.value})}
                        />
                    </div>
                 </div>

                 {newTransaction.type === 'expense' && (
                    <>
                      <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Paid By</label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'client'})}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${newTransaction.paidBy === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'}`}
                            >Client</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'vendor'})}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${newTransaction.paidBy === 'vendor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'}`}
                            >Vendor</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'designer'})}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${newTransaction.paidBy === 'designer' ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}`}
                            >Designer</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'admin'})}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${newTransaction.paidBy === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500'}`}
                            >Admin</button>
                            <button 
                                onClick={() => setNewTransaction({...newTransaction, paidBy: 'other' as any})}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${newTransaction.paidBy === 'other' ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-500'}`}
                            >Other</button>
                        </div>
                      </div>
                      {newTransaction.paidBy === 'client' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Client</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select a client from the list"
                          >
                              <option value="">Select a client...</option>
                              {users.filter(u => {
                                if (u.role !== Role.CLIENT) return false;
                                // designer restriction: only related clients
                                if (user.role === Role.DESIGNER) {
                                    const designerProjectIds = (projects || []).filter(p => 
                                      p.leadDesignerId === user.id || (p.teamMembers || []).includes(user.id)
                                    ).map(p => p.id);
                                    
                                    // Check if this client is on any of the designer's projects
                                    const isRelated = (projects || []).some(p => 
                                      designerProjectIds.includes(p.id) && 
                                      (p.clientId === u.id || (p.clientIds || []).includes(u.id))
                                    );
                                    
                                    return isRelated || u.createdBy === user.id;
                                }
                                return true;
                              }).map(client => (
                                <option key={client.id} value={client.name}>
                                  {client.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {newTransaction.paidBy === 'vendor' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
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
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Designer</label>
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
                      {newTransaction.paidBy === 'admin' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Admin</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={newTransaction.vendorName || ''}
                              onChange={e => setNewTransaction({...newTransaction, vendorName: e.target.value})}
                              title="Select an admin from the list"
                          >
                              <option value="">Select an admin...</option>
                              {users.filter(u => u.role === Role.ADMIN).map(admin => (
                                <option key={admin.id} value={admin.name}>
                                  {admin.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {newTransaction.paidBy === 'other' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Paid By (Name & Role)</label>
                          <input 
                              type="text" 
                              className={`${getInputClass(false)} mt-1`}
                              placeholder="e.g. John Smith (Partner) or Supplier (Vendor)"
                              title="Enter who paid (name and role in parentheses)"
                              value={newTransaction.paidByOther || ''}
                              onChange={e => setNewTransaction({...newTransaction, paidByOther: e.target.value})}
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Received By</label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            <button 
                                onClick={() => setReceivedByRole('client')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'}`}
                            >Client</button>
                            <button 
                                onClick={() => setReceivedByRole('vendor')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'vendor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'}`}
                            >Vendor</button>
                            <button 
                                onClick={() => setReceivedByRole('designer')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'designer' ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}`}
                            >Designer</button>
                            <button 
                                onClick={() => setReceivedByRole('admin')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500'}`}
                            >Admin</button>
                            <button 
                                onClick={() => setReceivedByRole('other')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'other' ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-500'}`}
                            >Other</button>
                        </div>
                      </div>
                      {receivedByRole === 'client' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Client</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select a client from the project"
                          >
                              <option value="">Select a client...</option>
                              {projectTeam.filter(u => u.role === Role.CLIENT).map(client => (
                                <option key={client.id} value={client.name}>
                                  {client.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'vendor' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select a vendor from the project"
                          >
                              <option value="">Select a vendor...</option>
                              {projectTeam.filter(u => u.role === Role.VENDOR).map(vendor => (
                                <option key={vendor.id} value={vendor.name}>
                                  {vendor.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'designer' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Designer</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select a designer from the project"
                          >
                              <option value="">Select a designer...</option>
                              {projectTeam.filter(u => u.role === Role.DESIGNER).map(designer => (
                                <option key={designer.id} value={designer.name}>
                                  {designer.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'admin' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Admin</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select an admin from the list"
                          >
                              <option value="">Select an admin...</option>
                              {users.filter(u => u.role === Role.ADMIN).map(admin => (
                                <option key={admin.id} value={admin.name}>
                                  {admin.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'other' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Received By (Name & Role)</label>
                          <input 
                              type="text" 
                              className={`${getInputClass(false)} mt-1`}
                              placeholder="e.g. John Smith (Contractor) or Supplier (Vendor)"
                              title="Enter who received (name and role in parentheses)"
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                          />
                        </div>
                      )}
                    </>
                 )}

                 {newTransaction.type === 'income' && (
                    <>
                      <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Paid By</label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            <button 
                                onClick={() => setReceivedByRole('client')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'}`}
                            >Client</button>
                            <button 
                                onClick={() => setReceivedByRole('vendor')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'vendor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'}`}
                            >Vendor</button>
                            <button 
                                onClick={() => setReceivedByRole('designer')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'designer' ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}`}
                            >Designer</button>
                            <button 
                                onClick={() => setReceivedByRole('admin')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500'}`}
                            >Admin</button>
                            <button 
                                onClick={() => setReceivedByRole('other')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'other' ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-500'}`}
                            >Other</button>
                        </div>
                      </div>
                      {receivedByRole === 'client' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Client</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={paidByName || ''}
                              onChange={e => setPaidByName(e.target.value)}
                              title="Select a client from the project"
                          >
                              <option value="">Select a client...</option>
                              {projectTeam.filter(u => u.role === Role.CLIENT).map(client => (
                                <option key={client.id} value={client.name}>
                                  {client.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'vendor' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={paidByName || ''}
                              onChange={e => setPaidByName(e.target.value)}
                              title="Select a vendor from the project"
                          >
                              <option value="">Select a vendor...</option>
                              {projectTeam.filter(u => u.role === Role.VENDOR).map(vendor => (
                                <option key={vendor.id} value={vendor.name}>
                                  {vendor.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'designer' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Designer</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={paidByName || ''}
                              onChange={e => setPaidByName(e.target.value)}
                              title="Select a designer from the project"
                          >
                              <option value="">Select a designer...</option>
                              {projectTeam.filter(u => u.role === Role.DESIGNER).map(designer => (
                                <option key={designer.id} value={designer.name}>
                                  {designer.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'admin' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Admin</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={paidByName || ''}
                              onChange={e => setPaidByName(e.target.value)}
                              title="Select an admin from the list"
                          >
                              <option value="">Select an admin...</option>
                              {users.filter(u => u.role === Role.ADMIN).map(admin => (
                                <option key={admin.id} value={admin.name}>
                                  {admin.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'other' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Paid By (Name & Role)</label>
                          <input 
                              type="text" 
                              className={`${getInputClass(false)} mt-1`}
                              placeholder="e.g. John Smith (Partner) or Supplier (Vendor)"
                              title="Enter who paid (name and role in parentheses)"
                              value={paidByName || ''}
                              onChange={e => setPaidByName(e.target.value)}
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Received By</label>
                        <div className="flex gap-2 mt-1 flex-wrap">
                            <button 
                                onClick={() => setReceivedByRole('')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === '' ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-500'}`}
                            >Project</button>
                            <button 
                                onClick={() => setReceivedByRole('vendor-received')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'vendor-received' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'}`}
                            >Vendor</button>
                            <button 
                                onClick={() => setReceivedByRole('designer-received')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'designer-received' ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}`}
                            >Designer</button>
                            <button 
                                onClick={() => setReceivedByRole('admin-received')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'admin-received' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-500'}`}
                            >Admin</button>
                            <button 
                                onClick={() => setReceivedByRole('other-received')}
                                className={`py-2 px-2 text-base md:text-xs font-bold rounded ${receivedByRole === 'other-received' ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-500'}`}
                            >Other</button>
                        </div>
                      </div>
                      {receivedByRole === 'vendor-received' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select a vendor from the project"
                          >
                              <option value="">Select a vendor...</option>
                              {projectTeam.filter(u => u.role === Role.VENDOR).map(vendor => (
                                <option key={vendor.id} value={vendor.name}>
                                  {vendor.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'designer-received' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Designer</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select a designer from the project"
                          >
                              <option value="">Select a designer...</option>
                              {projectTeam.filter(u => u.role === Role.DESIGNER).map(designer => (
                                <option key={designer.id} value={designer.name}>
                                  {designer.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'admin-received' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Select Admin</label>
                          <select 
                              className={`${getInputClass(false)} mt-1`}
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                              title="Select an admin from the list"
                          >
                              <option value="">Select an admin...</option>
                              {users.filter(u => u.role === Role.ADMIN).map(admin => (
                                <option key={admin.id} value={admin.name}>
                                  {admin.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {receivedByRole === 'other-received' && (
                        <div>
                          <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Received By (Name & Role)</label>
                          <input 
                              type="text" 
                              className={`${getInputClass(false)} mt-1`}
                              placeholder="e.g. John Smith (Contractor) or Supplier (Vendor)"
                              title="Enter who received (name and role in parentheses)"
                              value={receivedByName || ''}
                              onChange={e => setReceivedByName(e.target.value)}
                          />
                        </div>
                      )}
                    </>
                 )}

                 <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Category</label>
                        <select 
                            className={`${getInputClass(showTransactionErrors && !newTransaction.category)} mt-1 text-base md:text-xs`}
                            value={newTransaction.category || ''}
                            onChange={e => {
                              setNewTransaction({...newTransaction, category: e.target.value});
                              if (e.target.value !== 'Others') setCustomCategory('');
                            }}
                            aria-label="Transaction category"
                        >
                            <option value="">Select...</option>
                            {newTransaction.type === 'income' ? (
                                <>
                                    <option value="Advance">Advance</option>
                                    <option value="Milestone 1">Milestone 1</option>
                                    <option value="Milestone 2">Milestone 2</option>
                                    <option value="Final Payment">Final Payment</option>
                                    <option value="Additional Budget">Additional Budget</option>
                                    <option value="Others">Others (please specify)</option>
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
                    {newTransaction.type === 'income' && newTransaction.category === 'Others' && (
                        <div>
                            <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Specify Category</label>
                            <input 
                                type="text"
                                className={`${getInputClass(showTransactionErrors && !customCategory)} mt-1 text-base md:text-xs`}
                                placeholder="Enter custom category"
                                value={customCategory}
                                onChange={e => setCustomCategory(e.target.value)}
                            />
                        </div>
                    )}
                    <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Mode</label>
                        <select 
                            className={`${getInputClass(false)} mt-1 text-base md:text-xs`}
                            value={newTransaction.paymentMode || ''}
                            onChange={e => setNewTransaction({...newTransaction, paymentMode: e.target.value as any})}
                            aria-label="Payment mode"
                        >
                            <option value="">Select...</option>
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="cheque">Cheque</option>
                            <option value="credit_card">Credit Card</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-base md:text-xs font-bold text-gray-500 uppercase">Status</label>
                        <select 
                            className={`${getInputClass(false)} mt-1 text-base md:text-xs`}
                            value={newTransaction.status || 'pending'}
                            onChange={e => setNewTransaction({...newTransaction, status: e.target.value as any})}
                            aria-label="Transaction status"
                        >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                        </select>
                    </div>
                 </div>

                 {/* Approval Section for Additional Budgets */}
                 {newTransaction.type === 'income' && newTransaction.category === 'Additional Budget' && (
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <p className="text-base md:text-xs font-bold text-gray-700 uppercase mb-3">Approvals Required</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-all" style={{opacity: user?.role !== Role.CLIENT ? 0.5 : 1, pointerEvents: user?.role !== Role.CLIENT ? 'none' : 'auto'}}>
                          <input 
                            type="checkbox" 
                            checked={newTransaction.clientApprovalForAdditionalBudget === 'approved'}
                            onChange={e => setNewTransaction({
                              ...newTransaction,
                              clientApprovalForAdditionalBudget: e.target.checked ? 'approved' : 'pending'
                            })}
                            disabled={user?.role !== Role.CLIENT}
                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Client approval for additional budget"
                          />
                          <span className="text-sm text-gray-700">
                            Client Approval
                            {newTransaction.clientApprovalForAdditionalBudget === 'approved' && <span className="ml-1 text-green-600 font-bold">✓</span>}
                            {newTransaction.clientApprovalForAdditionalBudget === 'rejected' && <span className="ml-1 text-red-600 font-bold">✗</span>}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-all" style={{opacity: user?.role !== Role.ADMIN ? 0.5 : 1, pointerEvents: user?.role !== Role.ADMIN ? 'none' : 'auto'}}>
                          <input 
                            type="checkbox" 
                            checked={newTransaction.adminApprovalForAdditionalBudget === 'approved'}
                            onChange={e => setNewTransaction({
                              ...newTransaction,
                              adminApprovalForAdditionalBudget: e.target.checked ? 'approved' : 'pending'
                            })}
                            disabled={user?.role !== Role.ADMIN}
                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Admin approval for additional budget"
                          />
                          <span className="text-sm text-gray-700">
                            Admin Approval
                            {newTransaction.adminApprovalForAdditionalBudget === 'approved' && <span className="ml-1 text-green-600 font-bold">✓</span>}
                            {newTransaction.adminApprovalForAdditionalBudget === 'rejected' && <span className="ml-1 text-red-600 font-bold">✗</span>}
                          </span>
                        </label>
                      </div>
                    </div>
                 )}

                 {/* Approval Section for Received Payments from Client */}
                 {newTransaction.type === 'income' && newTransaction.category !== 'Additional Budget' && (
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <p className="text-base md:text-xs font-bold text-gray-700 uppercase mb-3">Payment Approvals</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-all" style={{opacity: user?.role !== Role.CLIENT ? 0.5 : 1, pointerEvents: user?.role !== Role.CLIENT ? 'none' : 'auto'}}>
                          <input 
                            type="checkbox" 
                            checked={newTransaction.clientApprovalForPayment === 'approved'}
                            onChange={e => setNewTransaction({
                              ...newTransaction,
                              clientApprovalForPayment: e.target.checked ? 'approved' : 'pending'
                            })}
                            disabled={user?.role !== Role.CLIENT}
                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Client confirmation of payment"
                          />
                          <span className="text-sm text-gray-700">
                            Client Confirmation
                            {newTransaction.clientApprovalForPayment === 'approved' && <span className="ml-1 text-green-600 font-bold">✓</span>}
                            {newTransaction.clientApprovalForPayment === 'rejected' && <span className="ml-1 text-red-600 font-bold">✗</span>}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-all" style={{opacity: user?.role !== Role.ADMIN ? 0.5 : 1, pointerEvents: user?.role !== Role.ADMIN ? 'none' : 'auto'}}>
                          <input 
                            type="checkbox" 
                            checked={newTransaction.adminApprovalForPayment === 'approved'}
                            onChange={e => setNewTransaction({
                              ...newTransaction,
                              adminApprovalForPayment: e.target.checked ? 'approved' : 'pending'
                            })}
                            disabled={user?.role !== Role.ADMIN}
                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Admin approval of payment"
                          />
                          <span className="text-sm text-gray-700">
                            Admin Approval
                            {newTransaction.adminApprovalForPayment === 'approved' && <span className="ml-1 text-green-600 font-bold">✓</span>}
                            {newTransaction.adminApprovalForPayment === 'rejected' && <span className="ml-1 text-red-600 font-bold">✗</span>}
                          </span>
                        </label>
                      </div>
                    </div>
                 )}

                 {/* Approval Section for Expenses */}
                 {newTransaction.type === 'expense' && (
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <p className="text-base md:text-xs font-bold text-gray-700 uppercase mb-3">Payment Approvals</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-all" style={{opacity: user?.role !== Role.CLIENT ? 0.5 : 1, pointerEvents: user?.role !== Role.CLIENT ? 'none' : 'auto'}}>
                          <input 
                            type="checkbox" 
                            checked={newTransaction.clientApprovalForPayment === 'approved'}
                            onChange={e => setNewTransaction({
                              ...newTransaction,
                              clientApprovalForPayment: e.target.checked ? 'approved' : 'pending'
                            })}
                            disabled={user?.role !== Role.CLIENT}
                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Client approval of expense"
                          />
                          <span className="text-sm text-gray-700">
                            Client Approval
                            {newTransaction.clientApprovalForPayment === 'approved' && <span className="ml-1 text-green-600 font-bold">✓</span>}
                            {newTransaction.clientApprovalForPayment === 'rejected' && <span className="ml-1 text-red-600 font-bold">✗</span>}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-all" style={{opacity: user?.role !== Role.ADMIN ? 0.5 : 1, pointerEvents: user?.role !== Role.ADMIN ? 'none' : 'auto'}}>
                          <input 
                            type="checkbox" 
                            checked={newTransaction.adminApprovalForPayment === 'approved'}
                            onChange={e => setNewTransaction({
                              ...newTransaction,
                              adminApprovalForPayment: e.target.checked ? 'approved' : 'pending'
                            })}
                            disabled={user?.role !== Role.ADMIN}
                            className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Admin approval of expense"
                          />
                          <span className="text-sm text-gray-700">
                            Admin Approval
                            {newTransaction.adminApprovalForPayment === 'approved' && <span className="ml-1 text-green-600 font-bold">✓</span>}
                            {newTransaction.adminApprovalForPayment === 'rejected' && <span className="ml-1 text-red-600 font-bold">✗</span>}
                          </span>
                        </label>
                      </div>
                    </div>
                 )}

                 <div className="pt-2 flex gap-3">
                    <button onClick={() => {
                      setIsTransactionModalOpen(false);
                      setShowTransactionErrors(false);
                      setEditingTransactionId(null);
                      setPaidByName('');
                      setReceivedByName('');
                      setReceivedByRole('');
                      setCustomCategory('');
                    }} className="flex-1 py-2 text-base md:text-xs text-gray-500 hover:bg-gray-100 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed" disabled={isSavingTransaction} title="Close transaction modal">Cancel</button>
                    <button onClick={handleSaveTransaction} disabled={isSavingTransaction} className="flex-1 py-2 text-base md:text-xs bg-gray-900 text-white rounded font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all" title="Save transaction entry">
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in">
               {/* Fixed Header */}
               <div className="p-4 md:p-6 border-b border-gray-100 flex-shrink-0">
                   <h3 className="text-xl md:text-lg font-bold flex items-center gap-2 text-gray-900"><Upload className="w-5 h-5 md:w-4 md:h-4"/> Upload Document</h3>
               </div>
               
               {/* Scrollable Content */}
               <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin space-y-4">
                  <input 
                    type="text" placeholder="Document Name (e.g. FloorPlan.pdf) - optional when uploading files" 
                    className={`${getInputClass(showDocErrors && !newDoc.name && selectedFiles.length === 0)} text-base md:text-sm`}
                    value={newDoc.name} onChange={e => setNewDoc({...newDoc, name: e.target.value})}
                  />
                  {/* ... rest of doc modal ... */}
                  <div>
                     <label className="text-base md:text-xs font-bold text-gray-500 uppercase mb-2 block">Share With Project Team:</label>
                     <div className="space-y-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                        {[Role.CLIENT, Role.VENDOR, Role.DESIGNER].map(role => {
                           const teamMembersWithRole = projectTeam.filter(u => u.role === role);
                           if (teamMembersWithRole.length === 0) return null;
                           return (
                              <div key={role}>
                                 <p className="text-base md:text-xs font-bold text-gray-600 uppercase mb-2">{role}s</p>
                                 <div className="space-y-1 ml-2">
                                    {teamMembersWithRole.map(person => (
                                       <label key={person.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded border border-transparent hover:border-gray-200">
                                          <input 
                                            type="checkbox" 
                                            checked={newDoc.sharedWith.includes(person.id)}
                                            onChange={e => {
                                               if (e.target.checked) setNewDoc({...newDoc, sharedWith: [...newDoc.sharedWith, person.id]});
                                               else setNewDoc({...newDoc, sharedWith: newDoc.sharedWith.filter(id => id !== person.id)});
                                            }}
                                          />
                                          <span className="text-base md:text-sm text-gray-800">{person.name}</span>
                                       </label>
                                    ))}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>

                  {currentTasks.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                       <label htmlFor="attach-task-select" className="text-base md:text-xs font-bold text-blue-600 uppercase mb-2 block">Attach to Task (Optional):</label>
                       <select 
                         id="attach-task-select"
                         title="Select a task to attach documents to"
                         aria-label="Select a task to attach documents to"
                         value={newDoc.attachToTaskId || ''}
                         onChange={e => {
                           setNewDoc({...newDoc, attachToTaskId: e.target.value || undefined});
                         }}
                         className="w-full p-2 border border-blue-300 rounded bg-white text-base md:text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                       >
                         <option value="">-- Don't attach to any task --</option>
                         {currentTasks.map(task => (
                           <option key={task.id} value={task.id}>
                             {task.title} ({task.status})
                           </option>
                         ))}
                       </select>
                    </div>
                  )}

                  <div 
                    className="bg-gray-50 p-4 md:p-6 rounded-lg border-2 border-dashed border-gray-300 text-base md:text-sm text-gray-500 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer relative"
                    onClick={() => fileInputRef.current?.click()}
                  >
                     {selectedFiles.length > 0 ? (
                       <div className="flex flex-col items-start gap-2">
                          <div className="w-full flex items-center gap-2">
                            <FileIcon className="w-8 h-8 text-blue-500 flex-shrink-0" />
                            <div className="flex-1 text-left">
                              <p className="font-bold text-base md:text-sm text-gray-800">{selectedFiles.length} file(s) selected</p>
                              <p className="text-sm md:text-xs text-gray-400">
                                Total size: {(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>
                          <div className="w-full mt-2 max-h-32 overflow-y-auto border-t border-gray-200 pt-2">
                            {selectedFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm md:text-xs text-gray-600 bg-white p-1.5 rounded mb-1">
                                <span className="truncate flex-1">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
                                  }}
                                  className="ml-2 text-gray-400 hover:text-red-500 flex-shrink-0 text-lg md:text-base"
                                  title="Remove file"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                       </div>
                     ) : (
                       <div className="flex flex-col items-center">
                          <Upload className="w-8 h-8 text-gray-300 mb-2" />
                          <p className="text-base md:text-sm">Click to select files</p>
                          <p className="text-sm md:text-xs text-gray-400 mt-1">or drag and drop here (multiple files supported)</p>
                       </div>
                     )}
                     <input 
                       type="file"
                       multiple
                       ref={fileInputRef}
                       onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setSelectedFiles(files);
                       }}
                       className="hidden"
                       title="Select files to upload"
                     />
                  </div>

                  <div className="flex gap-2 pt-2">
                     <button onClick={() => setIsDocModalOpen(false)} className="flex-1 py-2 md:py-1.5 text-base md:text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                     <button onClick={handleUploadDocument} className="flex-1 py-2 md:py-1.5 text-base md:text-xs bg-gray-900 text-white rounded font-bold hover:bg-gray-800" disabled={isUploadingDocument}>
                       {isUploadingDocument ? (
                         <span className="flex items-center justify-center gap-2">
                           <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                           Uploading...
                         </span>
                       ) : 'Upload'}
                     </button>
                  </div>
               </div>
            </div>
         </div>,
         document.body
      )}

      {/* Edit SharedWith Modal (Admin only) */}
      {isShareEditOpen && editingSharedDoc && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in">
            <div className="p-4 md:p-6 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-bold">Edit Shared Users</h3>
              <p className="text-sm text-gray-500">Modify who can access this document after approval.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold">Select Users</label>
                <div className="mt-2 space-y-2 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {projectTeam.map(member => (
                    <label key={member.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded border border-transparent hover:border-gray-200">
                      <input
                        type="checkbox"
                        checked={tempSharedWith.includes(member.id)}
                        onChange={e => {
                          if (e.target.checked) setTempSharedWith(prev => Array.from(new Set([...prev, member.id])));
                          else setTempSharedWith(prev => prev.filter(id => id !== member.id));
                        }}
                      />
                      <span className="text-sm text-gray-800">{member.name} ({member.role})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 md:p-6 border-t border-gray-100 flex gap-3">
              <button onClick={() => { setIsShareEditOpen(false); setEditingSharedDoc(null); setTempSharedWith([]); }} className="flex-1 py-2 text-base text-gray-500 hover:bg-gray-100 rounded font-medium">Cancel</button>
              <button onClick={async () => {
                try {
                  await updateDocument(project.id, editingSharedDoc.id, { sharedWith: tempSharedWith });
                  addNotification('Shared Users Updated', `Shared list updated for ${editingSharedDoc.name}`, 'success', undefined, project.id, project.name);
                } catch (err) {
                  console.error('Error updating sharedWith:', err);
                  addNotification('Update Failed', 'Could not update shared users', 'error');
                } finally {
                  setIsShareEditOpen(false);
                  setEditingSharedDoc(null);
                  setTempSharedWith([]);
                }
              }} className="flex-1 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>, document.body
      )}



      {/* Task/Gantt Modal (Same as before) */}
      {isTaskModalOpen && editingTask && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
           {/* ... Task Modal Logic ... */}
           <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col animate-fade-in overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                   <div>
                     <h3 className="text-lg font-bold text-gray-900">{editingTask.id ? 'Edit Task Details' : 'Create New Task'}</h3>
                     <div className="flex items-center gap-1 text-xs text-gray-500 font-medium mt-0.5">
                        <FolderKanban className="w-3 h-3" />
                        <span>{project.name}</span>
                     </div>
                   </div>
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

              {/* Mobile Tabs */}
              <div className="flex md:hidden border-b border-gray-200 bg-white flex-shrink-0">
                <button 
                  onClick={() => setMobileTaskTab('details')}
                  className={`flex-1 py-3 text-sm font-bold text-center ${mobileTaskTab === 'details' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500'}`}
                >
                  Details
                </button>
                <button 
                  onClick={() => setMobileTaskTab('activity')}
                  className={`flex-1 py-3 text-sm font-bold text-center ${mobileTaskTab === 'activity' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500'}`}
                >
                  Activity
                </button>
              </div>

              {/* Modal Body: Split View */}
              <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${isEditingFrozen ? 'pointer-events-none opacity-80 bg-gray-50' : ''}`}>
                 
                 {/* LEFT: Task Info Form */}
                 <div className={`w-full md:w-1/2 p-6 overflow-y-auto border-r border-gray-100 bg-white ${mobileTaskTab === 'activity' ? 'hidden md:block' : 'block'}`}>
                    <div className="space-y-4">
                       
                       {/* ADMIN ACTIONS */}
                       {isAdmin && (
                           <div className="bg-gray-900 p-3 rounded-lg pointer-events-auto">
                               <p className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1"><Shield className="w-3 h-3"/> Admin Actions</p>
                               <div className="flex gap-2">
                                   {/* Mark as Done Button (Admin) - Always visible */}
                                   <button 
                                       onClick={() => handleTaskCompletion(editingTask as Task)}
                                       className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                       disabled={editingTask.status === TaskStatus.DONE}
                                   >
                                       <CheckCircle className="w-3 h-3"/> Mark Done
                                   </button>

                                   {editingTask.status === TaskStatus.ON_HOLD ? (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, TaskStatus.IN_PROGRESS)})}
                                           className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <PlayCircle className="w-3 h-3"/> Resume
                                       </button>
                                   ) : (
                                       <button 
                                           onClick={() => setEditingTask({...editingTask, status: TaskStatus.ON_HOLD})}
                                           className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                                       >
                                           <PauseCircle className="w-3 h-3"/> Hold
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
                                           <Ban className="w-3 h-3"/> Abort
                                       </button>
                                   )}
                               </div>
                           </div>
                       )}

                       {/* Mark as Done Action (For Non-Admin Assignees) */}
                       {editingTask.id && editingTask.status !== TaskStatus.DONE && !isAdmin && user?.id === editingTask.assigneeId && !isEditingFrozen && (
                           <div className="bg-green-50 border border-green-100 p-3 rounded-lg mb-4 flex items-center justify-between">
                               <div className="flex items-center gap-2 text-green-800">
                                   <CheckCircle className="w-5 h-5" />
                                   <span className="font-bold text-sm">Complete this task?</span>
                               </div>
                               <button 
                                   onClick={() => handleTaskCompletion(editingTask as Task)}
                                   className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 px-4 rounded flex items-center gap-1 transition-colors"
                               >
                                   Mark as Done
                               </button>
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
                                 title="Select start date"
                                 value={editingTask.startDate || ''}
                                 onChange={e => setEditingTask({...editingTask, startDate: e.target.value})}
                                 disabled={isEditingFrozen}
                               />
                             ) : <p className="text-sm mt-1 text-gray-800">{formatDateToIndian(editingTask.startDate)}</p>}
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Due Date <span className="text-red-500">*</span></label>
                             {canEditProject ? (
                               <input
                                 type="date"
                                 className={`${getInputClass(showTaskErrors && !editingTask.dueDate, isEditingFrozen)} mt-1`}
                                 title="Select due date"
                                 value={editingTask.dueDate || ''}
                                 onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})}
                                 disabled={isEditingFrozen}
                               />
                             ) : <p className="text-sm mt-1 text-gray-800">{formatDateToIndian(editingTask.dueDate)}</p>}
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
                                  {editingTask.approvals?.completion?.client?.status === 'approved' && editingTask.approvals?.completion?.admin?.status === 'approved' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-normal">Approved by Both</span>
                                  )}
                                  {editingTask.approvals?.completion?.client?.status === 'approved' && !editingTask.approvals?.completion?.admin?.status && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-normal">Waiting for Admin Approval</span>
                                  )}
                                  {editingTask.approvals?.completion?.admin?.status === 'approved' && !editingTask.approvals?.completion?.client?.status && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-normal">Waiting for Client Approval</span>
                                  )}
                                  {!editingTask.approvals?.completion?.client?.status && !editingTask.approvals?.completion?.admin?.status && (
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
                       <div className={`pt-4 border-t border-gray-100 flex flex-col ${editingTask.subtasks && editingTask.subtasks.length > 0 ? 'h-64 max-h-[400px]' : ''}`}>
                         <div className="flex justify-between items-center mb-2">
                           <label className="text-xs font-bold text-gray-700 uppercase block">Checklist</label>
                           {canEditProject && !isEditingFrozen && (!editingTask.subtasks || editingTask.subtasks.length === 0) && (
                             <button 
                               onClick={() => {
                                  const newSub: SubTask = { id: Math.random().toString(), title: 'New Item', isCompleted: false };
                                  setEditingTask({ ...editingTask, subtasks: [...(editingTask.subtasks || []), newSub] });
                                  setTimeout(() => {
                                    const container = document.getElementById('checklist-container');
                                    if (container) container.scrollTop = container.scrollHeight;
                                  }, 100);
                               }}
                               className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                             ><Plus className="w-3 h-3"/> Add</button>
                           )}
                         </div>
                         <div className={`space-y-2 pr-2 custom-scrollbar ${editingTask.subtasks && editingTask.subtasks.length > 0 ? 'flex-1 overflow-y-auto min-h-[200px] border border-gray-200 rounded-lg p-3' : ''}`} id="checklist-container">
                            {editingTask.subtasks?.map((st, idx) => (
                              <div key={st.id} className="flex items-center gap-2 p-2 rounded transition-opacity" style={{opacity: ((!canEditProject && user.id !== editingTask.assigneeId) || isTaskBlocked(editingTask) || isEditingFrozen) ? 0.5 : 1}}>
                                 <button
                                   type="button"
                                   onClick={() => {
                                      const newSubs = [...(editingTask.subtasks || [])];
                                      newSubs[idx].isCompleted = !newSubs[idx].isCompleted;
                                      setEditingTask({...editingTask, subtasks: newSubs});
                                   }}
                                   disabled={(!canEditProject && user.id !== editingTask.assigneeId) || isTaskBlocked(editingTask) || isEditingFrozen}
                                   title="Toggle subtask completion"
                                   aria-label="Toggle subtask completion"
                                   className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-200 ${
                                     st.isCompleted
                                       ? 'bg-green-500 border-green-500 hover:bg-green-600 hover:border-green-600'
                                       : 'border-gray-400 hover:border-green-400 hover:bg-green-50'
                                   } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-300`}
                                 >
                                   {st.isCompleted && <Check className="w-3 h-3 text-white" />}
                                 </button>
                                 {canEditProject ? (
                                   <input 
                                      type="text" 
                                      value={st.title}
                                      placeholder="New Item"
                                      disabled={isEditingFrozen}
                                      onFocus={(e) => {
                                        if (st.title === 'New Item') {
                                          const newSubs = [...(editingTask.subtasks || [])];
                                          newSubs[idx].title = '';
                                          setEditingTask({...editingTask, subtasks: newSubs});
                                        }
                                      }}
                                      onChange={(e) => {
                                         const newSubs = [...(editingTask.subtasks || [])];
                                         newSubs[idx].title = e.target.value;
                                         setEditingTask({...editingTask, subtasks: newSubs});
                                      }}
                                      className="flex-1 p-1 border-b border-transparent focus:border-gray-300 outline-none text-sm bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    />
                                 ) : <span className={`flex-1 text-sm pointer-events-none ${st.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>{st.title}</span>}
                                 
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
                            
                            {canEditProject && !isEditingFrozen && editingTask.subtasks && editingTask.subtasks.length > 0 && (
                             <button 
                               id="add-checklist-btn"
                               onClick={(e) => {
                                  const newSub: SubTask = { id: Math.random().toString(), title: 'New Item', isCompleted: false };
                                  setEditingTask({ ...editingTask, subtasks: [...(editingTask.subtasks || []), newSub] });
                                  // Auto-scroll to bottom after render
                                  setTimeout(() => {
                                    const container = document.getElementById('checklist-container');
                                    if (container) container.scrollTop = container.scrollHeight;
                                  }, 100);
                               }}
                               className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-2 pt-2"
                             ><Plus className="w-3 h-3"/> Add Item</button>
                           )}
                         </div>
                       </div>
                    </div>
                 </div>

                 {/* RIGHT: Approvals & Comments */}
                 <div className={`w-full md:w-1/2 flex flex-col bg-gray-50/50 ${mobileTaskTab === 'details' ? 'hidden md:flex' : 'flex'}`}>
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
                                    {editingTask.approvals?.start?.client?.status === 'pending' ? (
                                      isClient && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
                                          <button onClick={() => handleApproval('start', 'approve')} disabled={processingApproval === 'start-approve-client'} className="p-1 hover:bg-green-100 text-green-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Approve start">{processingApproval === 'start-approve-client' ? <Spinner size="sm" color="currentColor" /> : <ThumbsUp className="w-3 h-3"/>}</button>
                                          <button onClick={() => handleApproval('start', 'reject')} disabled={processingApproval === 'start-reject-client'} className="p-1 hover:bg-red-100 text-red-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Reject start">{processingApproval === 'start-reject-client' ? <Spinner size="sm" color="currentColor" /> : <ThumbsDown className="w-3 h-3"/>}</button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <div className="flex items-center gap-1">
                                         <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.start?.client?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {editingTask.approvals?.start?.client?.status}
                                         </span>
                                         {isAdmin && !isEditingFrozen && !(editingTask.approvals?.start?.client?.status === 'approved' && editingTask.approvals?.start?.admin?.status === 'approved') && (
                                           <button onClick={() => handleApproval('start', 'revoke', 'client')} disabled={processingApproval === 'start-revoke-client'} className="p-1 hover:bg-gray-100 text-gray-600 rounded text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed" title="Revoke approval">✕</button>
                                         )}
                                       </div>
                                    )}
                                 </div>
                                 {/* Admin Vote */}
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-600">Admin</span>
                                    {editingTask.approvals?.start?.admin?.status === 'pending' ? (
                                      isAdmin && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
                                          <button onClick={() => handleApproval('start', 'approve')} disabled={processingApproval === 'start-approve-admin'} className="p-1 hover:bg-green-100 text-green-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Approve start">{processingApproval === 'start-approve-admin' ? <Spinner size="sm" color="currentColor" /> : <ThumbsUp className="w-3 h-3"/>}</button>
                                          <button onClick={() => handleApproval('start', 'reject')} disabled={processingApproval === 'start-reject-admin'} className="p-1 hover:bg-red-100 text-red-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Reject start">{processingApproval === 'start-reject-admin' ? <Spinner size="sm" color="currentColor" /> : <ThumbsDown className="w-3 h-3"/>}</button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <div className="flex items-center gap-1">
                                         <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.start?.admin?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {editingTask.approvals?.start?.admin?.status}
                                         </span>
                                         {isAdmin && !isEditingFrozen && !(editingTask.approvals?.start?.client?.status === 'approved' && editingTask.approvals?.start?.admin?.status === 'approved') && (
                                           <button onClick={() => handleApproval('start', 'revoke', 'admin')} disabled={processingApproval === 'start-revoke-admin'} className="p-1 hover:bg-gray-100 text-gray-600 rounded text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed" title="Revoke approval">✕</button>
                                         )}
                                       </div>
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
                                    {editingTask.approvals?.completion?.client?.status === 'pending' ? (
                                      isClient && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
                                          <button onClick={() => handleApproval('completion', 'approve')} disabled={processingApproval === 'completion-approve-client'} className="p-1 hover:bg-green-100 text-green-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Approve completion">{processingApproval === 'completion-approve-client' ? <Spinner size="sm" color="currentColor" /> : <ThumbsUp className="w-3 h-3"/>}</button>
                                          <button onClick={() => handleApproval('completion', 'reject')} disabled={processingApproval === 'completion-reject-client'} className="p-1 hover:bg-red-100 text-red-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Reject completion">{processingApproval === 'completion-reject-client' ? <Spinner size="sm" color="currentColor" /> : <ThumbsDown className="w-3 h-3"/>}</button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <div className="flex items-center gap-1">
                                         <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.completion?.client?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {editingTask.approvals?.completion?.client?.status}
                                         </span>
                                         {isAdmin && !isEditingFrozen && !(editingTask.approvals?.completion?.client?.status === 'approved' && editingTask.approvals?.completion?.admin?.status === 'approved') && (
                                           <button onClick={() => handleApproval('completion', 'revoke', 'client')} disabled={processingApproval === 'completion-revoke-client'} className="p-1 hover:bg-gray-100 text-gray-600 rounded text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed" title="Revoke approval">✕</button>
                                         )}
                                       </div>
                                    )}
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-600">Admin</span>
                                    {editingTask.approvals?.completion?.admin?.status === 'pending' ? (
                                      isAdmin && !isEditingFrozen ? (
                                        <div className="flex gap-1 pointer-events-auto">
                                          <button onClick={() => handleApproval('completion', 'approve')} disabled={processingApproval === 'completion-approve-admin'} className="p-1 hover:bg-green-100 text-green-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Approve completion">{processingApproval === 'completion-approve-admin' ? <Spinner size="sm" color="currentColor" /> : <ThumbsUp className="w-3 h-3"/>}</button>
                                          <button onClick={() => handleApproval('completion', 'reject')} disabled={processingApproval === 'completion-reject-admin'} className="p-1 hover:bg-red-100 text-red-600 rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Reject completion">{processingApproval === 'completion-reject-admin' ? <Spinner size="sm" color="currentColor" /> : <ThumbsDown className="w-3 h-3"/>}</button>
                                        </div>
                                      ) : <span className="text-xs text-gray-400 italic">Pending</span>
                                    ) : (
                                       <div className="flex items-center gap-1">
                                         <span className={`text-xs font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.completion?.admin?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {editingTask.approvals?.completion?.admin?.status}
                                         </span>
                                         {isAdmin && !isEditingFrozen && !(editingTask.approvals?.completion?.client?.status === 'approved' && editingTask.approvals?.completion?.admin?.status === 'approved') && (
                                           <button onClick={() => handleApproval('completion', 'revoke', 'admin')} disabled={processingApproval === 'completion-revoke-admin'} className="p-1 hover:bg-gray-100 text-gray-600 rounded text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed" title="Revoke approval">✕</button>
                                         )}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           </div>
                        </div>
                      </div>
                    )}

                    {/* Documents Section - Just Button */}
                    <div className="p-4 border-b border-gray-200 bg-white">
                       <button 
                         onClick={() => {
                            setSelectedDocument(null);
                            setIsTaskDocModalOpen(true);
                         }}
                         className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors group"
                         title="View task documents"
                       >
                          <div className="flex items-center gap-2">
                             <FileIcon className="w-4 h-4 text-blue-600" />
                             <span className="text-xs font-bold text-blue-900 uppercase">Task Documents</span>
                             {editingTask.documents && getValidDocumentCount(editingTask.documents) > 0 && (
                               <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                 {getValidDocumentCount(editingTask.documents)}
                               </span>
                             )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
                       </button>
                    </div>

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
                                  <div className={`p-2 rounded-lg max-w-[85%] text-sm ${isMe ? 'bg-blue-100 text-blue-900' : 'bg-white border border-gray-200 text-gray-700'}`}>
                                     <p className="text-[10px] font-bold opacity-70 mb-1">{getAssigneeName(comment.userId, comment.userName)}</p>
                                     <p>{comment.text}</p>
                                     <p className="text-[10px] opacity-60 mt-1 text-right">{formatRelativeTime(comment.timestamp)}</p>
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
                      <button onClick={handleSaveTask} disabled={isSavingTask} className="px-6 py-2 text-sm font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2" title="Save task">
                          {isSavingTask ? (
                            <>
                              <Spinner size="sm" color="currentColor" />
                              {editingTask.id ? 'Saving...' : 'Creating...'}
                            </>
                          ) : (
                            <>
                              {editingTask.id ? 'Save Changes' : 'Create Task'}
                            </>
                          )}
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
                     <p className="text-xs text-gray-500">Uploaded {formatDateToIndian(selectedDocument.uploadDate)}</p>
                   </div>
                </div>
                <button onClick={() => setIsDocDetailOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close document modal"><X className="w-5 h-5" /></button>
              </div>

              {/* Preview */}
              <div className="flex-1 overflow-hidden bg-gray-50 flex items-center justify-center">
                 {selectedDocument.type === 'image' ? (
                   <img src={selectedDocument.url || DEFAULT_AVATAR} alt={selectedDocument.name} className="max-h-full max-w-full object-contain" />
                 ) : selectedDocument.type === 'pdf' ? (
                   <div className="text-center space-y-4">
                     <div className="w-24 h-32 mx-auto bg-gradient-to-br from-red-50 to-red-100 rounded-lg flex flex-col items-center justify-center border-2 border-red-200">
                        <FileText className="w-12 h-12 text-red-500 mb-2" />
                        <span className="text-xs font-bold text-red-600 uppercase">PDF</span>
                     </div>
                     <div>
                        <p className="text-gray-700 font-medium mb-2">{selectedDocument.name}</p>
                        <p className="text-gray-500 text-sm mb-4">PDF documents cannot be previewed in-browser</p>
                     </div>
                     <button 
                       onClick={() => window.open(selectedDocument.url, '_blank')}
                       className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                     >
                       Open PDF in New Tab
                     </button>
                   </div>
                 ) : (
                   <div className="text-center space-y-4">
                     <div className="w-24 h-32 mx-auto bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg flex flex-col items-center justify-center border-2 border-blue-200">
                        <FileText className="w-12 h-12 text-blue-500 mb-2" />
                        <span className="text-xs font-bold text-blue-600 uppercase">{selectedDocument.type}</span>
                     </div>
                     <div>
                        <p className="text-gray-700 font-medium mb-2">{selectedDocument.name}</p>
                        <p className="text-gray-500 text-sm mb-4">{selectedDocument.type.toUpperCase()} files cannot be previewed in-browser</p>
                     </div>
                     <button 
                       onClick={() => window.open(selectedDocument.url, '_blank')}
                       className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
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
                          <div className="flex-1">
                             <p className="text-[10px] font-bold text-gray-700">{getAssigneeName(comment.userId, comment.userName)}</p>
                             <p className="text-xs text-gray-600 mt-0.5">{comment.text}</p>
                             <p className="text-[9px] text-gray-400 mt-1">{formatRelativeTime(comment.timestamp)}</p>
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
                     onKeyDown={e => e.key === 'Enter' && !isSendingDocumentComment && handleAddDocumentComment()}
                     disabled={isSendingDocumentComment}
                     className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
                   />
                   <button
                     onClick={handleAddDocumentComment}
                     disabled={!documentCommentText.trim() || isSendingDocumentComment}
                     className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                     title="Send comment"
                   >
                     {isSendingDocumentComment ? <Spinner size="sm" className="text-white" /> : <Send className="w-4 h-4" />}
                   </button>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && deleteConfirmTask && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200 overflow-hidden">
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

      {/* Meeting Delete Confirmation Modal */}
      {isMeetingDeleteConfirmOpen && deletingMeeting && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-red-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delete Meeting?</h2>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete the meeting <span className="font-bold text-gray-900">"{deletingMeeting.title}"</span>? 
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">
                  <span className="font-bold">⚠️ Warning:</span> This meeting and all associated comments will be removed from the project immediately.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 rounded-b-xl">
              <button
                onClick={() => {
                  setIsMeetingDeleteConfirmOpen(false);
                  setDeletingMeeting(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Cancel deletion"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deletingMeeting) {
                    handleDeleteMeeting(deletingMeeting.id, deletingMeeting.title);
                    setIsMeetingDeleteConfirmOpen(false);
                    setDeletingMeeting(null);
                  }
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                title="Confirm meeting deletion"
              >
                <Ban className="w-4 h-4" /> Delete Meeting
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Document Delete Confirmation Modal */}
      {isDocDeleteConfirmOpen && deletingDoc && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-red-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delete Document?</h2>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete the document <span className="font-bold text-gray-900">"{deletingDoc.name}"</span>? 
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">
                  <span className="font-bold">Warning:</span> This document will be permanently removed from the project and any tasks it is attached to.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 rounded-b-xl">
              <button
                onClick={() => {
                  setIsDocDeleteConfirmOpen(false);
                  setDeletingDoc(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Cancel deletion"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDocument}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                title="Confirm document deletion"
              >
                <Trash2 className="w-4 h-4" /> Delete Document
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
                {currentFinancials.filter(f => {
                    // Approval logic: both admin and client must approve
                    const approved = f.adminApproved && f.clientApproved;
                    // Vendor association logic
                    const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                    
                    return approved && (
                        f.vendorName === selectedVendorForBilling.name || 
                        cleanName(f.receivedByName) === selectedVendorForBilling.name || 
                        cleanName(f.paidByOther) === selectedVendorForBilling.name ||
                        f.paidTo === selectedVendorForBilling.name ||
                        f.receivedBy === selectedVendorForBilling.name
                    );
                }).length === 0 ? (
                    <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                        No approved billing records found for this vendor.
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Paid By</th>
                                    <th className="px-4 py-3">Received By</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3 text-center">Approvals</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {currentFinancials
                                    .filter(f => {
                                        // Approval logic: both admin and client must approve
                                        const approved = f.adminApproved && f.clientApproved;
                                        // Vendor association logic
                                        const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                                        
                                        return approved && (
                                            f.vendorName === selectedVendorForBilling.name || 
                                            cleanName(f.receivedByName) === selectedVendorForBilling.name || 
                                            cleanName(f.paidByOther) === selectedVendorForBilling.name ||
                                            f.paidTo === selectedVendorForBilling.name ||
                                            f.receivedBy === selectedVendorForBilling.name
                                        );
                                    })
                                    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(fin => (
                                    <tr key={fin.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fin.date}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-0.5">
                                              <div className="font-bold text-gray-900 text-xs">{fin.type === 'income' ? (fin.paidTo || fin.paidByOther || '-') : (fin.vendorName || '-')}</div>
                                              <div className="flex items-center gap-1 text-xs">
                                                <span className="text-gray-400">|</span>
                                                <span className={`flex-shrink-0 font-medium text-sm md:text-xs ${
                                                  fin.paidBy === 'client' ? 'text-blue-700' :
                                                  fin.paidBy === 'vendor' ? 'text-purple-700' :
                                                  fin.paidBy === 'designer' ? 'text-orange-700' :
                                                  fin.paidBy === 'admin' ? 'text-red-700' :
                                                  'text-gray-700'
                                                }`}>
                                                  {fin.type === 'income' ? (
                                                    (() => {
                                                      const paidByUser = users.find(u => u.name === (fin.paidTo || fin.paidByOther));
                                                      return paidByUser?.role === Role.CLIENT ? 'Client' :
                                                             paidByUser?.role === Role.VENDOR ? 'Vendor' :
                                                             paidByUser?.role === Role.DESIGNER ? 'Designer' :
                                                             paidByUser?.role === Role.ADMIN ? 'Admin' :
                                                             (fin.paidBy === 'client' ? 'Client' :
                                                              fin.paidBy === 'vendor' ? 'Vendor' :
                                                              fin.paidBy === 'designer' ? 'Designer' :
                                                              fin.paidBy === 'admin' ? 'Admin' : 'N/A');
                                                    })()
                                                  ) : (
                                                    fin.paidBy === 'client' ? 'Client' :
                                                    fin.paidBy === 'vendor' ? 'Vendor' :
                                                    fin.paidBy === 'designer' ? 'Designer' :
                                                    fin.paidBy === 'admin' ? 'Admin' :
                                                    'N/A'
                                                  )}
                                                </span>
                                              </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-0.5">
                                              <div className="font-bold text-gray-900 text-xs">
                                                {fin.receivedBy ? (
                                                  fin.receivedBy.includes('(') ? fin.receivedBy.split('(')[0].trim() : fin.receivedBy
                                                ) : '-'}
                                              </div>
                                              <div className="flex flex-col gap-1 text-xs">
                                                <div className="flex items-center gap-1">
                                                  <span className="text-gray-400">|</span>
                                                  <span className={`flex-shrink-0 font-medium text-xs ${
                                                    fin.receivedBy ? (
                                                      (() => {
                                                        const receivedUser = users.find(u => u.name === (fin.receivedBy?.includes('(') ? fin.receivedBy.split('(')[0].trim() : fin.receivedBy));
                                                        const role = receivedUser?.role || (fin.receivedBy?.includes('(') ? fin.receivedBy.split('(')[1].replace(')', '').trim() : '');
                                                        if (role === Role.CLIENT || role === 'Client') return 'text-blue-700';
                                                        if (role === Role.VENDOR || role === 'Vendor') return 'text-purple-700';
                                                        if (role === Role.DESIGNER || role === 'Designer') return 'text-orange-700';
                                                        if (role === Role.ADMIN || role === 'Admin') return 'text-red-700';
                                                        return 'text-gray-700';
                                                      })()
                                                    ) : 'text-gray-700'
                                                  }`}>
                                                    {fin.receivedBy && fin.receivedBy.includes('(') ? (
                                                      fin.receivedBy.split('(')[1].replace(')', '').trim()
                                                    ) : (users.find(m => m.name === fin.receivedBy)?.role || 'Vendor')}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{fin.description}</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">₹{fin.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            {/* Approval Status for Received Payments and Additional Budgets */}
                                            {(fin.isClientPayment || fin.type === 'income') && (
                                              <div className="flex items-center gap-3 justify-center">
                                                {/* Client Payment Approval */}
                                                <div className="flex items-center gap-1">
                                                  <span className="text-xs font-semibold text-blue-600">C:</span>
                                                  {(fin.clientApprovalForPayment === 'approved' || fin.clientApproved === true) && (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                                  )}
                                                  {(fin.clientApprovalForPayment === 'rejected') && (
                                                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                                  )}
                                                  {(fin.clientApprovalForPayment === 'pending' || fin.clientApprovalForPayment === undefined || fin.clientApprovalForPayment === null) && !fin.clientApproved && user?.role === Role.CLIENT && (
                                                    <div className="flex gap-0.5">
                                                      <button 
                                                        onClick={() => handleApprovePayment(fin.id, 'client', 'approved')}
                                                        className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Confirm payment"
                                                        disabled={processingAction === `approve-payment-${fin.id}-client-approved`}
                                                      >
                                                        {processingAction === `approve-payment-${fin.id}-client-approved` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                                      </button>
                                                      <button 
                                                        onClick={() => handleApprovePayment(fin.id, 'client', 'rejected')}
                                                        className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Dispute payment"
                                                        disabled={processingAction === `approve-payment-${fin.id}-client-rejected`}
                                                      >
                                                        {processingAction === `approve-payment-${fin.id}-client-rejected` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                                      </button>
                                                    </div>
                                                  )}
                                                  {(fin.clientApprovalForPayment === 'pending' || fin.clientApprovalForPayment === undefined || fin.clientApprovalForPayment === null) && !fin.clientApproved && user?.role !== Role.CLIENT && (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                  )}
                                                </div>
                                                
                                                <span className="text-gray-300">|</span>
                                                
                                                {/* Admin Payment Approval */}
                                                <div className="flex items-center gap-1">
                                                  <span className="text-xs font-semibold text-purple-600">A:</span>
                                                  {(fin.adminApprovalForPayment === 'approved' || fin.adminApproved === true) && (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                                  )}
                                                  {(fin.adminApprovalForPayment === 'rejected') && (
                                                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                                  )}
                                                  {(fin.adminApprovalForPayment === 'pending' || fin.adminApprovalForPayment === undefined || fin.adminApprovalForPayment === null) && !fin.adminApproved && user?.role === Role.ADMIN && (
                                                    <div className="flex gap-0.5">
                                                      <button 
                                                        onClick={() => handleApprovePayment(fin.id, 'admin', 'approved')}
                                                        className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Approve payment"
                                                        disabled={processingAction === `approve-payment-${fin.id}-admin-approved`}
                                                      >
                                                        {processingAction === `approve-payment-${fin.id}-admin-approved` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                                      </button>
                                                      <button 
                                                        onClick={() => handleApprovePayment(fin.id, 'admin', 'rejected')}
                                                        className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Reject payment"
                                                        disabled={processingAction === `approve-payment-${fin.id}-admin-rejected`}
                                                      >
                                                        {processingAction === `approve-payment-${fin.id}-admin-rejected` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                                      </button>
                                                    </div>
                                                  )}
                                                  {(fin.adminApprovalForPayment === 'pending' || fin.adminApprovalForPayment === undefined || fin.adminApprovalForPayment === null) && !fin.adminApproved && user?.role !== Role.ADMIN && (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            {/* Approval Status for Expenses */}
                                            {fin.type === 'expense' && (
                                              <div className="flex items-center gap-3 justify-center">
                                                {/* Client Approval for Expenses */}
                                                <div className="flex items-center gap-1">
                                                  <span className="text-xs font-semibold text-blue-600">C:</span>
                                                  {fin.clientApproved === true && (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                                  )}
                                                  {fin.clientApproved === false && (
                                                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                                  )}
                                                  {(fin.clientApproved === undefined || fin.clientApproved === null) && user?.role === Role.CLIENT && (
                                                    <div className="flex gap-0.5">
                                                      <button 
                                                        onClick={() => handleApproveExpense(fin.id, 'client', true)}
                                                        className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Approve expense"
                                                        disabled={processingAction === `approve-expense-${fin.id}-client-true`}
                                                      >
                                                        {processingAction === `approve-expense-${fin.id}-client-true` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                                      </button>
                                                      <button 
                                                        onClick={() => handleApproveExpense(fin.id, 'client', false)}
                                                        className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Reject expense"
                                                        disabled={processingAction === `approve-expense-${fin.id}-client-false`}
                                                      >
                                                        {processingAction === `approve-expense-${fin.id}-client-false` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                                      </button>
                                                    </div>
                                                  )}
                                                  {(fin.clientApproved === undefined || fin.clientApproved === null) && user?.role !== Role.CLIENT && (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                  )}
                                                </div>
                                                
                                                <span className="text-gray-300">|</span>
                                                
                                                {/* Admin Approval for Expenses */}
                                                <div className="flex items-center gap-1">
                                                  <span className="text-xs font-semibold text-purple-600">A:</span>
                                                  {fin.adminApproved === true && (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-xs">✓</span>
                                                  )}
                                                  {fin.adminApproved === false && (
                                                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">✗</span>
                                                  )}
                                                  {(fin.adminApproved === undefined || fin.adminApproved === null) && user?.role === Role.ADMIN && (
                                                    <div className="flex gap-0.5">
                                                      <button 
                                                        onClick={() => handleApproveExpense(fin.id, 'admin', true)}
                                                        className="text-white bg-green-600 hover:bg-green-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Approve expense"
                                                        disabled={processingAction === `approve-expense-${fin.id}-admin-true`}
                                                      >
                                                        {processingAction === `approve-expense-${fin.id}-admin-true` ? <Spinner size="sm" color="currentColor" /> : '✓'}
                                                      </button>
                                                      <button 
                                                        onClick={() => handleApproveExpense(fin.id, 'admin', false)}
                                                        className="text-white bg-red-600 hover:bg-red-700 font-bold text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-center min-w-[20px]"
                                                        title="Reject expense"
                                                        disabled={processingAction === `approve-expense-${fin.id}-admin-false`}
                                                      >
                                                        {processingAction === `approve-expense-${fin.id}-admin-false` ? <Spinner size="sm" color="currentColor" /> : '✗'}
                                                      </button>
                                                    </div>
                                                  )}
                                                  {(fin.adminApproved === undefined || fin.adminApproved === null) && user?.role !== Role.ADMIN && (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            {!fin.isAdditionalBudget && !fin.isClientPayment && fin.type !== 'expense' && (
                                              <span className="text-xs text-gray-300">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            {/* Footer Summary */}
            <div className="p-6 border-t border-gray-100 bg-gray-50">
                {/* Calculation Logic */}
                {(() => {
                    const vendorTransactions = currentFinancials.filter(f => {
                        // Approval logic: both admin and client must approve
                        const approved = f.adminApproved && f.clientApproved;
                        // Vendor association logic
                        const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                        
                        return approved && (
                            f.vendorName === selectedVendorForBilling.name || 
                            cleanName(f.receivedByName) === selectedVendorForBilling.name || 
                            cleanName(f.paidByOther) === selectedVendorForBilling.name ||
                            f.paidTo === selectedVendorForBilling.name ||
                            f.receivedBy === selectedVendorForBilling.name
                        );
                    });

                    // Total Paid TO Vendor (Vendor is Recipient)
                    const totalPaidToVendor = vendorTransactions
                        .filter(f => {
                            const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                            return cleanName(f.receivedByName) === selectedVendorForBilling.name || f.receivedBy === selectedVendorForBilling.name;
                        })
                        .reduce((acc, curr) => acc + curr.amount, 0);

                    // Total Paid BY Vendor (Vendor is Payer)
                    const totalPaidByVendor = vendorTransactions
                        .filter(f => {
                            const cleanName = (name: string | undefined) => name ? (name.includes('(') ? name.split('(')[0].trim() : name.trim()) : '';
                            return f.vendorName === selectedVendorForBilling.name || 
                                   cleanName(f.paidByOther) === selectedVendorForBilling.name ||
                                   f.paidTo === selectedVendorForBilling.name;
                        })
                        .reduce((acc, curr) => acc + curr.amount, 0);

                    const netAmount = totalPaidToVendor - totalPaidByVendor;
                    const designerChargesAmount = netAmount * (designerChargesPercent / 100);
                    const finalTotal = netAmount + designerChargesAmount;

                    return (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Total Paid To Vendor (Received):</span>
                                <span className="font-medium text-gray-900">₹{totalPaidToVendor.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Less: Paid By Vendor (Expenses):</span>
                                <span className="font-medium text-red-600">- ₹{totalPaidByVendor.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                <span className="font-bold text-gray-800">Net Amount:</span>
                                <span className="font-bold text-gray-900">₹{netAmount.toLocaleString()}</span>
                            </div>

                            {/* Designer Charges Section - Only for Designing Projects */}
                            {project.type === 'Designing' && (
                                <>
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 border-dashed">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-700">Designer Charges</span>
                                            {user.role === Role.ADMIN ? (
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max="100"
                                                        value={designerChargesPercent}
                                                        onChange={(e) => setDesignerChargesPercent(parseFloat(e.target.value) || 0)}
                                                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                        aria-label="Designer Charges Percentage"
                                                        title="Enter designer charges percentage"
                                                        placeholder="0"
                                                    />
                                                    <span className="text-sm text-gray-500">%</span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-500">({designerChargesPercent}%)</span>
                                            )}
                                        </div>
                                        <div className="text-md font-semibold text-orange-700">
                                            + ₹{designerChargesAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}
                                        </div>
                                    </div>

                                    {/* Final Total */}
                                    <div className="flex justify-between items-center pt-3 border-t border-gray-300">
                                        <div className="text-base font-bold text-gray-800">Final Payable</div>
                                        <div className="text-xl font-bold text-gray-900">
                                            ₹{finalTotal.toLocaleString(undefined, {maximumFractionDigits: 2})}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Designer Details Modal */}
      {selectedDesignerForDetails && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedDesignerForDetails.name}</h2>
                  <p className="text-sm text-gray-500">Designer Details & Projects</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEditProject && (
                  <button 
                    onClick={() => {
                      // Open edit modal for designer (you can add edit functionality)
                      addNotification('Info', 'Designer edit functionality coming soon', 'info');
                    }}
                    className="text-emerald-600 hover:text-emerald-700 text-sm font-medium px-3 py-1.5 hover:bg-emerald-50 rounded transition-colors"
                    title="Edit designer details"
                  >
                    Edit
                  </button>
                )}
                <button 
                  onClick={() => setSelectedDesignerForDetails(null)}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Close designer details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Designer Info Card */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-100">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Name</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{selectedDesignerForDetails.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Specialty</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{selectedDesignerForDetails.specialty || 'General Design'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Email</p>
                    <p className="text-sm text-gray-700 mt-1">{selectedDesignerForDetails.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Phone</p>
                    <p className="text-sm text-gray-700 mt-1">{selectedDesignerForDetails.phone || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Projects Assigned to Designer */}
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-4">Assigned Projects</h3>
                {project.tasks.filter(t => t.assigneeId === selectedDesignerForDetails.id).length === 0 ? (
                  <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                    No tasks assigned to this designer in this project.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-gray-700 text-sm">Project Name</th>
                          <th className="px-4 py-3 text-center font-bold text-gray-700 text-sm">Work Progress</th>
                          <th className="px-4 py-3 text-center font-bold text-gray-700 text-sm">Percentage</th>
                          <th className="px-4 py-3 text-center font-bold text-gray-700 text-sm">Deadline</th>
                          <th className="px-4 py-3 text-center font-bold text-gray-700 text-sm">Pending Tasks</th>
                          <th className="px-4 py-3 text-center font-bold text-gray-700 text-sm">Completed Tasks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* This project's tasks assigned to designer */}
                        {(() => {
                          const designerTasks = project.tasks.filter(t => t.assigneeId === selectedDesignerForDetails.id);
                          const completedCount = designerTasks.filter(t => t.status === TaskStatus.DONE).length;
                          const pendingCount = designerTasks.filter(t => {
                            const adminApproved = t?.approvals?.completion?.admin?.status === 'approved';
                            const clientStatus = t?.approvals?.completion?.client?.status;
                            const clientPending = !clientStatus || clientStatus === 'pending';
                            const isCompleted = t.status === TaskStatus.DONE;
                            // Only exclude if task is completed and admin-approved but waiting for client
                            if (isCompleted && adminApproved && clientPending) return false;
                            return t.status !== TaskStatus.DONE && t.status !== TaskStatus.REVIEW;
                          }).length;
                          const progressPercentage = designerTasks.length > 0 
                            ? Math.round((completedCount / designerTasks.length) * 100)
                            : 0;

                          return (
                            <tr className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3 text-left text-gray-900 font-medium text-xs">{project.name}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all" 
                                    style={{width: `${progressPercentage}%`}}
                                  ></div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-gray-900 text-xs">{progressPercentage}%</td>
                              <td className="px-4 py-3 text-center text-gray-600 text-xs whitespace-nowrap">{formatDateToIndian(project.deadline)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                                  {pendingCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                  {completedCount}
                                </span>
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Summary Footer */}
            <div className="p-6 border-t border-gray-100 bg-gray-50">
              {(() => {
                const designerTasks = project.tasks.filter(t => t.assigneeId === selectedDesignerForDetails.id);
                const completedCount = designerTasks.filter(t => t.status === TaskStatus.DONE).length;
                const totalCount = designerTasks.length;

                return (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Total Project Tasks</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Completed</p>
                      <p className="text-2xl font-bold text-green-600 mt-1">{completedCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Remaining</p>
                      <p className="text-2xl font-bold text-orange-600 mt-1">{totalCount - completedCount}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Additional Budget Modal */}
      {isAdditionalBudgetModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-green-50 flex-shrink-0">
              <h3 className="text-xl md:text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 md:w-4 md:h-4 text-emerald-600" /> Add Additional Budget
              </h3>
              <p className="text-base md:text-sm text-gray-600 mt-1">Increase the project budget with client approval</p>
            </div>

            {/* Content */}
            <div className="p-4 md:p-6 space-y-4 flex-1 overflow-y-auto scrollbar-thin">
              {/* Amount Field */}
              <div>
                <label className="block text-base md:text-sm font-medium text-gray-700 mb-2">
                  Budget Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold text-lg md:text-base">₹</span>
                  <input
                    type="number"
                    value={additionalBudgetAmount}
                    onChange={(e) => setAdditionalBudgetAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full pl-7 pr-4 py-3 md:py-2 text-base md:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    min="0"
                  />
                </div>
              </div>

              {/* Description Field */}
              <div>
                <label className="block text-base md:text-sm font-medium text-gray-700 mb-2">
                  Reason/Description
                </label>
                <textarea
                  value={additionalBudgetDescription}
                  onChange={(e) => setAdditionalBudgetDescription(e.target.value)}
                  placeholder="Why is additional budget needed? (optional)"
                  className="w-full px-4 py-3 md:py-2 text-base md:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
                  rows={3}
                />
              </div>

              {/* Preview */}
              {additionalBudgetAmount && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 md:p-3">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-base md:text-sm text-gray-600">Current Budget:</span>
                      <span className="text-base md:text-sm font-semibold text-gray-900">₹{project.budget.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-base md:text-sm text-gray-600">Additional Amount:</span>
                      <span className="text-base md:text-sm font-semibold text-emerald-600">+₹{parseFloat(additionalBudgetAmount || '0').toLocaleString()}</span>
                    </div>
                    <div className="border-t border-emerald-200 pt-2 flex justify-between">
                      <span className="text-base md:text-sm font-medium text-gray-900">New Total:</span>
                      <span className="text-base md:text-sm font-bold text-emerald-700">₹{(project.budget + parseFloat(additionalBudgetAmount || '0')).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 md:p-6 border-t border-gray-200 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsAdditionalBudgetModalOpen(false);
                  setAdditionalBudgetAmount('');
                  setAdditionalBudgetDescription('');
                }}
                className="px-4 py-2 md:py-1.5 text-base md:text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!additionalBudgetAmount || isNaN(parseFloat(additionalBudgetAmount))) {
                    addNotification('Validation', 'Please enter a valid budget amount', 'error', project.clientId, project.id, project.name);
                    return;
                  }

                  const additional = parseFloat(additionalBudgetAmount);
                  
                  try {
                    // Get client and admin details
                    const clientUser = users.find(u => u.id === project.clientId);
                    const clientName = clientUser?.name || 'Client';
                    const adminUser = users.find(u => u.role === Role.ADMIN);
                    const adminName = adminUser?.name || 'Admin';
                    
                    // Create a financial record for the additional budget in Firestore
                    const recordId = await createProjectFinancialRecord(project.id, {
                      date: new Date().toISOString().split('T')[0],
                      timestamp: new Date().toISOString(),
                      description: additionalBudgetDescription || `Additional Budget Increase: ₹${additional.toLocaleString()}`,
                      amount: additional,
                      type: 'income',
                      category: 'Additional Budget',
                      status: 'pending',
                      paidBy: 'client',
                      paidByOther: clientName,
                      receivedBy: adminName,
                      receivedByName: adminName,
                      receivedByRole: 'admin-received',
                      isAdditionalBudget: true,
                      clientApprovalForAdditionalBudget: 'pending',
                      adminApprovalForAdditionalBudget: 'pending'
                    });

                    // Log timeline event for budget request
                    logTimelineEvent(
                      project.id,
                      `Budget Increase Requested: ₹${additional.toLocaleString()}`,
                      `Budget increase of ₹${additional.toLocaleString()} requested by ${user.name}. Reason: ${additionalBudgetDescription || 'Not specified'}. Awaiting Client and Admin approval.`,
                      'in-progress',
                      new Date().toISOString(),
                      new Date().toISOString()
                    );
                    
                    // Log activity
                    logActivity('Budget', `Budget increase of ₹${additional.toLocaleString()} requested by ${user.name}. Awaiting approvals. Reason: ${additionalBudgetDescription || 'Not specified'}`);
                    
                    addNotification('Request', `Budget increase of ₹${additional.toLocaleString()} requested. Awaiting Client and Admin approval.`, 'success', project.clientId, project.id, project.name);

                    // Close modal
                    setIsAdditionalBudgetModalOpen(false);
                    setAdditionalBudgetAmount('');
                    setAdditionalBudgetDescription('');
                  } catch (error) {
                    console.error('Error creating additional budget record:', error);
                    addNotification('Error', 'Failed to create additional budget record', 'error', project.clientId, project.id, project.name);
                  }
                }}
                className="px-4 py-2 md:py-1.5 text-base md:text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4 md:w-3 md:h-3" /> Add Budget
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Meeting Form Modal */}
      <MeetingForm
        isOpen={isMeetingModalOpen}
        onClose={() => {
          setIsMeetingModalOpen(false);
          setEditingMeeting(null);
        }}
        onSubmit={handleMeetingSubmit}
        onUpdate={handleMeetingUpdate}
        teamMembers={projectTeam}
        isLoading={isSavingMeeting}
        editingMeeting={editingMeeting}
      />

      {/* Task Documents Modal */}
      {isTaskDocModalOpen && editingTask && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2">
                <FileIcon className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-900">Task Documents</h3>
                {editingTask.documents && getValidDocumentCount(editingTask.documents) > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {getValidDocumentCount(editingTask.documents)}
                  </span>
                )}
              </div>
              <button 
                type="button"
                onClick={() => setIsTaskDocModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 rounded transition-colors"
                title="Close modal"
                aria-label="Close documents modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {getValidDocumentCount(editingTask.documents) > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {getValidDocuments(editingTask.documents)
                    .filter(doc => {
                      // Only show to Admin/Designer if pending
                      if (doc.approvalStatus === 'pending') {
                        return user.role === Role.ADMIN || user.role === Role.DESIGNER || doc.uploadedBy === user.id;
                      }
                      // Approved: show to shared users, client, vendor
                      if (doc.approvalStatus === 'approved') {
                        return (Array.isArray(doc.sharedWith) && doc.sharedWith.includes(user.id)) || user.role === Role.ADMIN || doc.uploadedBy === user.id;
                      }
                      // Rejected: only show to admin/designer/uploader
                      if (doc.approvalStatus === 'rejected') {
                        return user.role === Role.ADMIN || user.role === Role.DESIGNER || doc.uploadedBy === user.id;
                      }
                      // Fallback: only show to admin
                      return user.role === Role.ADMIN;
                    })
                    .map(doc => (
                      <div key={doc.id} className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                        {/* Overlay Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10">
                          <div className="flex items-center justify-center gap-2">
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
                            {(doc.uploadedBy === user.id || canEditProject) && (
                              <button 
                                className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50" 
                                title="Delete"
                                onClick={() => handleDeleteDocument(doc)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {user.role === Role.ADMIN && doc.approvalStatus === 'pending' && (
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                className="p-2 bg-white rounded-full text-green-600 hover:bg-green-50" 
                                title="Approve"
                                onClick={() => handleApproveDocument(doc)}
                                disabled={processingAction === `approve-doc-${doc.id}`}
                              >
                                 {processingAction === `approve-doc-${doc.id}` ? <Spinner size="md" color="currentColor" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button 
                                className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50" 
                                title="Reject"
                                onClick={() => handleRejectDocument(doc)}
                                disabled={processingAction === `reject-doc-${doc.id}`}
                              >
                                 {processingAction === `reject-doc-${doc.id}` ? <Spinner size="md" color="currentColor" /> : <X className="w-4 h-4" />}
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="h-32 bg-gray-100 flex items-center justify-center overflow-hidden relative group">
                          {doc.type === 'image' ? (
                            <img 
                              src={doc.url || DEFAULT_AVATAR} 
                              alt={doc.name} 
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48L3BvbHlsaW5lPjwvc3ZnPg==';
                                e.currentTarget.className = "w-12 h-12 opacity-50";
                                e.currentTarget.parentElement?.classList.add("flex", "items-center", "justify-center");
                              }}
                            />
                          ) : doc.type === 'pdf' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
                              <FileText className="w-12 h-12 text-red-400 mb-2" />
                              <span className="text-xs font-bold text-red-600 uppercase">PDF</span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                              <FileText className="w-12 h-12 text-blue-400 mb-2" />
                              <span className="text-xs font-bold text-blue-600 uppercase">{doc.type}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-bold text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-gray-400">{formatDateToIndian(doc.uploadDate)}</span>
                            {/* Approval Status Indicator */}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${doc.approvalStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : doc.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{doc.approvalStatus === 'pending' ? 'Approval Pending' : doc.approvalStatus === 'approved' ? 'Approved' : 'Rejected'}</span>
                          </div>
                          {/* Approval Actions for Admin */}
                          <div className="mt-2 flex gap-1 flex-wrap">
                             {(Array.isArray(doc.sharedWith) ? doc.sharedWith : []).map(userId => {
                                const sharedUser = users.find(u => u.id === userId);
                                return (
                                   <span key={userId} className="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded" title={sharedUser?.name}>
                                      {sharedUser?.name?.split(' ')[0] || 'Unknown'}
                                   </span>
                                );
                             })}
                          </div>
                          {doc.comments && doc.comments.length > 0 && (
                            <div className="mt-2 text-xs text-blue-600 font-medium">
                              {doc.comments.length} {doc.comments.length === 1 ? 'comment' : 'comments'}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  }
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileIcon className="w-16 h-16 text-gray-300 mb-3" />
                  <p className="text-gray-400 font-medium">No documents attached to this task</p>
                  <p className="text-sm text-gray-300 mt-1">Upload documents and attach them to this task</p>
                </div>
              )}
            </div>

            {canEditProject && !isEditingFrozen && (
              <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                <button 
                  onClick={() => {
                    setIsTaskDocModalOpen(false);
                    setIsDocModalOpen(true);
                    setNewDoc({...newDoc, attachToTaskId: editingTask.id});
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold text-sm"
                  title="Add documents to task"
                >
                  <Plus className="w-4 h-4" /> Add Documents
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Project Delete Confirmation Modal */}
      {isProjectDeleteConfirmOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-red-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delete Project?</h2>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete the project <span className="font-bold text-gray-900">"{project.name}"</span>? 
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">
                  <span className="font-bold">⚠️ Warning:</span> This project and all associated data (tasks, documents, meetings, financials) will be permanently deleted.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setIsProjectDeleteConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Cancel deletion"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                title="Confirm project deletion"
              >
                <Trash2 className="w-4 h-4" /> Delete Project
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Transaction Delete Confirmation Modal */}
      {isTransactionDeleteConfirmOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-red-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Delete Transaction?</h2>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete this transaction?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">
                  <span className="font-bold">⚠️ Warning:</span> This financial record will be permanently removed from the project ledger.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 rounded-b-xl">
              <button
                onClick={() => {
                  setIsTransactionDeleteConfirmOpen(false);
                  setDeleteConfirmTransactionId(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Cancel deletion"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirmTransactionId) {
                    try {
                      await deleteFinancialRecord(deleteConfirmTransactionId);
                      addNotification('Transaction Deleted', 'The transaction was deleted successfully.', 'success');
                      setIsTransactionDeleteConfirmOpen(false);
                      setDeleteConfirmTransactionId(null);
                    } catch (err) {
                      addNotification('Error', 'Failed to delete transaction.', 'error');
                    }
                  }
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                title="Confirm transaction deletion"
              >
                <Trash2 className="w-4 h-4" /> Delete Transaction
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lead Designer Removal Confirmation Modal */}
      {isLeadDesignerRemovalConfirmOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in border border-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-orange-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Remove Lead Designer?</h2>
                  <p className="text-sm text-gray-600 mt-1">Confirm designer removal from project.</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to remove <span className="font-bold text-gray-900">{getAssigneeName(project.leadDesignerId)}</span> as the Lead Designer for this project?
              </p>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs text-orange-700">
                  <span className="font-bold">Note:</span> This will only unassign them as the Lead Designer. They may still be part of the team if they are in the team members list.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setIsLeadDesignerRemovalConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Cancel removal"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveLeadDesigner}
                className="px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
                title="Confirm removal"
              >
                 Confirm Removal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProjectDetail;
