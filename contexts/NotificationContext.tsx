import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Notification } from '../types';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (title: string, message: string, type?: Notification['type']) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = (title: string, message: string, type: Notification['type'] = 'info') => {
    const newNotification: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // Simulate real-time notifications
  useEffect(() => {
    const timer = setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance every 30s
        const events = [
          { title: "New Task Assigned", msg: "You have been assigned to 'Kitchen Renovation'", type: 'info' },
          { title: "Deadline Warning", msg: "Project 'Coastal Villa' is due in 3 days", type: 'warning' },
          { title: "Client Approval", msg: "Michael Client approved the moodboard", type: 'success' },
          { title: "Budget Alert", msg: "Expense exceeded 80% of budget for Penthouse", type: 'error' }
        ];
        const event = events[Math.floor(Math.random() * events.length)];
        addNotification(event.title, event.msg, event.type as any);
      }
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      unreadCount, 
      addNotification, 
      markAsRead, 
      markAllAsRead, 
      clearNotifications 
    }}>
      {children}
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