import React, { useState } from 'react';
import { Project, User, Task, TaskStatus, Role } from '../types';
import { generateProjectTasks } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import { 
  Calendar, DollarSign, Plus, CheckCircle, 
  ChevronRight, Wand2, Lock
} from 'lucide-react';

interface ProjectDetailProps {
  project: Project;
  users: User[];
  onUpdateProject: (updatedProject: Project) => void;
  onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, users, onUpdateProject, onBack }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tasks' | 'financials' | 'team'>('tasks');
  const [isGenerating, setIsGenerating] = useState(false);

  if (!user) return null;

  // --- Permissions Logic ---
  const isClient = user.role === Role.CLIENT;
  const isVendor = user.role === Role.VENDOR;
  const isAdmin = user.role === Role.ADMIN;
  const isLeadDesigner = user.role === Role.DESIGNER && project.leadDesignerId === user.id;

  const canEditProject = isAdmin || isLeadDesigner;
  const canViewFinancials = !isVendor; // Vendors shouldn't see budgets/profits
  const canManageTeam = isAdmin || isLeadDesigner;
  const canUseAI = canEditProject;

  const getAssigneeName = (id: string) => users.find(u => u.id === id)?.name || 'Unassigned';
  const getAssigneeAvatar = (id: string) => users.find(u => u.id === id)?.avatar || '';

  const handleGenerateTasks = async () => {
    if (!canUseAI) return;
    setIsGenerating(true);
    const newTasks = await generateProjectTasks(project.description, project.id);
    if (newTasks.length > 0) {
      onUpdateProject({
        ...project,
        tasks: [...project.tasks, ...newTasks]
      });
    }
    setIsGenerating(false);
  };

  const handleTaskStatusChange = (taskId: string, newStatus: TaskStatus) => {
    // Permission check for task movement
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Vendors can only move THEIR tasks
    if (isVendor && task.assigneeId !== user.id) return;
    // Clients cannot move tasks
    if (isClient) return;

    const updatedTasks = project.tasks.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    );
    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  const calculateFinancials = () => {
    const income = project.financials.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount, 0);
    const expense = project.financials.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0);
    return { income, expense, balance: income - expense };
  };

  const { income, expense, balance } = calculateFinancials();

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
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
          {activeTab === 'tasks' && canUseAI && (
            <button 
              onClick={handleGenerateTasks}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
            >
              <Wand2 className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Thinking...' : 'AI Suggest Tasks'}
            </button>
          )}
          {canEditProject && (
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
              <Plus className="w-4 h-4" />
              Add {activeTab === 'tasks' ? 'Task' : activeTab === 'financials' ? 'Record' : 'Member'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-gray-200 bg-white">
        <div className="flex gap-6">
          {['tasks', 'financials', 'team'].map((tab) => {
             if (tab === 'financials' && !canViewFinancials) return null;
             return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab 
                    ? 'border-gray-900 text-gray-900' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
             );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        
        {/* TASKS TAB */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE].map(status => {
                const tasksInStatus = project.tasks.filter(t => t.status === status);
                return (
                  <div key={status} className="bg-gray-100 rounded-xl p-4 flex flex-col gap-3 min-h-[400px]">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">{status}</h3>
                      <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">
                        {tasksInStatus.length}
                      </span>
                    </div>
                    
                    {tasksInStatus.map(task => {
                      // Check if current user can interact with this specific task
                      const isMyTask = task.assigneeId === user.id;
                      const canMove = !isClient && (canEditProject || isMyTask);
                      
                      return (
                        <div key={task.id} className={`bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all group ${canMove ? 'hover:shadow-md' : 'opacity-90'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
                              ${task.priority === 'high' ? 'bg-red-100 text-red-600' : 
                                task.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'}`}>
                              {task.priority}
                            </span>
                            
                            {/* Task Movers */}
                            {canMove && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {status !== TaskStatus.TODO && (
                                  <button onClick={() => handleTaskStatusChange(task.id, TaskStatus.TODO)} className="p-1 hover:bg-gray-100 rounded" title="Move to Todo">
                                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                                  </button>
                                )}
                                {status !== TaskStatus.IN_PROGRESS && (
                                  <button onClick={() => handleTaskStatusChange(task.id, TaskStatus.IN_PROGRESS)} className="p-1 hover:bg-gray-100 rounded" title="Move to In Progress">
                                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                                  </button>
                                )}
                                {status !== TaskStatus.DONE && (
                                  <button onClick={() => handleTaskStatusChange(task.id, TaskStatus.DONE)} className="p-1 hover:bg-gray-100 rounded" title="Move to Done">
                                    <div className="w-2 h-2 rounded-full bg-green-400" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <h4 className="text-sm font-medium text-gray-800 mb-1">{task.title}</h4>
                          {task.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{task.description}</p>}
                          
                          <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                            <div className="flex items-center gap-2">
                              {task.assigneeId ? (
                                <>
                                  <img src={getAssigneeAvatar(task.assigneeId)} alt="" className="w-6 h-6 rounded-full" />
                                  <span className="text-xs text-gray-600">{getAssigneeName(task.assigneeId)}</span>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 italic">Unassigned</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">{new Date(task.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                          </div>
                        </div>
                      );
                    })}
                    
                    {tasksInStatus.length === 0 && (
                       <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                          <span className="text-xs">No tasks</span>
                       </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FINANCIALS TAB */}
        {activeTab === 'financials' && canViewFinancials && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="grid grid-cols-3 gap-6">
               <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                 <p className="text-sm text-gray-500 mb-1">Total Invoiced</p>
                 <h3 className="text-2xl font-bold text-green-600">+${income.toLocaleString()}</h3>
               </div>
               <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                 <p className="text-sm text-gray-500 mb-1">Total Expenses</p>
                 <h3 className="text-2xl font-bold text-red-600">-${expense.toLocaleString()}</h3>
               </div>
               <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                 <p className="text-sm text-gray-500 mb-1">Net Balance</p>
                 <h3 className={`text-2xl font-bold ${balance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                   ${balance.toLocaleString()}
                 </h3>
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                 <h3 className="font-semibold text-gray-800">Transaction History</h3>
                 {!isClient && <button className="text-sm text-blue-600 hover:underline">Export Report</button>}
              </div>
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {project.financials.length > 0 ? project.financials.map(fin => (
                    <tr key={fin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-600">{fin.date}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fin.description}</td>
                      <td className="px-6 py-4 text-gray-600">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {fin.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium capitalize
                          ${fin.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                          {fin.status === 'paid' && <CheckCircle className="w-3 h-3" />}
                          {fin.status}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${fin.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {fin.type === 'income' ? '+' : '-'}${fin.amount.toLocaleString()}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">No financial records yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="max-w-4xl mx-auto relative">
             {!canManageTeam && (
               <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                 <div className="bg-white p-4 rounded-lg shadow-lg flex items-center gap-2">
                   <Lock className="w-5 h-5 text-gray-500" />
                   <span className="text-gray-700 font-medium">Restricted Access</span>
                 </div>
               </div>
             )}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 filter">
                {/* Client Card */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Client</h3>
                  <div className="flex items-center gap-4">
                    <img src={getAssigneeAvatar(project.clientId)} className="w-12 h-12 rounded-full" alt="" />
                    <div>
                      <h4 className="font-semibold text-gray-900">{getAssigneeName(project.clientId)}</h4>
                      <p className="text-sm text-gray-500">{users.find(u => u.id === project.clientId)?.email}</p>
                    </div>
                  </div>
                </div>

                {/* Lead Designer Card */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Lead Designer</h3>
                  <div className="flex items-center gap-4">
                    <img src={getAssigneeAvatar(project.leadDesignerId)} className="w-12 h-12 rounded-full" alt="" />
                    <div>
                      <h4 className="font-semibold text-gray-900">{getAssigneeName(project.leadDesignerId)}</h4>
                      <p className="text-sm text-gray-500">{users.find(u => u.id === project.leadDesignerId)?.email}</p>
                    </div>
                  </div>
                </div>

                {/* Active Vendors on Project */}
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm md:col-span-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Assigned Vendors</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {Array.from(new Set(project.tasks.map(t => t.assigneeId).filter(id => {
                       const u = users.find(user => user.id === id);
                       return u && u.role === Role.VENDOR;
                     }))).map(vendorId => {
                       const vendor = users.find(u => u.id === vendorId);
                       return (
                         <div key={vendorId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                           <div className="flex items-center gap-3">
                              <img src={vendor?.avatar} className="w-10 h-10 rounded-full" alt="" />
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900">{vendor?.company || vendor?.name}</h4>
                                <p className="text-xs text-gray-500">{vendor?.specialty}</p>
                              </div>
                           </div>
                           <button className="text-xs text-blue-600 font-medium hover:underline">View Contract</button>
                         </div>
                       )
                     })}
                     {project.tasks.every(t => !users.find(u => u.id === t.assigneeId && u.role === Role.VENDOR)) && (
                        <p className="text-sm text-gray-400 italic">No vendors assigned to tasks yet.</p>
                     )}
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDetail;