import React, { useState, useEffect } from 'react';
import { Smartphone, Trash2, LogOut, Clock, Info } from 'lucide-react';
import { DeviceInfo, getRememberedDevices, forgetDevice, getCurrentDeviceId } from '../utils/deviceUtils';

const RememberedDevices: React.FC = () => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = () => {
    const allDevices = getRememberedDevices();
    const currentId = getCurrentDeviceId();
    setDevices(allDevices);
    setCurrentDeviceId(currentId);
  };

  const handleForgetDevice = (deviceId: string) => {
    forgetDevice(deviceId);
    setDevices(devices.filter(d => d.id !== deviceId));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
      }
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }

    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Remembered Devices ({devices.length})
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Manage devices that have been remembered for automatic login
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <Smartphone className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No remembered devices</p>
          <p className="text-sm text-gray-500">Next time you log in, check "Remember this device"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => {
            const isCurrentDevice = device.id === currentDeviceId;
            return (
              <div
                key={device.id}
                className={`border rounded-lg p-4 flex items-center justify-between ${
                  isCurrentDevice
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isCurrentDevice ? 'bg-blue-100' : 'bg-gray-100'
                    }`}
                  >
                    <Smartphone
                      className={`w-5 h-5 ${
                        isCurrentDevice ? 'text-blue-600' : 'text-gray-600'
                      }`}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{device.name}</p>
                      {isCurrentDevice && (
                        <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded">
                          This Device
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>Last login: {formatDate(device.lastLogin)}</span>
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                      Added: {formatDate(device.createdAt)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleForgetDevice(device.id)}
                  className="ml-4 p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title={`Forget this device${isCurrentDevice ? ' (will require login next time)' : ''}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1"><Info className="w-4 h-4 inline-block mr-2" /> About Device Memory</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Devices are remembered for 30 days of inactivity</li>
          <li>Each login extends the 30-day period</li>
          <li>Forgetting a device requires manual login next time</li>
          <li>Device fingerprints are stored locally in your browser</li>
        </ul>
      </div>
    </div>
  );
};

export default RememberedDevices;
