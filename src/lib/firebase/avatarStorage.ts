import { storage, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

// Constants
const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const COMPRESSION_MAX_SIZE_MB = 0.3; // Compress to max 300KB
const COMPRESSION_MAX_DIMENSION = 400; // Max width/height in pixels

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Validates file before upload
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'El archivo debe ser una imagen' };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `La imagen no puede superar ${MAX_FILE_SIZE_MB}MB` };
  }

  return { valid: true };
}

/**
 * Compresses an image file
 * Uses canvas API for compression (no external dependencies)
 */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
          if (width > COMPRESSION_MAX_DIMENSION) {
            height = Math.round((height * COMPRESSION_MAX_DIMENSION) / width);
            width = COMPRESSION_MAX_DIMENSION;
          }
        } else {
          if (height > COMPRESSION_MAX_DIMENSION) {
            width = Math.round((width * COMPRESSION_MAX_DIMENSION) / height);
            height = COMPRESSION_MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw image with smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not compress image'));
              return;
            }

            // Create new file from blob
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });

            console.log(`📸 Compressed: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB`);
            resolve(compressedFile);
          },
          'image/jpeg',
          0.85 // Quality 85%
        );
      };

      img.onerror = () => reject(new Error('Could not load image'));
    };

    reader.onerror = () => reject(new Error('Could not read file'));
  });
}

/**
 * Uploads a user avatar to Firebase Storage
 * Compresses the image before upload
 */
export async function uploadAvatar(file: File): Promise<UploadResult> {
  if (!browser || !isFirebaseEnabled() || !storage) {
    return { success: false, error: 'Firebase Storage no disponible' };
  }

  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'Usuario no autenticado' };
  }

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Compress image
    const compressedFile = await compressImage(file);

    // Upload to Storage
    const avatarRef = ref(storage, `users/${user.id}/avatar.jpg`);
    await uploadBytes(avatarRef, compressedFile, {
      contentType: 'image/jpeg',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        originalName: file.name
      }
    });

    // Get download URL
    const downloadURL = await getDownloadURL(avatarRef);

    // Update user profile in Firestore
    if (db) {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        photoURL: downloadURL,
        updatedAt: serverTimestamp()
      });
    }

    // Update currentUser store so UI reflects the change immediately (preserve googlePhotoURL)
    currentUser.update(u => u ? { ...u, photoURL: downloadURL } : null);

    console.log('✅ Avatar uploaded successfully');
    return { success: true, url: downloadURL };

  } catch (error) {
    console.error('❌ Error uploading avatar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al subir la imagen'
    };
  }
}

/**
 * Deletes the user's avatar from Firebase Storage
 * Reverts to Google profile photo or null
 */
export async function deleteAvatar(): Promise<UploadResult> {
  if (!browser || !isFirebaseEnabled() || !storage) {
    return { success: false, error: 'Firebase Storage no disponible' };
  }

  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'Usuario no autenticado' };
  }

  try {
    // Delete from Storage
    const avatarRef = ref(storage, `users/${user.id}/avatar.jpg`);

    try {
      await deleteObject(avatarRef);
      console.log('🗑️ Avatar deleted from storage');
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code !== 'storage/object-not-found') {
        throw error;
      }
    }

    // Update user profile - remove custom photo (will fallback to Google photo)
    if (db) {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        photoURL: null,
        updatedAt: serverTimestamp()
      });
    }

    // Update currentUser store - revert to Google photo immediately
    currentUser.update(u => u ? { ...u, photoURL: u.googlePhotoURL } : null);

    console.log('✅ Avatar deleted, reverted to default');
    return { success: true };

  } catch (error) {
    console.error('❌ Error deleting avatar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al eliminar la imagen'
    };
  }
}

/**
 * Gets the avatar URL for a user
 * Returns custom avatar if exists, otherwise Google photo
 */
export function getAvatarUrl(photoURL: string | null | undefined): string | null {
  return photoURL || null;
}
