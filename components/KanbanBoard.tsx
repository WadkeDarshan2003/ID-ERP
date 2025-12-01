import React, { useState } from 'react';
import { Task, TaskStatus, User } from '../types';
import { MoreHorizontal, Calendar, AlertCircle, Lock } from 'lucide-react';

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onEditTask: (task: Task) => void;
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: TaskStatus.TODO, label: 'To Do', color: 'border-t-4 border-gray-400' },
  { id: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'border-t-4 border-blue-500' },
  { id: TaskStatus.REVIEW, label: 'Review', color: 'border-t-4 border-yellow-500' },
  { id: TaskStatus.DONE, label: 'Done', color: 'border-t-4 border-green-500' },
];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, onUpdateTaskStatus, onEditTask }) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    // Strict Dependency Validation
    if (status === TaskStatus.IN_PROGRESS || status === TaskStatus.DONE) {
       const task = tasks.find(t => t.id === draggedTaskId);
       if (task) {
          const parentTasks = tasks.filter(t => task.dependencies.includes(t.id));
          const incompleteParents = parentTasks.filter(t => t.status !== TaskStatus.DONE);
          
          if (incompleteParents.length > 0) {
             const names = incompleteParents.map(t => t.title).join(', ');
             alert(`BLOCKED: Cannot start this task. Waiting for dependencies: ${names}`);
             setDraggedTaskId(null);
             return;
          }
       }
    }

    onUpdateTaskStatus(draggedTaskId, status);
    setDraggedTaskId(null);
  };

  const getAssigneeAvatar = (id: string) => users.find(u => u.id === id)?.avatar || 'https://via.placeholder.com/30';
  const getAssigneeName = (id: string) => users.find(u => u.id === id)?.name || 'Unassigned';

  const isTaskBlocked = (task: Task) => {
      // A task is blocked if it has dependencies that are not DONE
      const parentTasks = tasks.filter(t => task.dependencies.includes(t.id));
      return parentTasks.some(t => t.status !== TaskStatus.DONE);
  };

  return (
    <div className="flex h-full overflow-x-auto gap-6 p-2 pb-6 items-start">
      {COLUMNS.map(column => {
        const columnTasks = tasks.filter(t => t.status === column.id);

        return (
          <div 
            key={column.id} 
            className={`flex-shrink-0 w-80 bg-gray-100/50 rounded-xl p-4 flex flex-col h-full max-h-[calc(100vh-250px)] ${column.color}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="flex justify-between items-center mb-4 px-1">
              <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                {column.label}
                <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{columnTasks.length}</span>
              </h3>
              <MoreHorizontal className="w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {columnTasks.map(task => {
                const blocked = isTaskBlocked(task) && task.status === TaskStatus.TODO;
                
                return (
                  <div 
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onEditTask(task)}
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative
                       ${blocked ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}
                    `}
                  >
                    {blocked && (
                       <div className="absolute top-2 right-2 text-red-400" title="Dependencies not met">
                          <Lock className="w-4 h-4" />
                       </div>
                    )}

                    <div className="flex justify-between items-start mb-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase
                         ${task.priority === 'high' ? 'bg-red-50 text-red-600' : 
                           task.priority === 'medium' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                         {task.priority}
                      </span>
                      {new Date(task.dueDate) < new Date() && task.status !== TaskStatus.DONE && (
                        <AlertCircle className="w-4 h-4 text-red-500 absolute top-2 right-8" />
                      )}
                    </div>
                    
                    <h4 className={`font-bold text-sm mb-3 group-hover:text-blue-600 transition-colors ${blocked ? 'text-gray-500' : 'text-gray-800'}`}>
                        {task.title}
                    </h4>
                    
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
                <div className="h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 italic">
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