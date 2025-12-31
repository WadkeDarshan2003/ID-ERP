import React, { useState } from 'react';
import { Task, TaskStatus, User, Role } from '../types';
import { Calendar, Lock, CheckCircle, Clock, Ban, PauseCircle, ArrowRight, PlayCircle } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { AvatarCircle } from '../utils/avatarUtils';

import { calculateTaskProgress, formatDateToIndian } from '../utils/taskUtils';

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTaskPriority?: (taskId: string, newPriority: 'low' | 'medium' | 'high') => void;
  onEditTask: (task: Task) => void;
  onCompleteTask: (task: Task) => void;
}

// Columns are now Task Statuses
const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: TaskStatus.TODO, label: 'Scheduled Tasks', color: 'border-t-4 border-gray-400' },
  { id: TaskStatus.IN_PROGRESS, label: 'In Process', color: 'border-t-4 border-blue-500' },
  { id: TaskStatus.REVIEW, label: 'In Review', color: 'border-t-4 border-purple-500' },
  { id: TaskStatus.ON_HOLD, label: 'On Hold', color: 'border-t-4 border-yellow-500' },
  { id: TaskStatus.DONE, label: 'Completed', color: 'border-t-4 border-green-500' },
];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, onUpdateTaskStatus, onUpdateTaskPriority, onEditTask, onCompleteTask }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const isTaskFrozen = (status: TaskStatus) => {
    return status === TaskStatus.ABORTED || status === TaskStatus.ON_HOLD;
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task && isTaskFrozen(task.status)) {
        e.preventDefault();
        return;
    }
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Dropping now updates STATUS
  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    if (!draggedTaskId || !onUpdateTaskStatus) return;

    onUpdateTaskStatus(draggedTaskId, status);
    setDraggedTaskId(null);
  };

  // Quick Action: Advance Status
  const handleQuickAction = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    
    if (isTaskFrozen(task.status)) return;

    if (isTaskBlocked(task) && task.status !== TaskStatus.DONE) {
      addNotification("Locked", "Cannot update task. Dependencies not met.", "error");
      return;
    }
    
    // Flow: TODO -> IN_PROGRESS -> REVIEW -> DONE
    let nextStatus = task.status;
    if (task.status === TaskStatus.TODO) nextStatus = TaskStatus.IN_PROGRESS;
    else if (task.status === TaskStatus.IN_PROGRESS) nextStatus = TaskStatus.REVIEW;
    else if (task.status === TaskStatus.REVIEW) nextStatus = TaskStatus.DONE;

    onUpdateTaskStatus(task.id, nextStatus);
  };

  const getAssigneeAvatar = (id: string) => users.find(u => u.id === id)?.avatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="12" fill="%23e5e7eb"/%3E%3Ctext x="12" y="13" text-anchor="middle" font-size="10" fill="%239ca3af" dominant-baseline="middle"%3E?%3C/text%3E%3C/svg%3E';
  const getAssigneeName = (id: string) => users.find(u => u.id === id)?.name || 'Unassigned';

  const getAvatarComponent = (userId: string) => {
    const userObj = users.find(u => u.id === userId);
    if (userObj) {
      return <AvatarCircle avatar={userObj.avatar} name={userObj.name} size="sm" role={String(userObj.role).toLowerCase()} />;
    }
    return <AvatarCircle avatar="" name="Unassigned" size="sm" />;
  };

  const isTaskBlocked = (task: Task) => {
      if (task.status === TaskStatus.DONE) return false;
      if (!task.dependencies || task.dependencies.length === 0) return false;
      const parentTasks = tasks.filter(t => task.dependencies?.includes(t.id));
      return parentTasks.some(t => t.status !== TaskStatus.DONE);
  };

  // Replaced local getTaskProgress with imported utility
  // const getTaskProgress = (task: Task) => { ... }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
        case TaskStatus.TODO: return 'bg-gray-100 text-gray-600';
        case TaskStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-600';
        case TaskStatus.REVIEW: return 'bg-purple-100 text-purple-600';
        case TaskStatus.DONE: return 'bg-green-100 text-green-600';
        case TaskStatus.OVERDUE: return 'bg-red-100 text-red-600';
        case TaskStatus.ABORTED: return 'bg-black text-white';
        case TaskStatus.ON_HOLD: return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100';
    }
  };

  // Topological Sort / Dependency Sort within a Column
  const sortTasksByDependency = (taskList: Task[]) => {
      // Logic: If A depends on B, B comes first.
      return taskList.sort((a, b) => {
          // Check if A depends on B
          if (a.dependencies?.includes(b.id)) return 1; // A after B
          // Check if B depends on A
          if (b.dependencies?.includes(a.id)) return -1; // B after A
          
          // Secondary sort: Due Date
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  };

  return (
    <div className="flex h-full overflow-x-auto gap-4 p-3 pb-6 items-start">
      {COLUMNS.map(column => {
        // Filter by Status - For IN_PROGRESS column, include IN_PROGRESS, OVERDUE, and ABORTED tasks
        let rawTasks: Task[];
        if (column.id === TaskStatus.IN_PROGRESS) {
          rawTasks = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.OVERDUE || t.status === TaskStatus.ABORTED);
        } else {
          rawTasks = tasks.filter(t => t.status === column.id);
        }
        const columnTasks = sortTasksByDependency(rawTasks);

        return (
          <div 
            key={column.id} 
            className={`flex-shrink-0 w-80 bg-gray-50 rounded-lg p-4 flex flex-col h-full max-h-[calc(100vh-250px)] border border-gray-200 ${column.color}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="flex justify-between items-center mb-3 px-1">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                {column.label}
                <span className="bg-white border border-gray-200 text-gray-600 text-xs px-2.5 py-0.5 rounded-full">{columnTasks.length}</span>
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {columnTasks.map(task => {
                const blocked = isTaskBlocked(task) && task.status !== TaskStatus.DONE;
                const frozen = isTaskFrozen(task.status);
                const progress = calculateTaskProgress(task);
                const isMyTask = user?.id === task.assigneeId;
                
                return (
                  <div 
                    key={task.id}
                    draggable={!blocked && !frozen && user?.role !== Role.CLIENT}
                    onDragStart={(e) => !blocked && !frozen && user?.role !== Role.CLIENT && handleDragStart(e, task.id)}
                    onClick={() => onEditTask(task)}
                    className={`bg-white p-3 md:p-4 rounded-lg shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative
                       ${blocked ? 'border-red-200 bg-red-50/50 cursor-not-allowed opacity-75' : 'border-gray-200'}
                       ${frozen ? 'border-gray-300 bg-gray-100 opacity-80 cursor-not-allowed' : ''}
                       ${task.status === TaskStatus.DONE ? 'opacity-70 bg-gray-50' : ''}
                    `}
                  >
                    {frozen && (
                       <div className="absolute top-1 right-1 text-gray-500" title={`Frozen: ${task.status}`}>
                          {task.status === TaskStatus.ABORTED ? <Ban className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                       </div>
                    )}

                    {/* Category and Status Row */}
                    <div className="flex justify-between items-center gap-1 mb-2">
                      <div className="flex items-center gap-0.5">
                        {blocked && (
                          <span title="Locked by dependencies" className="flex items-center">
                            <Lock className="w-3 h-3 text-red-400 flex-shrink-0" />
                          </span>
                        )}
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 flex-shrink-0">{task.category}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0 ${getStatusColor(task.status)}`}>
                         {task.status}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-start gap-0.5 mb-2">
                        <h4 className={`font-bold text-sm group-hover:text-blue-600 transition-colors line-clamp-2 ${blocked || frozen ? 'text-gray-500' : 'text-gray-900'}`}>
                            {task.title}
                        </h4>
                        
                        {/* Quick Action Button */}
                        {((isMyTask || user?.role === Role.ADMIN) && !blocked && !frozen && task.status !== TaskStatus.DONE && user?.role !== Role.CLIENT) && (
                           <div className="flex items-center">
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 onCompleteTask(task);
                               }}
                               className="text-gray-300 hover:text-green-500 transition-colors p-0.5 flex-shrink-0 mr-1"
                               title="Mark as Done"
                             >
                               <CheckCircle className="w-4 h-4 text-green-500" />
                             </button>
                             
                             <button 
                               onClick={(e) => handleQuickAction(e, task)}
                               className="text-gray-300 hover:text-blue-500 transition-colors p-0.5 flex-shrink-0"
                               title="Advance Status"
                             >
                               <ArrowRight className="w-4 h-4" />
                             </button>
                           </div>
                        )}
                        {/* Standard Action for non-WIP tasks - REMOVED as we now show Mark as Done for all */}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <span className="text-gray-400 font-medium">Progress</span>
                      <span className="text-gray-600 font-bold">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                       <div 
                         className={`h-1.5 rounded-full transition-all duration-500 ${task.status === TaskStatus.DONE ? 'bg-green-500' : frozen ? 'bg-gray-400' : 'bg-blue-500'}`} 
                         {...{ style: { width: `${progress}%` } }}
                       />
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                       <div className="flex items-center gap-1">
                          {getAvatarComponent(task.assigneeId)}
                       </div>
                       <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDateToIndian(task.dueDate)}</span>
                       </div>
                    </div>
                  </div>
                );
              })}
              {columnTasks.length === 0 && (
                <div className="h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-sm text-gray-400 italic bg-white">
                   Drop items here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KanbanBoard;