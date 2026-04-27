import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { Project } from '../types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  // Allow caller to receive optional opts (e.g. { initialTab }) when selecting
  onSelectProject?: (project: Project, opts?: any) => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose, projects, onSelectProject }) => {
  const { notifications, markAsRead, markAllAsRead, clearNotifications } = useNotifications();

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    // Mark as read
    markAsRead(notification.id);
    
    // If project notification, navigate to it
    if (notification.projectId && onSelectProject) {
      const project = projects.find(p => p.id === notification.projectId);
        if (project) {
        onSelectProject?.(project);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed sm:absolute right-1/2 sm:right-0 sm:left-auto left-1/2 -translate-x-1/2 sm:translate-x-0 top-12 w-[calc(100%-2rem)] sm:w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800">Notifications</h3>
        <div className="flex gap-2">
          {notifications.length > 0 && (
            <>
              <button 
                onClick={markAllAsRead} 
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
                title="Mark all as read"
              >
                Mark all read
              </button>
              <button 
                onClick={clearNotifications}
                className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400 flex flex-col items-center">
            <Bell className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">No new notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map((notification) => (
              <div 
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`p-4 hover:bg-gray-50 transition-colors relative group cursor-pointer ${notification.read ? 'opacity-60' : 'bg-blue-50/30'}`}
              >
                <div className="flex gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                    notification.type === 'error' ? 'bg-red-500' :
                    notification.type === 'warning' ? 'bg-yellow-500' :
                    notification.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1">
                    <h4 className={`text-sm font-medium ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                      {notification.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{notification.message}</p>
                    <p className="text-[10px] text-gray-400 mt-2">
                      {new Date(notification.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                  {!notification.read && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                      className="absolute top-4 right-4 text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;