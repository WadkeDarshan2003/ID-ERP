import React, { useState, useEffect } from 'react';
import { AlertCircle, X, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSessionTimeRemaining, getSessionTimeRemainingFormatted, shouldShowExpiryWarning } from '../utils/sessionUtils';

const SessionExpiryWarning: React.FC = () => {
  const { extendSession } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const checkSession = () => {
      if (shouldShowExpiryWarning()) {
        setIsVisible(true);
        setTimeRemaining(getSessionTimeRemainingFormatted());
      }
    };

    // Check immediately
    checkSession();

    // Check every minute
    const interval = setInterval(checkSession, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="bg-amber-50 border border-amber-300 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 mb-1">Session Expiring Soon</h3>
            <p className="text-sm text-amber-800 mb-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeRemaining}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  extendSession();
                  setIsVisible(false);
                }}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2 rounded transition-colors"
              >
                Extend Session
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="px-3 py-2 text-amber-700 hover:bg-amber-100 rounded transition-colors"
                title="Dismiss warning"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-amber-700 mt-2">
              After expiry, you'll need to log in again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiryWarning;
