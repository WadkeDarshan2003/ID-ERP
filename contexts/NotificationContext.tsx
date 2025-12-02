import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Notification } from '../types';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (title: string, message: string, type?: Notification['type'], recipientId?: string, projectId?: string, targetTab?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);

  // Filter notifications relevant to the current user
  const visibleNotifications = notifications.filter(n => !n.recipientId || n.recipientId === user?.id);
  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  const addNotification = (title: string, message: string, type: Notification['type'] = 'info', recipientId?: string, projectId?: string, targetTab?: string) => {
    const newNotification: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      recipientId,
      projectId,
      timestamp: new Date(),
      read: false,
      targetTab,
    };
    
    // Add to persistent store
    setNotifications(prev => [newNotification, ...prev]);
    
    // Add to toasts only if it's for the current user (or global)
    if (!recipientId || recipientId === user?.id) {
        setToasts(prev => [...prev, newNotification]);
        // Remove toast after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== newNotification.id));
        }, 5000);
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ( (!n.recipientId || n.recipientId === user?.id) ? { ...n, read: true } : n )));
  };

  const clearNotifications = () => {
    setNotifications(prev => prev.filter(n => n.recipientId && n.recipientId !== user?.id));
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