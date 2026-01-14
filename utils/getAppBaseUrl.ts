/**
 * Utility function to get the application base URL
 * Handles both browser and server-side environments
 * Prioritizes environment variables over localhost fallback
 */
export const getAppBaseUrl = (): string => {
  // Check if running in browser
  if (typeof window !== 'undefined') {
    // In browser, always use the current origin (deployed or localhost)
    return window.location.origin;
  }

  // Server-side environment - use Vite environment variables
  // For Electron/Windows app: Use VITE_APP_URL or VITE_DEPLOYED_URL
  const viteAppUrl = import.meta.env.VITE_APP_URL;
  const viteDeployedUrl = import.meta.env.VITE_DEPLOYED_URL;
  
  // Alternative environment variables
  const appUrl = import.meta.env.VITE_APP_BASE_URL;
  
  // Use environment variables if available, otherwise use localhost as fallback
  if (viteAppUrl) return viteAppUrl;
  if (viteDeployedUrl) return viteDeployedUrl;
  if (appUrl) return appUrl;

  // Fallback: Should only happen in development
  // This prevents hardcoding localhost and makes it explicit that env vars should be set
  return import.meta.env.PROD 
    ? 'https://your-deployed-url.com' // Placeholder for production
    : 'http://localhost:5173';         // Development fallback
};
