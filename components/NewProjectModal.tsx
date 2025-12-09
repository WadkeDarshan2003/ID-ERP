import React, { useState } from 'react';
import { User, Role, Project, ProjectStatus, ProjectType, ProjectCategory } from '../types';
import { X, Calendar, DollarSign, Image as ImageIcon, Loader } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useProjectCrud } from '../hooks/useCrud';

interface NewProjectModalProps {
  users: User[];
  onClose: () => void;
  onSave: (project: Project) => void;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ users, onClose, onSave }) => {
  const { addNotification } = useNotifications();
  const { createNewProject, loading, error } = useProjectCrud();
  
  // Initialize dates with today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState<Partial<Project>>({
    name: '',
    status: ProjectStatus.PLANNING,
    type: ProjectType.DESIGNING,
    category: ProjectCategory.COMMERCIAL,
    description: '',
    budget: undefined,
    startDate: today,
    deadline: today,
    clientId: '',
    leadDesignerId: ''
  });
  const [showErrors, setShowErrors] = useState(false);

  const validate = () => {
    if (!formData.name || !formData.clientId || !formData.leadDesignerId || !formData.startDate || !formData.deadline || !formData.budget) {
      setShowErrors(true);
      addNotification('Validation Error', 'Please complete all required fields marked in red.', 'error');
      return false;
    }
    
    // Validate date format and values
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.startDate || '')) {
      addNotification('Invalid Date', 'Start date must be in YYYY-MM-DD format.', 'error');
      return false;
    }
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.deadline || '')) {
      addNotification('Invalid Date', 'Deadline must be in YYYY-MM-DD format.', 'error');
      return false;
    }
    
    // Check if dates are valid
    const startDateObj = new Date(formData.startDate!);
    const deadlineObj = new Date(formData.deadline!);
    
    if (isNaN(startDateObj.getTime())) {
      addNotification('Invalid Date', 'Start date is not a valid date.', 'error');
      return false;
    }
    
    if (isNaN(deadlineObj.getTime())) {
      addNotification('Invalid Date', 'Deadline is not a valid date.', 'error');
      return false;
    }
    
    // Ensure deadline >= startDate
    if (deadlineObj < startDateObj) {
      addNotification('Invalid Date Range', 'Deadline must be on or after the start date.', 'error');
      return false;
    }
    
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const newProject: Omit<Project, 'id'> = {
      name: formData.name!,
      clientId: formData.clientId!,
      leadDesignerId: formData.leadDesignerId!,
      status: formData.status || ProjectStatus.PLANNING,
      type: formData.type as ProjectType,
      category: formData.category as ProjectCategory,
      startDate: formData.startDate!,
      deadline: formData.deadline!,
      budget: Number(formData.budget),
      thumbnail: `https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop`,
      description: formData.description || '',
      tasks: [],
      financials: [],
      meetings: [],
      documents: [],
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

    createNewProject(newProject)
      .then((projectId) => {
        const savedProject = { ...newProject, id: projectId } as Project;
        onSave(savedProject);
        onClose();
        addNotification('Success', `Project "${formData.name}" has been saved to the database.`, 'success');
      })
      .catch((err) => {
        addNotification('Error', `Failed to create project: ${err.message}`, 'error');
      });
  };

  const clients = users.filter(u => u.role === Role.CLIENT);
  const designers = users.filter(u => u.role === Role.DESIGNER);

  const handleDateChange = (field: 'startDate' | 'deadline', value: string) => {
    // Ensure date is in valid YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) && value !== '') {
      return; // Ignore invalid input
    }
    
    const newData = { ...formData, [field]: value };
    
    // Auto-adjust deadline if it becomes before startDate
    if (field === 'startDate' && newData.deadline && new Date(value) > new Date(newData.deadline)) {
      newData.deadline = value;
    }
    
    setFormData(newData);
  };

  const getInputClass = (value: any) => `
    w-full px-4 py-2 border rounded-lg focus:outline-none transition-all
    bg-white text-gray-900 placeholder-gray-400
    ${showErrors && !value ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h2 className="text-xl font-bold text-gray-900">Create New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" title="Close modal">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white">
          
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Project Name <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                className={getInputClass(formData.name)}
                placeholder="e.g. Victorian Manor Renovation"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
              <textarea 
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none h-24 resize-none bg-white text-gray-900 placeholder-gray-400"
                placeholder="Briefly describe the scope of work..."
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
          </div>

          {/* People */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Client <span className="text-red-500">*</span></label>
              <select 
                className={getInputClass(formData.clientId)}
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value})}
                title="Select a client for the project"
              >
                <option value="">Select Client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Lead Designer <span className="text-red-500">*</span></label>
              <select 
                className={getInputClass(formData.leadDesignerId)}
                value={formData.leadDesignerId}
                onChange={e => setFormData({...formData, leadDesignerId: e.target.value})}
                title="Select the lead designer for the project"
              >
                <option value="">Select Designer...</option>
                {designers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* Project Type & Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Project Type <span className="text-red-500">*</span></label>
              <select 
                className={getInputClass(formData.type)}
                value={formData.type || ''}
                onChange={e => setFormData({...formData, type: e.target.value as ProjectType})}
                title="Select the project type (Designing or Turnkey)"
              >
                <option value="">Select Type...</option>
                <option value={ProjectType.DESIGNING}>{ProjectType.DESIGNING}</option>
                <option value={ProjectType.TURNKEY}>{ProjectType.TURNKEY}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
              <select 
                className={getInputClass(formData.category)}
                value={formData.category || ''}
                onChange={e => setFormData({...formData, category: e.target.value as ProjectCategory})}
                title="Select the project category (Commercial or Residential)"
              >
                <option value="">Select Category...</option>
                <option value={ProjectCategory.COMMERCIAL}>{ProjectCategory.COMMERCIAL}</option>
                <option value={ProjectCategory.RESIDENTIAL}>{ProjectCategory.RESIDENTIAL}</option>
              </select>
            </div>
          </div>

          {/* Logistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                 <Calendar className="w-4 h-4 text-gray-400"/> Start Date <span className="text-red-500">*</span>
               </label>
               <input 
                 type="date" 
                 className={getInputClass(formData.startDate)}
                 value={formData.startDate}
                 onChange={e => handleDateChange('startDate', e.target.value)}
                 title="Select the project start date"
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                 <Calendar className="w-4 h-4 text-gray-400"/> Deadline <span className="text-red-500">*</span>
               </label>
               <input 
                 type="date" 
                 className={getInputClass(formData.deadline)}
                 value={formData.deadline}
                 onChange={e => handleDateChange('deadline', e.target.value)}
                 title="Select the project deadline date"
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                 <DollarSign className="w-4 h-4 text-gray-400"/> Budget <span className="text-red-500">*</span>
               </label>
               <input 
                 type="number" 
                 className={getInputClass(formData.budget)}
                 placeholder="0.00"
                 value={formData.budget || ''}
                 onChange={e => setFormData({...formData, budget: Number(e.target.value)})}
                 title="Enter the total project budget"
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
              disabled={loading}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="px-8 py-2.5 rounded-lg text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Launch Project'
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default NewProjectModal;