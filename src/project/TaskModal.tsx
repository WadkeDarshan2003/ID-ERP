import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Task, User, Project, TaskStatus, Role, SubTask, Comment, ProjectDocument } from '../../types';
import { CATEGORY_ORDER } from '../../constants';
import { isTaskFrozen, isTaskBlocked, getBlockingTasks, deriveStatus, formatDateToIndian, formatIndianToISO, formatRelativeTime } from '../../utils/taskUtils';
import { updateTask } from '../../services/projectDetailsService';
import { 
  X, AlertCircle, Ban, Shield, PlayCircle, PauseCircle, History, Link2, Plus, 
  ThumbsUp, ThumbsDown, FileText, ChevronRight, MessageSquare, Send, Trash2, File as FileIcon
} from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Partial<Task>;
  setTask: (task: Partial<Task>) => void;
  onSave: (() => Promise<void>) | (() => void);
  onDelete: () => void;
  users: User[];
  currentTasks: Task[];
  project: Project;
  isAdmin: boolean;
  isClient: boolean;
  isEditingFrozen: boolean;
  showErrors: boolean;
  user: User;
  onOpenDocumentModal: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  task: editingTask,
  setTask: setEditingTask,
  onSave,
  onDelete,
  users,
  currentTasks,
  project,
  isAdmin,
  isClient,
  isEditingFrozen,
  showErrors,
  user,
  onOpenDocumentModal
}) => {
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Scroll to bottom of comments
  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [editingTask.comments, isOpen]);

  if (!isOpen || !editingTask) return null;

  // Ensure approvals object is properly initialized
  const task = {
    ...editingTask,
    approvals: editingTask.approvals || {
      start: { client: { status: 'pending' }, admin: { status: 'pending' } },
      completion: { client: { status: 'pending' }, admin: { status: 'pending' } }
    }
  };

  // Ensure all approval fields exist
  if (!task.approvals.start) {
    task.approvals.start = { client: { status: 'pending' }, admin: { status: 'pending' } };
  }
  if (!task.approvals.completion) {
    task.approvals.completion = { client: { status: 'pending' }, admin: { status: 'pending' } };
  }
  if (!task.approvals.start.client) {
    task.approvals.start.client = { status: 'pending' };
  }
  if (!task.approvals.start.admin) {
    task.approvals.start.admin = { status: 'pending' };
  }
  if (!task.approvals.completion.client) {
    task.approvals.completion.client = { status: 'pending' };
  }
  if (!task.approvals.completion.admin) {
    task.approvals.completion.admin = { status: 'pending' };
  }

  // Use task.approvals for display (with proper initialization)
  const displayApprovals = task.approvals;

  const getInputClass = (isError: boolean, disabled: boolean = false) => `
    w-full p-2 border rounded-lg transition-all focus:outline-none placeholder-gray-400 text-xl md:text-sm

    ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-900'}
    ${isError ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

  const getAssigneeName = (id: string, storedName?: string) => {
    if (!id) return 'Unknown User';
    if (id === user.id) return user.name || 'You';
    if (storedName && storedName.trim()) return storedName;
    const foundUser = users.find(u => u.id === id);
    if (foundUser?.name) return foundUser.name;
    if (id === project.leadDesignerId) return users.find(u => u.id === id)?.name || 'Designer';
    if (id === project.clientId) return users.find(u => u.id === id)?.name || 'Client';
    return 'Unknown User';
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

  const handleApproval = async (stage: 'start' | 'completion', action: 'approve' | 'reject' | 'revoke', role?: 'client' | 'admin' | 'designer') => {
    if (!editingTask.approvals) return;
    
    // Deep copy the approvals object
    const newApprovals = JSON.parse(JSON.stringify(editingTask.approvals));
    const targetRole = role || (isClient ? 'client' : 'admin');
    
    if (process.env.NODE_ENV !== 'production') console.log(`🔄 Approval action: ${action} for ${stage}/${targetRole}`, newApprovals[stage][targetRole]);
    
    // Ensure stage and role exist
    if (!newApprovals[stage]) {
      newApprovals[stage] = {};
    }
    if (!newApprovals[stage][targetRole]) {
      newApprovals[stage][targetRole] = { status: 'pending' };
    }
    
    if (action === 'revoke') {
        newApprovals[stage][targetRole].status = 'pending';
        if (process.env.NODE_ENV !== 'production') console.log(`🔄 Revoke action - setting status to 'pending'`);
    } else {
        newApprovals[stage][targetRole].status = action === 'approve' ? 'approved' : 'rejected';
    }
    
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Updated approval state:`, newApprovals[stage][targetRole]);
    
    // Auto-update status based on approvals
    let newStatus = editingTask.status;
    
    const startClient = newApprovals.start?.client?.status === 'approved';
    const startAdmin = newApprovals.start?.admin?.status === 'approved';
    const completionClient = newApprovals.completion?.client?.status === 'approved';
    const completionAdmin = newApprovals.completion?.admin?.status === 'approved';
    
    // If ALL 4 are approved, move to DONE
    if (startClient && startAdmin && completionClient && completionAdmin) {
        newStatus = TaskStatus.DONE;
    }
    // If currently DONE but ANY is missing, move back to REVIEW
    else if (editingTask.status === TaskStatus.DONE) {
         newStatus = TaskStatus.REVIEW;
    }

    const updatedTask = { ...editingTask, approvals: newApprovals, status: newStatus };
    if (process.env.NODE_ENV !== 'production') console.log(`📝 Setting editing task with new approvals`, updatedTask.approvals);
    if (process.env.NODE_ENV !== 'production') console.log(`📝 Current editing task approvals before state update:`, editingTask.approvals);
    if (process.env.NODE_ENV !== 'production') console.log(`📝 New approvals after state update will be:`, newApprovals);
    setEditingTask(updatedTask);
    if (process.env.NODE_ENV !== 'production') console.log(`📝 State updated, component should re-render`);
    
    // Auto-save approval to database
    if (editingTask.id) {
        try {
            if (process.env.NODE_ENV !== 'production') console.log(`💾 Saving to Firebase...`);
            await updateTask(project.id, editingTask.id, { 
                approvals: newApprovals, 
                status: newStatus 
            });
            if (process.env.NODE_ENV !== 'production') console.log(`✅ Firebase save complete`);
        } catch (error) {
            console.error('Error saving approval:', error);
        }
    }
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    const comment: Comment = {
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name || 'Unknown',
        text: newComment,
        timestamp: new Date().toISOString()
    };
    
    setEditingTask({
        ...editingTask,
        comments: [...(editingTask.comments || []), comment]
    });
    setNewComment('');
  };

  const getValidDocumentCount = (documentIds?: string[]): number => {
    // This is a simplified check since we don't have realTimeDocuments here easily without passing them
    // But for UI count it's okay to just check length if we assume integrity
    return documentIds?.length || 0;
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 md:p-4">
       <div className="bg-white rounded-xl shadow-xl w-full max-w-full md:max-w-4xl h-[95vh] md:h-[90vh] flex flex-col animate-fade-in overflow-hidden">
          {/* Modal Header */}
           <div className="p-3 md:p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-2xl md:text-base font-bold text-gray-900 truncate">{editingTask.id ? 'Edit Task Details' : 'Create New Task'}</h3>
              {editingTask.id && <span className="text-sm md:text-[10px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded flex-shrink-0">{editingTask.id}</span>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Close task modal"><X className="w-5 h-5 md:w-4 md:h-4"/></button>
          </div>

          {/* Dependency Warning */}
           {isTaskBlocked(editingTask, currentTasks) && (
             <div className="bg-red-50 border-b border-red-100 px-3 md:px-4 py-2 flex items-center gap-2 text-red-700 text-base md:text-xs flex-shrink-0">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">Dependency Locked:</span>
                <span className="truncate">{getBlockingTasks(editingTask, currentTasks).map(t => t.title).join(', ')}</span>
             </div>
          )}

          {/* Frozen Warning */}
                  {isEditingFrozen && (
              <div className="bg-gray-800 text-white px-3 md:px-4 py-2 md:py-3 flex items-center justify-between shadow-md text-base md:text-sm flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Ban className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span className="font-bold uppercase tracking-wide">Task Frozen: {editingTask.status}</span>
                  </div>
                  <span className="text-base md:text-sm opacity-70">Disabled</span>
              </div>
          )}

          {/* Modal Body: Responsive Layout (Stacked on mobile, Split on desktop) */}
          <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${isEditingFrozen ? 'pointer-events-none opacity-80 bg-gray-50' : ''}`}>
             
             {/* LEFT: Task Info Form */}
             <div className="w-full md:w-1/2 p-3 md:p-4 overflow-y-auto md:border-r border-gray-100 bg-white">
                <div className="space-y-4">
                   {/* ADMIN ACTIONS */}
                   {isAdmin && (
                         <div className="bg-gray-900 p-4 md:p-3 rounded-lg pointer-events-auto">
                           <p className="text-xl md:text-sm font-bold text-gray-400 uppercase mb-2 flex items-center gap-1"><Shield className="w-4 h-4 md:w-3 md:h-3"/> Admin Actions</p>
                           <div className="flex gap-2">
                               {editingTask.status === TaskStatus.ON_HOLD ? (
                                  <button 
                                       onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, TaskStatus.IN_PROGRESS)})}
                                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xl md:text-sm font-bold py-2 rounded flex items-center justify-center gap-1"
                                   >
                                      <PlayCircle className="w-4 h-4 md:w-3 md:h-3"/> Resume Task
                                   </button>
                               ) : (
                                  <button 
                                       onClick={() => setEditingTask({...editingTask, status: TaskStatus.ON_HOLD})}
                                      className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xl md:text-sm font-bold py-2 rounded flex items-center justify-center gap-1"
                                   >
                                      <PauseCircle className="w-4 h-4 md:w-3 md:h-3"/> Put On Hold
                                   </button>
                               )}

                               {editingTask.status === TaskStatus.ABORTED ? (
                                  <button 
                                       onClick={() => setEditingTask({...editingTask, status: deriveStatus(editingTask, TaskStatus.IN_PROGRESS)})}
                                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xl md:text-sm font-bold py-2 rounded flex items-center justify-center gap-1"
                                   >
                                      <History className="w-4 h-4 md:w-3 md:h-3"/> Restore
                                   </button>
                               ) : (
                                  <button 
                                       onClick={() => setEditingTask({...editingTask, status: TaskStatus.ABORTED})}
                                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xl md:text-sm font-bold py-2 rounded flex items-center justify-center gap-1"
                                   >
                                      <Ban className="w-4 h-4 md:w-3 md:h-3"/> Abort Task
                                   </button>
                               )}
                           </div>
                       </div>
                   )}

                   <div>
                     <label className="text-xl md:text-sm font-bold text-gray-500 uppercase">Title <span className="text-red-500">*</span></label>
                      {isAdmin || !isEditingFrozen ? (
                        <input 
                          id={`task-title-${project.id}-${editingTask.id || 'new'}`}
                          aria-label="Task title"
                          type="text" 
                          className={`${getInputClass(showErrors && !editingTask.title, isEditingFrozen)} font-semibold mt-1`}
                          placeholder="Task title"
                          value={editingTask.title || ''} onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                          disabled={isEditingFrozen}
                        />
                      ) : (
                        <p className="font-bold text-gray-800 mt-1">{editingTask.title}</p>
                      )}
                   </div>

                   <div>
                     <label className="text-xl md:text-sm font-bold text-gray-500 uppercase">Category</label>
                      {isAdmin || !isEditingFrozen ? (
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
                         <span className="block mt-1 text-base md:text-sm bg-gray-100 w-fit px-2 py-1 rounded text-gray-800">{editingTask.category || 'General'}</span>
                      )}
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                       <div>
                        <label htmlFor={`task-start-${project.id}-${editingTask.id || 'new'}`} className="text-xl md:text-sm font-bold text-gray-500 uppercase">Start Date <span className="text-red-500">*</span></label>
                        {isAdmin || !isEditingFrozen ? (
                          <input 
                            id={`task-start-${project.id}-${editingTask.id || 'new'}`}
                            type="date" 
                            placeholder="Select start date"
                            aria-label="Task start date"
                            className={`${getInputClass(showErrors && !editingTask.startDate, isEditingFrozen)} mt-1`} 
                            value={editingTask.startDate || ''} 
                            onChange={e => setEditingTask({...editingTask, startDate: e.target.value})} 
                            disabled={isEditingFrozen}
                          />
                        ) : <p className="text-base md:text-sm mt-1 text-gray-800">{formatDateToIndian(editingTask.startDate)}</p>}
                       </div>
                       <div>
                        <label htmlFor={`task-due-${project.id}-${editingTask.id || 'new'}`} className="text-xl md:text-sm font-bold text-gray-500 uppercase">Due Date <span className="text-red-500">*</span></label>
                        {isAdmin || !isEditingFrozen ? (
                          <input 
                            id={`task-due-${project.id}-${editingTask.id || 'new'}`}
                            type="date" 
                            placeholder="Select due date"
                            aria-label="Task due date"
                            className={`${getInputClass(showErrors && !editingTask.dueDate, isEditingFrozen)} mt-1`} 
                            value={editingTask.dueDate || ''} 
                            onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} 
                            disabled={isEditingFrozen}
                          />
                        ) : <p className="text-base md:text-sm mt-1 text-gray-800">{formatDateToIndian(editingTask.dueDate)}</p>}
                       </div>
                   </div>

                    {/* Dependencies Selection */}
                    <div>
                         <div className="flex items-center gap-2 mb-1">
                         <Link2 className="w-4 h-4 md:w-3 md:h-3 text-gray-400" />
                         <label className="text-base md:text-sm font-bold text-gray-500 uppercase">Dependencies</label>
                       </div>
                      {isAdmin || !isEditingFrozen ? (
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
                                  <span className="text-base md:text-sm text-gray-700 truncate flex-1">{t.title}</span>
                                  <span className="text-sm md:text-sm text-gray-400 whitespace-nowrap">({formatDateToIndian(t.startDate)} → {formatDateToIndian(t.dueDate)})</span>
                                </label>
                              ))
                          ) : <p className="text-base md:text-sm text-gray-400 italic">No other tasks available</p>}
                        </div>
                      ) : (
                        <div className="mt-1 text-base md:text-sm text-gray-600">
                            {(editingTask.dependencies || []).length > 0 ? (
                                currentTasks.filter(t => (editingTask.dependencies || []).includes(t.id)).map(t => (
                                    <div key={t.id} className="flex items-center gap-1 text-base md:text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1 mb-1">
                                        <Link2 className="w-3 h-3 text-gray-400"/> 
                                        <span className="flex-1">{t.title}</span>
                                        <span className="text-gray-500 whitespace-nowrap ml-1">({formatDateToIndian(t.startDate)} → {formatDateToIndian(t.dueDate)})</span>
                                        {t.status !== TaskStatus.DONE && <span className="text-red-500 font-bold ml-1">(Pending)</span>}
                                    </div>
                                ))
                            ) : <span className="text-gray-400 italic text-base md:text-sm">No dependencies</span>}
                         </div>
                      )}
                    </div>

                   <div>
                 <label className="text-xl md:text-sm font-bold text-gray-500 uppercase">Assignee & Priority</label>
                      <div className="flex gap-4 mt-1">
                         {isAdmin || !isEditingFrozen ? (
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
                         ) : <p className="flex-1 text-base bg-gray-50 p-2 rounded text-gray-800">{getAssigneeName(editingTask.assigneeId || '')}</p>}

                         {isAdmin || !isEditingFrozen ? (
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
                         ) : <span className="p-2 border rounded bg-gray-50 uppercase text-xl md:text-sm font-bold flex items-center text-gray-800">{editingTask.priority}</span>}
                      </div>
                   </div>
                   
                   {/* Status Display */}
                   <div>
                     <label className="text-xl md:text-sm font-bold text-gray-500 uppercase">Current Status</label>
                      <div className={`mt-1 w-full p-2 border rounded bg-gray-50 text-gray-700 font-bold flex justify-between items-center flex-wrap gap-2 ${isEditingFrozen ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                          <span>{editingTask.status || TaskStatus.TODO}</span>
                          {editingTask.status === TaskStatus.REVIEW && (
                            <div className="flex gap-1 flex-wrap">
                              {editingTask.approvals?.completion?.client?.status === 'approved' && editingTask.approvals?.completion?.admin?.status === 'approved' && (
                                <span className="text-base md:text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded font-normal">Approved by Both</span>
                              )}
                              {editingTask.approvals?.completion?.client?.status === 'approved' && !editingTask.approvals?.completion?.admin?.status && (
                                <span className="text-base md:text-sm bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-normal">Waiting for Admin Approval</span>
                              )}
                              {editingTask.approvals?.completion?.admin?.status === 'approved' && !editingTask.approvals?.completion?.client?.status && (
                                <span className="text-base md:text-sm bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-normal">Waiting for Client Approval</span>
                              )}
                              {!editingTask.approvals?.completion?.client?.status && !editingTask.approvals?.completion?.admin?.status && (
                                <span className="text-sm md:text-sm bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-normal">Under Review</span>
                              )}
                              {editingTask.approvals?.completion?.client?.status === 'rejected' && (
                                <span className="text-[11px] md:text-sm bg-red-100 text-red-700 px-2 py-0.5 rounded font-normal">Rejected by Client</span>
                              )}
                              {editingTask.approvals?.completion?.designer?.status === 'rejected' && (
                                <span className="text-[11px] md:text-sm bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-normal">Rejected by Designer</span>
                              )}
                            </div>
                          )}
                            <span className="text-[11px] font-normal text-gray-400 italic">
                              {isEditingFrozen ? 'Frozen by Admin' : 'Auto-updated via progress'}
                          </span>
                      </div>
                   </div>

                   {/* Subtasks */}
                   <div className="pt-4 border-t border-gray-100 flex flex-col h-64">
                     <label className="text-xl md:text-sm font-bold text-gray-700 uppercase mb-2 block">Checklist</label>
                     <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                        {editingTask.subtasks?.map((st, idx) => (
                          <div key={st.id} className="flex items-center gap-2">
                             <input 
                               type="checkbox" 
                               checked={st.isCompleted} 
                               title="Toggle subtask completion"
                               aria-label="Toggle subtask completion"
                               disabled={(!isAdmin && user.id !== editingTask.assigneeId) || isTaskBlocked(editingTask, currentTasks) || isEditingFrozen}
                               onChange={() => {
                                  const newSubs = [...(editingTask.subtasks || [])];
                                  newSubs[idx].isCompleted = !newSubs[idx].isCompleted;
                                  setEditingTask({...editingTask, subtasks: newSubs});
                               }}
                             />
                              {isAdmin || !isEditingFrozen ? (
                               <input 
                                 type="text" 
                                 aria-label={`Subtask ${idx + 1} title`}
                                 value={st.title}
                                 placeholder="Subtask title"
                                 disabled={isEditingFrozen}
                                 onChange={(e) => {
                                   const newSubs = [...(editingTask.subtasks || [])];
                                   newSubs[idx].title = e.target.value;
                                   setEditingTask({...editingTask, subtasks: newSubs});
                                 }}
                                 className="flex-1 p-1 border-b border-transparent focus:border-gray-300 outline-none text-xl md:text-sm bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                                />
                              ) : <span className={`flex-1 text-base md:text-sm ${st.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>{st.title}</span>}
                             
                             {(isAdmin || !isEditingFrozen) && (
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
                        {(!editingTask.subtasks || editingTask.subtasks.length === 0) && <p className="text-2xl md:text-base text-gray-400 italic">No checklist items</p>}
                     </div>
                     {(isAdmin || !isEditingFrozen) && (
                      <button 
                         onClick={() => {
                           const newSub: SubTask = { id: Math.random().toString(), title: 'New Item', isCompleted: false };
                           setEditingTask({ ...editingTask, subtasks: [...(editingTask.subtasks || []), newSub] });
                         }}
                         className="text-2xl md:text-base text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-2 pt-2 border-t border-gray-100"
                        ><Plus className="w-5 h-5 md:w-3 md:h-3"/> Add</button>
                     )}
                   </div>
                </div>
             </div>

             {/* RIGHT: Approvals & Comments */}
             <div className="w-full md:w-1/2 flex flex-col bg-gray-50/50 md:border-l border-t md:border-t-0 border-gray-100 mt-4 md:mt-0">
                {/* Approvals Section */}
                {editingTask.approvals && (
                  <div className="p-3 md:p-4 border-b border-gray-200 bg-white">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-gray-500" />
                        <h4 className="text-xl md:text-sm font-bold text-gray-700 uppercase">Approvals</h4>
                      </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       {/* Start Approval */}
                       <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-xl md:text-sm font-bold text-gray-500 mb-2">1. Start Approval</p>
                          <div className="space-y-2">
                             {/* Client Vote */}
                             <div className="flex justify-between items-center">
                                <span className="text-xl md:text-sm text-gray-600">Client</span>
                                {editingTask.approvals?.start?.client?.status === 'pending' ? (
                                  isClient && !isEditingFrozen ? (
                                    <div className="flex gap-1 pointer-events-auto">
                                      <button onClick={() => handleApproval('start', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve start"><ThumbsUp className="w-3 h-3"/></button>
                                      <button onClick={() => handleApproval('start', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject start"><ThumbsDown className="w-3 h-3"/></button>
                                    </div>
                                  ) : <span className="text-xl md:text-sm text-gray-400 italic">Pending</span>
                                ) : (
                                   <div className="flex items-center gap-1">
                                     <span className={`text-xl md:text-sm font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.start?.client?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {editingTask.approvals?.start?.client?.status}
                                     </span>
                                     {isAdmin && !isEditingFrozen && (
                                       <>
                                         <button onClick={() => handleApproval('start', 'approve', 'client')} className="p-0.5 hover:bg-green-100 text-green-600 rounded text-[10px]" title="Approve">✓</button>
                                         <button onClick={() => handleApproval('start', 'reject', 'client')} className="p-0.5 hover:bg-red-100 text-red-600 rounded text-[10px]" title="Reject">✕</button>
                                       </>
                                     )}
                                   </div>
                                )}
                             </div>
                             {/* Admin Vote */}
                             <div className="flex justify-between items-center">
                                <span className="text-xl md:text-sm text-gray-600">Admin</span>
                                {editingTask.approvals?.start?.admin?.status === 'pending' ? (
                                  isAdmin && !isEditingFrozen ? (
                                    <div className="flex gap-1 pointer-events-auto">
                                      <button onClick={() => handleApproval('start', 'approve', 'admin')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve start"><ThumbsUp className="w-3 h-3"/></button>
                                      <button onClick={() => handleApproval('start', 'reject', 'admin')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject start"><ThumbsDown className="w-3 h-3"/></button>
                                    </div>
                                  ) : <span className="text-xl md:text-sm text-gray-400 italic">Pending</span>
                                ) : (
                                   <div className="flex items-center gap-1">
                                     <span className={`text-xl md:text-sm font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.start?.admin?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {editingTask.approvals?.start?.admin?.status}
                                     </span>
                                     {isAdmin && !isEditingFrozen && (
                                       <>
                                         <button onClick={() => handleApproval('start', 'approve', 'admin')} className="p-0.5 hover:bg-green-100 text-green-600 rounded text-[10px]" title="Approve">✓</button>
                                         <button onClick={() => handleApproval('start', 'reject', 'admin')} className="p-0.5 hover:bg-red-100 text-red-600 rounded text-[10px]" title="Reject">✕</button>
                                         <button onClick={() => handleApproval('start', 'revoke', 'admin')} className="p-0.5 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-bold" title="Remove approval">✗</button>
                                       </>
                                     )}
                                   </div>
                                )}
                             </div>
                          </div>
                       </div>

                       {/* End Approval */}
                       <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-xl md:text-sm font-bold text-gray-500 mb-2">2. Completion Approval</p>
                          <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <span className="text-xl md:text-sm text-gray-600">Client</span>
                                {editingTask.approvals?.completion?.client?.status === 'pending' ? (
                                  isClient && !isEditingFrozen ? (
                                    <div className="flex gap-1 pointer-events-auto">
                                      <button onClick={() => handleApproval('completion', 'approve')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve completion"><ThumbsUp className="w-3 h-3"/></button>
                                      <button onClick={() => handleApproval('completion', 'reject')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject completion"><ThumbsDown className="w-3 h-3"/></button>
                                    </div>
                                  ) : <span className="text-xl md:text-sm text-gray-400 italic">Pending</span>
                                ) : (
                                   <div className="flex items-center gap-1">
                                     <span className={`text-xl md:text-sm font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.completion?.client?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {editingTask.approvals?.completion?.client?.status}
                                     </span>
                                     {isAdmin && !isEditingFrozen && (
                                       <>
                                         <button onClick={() => handleApproval('completion', 'approve', 'client')} className="p-0.5 hover:bg-green-100 text-green-600 rounded text-[10px]" title="Approve">✓</button>
                                         <button onClick={() => handleApproval('completion', 'reject', 'client')} className="p-0.5 hover:bg-red-100 text-red-600 rounded text-[10px]" title="Reject">✕</button>
                                       </>
                                     )}
                                   </div>
                                )}
                             </div>
                             <div className="flex justify-between items-center">
                                <span className="text-xl md:text-sm text-gray-600">Admin</span>
                                {editingTask.approvals?.completion?.admin?.status === 'pending' ? (
                                  isAdmin && !isEditingFrozen ? (
                                    <div className="flex gap-1 pointer-events-auto">
                                      <button onClick={() => handleApproval('completion', 'approve', 'admin')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Approve completion"><ThumbsUp className="w-3 h-3"/></button>
                                      <button onClick={() => handleApproval('completion', 'reject', 'admin')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Reject completion"><ThumbsDown className="w-3 h-3"/></button>
                                    </div>
                                  ) : <span className="text-xl md:text-sm text-gray-400 italic">Pending</span>
                                ) : (
                                   <div className="flex items-center gap-1">
                                     <span className={`text-xl md:text-sm font-bold px-1.5 py-0.5 rounded capitalize ${editingTask.approvals?.completion?.admin?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {editingTask.approvals?.completion?.admin?.status}
                                     </span>
                                     {isAdmin && !isEditingFrozen && (
                                       <>
                                         <button onClick={() => handleApproval('completion', 'approve', 'admin')} className="p-0.5 hover:bg-green-100 text-green-600 rounded text-[10px]" title="Approve">✓</button>
                                         <button onClick={() => handleApproval('completion', 'reject', 'admin')} className="p-0.5 hover:bg-red-100 text-red-600 rounded text-[10px]" title="Reject">✕</button>
                                         <button onClick={() => handleApproval('completion', 'revoke', 'admin')} className="p-0.5 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-bold" title="Remove approval">✗</button>
                                       </>
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
                <div className="p-3 md:p-4 border-b border-gray-200 bg-white">
                   <button 
                     onClick={onOpenDocumentModal}
                     className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors group"
                     title="View task documents"
                   >
                      <div className="flex items-center gap-2">
                         <FileIcon className="w-4 h-4 text-blue-600" />
                         <span className="text-xl md:text-sm font-bold text-blue-900 uppercase">Task Documents</span>
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
                <div className="flex-1 flex flex-col p-3 md:p-4 overflow-hidden">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <h4 className="text-base md:text-sm font-bold text-gray-700 uppercase">Comments</h4>
                    </div>
                   
                     <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                     {editingTask.comments?.length === 0 && <p className="text-center text-xl md:text-sm text-gray-400 py-4">No comments yet. Start the discussion!</p>}
                      {editingTask.comments?.map(comment => {
                         const isMe = comment.userId === user.id;
                         return (
                           <div key={comment.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                              <div className={`p-2 rounded-lg max-w-[85%] text-xl md:text-sm ${isMe ? 'bg-blue-100 text-blue-900' : 'bg-white border border-gray-200 text-gray-700'}`}>
                                <p className="text-sm font-bold opacity-70 mb-1">{getAssigneeName(comment.userId, comment.userName)}</p>
                                <p>{comment.text}</p>
                                <p className="text-[11px] opacity-60 mt-1 text-right">{formatRelativeTime(comment.timestamp)}</p>
                              </div>
                           </div>
                         );
                      })}
                      <div ref={commentsEndRef} />
                   </div>

                      <div className={`relative ${isEditingFrozen ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input 
                        type="text" 
                        className="w-full p-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl md:text-sm bg-white text-gray-900"
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
          <div className="p-3 md:p-4 border-t border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-white gap-3 md:gap-0 flex-shrink-0">
            <div>
              {/* Delete button for admins - only show for existing tasks */}
              {isAdmin && editingTask.id && (
                <button 
                  onClick={onDelete}
                  className="px-3 md:px-4 py-2 text-base md:text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                  title="Delete this task permanently"
                >
                  <Trash2 className="w-4 h-4 md:w-3 md:h-3" /> Delete Task
                </button>
              )}
            </div>
              <div className="flex gap-3 w-full md:w-auto">
              <button onClick={onClose} className="flex-1 md:flex-initial px-3 md:px-4 py-2 text-base md:text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg" title="Cancel">Cancel</button>
              {/* Only Show Save if NOT frozen or if ADMIN */}
              {(!isEditingFrozen || isAdmin) && (
                <button
                  onClick={async () => {
                    if (isSaving) return;
                    try {
                      setIsSaving(true);
                      await Promise.resolve(onSave());
                    } catch (err) {
                      console.error('Error in TaskModal onSave:', err);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving || isEditingFrozen}
                  className={`flex-1 md:flex-initial px-4 md:px-6 py-2 text-base md:text-sm font-bold bg-gray-900 text-white rounded-lg shadow-sm ${isSaving || isEditingFrozen ? 'opacity-60 cursor-not-allowed hover:bg-gray-900' : 'hover:bg-gray-800'}`}
                  title="Save task"
                >
                      {isSaving ? 'Saving...' : (editingTask.id ? 'Save Changes' : 'Create Task')}
                  </button>
              )}
            </div>
          </div>
       </div>
    </div>,
    document.body
  );
};

export default TaskModal;