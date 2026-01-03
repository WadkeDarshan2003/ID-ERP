import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useTenantBranding } from '../hooks/useTenantBranding';
import { uploadLogoToStorage } from '../services/storageService';
import { updateTenantBranding, getTenantById } from '../services/tenantService';
import { Building2, Upload, Save, RotateCcw } from 'lucide-react';

interface BrandingSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const BrandingSettings: React.FC<BrandingSettingsProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { brandName: currentBrandName, logoUrl: currentLogoUrl } = useTenantBranding();
  
  const [brandName, setBrandName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBrandName(currentBrandName === 'Kydo Solutions' ? '' : currentBrandName);
      setLogoPreview(currentLogoUrl === '/kydoicon.png' ? '' : currentLogoUrl);
      setLogoFile(null);
      setHasChanges(false);
    }
  }, [isOpen, currentBrandName, currentLogoUrl]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        addNotification('File Size Error', 'Logo must be less than 2MB', 'error');
        return;
      }
      if (!file.type.startsWith('image/')) {
        addNotification('File Type Error', 'Please upload an image file', 'error');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
      setHasChanges(true);
    }
  };

  const handleBrandNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBrandName(e.target.value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!user?.tenantId) {
      addNotification('Error', 'No tenant ID found', 'error');
      return;
    }

    setLoading(true);
    try {
      const updateData: { brandName?: string; logoUrl?: string } = {};

      // Update brand name if changed
      if (brandName.trim() !== '' && brandName.trim() !== currentBrandName) {
        updateData.brandName = brandName.trim();
      } else if (brandName.trim() === '' && currentBrandName !== 'Kydo Solutions') {
        updateData.brandName = undefined; // Reset to default
      }

      // Upload new logo if provided
      if (logoFile) {
        try {
          const logoUrl = await uploadLogoToStorage(logoFile, user.tenantId);
          updateData.logoUrl = logoUrl;
        } catch (logoError) {
          console.error('Logo upload failed:', logoError);
          addNotification('Upload Error', 'Failed to upload logo. Please try again.', 'error');
          setLoading(false);
          return;
        }
      }

      // Update tenant branding
      if (Object.keys(updateData).length > 0) {
        await updateTenantBranding(user.tenantId, updateData);
        addNotification('Success', 'Branding updated successfully! Please refresh the page to see changes.', 'success');
        setHasChanges(false);
        // Close modal after successful update
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        addNotification('No Changes', 'No changes to save', 'info');
      }
    } catch (error) {
      console.error('Error updating branding:', error);
      addNotification('Error', 'Failed to update branding. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setBrandName('');
    setLogoFile(null);
    setLogoPreview('');
    setHasChanges(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Branding Settings</h2>
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
          {/* Current Branding Preview */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Current Branding</h3>
            <div className="flex items-center gap-3">
              <img src={currentLogoUrl} alt={currentBrandName} className="w-8 h-8 rounded" />
              <span className="font-medium text-gray-900">{currentBrandName}</span>
            </div>
          </div>

          {/* Brand Name Input */}
          <div className="space-y-2">
            <label htmlFor="brandName" className="text-sm font-medium text-gray-700">
              Company Brand Name
            </label>
            <input 
              id="brandName" 
              placeholder="Enter your company name (leave empty for Kydo Solutions)" 
              value={brandName} 
              onChange={handleBrandNameChange}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="text-xs text-gray-500">This will replace "Kydo Solutions" throughout the application</p>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <label htmlFor="logo" className="text-sm font-medium text-gray-700">
              Company Logo
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input 
                  id="logo" 
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all file:mr-4 file:py-1 file:px-3 file:border-0 file:text-sm file:bg-blue-100 file:text-blue-700 file:rounded-lg hover:file:bg-blue-200"
                />
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB. Square logos work best.</p>
              </div>
              {logoPreview && (
                <div className="w-16 h-16 border-2 border-gray-200 rounded-lg overflow-hidden">
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-200">
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={!hasChanges || loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-300 text-gray-700 font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full bg-gray-200 hover:bg-gray-300 disabled:bg-gray-300 text-gray-700 font-medium py-2.5 rounded-xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandingSettings;