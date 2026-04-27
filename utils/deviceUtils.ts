/**
 * Device Fingerprinting and Management Utilities
 * Helps identify and remember user devices for "Remember Me" functionality
 */

export interface DeviceInfo {
  id: string; // Unique device identifier
  name: string; // Device name (e.g., "Chrome on Windows")
  type: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  lastLogin: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  isCurrentDevice?: boolean;
  ipAddress?: string;
}

/**
 * Generate a unique device fingerprint based on browser and OS
 * This is NOT a perfect unique identifier but good enough for most use cases
 */
export const generateDeviceFingerprint = (): string => {
  const navigator = window.navigator;
  const screen = window.screen;
  
  // Combine multiple browser properties
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    (navigator as any).deviceMemory || 'unknown'
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
};

/**
 * Get device type from user agent
 */
export const getDeviceType = (): 'desktop' | 'mobile' | 'tablet' => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (/tablet|ipad|playbook|silk|(android(?!.*mobi|phone|windows phone))/.test(userAgent)) {
    return 'tablet';
  }
  if (/mobile|phone|windows phone|iphone|android|blackberry|opera mini/.test(userAgent)) {
    return 'mobile';
  }
  return 'desktop';
};

/**
 * Get browser name from user agent
 */
export const getBrowserName = (): string => {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome') && !userAgent.includes('Chromium')) return 'Chrome';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edge') || userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Unknown Browser';
};

/**
 * Get OS name from user agent
 */
export const getOSName = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('win')) return 'Windows';
  if (userAgent.includes('mac')) return 'macOS';
  if (userAgent.includes('linux')) return 'Linux';
  if (userAgent.includes('android')) return 'Android';
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
  return 'Unknown OS';
};

/**
 * Create a human-readable device name
 */
export const createDeviceName = (): string => {
  const browser = getBrowserName();
  const os = getOSName();
  return `${browser} on ${os}`;
};

/**
 * Create a new device info object
 */
export const createDeviceInfo = (): DeviceInfo => {
  const now = new Date().toISOString();
  
  return {
    id: generateDeviceFingerprint(),
    name: createDeviceName(),
    type: getDeviceType(),
    browser: getBrowserName(),
    os: getOSName(),
    lastLogin: now,
    createdAt: now
  };
};

/**
 * Store device info in localStorage for quick access
 */
export const saveDeviceToLocal = (device: DeviceInfo): void => {
  try {
    const devices = JSON.parse(localStorage.getItem('rememberedDevices') || '{}');
    devices[device.id] = device;
    localStorage.setItem('rememberedDevices', JSON.stringify(devices));
  } catch (error) {
    console.error('Failed to save device to localStorage:', error);
  }
};

/**
 * Get all remembered devices from localStorage
 */
export const getRememberedDevices = (): DeviceInfo[] => {
  try {
    const devices = JSON.parse(localStorage.getItem('rememberedDevices') || '{}');
    return Object.values(devices) as DeviceInfo[];
  } catch (error) {
    console.error('Failed to get remembered devices:', error);
    return [];
  }
};

/**
 * Get current device fingerprint
 */
export const getCurrentDeviceId = (): string => {
  return generateDeviceFingerprint();
};

/**
 * Check if current device is remembered
 */
export const isDeviceRemembered = (): boolean => {
  const currentDeviceId = getCurrentDeviceId();
  const devices = getRememberedDevices();
  return devices.some(d => d.id === currentDeviceId);
};

/**
 * Remove a device from remembered list
 */
export const forgetDevice = (deviceId: string): void => {
  try {
    const devices = JSON.parse(localStorage.getItem('rememberedDevices') || '{}');
    delete devices[deviceId];
    localStorage.setItem('rememberedDevices', JSON.stringify(devices));
  } catch (error) {
    console.error('Failed to forget device:', error);
  }
};

/**
 * Forget all remembered devices
 */
export const forgetAllDevices = (): void => {
  try {
    localStorage.removeItem('rememberedDevices');
  } catch (error) {
    console.error('Failed to forget all devices:', error);
  }
};

/**
 * Update device last login time
 */
export const updateDeviceLastLogin = (deviceId: string): void => {
  try {
    const devices = JSON.parse(localStorage.getItem('rememberedDevices') || '{}');
    if (devices[deviceId]) {
      devices[deviceId].lastLogin = new Date().toISOString();
      localStorage.setItem('rememberedDevices', JSON.stringify(devices));
    }
  } catch (error) {
    console.error('Failed to update device last login:', error);
  }
};
