import { doc, getDoc } from 'firebase/firestore';
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