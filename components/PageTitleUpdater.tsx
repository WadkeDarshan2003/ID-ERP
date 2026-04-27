import { useEffect } from 'react';
import { useTenantBranding } from '../hooks/useTenantBranding';

/**
 * Component to dynamically update page title based on tenant branding
 * Place this component in your main App component or Router
 */
export const PageTitleUpdater: React.FC = () => {
  const { brandName, isLoading } = useTenantBranding();

  useEffect(() => {
    if (!isLoading) {
      document.title = brandName;
    }
  }, [brandName, isLoading]);

  return null; // This component doesn't render anything
};