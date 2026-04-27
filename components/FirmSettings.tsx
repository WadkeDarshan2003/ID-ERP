import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Building2, X } from 'lucide-react';
import FirmSwitcher from './FirmSwitcher';

interface FirmSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const FirmSettings: React.FC<FirmSettingsProps> = ({ isOpen, onClose }) => {
  const { currentTenant, availableTenants } = useAuth();
  const [isFirmSwitcherOpen, setIsFirmSwitcherOpen] = React.useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[900] p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Firm Settings</h2>
              </div>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Current Firm Information */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Current Firm</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Active Firm</p>
                    <p className="text-lg font-semibold text-gray-900">{currentTenant?.name || 'Loading...'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Available Firms List */}
            {availableTenants && availableTenants.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Your Firms ({availableTenants.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableTenants.map(firm => (
                    <div
                      key={firm.id}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        currentTenant?.id === firm.id
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            currentTenant?.id === firm.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-300 text-gray-700'
                          }`}>
                            <Building2 className="w-4 h-4" />
                          </div>
                          <span className="font-medium text-gray-900">{firm.name}</span>
                        </div>
                        {currentTenant?.id === firm.id && (
                          <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Switch Firm Button */}
            {availableTenants && availableTenants.length > 1 && (
              <button
                onClick={() => setIsFirmSwitcherOpen(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Switch Firm
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2.5 rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <FirmSwitcher 
        isOpen={isFirmSwitcherOpen}
        onClose={() => setIsFirmSwitcherOpen(false)}
      />
    </>
  );
};

export default FirmSettings;
