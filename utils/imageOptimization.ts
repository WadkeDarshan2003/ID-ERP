/**
 * Image & Document Optimization Utility
 * Compresses images and optimizes documents before upload to save storage space
 */

/**
 * Compresses an image file and returns optimized Blob
 * @param file The image file to compress
 * @param maxWidth Max width in pixels (default: 1920)
 * @param maxHeight Max height in pixels (default: 1920)
 * @param quality JPEG quality 0-1 (default: 0.8)
 * @returns Promise<Blob> Compressed image blob
 */
export const compressImage = async (
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = 0.8
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const img = new Image();

        img.onload = () => {
          // Calculate new dimensions maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const aspectRatio = width / height;

            if (width > height) {
              width = maxWidth;
              height = Math.round(maxWidth / aspectRatio);
            } else {
              height = maxHeight;
              width = Math.round(maxHeight * aspectRatio);
            }
          }

          // Create canvas and compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with quality setting
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas to blob conversion failed'));
              }
            },
            file.type === 'image/png' ? 'image/png' : 'image/jpeg',
            quality
          );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = event.target?.result as string;
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Optimizes file size with specific handling for different file types
 * @param file The file to optimize
 * @returns Promise<File | null> Optimized file or null if optimization not applicable
 */
export const optimizeFile = async (file: File): Promise<File | null> => {
  // Images: Compress and reduce quality
  if (file.type.startsWith('image/')) {
    try {
      const compressedBlob = await compressImage(file, 1920, 1920, 0.75);
      
      // Only use compressed version if it's smaller
      if (compressedBlob.size < file.size) {
        return new File([compressedBlob], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        });
      }
    } catch (error) {
      console.warn('Image compression failed, using original:', error);
    }
  }

  // PDFs: No compression needed (already optimized by PDF creators)
  // Documents: No compression needed
  
  return null; // Return null if no optimization applied
};

/**
 * Get storage size reduction info for a file
 * @param originalSize Original file size in bytes
 * @param compressedSize Compressed file size in bytes
 * @returns Object with size info and percentage saved
 */
export const getCompressionStats = (originalSize: number, compressedSize: number) => {
  const savedBytes = originalSize - compressedSize;
  const savedPercent = ((savedBytes / originalSize) * 100).toFixed(2);

  return {
    originalSize: `${(originalSize / 1024 / 1024).toFixed(2)} MB`,
    compressedSize: `${(compressedSize / 1024 / 1024).toFixed(2)} MB`,
    savedBytes: `${(savedBytes / 1024 / 1024).toFixed(2)} MB`,
    savedPercent: `${savedPercent}%`,
    reduction: parseFloat(savedPercent),
  };
};

/**
 * Format bytes to human-readable size
 * @param bytes File size in bytes
 * @returns Formatted size string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Check if file needs optimization
 * @param file The file to check
 * @returns true if file should be optimized
 */
export const shouldOptimizeFile = (file: File): boolean => {
  // Optimize images larger than 500KB
  if (file.type.startsWith('image/') && file.size > 500 * 1024) {
    return true;
  }

  // Don't optimize PDFs or other documents
  return false;
};
