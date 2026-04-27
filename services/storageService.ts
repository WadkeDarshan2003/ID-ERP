import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebaseConfig";
import { optimizeFile, formatFileSize, getCompressionStats } from "../utils/imageOptimization";

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * Automatically optimizes images to save storage space.
 * @param file The file to upload
 * @param path The path in storage (e.g., 'projects/{projectId}/documents/{fileName}')
 * @returns Promise resolving to the download URL
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  try {
    let fileToUpload = file;
    let originalSize = file.size;

    // Attempt to optimize file (especially images)
    const optimizedFile = await optimizeFile(file);
    if (optimizedFile) {
      fileToUpload = optimizedFile;
      const stats = getCompressionStats(originalSize, fileToUpload.size);
      console.log(`📦 Image optimized: ${stats.originalSize} → ${stats.compressedSize} (saved ${stats.savedPercent})`);
    }

    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, fileToUpload);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    console.log(`✅ File uploaded: ${fileToUpload.name} (${formatFileSize(fileToUpload.size)})`);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
};

/**
 * Uploads a logo file for a tenant to Firebase Storage.
 * @param logoFile The logo file to upload
 * @param tenantId The tenant ID to organize the logo
 * @returns Promise resolving to the download URL
 */
export const uploadLogoToStorage = async (logoFile: File, tenantId: string): Promise<string> => {
  try {
    console.log('📤 Starting logo upload for tenant:', tenantId);
    console.log('📄 File details:', {
      name: logoFile.name,
      size: logoFile.size,
      type: logoFile.type
    });
    
    // Use a safe filename and add timestamp to avoid conflicts
    const fileExtension = logoFile.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `logo_${Date.now()}.${fileExtension}`;
    const logoPath = `tenants/${tenantId}/branding/${fileName}`;
    
    console.log('📂 Upload path:', logoPath);
    
    const downloadURL = await uploadFile(logoFile, logoPath);
    console.log('✅ Logo upload successful, URL:', downloadURL);
    
    return downloadURL;
  } catch (error) {
    console.error("❌ Error uploading logo:", error);
    throw error;
  }
};
