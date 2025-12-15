import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Notification, Project } from '../types';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (
    titleOrObj: string | { title: string; message: string; type?: Notification['type']; recipientId?: string; projectId?: string; projectName?: string; targetTab?: string },
    message?: string,
    type?: Notification['type'],
    recipientId?: string,
    projectId?: string,
    projectName?: string,
    targetTab?: string
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode, projects?: Project[] }> = ({ children, projects = [] }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);

  // Helper: Check if user is part of a project team
  const isUserInProjectTeam = (userId: string, projectId: string): boolean => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return false;
    
    // Check if user is client, lead designer, or explicitly added team member
    const isClient = project.clientId === userId;
    const isLeadDesigner = project.leadDesignerId === userId;
    const isTeamMember = project.teamMembers?.includes(userId) || false;
    
    return isClient || isLeadDesigner || isTeamMember;
  };

  // Filter notifications relevant to the current user
  const visibleNotifications = notifications.filter(n => {
    if (!user) return false;
    
    // If notification has a specific recipient, only show to that recipient
    if (n.recipientId) {
      return n.recipientId === user.id;
    }
    
    // If notification is project-specific, only show to team members
    if (n.projectId) {
      return isUserInProjectTeam(user.id, n.projectId);
    }
    
    // No recipientId and no projectId = no global notifications allowed, hide it
    return false;
  });
  
  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  const addNotification = (
    titleOrObj: string | { title: string; message: string; type?: Notification['type']; recipientId?: string; projectId?: string; projectName?: string; targetTab?: string },
    message?: string,
    type: Notification['type'] = 'info',
    recipientId?: string,
    projectId?: string,
    projectName?: string,
    targetTab?: string
  ) => {
    let notificationData: { title: string; message: string; type?: Notification['type']; recipientId?: string; projectId?: string; projectName?: string; targetTab?: string };

    if (typeof titleOrObj === 'object') {
      notificationData = titleOrObj;
    } else {
      notificationData = {
        title: titleOrObj,
        message: message!,
        type,
        recipientId,
        projectId,
        projectName,
        targetTab
      };
    }

    const newNotification: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'info',
      recipientId: notificationData.recipientId,
      projectId: notificationData.projectId,
      projectName: notificationData.projectName,
      timestamp: new Date(),
      read: false,
      targetTab: notificationData.targetTab,
    };
    
    // Add to persistent store
    setNotifications(prev => [newNotification, ...prev]);
    
    // Add to toasts only if notification is targeted or project-specific (no global notifications)
    if (newNotification.recipientId) {
      // Show toast only to the targeted recipient
      if (newNotification.recipientId === user?.id) {
        setToasts(prev => [...prev, newNotification]);
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== newNotification.id));
        }, 5000);
      }
    } else if (newNotification.projectId && newNotification.projectName) {
      // Show toast for project notifications if projectName is provided (proof of valid project)
      // This allows notifications to show even if projects array isn't fully synced
      if (user) {
        setToasts(prev => [...prev, newNotification]);
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== newNotification.id));
        }, 5000);
      }
    }
    // No recipientId and no projectId = global notification, don't show toast
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => {
      // Only mark visible notifications as read (targeted or project-specific, no global)
      if (!user) return n;
      
      if (n.recipientId && n.recipientId !== user.id) return n;
      if (!n.recipientId && n.projectId && !isUserInProjectTeam(user.id, n.projectId)) return n;
      if (!n.recipientId && !n.projectId) return n; // Don't mark global notifications
      
      return { ...n, read: true };
    }));
  };

  const clearNotifications = () => {
    setNotifications(prev => {
      if (!user) return prev;
      return prev.filter(n => {
        // Only clear notifications visible to the user (targeted or project-specific, not global)
        if (n.recipientId && n.recipientId !== user.id) return true; // Keep it (not visible anyway)
        if (!n.recipientId && n.projectId && !isUserInProjectTeam(user.id, n.projectId)) return true; // Keep it (not visible anyway)
        if (!n.recipientId && !n.projectId) return true; // Keep global notifications (they're not shown anyway)
        return false; // Clear visible notifications (targeted or project-specific)
      });
    });
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ 
      notifications: visibleNotifications, 
      unreadCount, 
      addNotification, 
      markAsRead, 
      markAllAsRead, 
      clearNotifications 
    }}>
      {children}
      
      {/* Toast Container - z-[100] to ensure it is above everything including modals */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className="bg-white rounded-lg shadow-xl border-l-4 p-4 w-80 pointer-events-auto transform transition-all animate-fade-in flex items-start gap-3"
            style={{ 
              borderColor: toast.type === 'error' ? '#ef4444' : 
                          toast.type === 'warning' ? '#f59e0b' : 
                          toast.type === 'success' ? '#22c55e' : '#3b82f6' 
            }}
          >
             <div className="mt-0.5">
               {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
               {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
               {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
               {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
             </div>
             <div className="flex-1">
               <h4 className="font-bold text-gray-800 text-sm">{toast.title}</h4>
               <p className="text-xs text-gray-600 mt-1">{toast.message}</p>
             </div>
             <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600">
               <X className="w-4 h-4" />
             </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};