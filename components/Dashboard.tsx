import React from 'react';
import { Project, User, ProjectStatus, Role, Task, TaskStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { DollarSign, Briefcase, CheckCircle, Clock, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardProps {
  projects: Project[];
  users: User[];
}

const COLORS = ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1']; // Slate minimalist theme

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
    assignedTasks = projects.flatMap(p => p.tasks.map(t => ({ task: t, project: p }))).filter(item => item.task.assigneeId === user.id);
    const projectIds = new Set(assignedTasks.map(t => t.project.id));
    filteredProjects = projects.filter(p => projectIds.has(p.id));
  }

  // --- Stats Calculation ---
  const totalBudget = filteredProjects.reduce((acc, p) => acc + p.budget, 0);
  const activeProjectsCount = filteredProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length;
  
  const pendingTasksCount = user.role === Role.VENDOR 
    ? assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length 
    : filteredProjects.reduce((acc, p) => acc + p.tasks.filter(t => t.status !== TaskStatus.DONE).length, 0);

  const completedCount = user.role === Role.VENDOR
    ? assignedTasks.filter(t => t.task.status === TaskStatus.DONE).length
    : filteredProjects.filter(p => p.status === ProjectStatus.COMPLETED).length;


  // --- Chart Data ---
  const statusData = [
    { name: 'Plan', value: filteredProjects.filter(p => p.status === ProjectStatus.PLANNING).length },
    { name: 'Active', value: filteredProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length },
    { name: 'Hold', value: filteredProjects.filter(p => p.status === ProjectStatus.ON_HOLD).length },
    { name: 'Done', value: filteredProjects.filter(p => p.status === ProjectStatus.COMPLETED).length },
  ].filter(d => d.value > 0);

  const financialData = filteredProjects.slice(0, 10).map(p => ({
    name: p.name.length > 10 ? p.name.substring(0, 8) + '..' : p.name,
    budget: p.budget,
    spent: p.financials
      .filter(f => f.type === 'expense')
      .reduce((sum, f) => sum + f.amount, 0)
  }));

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-white p-5 rounded-xl border border-gray-100 flex items-center justify-between hover:shadow-sm transition-shadow">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{title}</p>
        <h3 className="text-xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-2.5 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">
          {user.role === Role.ADMIN ? 'Global Overview' : 'Dashboard'}
        </h2>
        <span className="text-xs text-gray-500 font-medium px-3 py-1 bg-white rounded-full border border-gray-200">
          {filteredProjects.length} Projects Loaded
        </span>
      </div>

      {/* Stats Grid - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {user.role !== Role.VENDOR && (
          <StatCard 
            title={user.role === Role.CLIENT ? "Total Budget" : "Volume"} 
            value={`$${(totalBudget/1000).toFixed(0)}k`} 
            icon={DollarSign} 
            color="bg-emerald-500" 
          />
        )}
        
        {user.role === Role.VENDOR ? (
           <StatCard 
            title="My Tasks" 
            value={assignedTasks.length} 
            icon={List} 
            color="bg-blue-500" 
          />
        ) : (
          <StatCard 
            title="Active Jobs" 
            value={activeProjectsCount} 
            icon={Briefcase} 
            color="bg-blue-500" 
          />
        )}
        
        <StatCard 
          title="Completed" 
          value={completedCount} 
          icon={CheckCircle} 
          color="bg-indigo-500" 
        />
        
        <StatCard 
          title="Pending Items" 
          value={pendingTasksCount} 
          icon={Clock} 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* VENDOR: Task List View */}
        {user.role === Role.VENDOR ? (
          <div className="bg-white p-6 rounded-xl border border-gray-100 lg:col-span-3">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Your Active Tasks</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                   <tr>
                     <th className="px-4 py-2 rounded-l-lg">Task</th>
                     <th className="px-4 py-2">Project</th>
                     <th className="px-4 py-2">Due</th>
                     <th className="px-4 py-2 rounded-r-lg">Status</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).map(({ task, project }) => (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{task.title}</td>
                      <td className="px-4 py-3 text-gray-600">{project.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
                          ${task.status === 'In Progress' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {assignedTasks.filter(t => t.task.status !== TaskStatus.DONE).length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400">All caught up!</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* OTHERS: Minimalist Charts */
          <>
            <div className="bg-white p-5 rounded-xl border border-gray-100 lg:col-span-2 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-gray-700">Financial Overview</h3>
              </div>
              <div className="flex-1 w-full min-h-[200px]">
                {financialData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={financialData} barGap={4}>
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10}} 
                        interval={0}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="budget" fill="#0f172a" radius={[2, 2, 0, 0]} barSize={20} />
                      <Bar dataKey="spent" fill="#cbd5e1" radius={[2, 2, 0, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300 text-sm">No data</div>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-100 flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 mb-6">Project Status</h3>
              <div className="flex-1 w-full min-h-[180px] flex justify-center items-center">
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="text-gray-300 text-sm">No projects</div>
                )}
              </div>
              <div className="flex justify-center gap-3 mt-2 flex-wrap">
                {statusData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[10px] font-medium text-gray-500 uppercase">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;