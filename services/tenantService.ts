import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Tenant } from '../types';

/**
 * Fetches tenant information by tenantId
 * @param tenantId The ID of the tenant to fetch
 * @returns Promise resolving to tenant data or null if not found
 */
export const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
  try {
    const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
    
    if (tenantDoc.exists()) {
      const tenantData = {
        id: tenantDoc.id,
        ...tenantDoc.data()
      } as Tenant;
      return tenantData;
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Gets tenant branding information (name and logo)
 * Returns default values if tenant not found or custom branding not set
 * @param tenantId The ID of the tenant
 * @returns Promise resolving to branding info
 */
export const getTenantBranding = async (tenantId?: string): Promise<{
  brandName: string;
  logoUrl: string;
}> => {
  
  const defaults = {
    brandName: 'Kydo Solutions',
    logoUrl: '/kydoicon.png'
  };

  if (!tenantId) {
    return defaults;
  }

  try {
    const tenant = await getTenantById(tenantId);
    
    if (!tenant) {
      return defaults;
    }

    const result = {
      brandName: tenant.brandName || defaults.brandName,
      logoUrl: tenant.logoUrl || defaults.logoUrl
    };
    
    return result;
  } catch (error) {
    return defaults;
  }
};

/**
 * Updates tenant branding information
 * Creates the tenant document if it doesn't exist, or updates it if it does
 * @param tenantId The ID of the tenant to update
 * @param brandingData The branding data to update
 * @returns Promise resolving when update is complete
 */
export const updateTenantBranding = async (
  tenantId: string,
  brandingData: { brandName?: string; logoUrl?: string }
): Promise<void> => {
  try {
    const { setDoc } = await import('firebase/firestore');
    const tenantRef = doc(db, 'tenants', tenantId);
    
    const updateData: any = {};
    if (brandingData.brandName !== undefined) updateData.brandName = brandingData.brandName;
    if (brandingData.logoUrl !== undefined) updateData.logoUrl = brandingData.logoUrl;
    
    // Use setDoc with merge option to create the document if it doesn't exist
    // or update only the specified fields if it does exist
    await setDoc(tenantRef, updateData, { merge: true });
  } catch (error) {
    throw error;
  }
};

/**
 * Get all tenants where the given adminId is the owner or co-admin
 * Fetches tenants where:
 * - User is the adminUid (owner/creator of the firm)
 * - User's ID is in the adminIds array (co-admin support for business partnerships)
 * @param adminId The admin user ID
 * @returns Promise resolving to array of tenant objects with id and name
 */
export const getTenantsByAdmin = async (adminId: string): Promise<Array<{ id: string; name: string }>> => {
  try {
    // Query 1: Tenants where user is the owner (adminUid)
    const ownerQuery = query(collection(db, 'tenants'), where('adminUid', '==', adminId));
    const ownerSnapshot = await getDocs(ownerQuery);
    
    // Query 2: Tenants where user is in the adminIds array (co-admin)
    const coAdminQuery = query(collection(db, 'tenants'), where('adminIds', 'array-contains', adminId));
    const coAdminSnapshot = await getDocs(coAdminQuery);
    
    // Combine results and remove duplicates (in case user is both owner and in adminIds)
    const tenantMap = new Map<string, { id: string; name: string }>();
    
    ownerSnapshot.docs.forEach(doc => {
      tenantMap.set(doc.id, {
        id: doc.id,
        name: doc.data().name || 'Unnamed Firm'
      });
    });
    
    coAdminSnapshot.docs.forEach(doc => {
      tenantMap.set(doc.id, {
        id: doc.id,
        name: doc.data().name || 'Unnamed Firm'
      });
    });
    
    return Array.from(tenantMap.values());
  } catch (error) {
    console.error('Error fetching tenants by admin:', error);
    return [];
  }
};

/**
 * Save the current selected tenant ID to localStorage
 * @param adminId The admin user ID
 * @param tenantId The tenant ID to save
 */
export const saveSelectedTenant = (adminId: string, tenantId: string): void => {
  try {
    localStorage.setItem(`selectedTenant_${adminId}`, tenantId);
  } catch (error) {
    console.warn('Could not save selected tenant:', error);
  }
};

/**
 * Get the last selected tenant ID from localStorage
 * @param adminId The admin user ID
 * @returns The saved tenant ID or null
 */
export const getSelectedTenant = (adminId: string): string | null => {
  try {
    return localStorage.getItem(`selectedTenant_${adminId}`);
  } catch (error) {
    console.warn('Could not retrieve selected tenant:', error);
    return null;
  }
};