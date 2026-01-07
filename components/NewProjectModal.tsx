import React, { useState, useRef, useEffect } from 'react';
import { User, Role, Project, ProjectStatus, ProjectType, ProjectCategory, ProjectDocument } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { X, Calendar, IndianRupee, Image as ImageIcon, Loader, Upload, Trash2 } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useProjectCrud } from '../hooks/useCrud';
import { storage } from '../services/firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createDocument } from '../services/projectDetailsService';
import { formatDateToIndian, formatIndianToISO } from '../utils/taskUtils';

interface NewProjectModalProps {
  users: User[];
  onClose: () => void;
  onSave: (project: Project) => void;
  initialProject?: Project | null;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ users, onClose, onSave, initialProject }) => {
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const { createNewProject, updateExistingProject } = useProjectCrud();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialProject;
  
  // Initialize dates with today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState<Partial<Project>>(
    initialProject ? {
      name: initialProject.name,
      tenantId: initialProject.tenantId,
      status: initialProject.status,
      type: initialProject.type,
      category: initialProject.category,
      description: initialProject.description,
      budget: initialProject.budget,
      startDate: initialProject.startDate,
      deadline: initialProject.deadline,
      clientId: initialProject.clientId,
      clientIds: initialProject.clientIds || [initialProject.clientId],
      leadDesignerId: initialProject.leadDesignerId
    } : {
      name: '',
      tenantId: user?.tenantId || user?.id || '',
      status: ProjectStatus.DISCOVERY,
      type: ProjectType.DESIGNING,
      category: ProjectCategory.COMMERCIAL,
      description: '',
      budget: undefined,
      startDate: today,
      deadline: today,
      clientId: '',
      clientIds: [],
      leadDesignerId: ''
    }
  );
  const [showErrors, setShowErrors] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<{file: File, name: string}[]>([]);
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    // clientIds must have at least one client (use clientIds if available, otherwise check clientId)
    const selectedClients = formData.clientIds && formData.clientIds.length > 0 ? formData.clientIds : (formData.clientId ? [formData.clientId] : []);
    
    if (!formData.name || !formData.startDate || !formData.deadline) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
        if (isEditMode && initialProject) {
        // Update mode
        const selectedClients = formData.clientIds && formData.clientIds.length > 0 ? formData.clientIds : (formData.clientId ? [formData.clientId] : []);
        
        const updates: Partial<Project> = {
          name: formData.name!,
          clientId: selectedClients[0] || '', // Keep for backward compatibility; empty if none
          clientIds: selectedClients, // All clients treated equally (may be empty)
          tenantId: initialProject.tenantId || user?.tenantId || user?.id || '',
          leadDesignerId: formData.leadDesignerId || '',
          status: formData.status || ProjectStatus.DISCOVERY,
          type: formData.type as ProjectType,
          category: formData.category as ProjectCategory,
          startDate: formData.startDate!,
          deadline: formData.deadline!,
          budget: formData.budget ? Number(formData.budget) : 0,
          description: formData.description || ''
        };
        // Audit fields for update
        updates.updatedBy = user?.id || '';
        updates.updatedAt = new Date().toISOString();

        // Upload cover image if provided
        if (coverImageFile) {
          try {
            const timestamp = Date.now();
            const fileName = coverImageFile.name.replace(/\s+/g, '_');
            const storageRef = ref(storage, `thumbnails/${initialProject.id}/${timestamp}_${fileName}`);
            await uploadBytes(storageRef, coverImageFile);
            updates.thumbnail = await getDownloadURL(storageRef);
          } catch (error: any) {
            console.error('Cover image upload failed:', error);
            addNotification('Warning', 'Project updated but cover image upload failed.', 'warning');
          }
        }

        // Upload documents if provided
        if (uploadedDocuments.length > 0) {
            const newDocs: ProjectDocument[] = [];
            for (let i = 0; i < uploadedDocuments.length; i++) {
              const doc = uploadedDocuments[i];
              try {
                const timestamp = Date.now();
                const fileName = doc.file.name.replace(/\s+/g, '_');
                const storageRef = ref(storage, `documents/${initialProject.id}/${timestamp}_${fileName}`);
                await uploadBytes(storageRef, doc.file);
                const fileUrl = await getDownloadURL(storageRef);
                
                let docType: 'image' | 'pdf' | 'other' = 'other';
                if (doc.file.type.startsWith('image/')) docType = 'image';
                else if (doc.file.type === 'application/pdf') docType = 'pdf';
                
                const projectDoc: ProjectDocument = {
                  id: `doc_${timestamp}_${i}`,
                  name: doc.name || doc.file.name,
                  type: docType,
                  url: fileUrl,
                  uploadedBy: user?.id || 'system',
                  uploadDate: new Date().toISOString(),
                  sharedWith: [Role.ADMIN, Role.DESIGNER, Role.CLIENT],
                  approvalStatus: 'pending'
                };

                newDocs.push(projectDoc);

                // Also save to documents subcollection so it appears in Documents tab
                await createDocument(initialProject.id, projectDoc);
              } catch (error: any) {
                console.error(`Document upload failed for ${doc.name}:`, error);
                addNotification('Warning', `Failed to upload document: ${doc.name}`, 'warning');
              }
            }
            // Append to existing documents
            updates.documents = [...(initialProject.documents || []), ...newDocs];
        }

        await updateExistingProject(initialProject.id, updates);
        const updatedProject = { ...initialProject, ...updates } as Project;
        onSave(updatedProject);
        onClose();
        addNotification('Success', `Project "${formData.name}" has been updated successfully.`, 'success');
      } else {
        // Create mode
        const selectedClients = formData.clientIds && formData.clientIds.length > 0 ? formData.clientIds : (formData.clientId ? [formData.clientId] : []);
        
        const newProject: Omit<Project, 'id'> = {
          name: formData.name!,
          clientId: selectedClients[0] || '', // Keep for backward compatibility; empty if none
          clientIds: selectedClients, // All clients treated equally (may be empty)
          tenantId: user?.tenantId || user?.id || '',
          leadDesignerId: formData.leadDesignerId || '',
          status: formData.status || ProjectStatus.DISCOVERY,
          type: formData.type as ProjectType,
          category: formData.category as ProjectCategory,
          startDate: formData.startDate!,
          deadline: formData.deadline!,
          budget: formData.budget ? Number(formData.budget) : 0,
          initialBudget: formData.budget ? Number(formData.budget) : 0,
          thumbnail: '',
          description: formData.description || '',
          tasks: [],
          financials: [],
          meetings: [],
          documents: [],
          activityLog: [
            {
              id: `log_${Date.now()}`,
              userId: user?.id || 'system',
              action: 'Project Created',
              details: 'Project initialized via Admin Dashboard',
              timestamp: new Date().toISOString(),
              type: 'creation'
            }
          ],
          createdBy: user?.id || '',
          createdAt: new Date().toISOString()
        };

        // Create project first
        const projectId = await createNewProject(newProject);
        
        let thumbnailUrl: string | undefined;
        // Upload cover image if provided
        if (coverImageFile) {
          try {
            const timestamp = Date.now();
            const fileName = coverImageFile.name.replace(/\s+/g, '_');
            const storageRef = ref(storage, `thumbnails/${projectId}/${timestamp}_${fileName}`);
            await uploadBytes(storageRef, coverImageFile);
            thumbnailUrl = await getDownloadURL(storageRef);
          } catch (error: any) {
            console.error('Cover image upload failed:', error);
            addNotification('Warning', 'Project created but cover image upload failed. You can add it later.', 'warning');
          }
        }

        // Upload documents if provided
        const uploadedDocs: ProjectDocument[] = [];
        for (let i = 0; i < uploadedDocuments.length; i++) {
          const doc = uploadedDocuments[i];
          try {
            const timestamp = Date.now();
            const fileName = doc.file.name.replace(/\s+/g, '_');
            const storageRef = ref(storage, `documents/${projectId}/${timestamp}_${fileName}`);
            await uploadBytes(storageRef, doc.file);
            const fileUrl = await getDownloadURL(storageRef);
            
            let docType: 'image' | 'pdf' | 'other' = 'other';
            if (doc.file.type.startsWith('image/')) docType = 'image';
            else if (doc.file.type === 'application/pdf') docType = 'pdf';
            
            const projectDoc: ProjectDocument = {
              id: `doc_${timestamp}_${i}`,
              name: doc.name || doc.file.name,
              type: docType,
              url: fileUrl,
              uploadedBy: user?.id || 'system',
              uploadDate: new Date().toISOString(),
              sharedWith: [Role.ADMIN, Role.DESIGNER, Role.CLIENT],
              approvalStatus: 'pending'
            };

            uploadedDocs.push(projectDoc);

            // Also save to documents subcollection so it appears in Documents tab
            await createDocument(projectId, projectDoc);
          } catch (error: any) {
            console.error(`Document upload failed for ${doc.name}:`, error);
            addNotification('Warning', `Failed to upload document: ${doc.name}`, 'warning');
          }
        }
        
        // Update project with uploaded files if any
        const updates: Partial<Project> = {};
        if (thumbnailUrl) updates.thumbnail = thumbnailUrl;
        if (uploadedDocs.length > 0) updates.documents = uploadedDocs;

        if (Object.keys(updates).length > 0) {
          await updateExistingProject(projectId, updates);
        }
        
        // Return project with uploaded files
        const savedProject = { 
          ...newProject, 
          id: projectId, 
          thumbnail: thumbnailUrl,
          documents: uploadedDocs 
        } as Project;
        
        onSave(savedProject);
        onClose();
        addNotification('Success', `Project "${formData.name}" has been created with ${uploadedDocs.length} document(s).`, 'success');
      }
    } catch (error: any) {
      console.error('Project operation failed:', error);
      addNotification('Error', `Failed to ${isEditMode ? 'update' : 'create'} project: ${error.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clients = users
    .filter(u => u.role === Role.CLIENT)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
  const designers = users
    .filter(u => u.role === Role.DESIGNER)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientsDropdownRef.current && !clientsDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    bg-white text-gray-900 placeholder-gray-400 text-base md:text-sm
    ${showErrors && !value ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-transparent'}
  `;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h2 className="text-xl font-bold text-gray-900">{isEditMode ? 'Edit Project' : 'Create New Project'}</h2>
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
                placeholder="e.g. House Renovation"
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
              <label className="block text-sm font-bold text-gray-700 mb-2">Clients</label>
              <div className="relative" ref={clientsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowClientDropdown(s => !s)}
                  className={`w-full text-left px-3 py-2 border rounded-lg bg-white border-gray-300`}
                  title="Select clients"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700 truncate">
                      {(formData.clientIds && formData.clientIds.length > 0)
                        ? `${formData.clientIds.length} client${formData.clientIds.length !== 1 ? 's' : ''} selected`
                        : 'Select clients...'}
                    </div>
                    <div className="text-gray-400">{showClientDropdown ? '▴' : '▾'}</div>
                  </div>
                </button>

                {showClientDropdown && (
                  <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-md shadow-md max-h-48 overflow-y-auto">
                    {clients.length === 0 ? (
                      <p className="text-gray-500 text-sm p-3">No clients available</p>
                    ) : (
                      clients.map(client => (
                        <label key={client.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={(formData.clientIds || []).includes(client.id)}
                            onChange={(e) => {
                              const currentIds = formData.clientIds || [];
                              const newIds = e.target.checked
                                ? [...currentIds, client.id]
                                : currentIds.filter(id => id !== client.id);
                              setFormData({ ...formData, clientIds: newIds, clientId: newIds[0] || '' });
                            }}
                            className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                          />
                          <span className="text-sm text-gray-700">{client.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
              {formData.clientIds && formData.clientIds.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {formData.clientIds.length} client{formData.clientIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Lead Designer</label>
              <select 
                className="w-full px-4 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 placeholder-gray-400 text-base md:text-sm border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-3 gap-2">
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-0.5">
                 <Calendar className="w-3 h-3 text-gray-400"/> Start Date <span className="text-red-500">*</span>
               </label>
               <input
                 type="date"
                 className={getInputClass(formData.startDate)}
                 value={formData.startDate || ''}
                 onChange={e => handleDateChange('startDate', e.target.value)}
                 title="Select the project start date"
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-0.5">
                 <Calendar className="w-3 h-3 text-gray-400"/> Deadline <span className="text-red-500">*</span>
               </label>
               <input
                 type="date"
                 className={getInputClass(formData.deadline)}
                 value={formData.deadline || ''}
                 onChange={e => handleDateChange('deadline', e.target.value)}
                 title="Select the project deadline date"
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-0.5">
                 <IndianRupee className="w-3 h-3 text-gray-400"/> Budget
               </label>
               <input 
                 type="number" 
                 className="w-full px-4 py-2 border rounded-lg focus:outline-none transition-all bg-white text-gray-900 placeholder-gray-400 text-base md:text-sm border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                 placeholder="0.00"
                 value={formData.budget || ''}
                 onChange={e => setFormData({...formData, budget: Number(e.target.value)})}
                 title="Enter the total project budget"
               />
             </div>
          </div>

          {/* Cover Image Upload */}
            <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Cover Image (Optional)</label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-2 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => coverImageInputRef.current?.click()}
                >
                  {coverImageFile ? (
                    <div className="flex items-center justify-center gap-1">
                      <ImageIcon className="w-3 h-3 text-blue-500" />
                      <span className="text-base md:text-sm text-gray-700 truncate">{coverImageFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <ImageIcon className="w-4 h-4 text-gray-300" />
                      <p className="text-base md:text-sm text-gray-500">Upload image</p>
                    </div>
                  )}
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setCoverImageFile(file);
                    }}
                    className="hidden"
                    title="Upload cover image"
                  />
                </div>
              </div>
              {coverImageFile && (
                <div className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0">
                  <img 
                    src={URL.createObjectURL(coverImageFile)}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Documents Upload */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-bold text-gray-700">Attached Documents (Optional)</label>
              {uploadedDocuments.length > 0 && (
                <span className="text-base md:text-sm text-gray-500">{uploadedDocuments.length} file(s)</span>
              )}
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-2 text-center cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
              >
                <Upload className="w-3 h-3 text-gray-500" />
                <span className="text-base md:text-sm text-gray-600">Add documents</span>
              </button>
              <input
                ref={documentInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    const newDocs = Array.from(files).map((f: File) => ({ file: f, name: f.name }));
                    setUploadedDocuments([...uploadedDocuments, ...newDocs]);
                  }
                }}
                className="hidden"
                title="Upload documents"
              />
              {uploadedDocuments.length > 0 && (
                <div className="space-y-0.5 max-h-24 overflow-y-auto bg-gray-50 p-1 rounded border border-gray-200">
                  {uploadedDocuments.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white p-1 rounded border border-gray-200 text-base md:text-sm">
                      <span className="text-gray-700 truncate flex-1">{doc.name}</span>
                      <button
                        type="button"
                        onClick={() => setUploadedDocuments(uploadedDocuments.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700 transition-colors ml-1"
                        title="Remove document"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end gap-2">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-base md:text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-1.5 rounded-lg text-base md:text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Saving...'}
                </>
              ) : (
                isEditMode ? 'Update Project' : 'Launch Project'
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default NewProjectModal;