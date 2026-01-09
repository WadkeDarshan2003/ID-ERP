import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTenantBranding } from '../services/tenantService';

interface TenantBranding {
  brandName: string;
  logoUrl: string;
  isLoading: boolean;
}

/**
 * Custom hook to get tenant branding information
 * Automatically fetches branding based on current user's tenantId
 * Falls back to default Kydo Solutions branding if no custom branding is set
 */
export const useTenantBranding = (): TenantBranding => {
  const { user } = useAuth();
  const [branding, setBranding] = useState<TenantBranding>({
    brandName: 'Kydo Solutions',
    logoUrl: '/kydoicon.png',
    isLoading: true
  });

  useEffect(() => {
    const fetchBranding = async () => {
      setBranding(prev => ({ ...prev, isLoading: true }));
      
      try {
        const tenantBranding = await getTenantBranding(user?.tenantId);
        setBranding({
          brandName: tenantBranding.brandName,
          logoUrl: tenantBranding.logoUrl,
          isLoading: false
        });
      } catch (error) {
        setBranding({
          brandName: 'Kydo Solutions',
          logoUrl: '/kydoicon.png',
          isLoading: false
        });
      }
    };

    fetchBranding();
  }, [user?.tenantId]);

  return branding;
};