import React, { useState } from 'react';
import { Task, TaskStatus, User } from '../types';
import { MoreHorizontal, Calendar, AlertCircle, Lock, CheckCircle, Clock, Ban, PauseCircle } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTaskPriority?: (taskId: string, newPriority: 'low' | 'medium' | 'high') => void;
  onEditTask: (task: Task) => void;
}

// Columns are now Priorities
const COLUMNS: { id: 'high' | 'medium' | 'low'; label: string; color: string }[] = [
  { id: 'high', label: 'High Priority', color: 'border-t-4 border-red-500' },
  { id: 'medium', label: 'Medium Priority', color: 'border-t-4 border-yellow-500' },
  { id: 'low', label: 'Low Priority', color: 'border-t-4 border-blue-500' },
];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, onUpdateTaskStatus, onUpdateTaskPriority, onEditTask }) => {
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

  // Dropping now updates PRIORITY
  const handleDrop = (e: React.DragEvent, priority: 'high' | 'medium' | 'low') => {
    e.preventDefault();
    if (!draggedTaskId || !onUpdateTaskPriority) return;

    // We allow changing priority freely without dependency checks (admin/designer discretion)
    // Dependency checks are for Status changes, not Priority sorting.
    onUpdateTaskPriority(draggedTaskId, priority);
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

  const getAssigneeAvatar = (id: string) => users.find(u => u.id === id)?.avatar || 'https://via.placeholder.com/30';
  const getAssigneeName = (id: string) => users.find(u => u.id === id)?.name || 'Unassigned';

  const isTaskBlocked = (task: Task) => {
      if (task.status === TaskStatus.DONE) return false;
      const parentTasks = tasks.filter(t => task.dependencies.includes(t.id));
      return parentTasks.some(t => t.status !== TaskStatus.DONE);
  };

  const getTaskProgress = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) {
      return task.status === TaskStatus.DONE ? 100 : 0;
    }
    const completed = task.subtasks.filter(s => s.isCompleted).length;
    return Math.round((completed / task.subtasks.length) * 100);
  };

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
          if (a.dependencies.includes(b.id)) return 1; // A after B
          // Check if B depends on A
          if (b.dependencies.includes(a.id)) return -1; // B after A
          
          // Secondary sort: Due Date
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  };

  return (
    <div className="flex h-full overflow-x-auto gap-6 p-2 pb-6 items-start">
      {COLUMNS.map(column => {
        // Filter by Priority
        const rawTasks = tasks.filter(t => t.priority === column.id);
        const columnTasks = sortTasksByDependency(rawTasks);

        return (
          <div 
            key={column.id} 
            className={`flex-shrink-0 w-80 bg-gray-50 rounded-xl p-4 flex flex-col h-full max-h-[calc(100vh-250px)] border border-gray-200 ${column.color}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="flex justify-between items-center mb-4 px-1">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                {column.label}
                <span className="bg-white border border-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{columnTasks.length}</span>
              </h3>
              <MoreHorizontal className="w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {columnTasks.map(task => {
                const blocked = isTaskBlocked(task) && task.status !== TaskStatus.DONE;
                const frozen = isTaskFrozen(task.status);
                const progress = getTaskProgress(task);
                const isMyTask = user?.id === task.assigneeId;
                
                return (
                  <div 
                    key={task.id}
                    draggable={!blocked && !frozen}
                    onDragStart={(e) => !blocked && !frozen && handleDragStart(e, task.id)}
                    onClick={() => onEditTask(task)}
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative
                       ${blocked ? 'border-red-200 bg-red-50/50 cursor-not-allowed opacity-75' : 'border-gray-200'}
                       ${frozen ? 'border-gray-300 bg-gray-100 opacity-80 cursor-not-allowed' : ''}
                       ${task.status === TaskStatus.DONE ? 'opacity-70 bg-gray-50' : ''}
                    `}
                  >
                    {blocked && (
                       <div className="absolute top-2 right-2 text-red-400" title="Locked by dependencies">
                          <Lock className="w-4 h-4" />
                       </div>
                    )}
                    {frozen && (
                       <div className="absolute top-2 right-2 text-gray-500" title={`Frozen: ${task.status}`}>
                          {task.status === TaskStatus.ABORTED ? <Ban className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                       </div>
                    )}

                    <div className="flex justify-between items-start mb-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase ${getStatusColor(task.status)}`}>
                         {task.status}
                      </span>
                      {new Date(task.dueDate) < new Date() && task.status !== TaskStatus.DONE && !frozen && (
                        <AlertCircle className="w-4 h-4 text-red-500 absolute top-2 right-8" />
                      )}
                    </div>

                    <div className="mb-2">
                       <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">{task.category}</span>
                    </div>
                    
                    <div className="flex justify-between items-center gap-2 mb-3">
                        <h4 className={`font-bold text-sm group-hover:text-blue-600 transition-colors ${blocked || frozen ? 'text-gray-500' : 'text-gray-900'}`}>
                            {task.title}
                        </h4>
                        
                        {/* Quick Action Button */}
                        {isMyTask && !blocked && !frozen && task.status !== TaskStatus.DONE && (
                           <button 
                             onClick={(e) => handleQuickAction(e, task)}
                             className="text-gray-300 hover:text-blue-500 transition-colors p-1"
                             title={task.status === TaskStatus.IN_PROGRESS ? "Send for Review" : "Start Task"}
                           >
                             {task.status === TaskStatus.REVIEW ? <Clock className="w-5 h-5 text-purple-400"/> : <CheckCircle className="w-5 h-5" />}
                           </button>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1 mb-3">
                       <div 
                         className={`h-1 rounded-full ${task.status === TaskStatus.DONE ? 'bg-green-500' : frozen ? 'bg-gray-400' : 'bg-blue-500'}`} 
                         style={{ width: `${progress}%` }} 
                       />
                    </div>
                    
                    <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                       <div className="flex items-center gap-2">
                          <img src={getAssigneeAvatar(task.assigneeId)} alt="" className="w-6 h-6 rounded-full border border-white shadow-sm" title={getAssigneeName(task.assigneeId)}/>
                       </div>
                       <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(task.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                       </div>
                    </div>
                  </div>
                );
              })}
              {columnTasks.length === 0 && (
                <div className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400 italic bg-white">
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