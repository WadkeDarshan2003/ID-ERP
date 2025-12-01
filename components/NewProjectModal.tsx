import React, { useState } from 'react';
import { User, Role, Project, ProjectStatus } from '../types';
import { X, Calendar, DollarSign, Image as ImageIcon } from 'lucide-react';

interface NewProjectModalProps {
  users: User[];
  onClose: () => void;
  onSave: (project: Project) => void;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ users, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<Project>>({
    name: '',
    status: ProjectStatus.PLANNING,
    description: '',
    budget: 0,
    startDate: new Date().toISOString().split('T')[0],
    deadline: '',
    clientId: '',
    leadDesignerId: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.clientId || !formData.leadDesignerId) return;

    const newProject: Project = {
      id: `p_${Date.now()}`,
      name: formData.name,
      clientId: formData.clientId,
      leadDesignerId: formData.leadDesignerId,
      status: formData.status || ProjectStatus.PLANNING,
      startDate: formData.startDate || '',
      deadline: formData.deadline || '',
      budget: Number(formData.budget),
      thumbnail: `https://picsum.photos/seed/${formData.name}/800/600`, // Auto-generate random image based on name seed
      description: formData.description || '',
      tasks: [],
      financials: [],
      meetings: [],
      activityLog: [
        {
          id: `log_${Date.now()}`,
          userId: 'system',
          action: 'Project Created',
          details: 'Project initialized via Admin Dashboard',
          timestamp: new Date().toISOString(),
          type: 'creation'
        }
      ]
    };

    onSave(newProject);
    onClose();
  };

  const clients = users.filter(u => u.role === Role.CLIENT);
  const designers = users.filter(u => u.role === Role.DESIGNER);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50 sticky top-0">
          <h2 className="text-xl font-bold text-gray-800">Create New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Project Name</label>
              <input 
                required
                type="text" 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                placeholder="e.g. Victorian Manor Renovation"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
              <textarea 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none h-24 resize-none"
                placeholder="Briefly describe the scope of work..."
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
          </div>

          {/* People */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Client</label>
              <select 
                required
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value})}
              >
                <option value="">Select Client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Lead Designer</label>
              <select 
                required
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                value={formData.leadDesignerId}
                onChange={e => setFormData({...formData, leadDesignerId: e.target.value})}
              >
                <option value="">Select Designer...</option>
                {designers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* Logistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                 <Calendar className="w-4 h-4 text-gray-400"/> Start Date
               </label>
               <input 
                 required
                 type="date" 
                 className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                 value={formData.startDate}
                 onChange={e => setFormData({...formData, startDate: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                 <Calendar className="w-4 h-4 text-gray-400"/> Deadline
               </label>
               <input 
                 required
                 type="date" 
                 className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                 value={formData.deadline}
                 onChange={e => setFormData({...formData, deadline: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                 <DollarSign className="w-4 h-4 text-gray-400"/> Budget
               </label>
               <input 
                 required
                 type="number" 
                 className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                 placeholder="0.00"
                 value={formData.budget}
                 onChange={e => setFormData({...formData, budget: Number(e.target.value)})}
               />
             </div>
          </div>

          {/* Thumbnail Preview */}
          <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4 border border-dashed border-gray-300">
             <div className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-400">
               <ImageIcon className="w-6 h-6" />
             </div>
             <div className="text-sm text-gray-500">
               <p>A project thumbnail will be auto-generated.</p>
               <p className="text-xs opacity-70">You can upload a specific image later.</p>
             </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-8 py-2.5 rounded-lg text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all"
            >
              Launch Project
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default NewProjectModal;