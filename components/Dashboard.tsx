import React from 'react';
import { Project, User, ProjectStatus, Role, Task, TaskStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { DollarSign, Briefcase, CheckCircle, Clock, AlertTriangle, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardProps {
  projects: Project[];
  users: User[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const Dashboard: React.FC<DashboardProps> = ({ projects, users }) => {
  const { user } = useAuth();
  
  if (!user) return null;

  // --- Filter Data based on Role ---
  let filteredProjects = projects;
  let assignedTasks: { task: Task, project: Project }[] = [];

  if (user.role === Role.CLIENT) {
    filteredProjects = projects.filter(p => p.clientId === user.id);
  } else if (user.role === Role.DESIGNER) {
    filteredProjects = projects.filter(p => p.leadDesignerId === user.id);
  } else if (user.role === Role.VENDOR) {
    // Vendors might not see full project lists, but for dashboard stats we might show projects they are involved in
    // Or primarily show their tasks.
    assignedTasks = projects.flatMap(p => p.tasks.map(t => ({ task: t, project: p }))).filter(item => item.task.assigneeId === user.id);
    // Filter projects to only those where they have tasks for chart purposes if needed
    const projectIds = new Set(assignedTasks.map(t => t.project.id));
    filteredProjects = projects.filter(p => projectIds.has(p.id));
  }

  // --- Stats Calculation ---
  const totalBudget = filteredProjects.reduce((acc, p) => acc + p.budget, 0);
  const activeProjectsCount = filteredProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length;
  
  // Specific stats
  const pendingTasksCount = user.role === Role.VENDOR 
    ? assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length 
    : filteredProjects.reduce((acc, p) => acc + p.tasks.filter(t => t.status !== TaskStatus.DONE).length, 0);

  const completedCount = user.role === Role.VENDOR
    ? assignedTasks.filter(t => t.task.status === TaskStatus.DONE).length
    : filteredProjects.filter(p => p.status === ProjectStatus.COMPLETED).length;


  // --- Chart Data ---
  const statusData = [
    { name: 'Planning', value: filteredProjects.filter(p => p.status === ProjectStatus.PLANNING).length },
    { name: 'In Progress', value: filteredProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length },
    { name: 'Procurement', value: filteredProjects.filter(p => p.status === ProjectStatus.PROCUREMENT).length },
    { name: 'On Hold', value: filteredProjects.filter(p => p.status === ProjectStatus.ON_HOLD).length },
  ].filter(d => d.value > 0);

  const financialData = filteredProjects.map(p => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
    budget: p.budget,
    spent: p.financials
      .filter(f => f.type === 'expense')
      .reduce((sum, f) => sum + f.amount, 0)
  }));

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-full ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">
          {user.role === Role.ADMIN ? 'Global Overview' : 'My Dashboard'}
        </h2>
        <span className="text-sm text-gray-500">Welcome back, {user.name}</span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {user.role !== Role.VENDOR && (
          <StatCard 
            title={user.role === Role.CLIENT ? "Total Budget" : "Budget Volume"} 
            value={`$${totalBudget.toLocaleString()}`} 
            icon={DollarSign} 
            color="bg-green-500" 
          />
        )}
        
        {user.role === Role.VENDOR ? (
           <StatCard 
            title="Assigned Tasks" 
            value={assignedTasks.length} 
            icon={List} 
            color="bg-blue-500" 
          />
        ) : (
          <StatCard 
            title="Active Projects" 
            value={activeProjectsCount} 
            icon={Briefcase} 
            color="bg-blue-500" 
          />
        )}
        
        <StatCard 
          title={user.role === Role.VENDOR ? "Completed Tasks" : "Completed Projects"} 
          value={completedCount} 
          icon={CheckCircle} 
          color="bg-purple-500" 
        />
        
        <StatCard 
          title={user.role === Role.VENDOR ? "Pending Tasks" : "Total Pending Tasks"} 
          value={pendingTasksCount} 
          icon={Clock} 
          color="bg-orange-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* VENDOR: Task List View instead of Financials */}
        {user.role === Role.VENDOR ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Active Tasks</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                   <tr>
                     <th className="px-4 py-3 rounded-l-lg">Task</th>
                     <th className="px-4 py-3">Project</th>
                     <th className="px-4 py-3">Due Date</th>
                     <th className="px-4 py-3">Priority</th>
                     <th className="px-4 py-3 rounded-r-lg">Status</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).map(({ task, project }) => (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{task.title}</td>
                      <td className="px-4 py-3 text-gray-600">{project.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(task.dueDate).toLocaleDateString()}
                        {new Date(task.dueDate) < new Date() && <span className="ml-2 text-xs text-red-500 font-bold">Overdue</span>}
                      </td>
                      <td className="px-4 py-3">
                         <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase
                          ${task.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-gray-400">No active tasks. Good job!</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* OTHERS: Financial Chart */
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {user.role === Role.CLIENT ? 'Project Budget' : 'Budget vs Spent'}
            </h3>
            <div className="h-80 w-full">
              {financialData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      cursor={{ fill: '#f3f4f6' }}
                    />
                    <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="spent" name="Spent" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">No financial data available</div>
              )}
            </div>
          </div>
        )}

        {/* Project Status Chart - All roles except Vendor */}
        {user.role !== Role.VENDOR && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {user.role === Role.CLIENT ? 'Project State' : 'Project Status Distribution'}
            </h3>
            <div className="h-80 w-full flex justify-center">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                 <div className="flex items-center justify-center h-full text-gray-400">No projects found</div>
              )}
            </div>
            <div className="flex justify-center gap-4 mt-4 flex-wrap">
              {statusData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-sm text-gray-600">{entry.name} ({entry.value})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;