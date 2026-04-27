import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, AlertCircle, CheckCircle2, Shield, FileText, UserCheck } from 'lucide-react';
import { Task, TaskStatus, Role, Project, User, ProjectDocument } from '../types';
import { formatDateToIndian } from '../utils/taskUtils';

interface PendingItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  realTimeTasks: Map<string, Task[]>;
  users: User[];
  currentUser: User;
  onSelectProject?: (project: Project) => void;
  onSelectTask?: (task: Task, project: Project) => void;
}

type PendingItem = 
  | (Task & { itemType: 'task'; projectName: string; projectId: string })
  | (ProjectDocument & { itemType: 'document'; projectName: string; projectId: string });

const PendingItemsModal: React.FC<PendingItemsModalProps> = ({ 
  isOpen, 
  onClose, 
  projects, 
  realTimeTasks,
  users,
  currentUser,
  onSelectProject,
  onSelectTask
}) => {
  if (!isOpen) return null;

  // Get all tasks from visible projects - use real-time tasks
  const allTasks = useMemo(() => {
    const tasks: (Task & { itemType: 'task'; projectName: string; projectId: string })[] = [];
    
    projects.forEach(project => {
      const projectTasks = realTimeTasks.get(project.id) || project.tasks || [];
      projectTasks.forEach(task => {
        tasks.push({
          ...task,
          itemType: 'task',
          projectName: project.name,
          projectId: project.id
        });
      });
    });

    return tasks;
  }, [projects, realTimeTasks]);

  // Get all documents from visible projects
  const allDocuments = useMemo(() => {
    const docs: (ProjectDocument & { itemType: 'document'; projectName: string; projectId: string })[] = [];
    projects.forEach(project => {
      if (project.documents) {
        project.documents.forEach(doc => {
          docs.push({
            ...doc,
            itemType: 'document',
            projectName: project.name,
            projectId: project.id
          });
        });
      }
    });
    return docs;
  }, [projects]);

  // Calculate hours until due date
  const getHoursUntilDue = (dueDate: string): number => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = due.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60));
  };

  // Categorize tasks
  const categorizedTasks = useMemo(() => {
    const urgent: PendingItem[] = [];
    const planned: PendingItem[] = [];
    const completed: PendingItem[] = [];
    const pendingApprovals: PendingItem[] = [];
    const clientSide: PendingItem[] = [];

    // Process Tasks
    allTasks.forEach(task => {
      if (task.status === TaskStatus.DONE) {
        completed.push(task);
        return;
      }

      // Urgent: Overdue or Due within 48 hours
      const hours = getHoursUntilDue(task.dueDate);
      if (task.status === TaskStatus.OVERDUE || (hours <= 48 && hours > -9999)) {
        urgent.push(task);
        return;
      }

      const adminStartApproved = task.approvals?.start?.admin?.status === 'approved';
      const adminCompletionApproved = task.approvals?.completion?.admin?.status === 'approved';
      const clientStartApproved = task.approvals?.start?.client?.status === 'approved';
      const clientCompletionApproved = task.approvals?.completion?.client?.status === 'approved';

      // Pending Approvals (Admin): Check if admin has NOT given both approvals
      if (!adminStartApproved || !adminCompletionApproved) {
        pendingApprovals.push(task);
        return;
      }

      // Client Side: Admin approved but Client pending
      if ((adminStartApproved && !clientStartApproved) || (adminCompletionApproved && !clientCompletionApproved)) {
        clientSide.push(task);
        return;
      }

      // Planned: Everything else (In Progress)
      planned.push(task);
    });

    // Process Documents
    allDocuments.forEach(doc => {
      if (doc.approvalStatus === 'pending') {
        pendingApprovals.push(doc);
      } else if (doc.approvalStatus === 'approved' && doc.clientApprovalStatus === 'pending') {
        clientSide.push(doc);
      }
    });

    return { urgent, planned, completed, pendingApprovals, clientSide };
  }, [allTasks, allDocuments]);

  const ItemCard = ({ item }: { item: PendingItem }) => {
    const project = projects.find(p => p.id === item.projectId);
    
    const handleClick = () => {
      if (project) {
        if (onSelectProject) {
          onSelectProject(project);
        }
        if (item.itemType === 'task' && onSelectTask) {
          onSelectTask(item as Task, project);
        }
        // For documents, we just open the project (maybe could open doc tab if supported)
        onClose();
      }
    };

    if (item.itemType === 'document') {
      const isClientPending = item.approvalStatus === 'approved' && item.clientApprovalStatus === 'pending';
      return (
        <div 
          onClick={handleClick}
          className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-blue-400 transition-all cursor-pointer"
        >
          <div className="flex items-start gap-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <FileText className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
              <p className="text-xs text-gray-500 mt-1">{item.projectName}</p>
              <p className={`text-xs font-medium mt-1 px-2 py-0.5 rounded inline-block ${isClientPending ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                {isClientPending ? 'Client Approval Pending' : 'Waiting for Admin Approval'}
              </p>
            </div>
          </div>
        </div>
      );
    }
    
    // Task Card
    const hoursUntilDue = getHoursUntilDue(item.dueDate);
    const assignee = users.find(u => u.id === item.assigneeId);
    
    const getApprovalStatusLabel = () => {
      const adminStart = item.approvals?.start?.admin?.status;
      const adminCompletion = item.approvals?.completion?.admin?.status;
      const clientStart = item.approvals?.start?.client?.status;
      const clientCompletion = item.approvals?.completion?.client?.status;
      
      // Check if any admin approval is pending
      const adminPending = adminStart !== 'approved' || adminCompletion !== 'approved';
      // Check if any client approval is pending (only after admin approvals)
      const clientPending = adminStart === 'approved' && clientStart !== 'approved' || 
                           adminCompletion === 'approved' && clientCompletion !== 'approved';
      
      if (adminPending) return "Admin Approval Pending";
      if (clientPending) return "Client Approval Pending";
      
      return null;
    };

    const approvalLabel = getApprovalStatusLabel();
    const isClientPending = approvalLabel?.includes('(Client)');
    
    return (
      <div 
        onClick={handleClick}
        className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-blue-400 transition-all cursor-pointer"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
            <p className="text-xs text-gray-500 mt-1">{item.projectName}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
              <Calendar className="w-3 h-3" />
              <span>{formatDateToIndian(item.dueDate)}</span>
            </div>
            {assignee && (
              <p className="text-xs text-gray-500 mt-1">Assigned: {assignee.name}</p>
            )}
            {approvalLabel && (
              <p className={`text-xs font-medium mt-1 px-2 py-0.5 rounded inline-block ${isClientPending ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                {approvalLabel}
              </p>
            )}
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${
            item.status === TaskStatus.IN_PROGRESS 
              ? 'bg-blue-100 text-blue-700' 
              : item.status === TaskStatus.REVIEW
              ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {item.status}
          </span>
        </div>
        {hoursUntilDue > 0 && hoursUntilDue <= 48 && item.status !== TaskStatus.DONE && (
          <div className="mt-2 text-xs text-red-600 font-medium">
            Due in {hoursUntilDue}h
          </div>
        )}
      </div>
    );
  };

  const KanbanColumn = ({ title, items, icon: Icon, color }: { title: string; items: PendingItem[]; icon: any; color: string }) => (
    <div className="flex flex-col flex-1 min-w-[300px] h-full">
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${color}`}>
        <Icon className="w-5 h-5" />
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="ml-auto text-sm font-bold text-gray-600">{items.length}</span>
      </div>
      <div className="space-y-3 overflow-y-auto flex-1 pr-2 min-h-0">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No items</p>
        ) : (
          items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Pending Items</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">View all pending tasks across your projects</p>
        </div>

        {/* Kanban Boards */}
        <div className="flex-1 overflow-x-auto p-6 bg-gray-50">
          <div className="flex gap-6 h-full min-w-max">
            <KanbanColumn 
              title="Urgent (Due within 48hrs)" 
              items={categorizedTasks.urgent}
              icon={AlertCircle}
              color="border-red-500"
            />
            <KanbanColumn 
              title="Planned" 
              items={categorizedTasks.planned}
              icon={Calendar}
              color="border-blue-500"
            />
            <KanbanColumn 
              title="Pending Approvals" 
              items={categorizedTasks.pendingApprovals}
              icon={Shield}
              color="border-purple-500"
            />
            <KanbanColumn 
              title="Client Side" 
              items={categorizedTasks.clientSide}
              icon={UserCheck}
              color="border-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PendingItemsModal;
