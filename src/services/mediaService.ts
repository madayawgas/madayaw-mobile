import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ENV } from '@/config';
import { authService } from './authService';
import { networkSentinel } from '@/sync/networkSentinel';
import { compressAndPrepareImage } from '@/utils/imageCompressor';

const OFFLINE_MEDIA_DIR = `${FileSystem.documentDirectory || ''}offline_media/`;
const MEDIA_UPLOAD_TIMEOUT_MS = 6000; // 6s timeout to prevent 60s native socket hangs

export interface CachedMediaResult {
  localUri: string;
  fileSize?: number;
  width: number;
  height: number;
}

export interface UploadMediaResponse {
  storageKey: string;
  url: string;
}

export const mediaService = {
  /**
   * Ensures the persistent offline media directory exists.
   */
  async ensureOfflineDirectory(): Promise<string> {
    if (Platform.OS === 'web') return '';
    try {
      const dirInfo = await FileSystem.getInfoAsync(OFFLINE_MEDIA_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(OFFLINE_MEDIA_DIR, { intermediates: true });
      }
      return OFFLINE_MEDIA_DIR;
    } catch (e) {
      console.warn('[MediaService] Could not ensure offline media directory:', e);
      return '';
    }
  },

  /**
   * Prompts the user to capture a photo via camera.
   */
  async capturePhoto(): Promise<string | null> {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera permission is required to capture ticket/receipt photos.');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1, // Full resolution input for compression pipeline
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      return result.assets[0].uri;
    } catch (error: any) {
      console.error('[MediaService] Camera capture failed:', error);
      throw error;
    }
  },

  /**
   * Prompts the user to select an existing photo from the gallery.
   */
  async pickFromGallery(): Promise<string | null> {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Photo library permission is required to select photos.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      return result.assets[0].uri;
    } catch (error: any) {
      console.error('[MediaService] Gallery pick failed:', error);
      throw error;
    }
  },

  /**
   * Compresses an image and persists it into the offline media cache.
   */
  async processAndCacheImage(rawUri: string, prefix: string = 'media'): Promise<CachedMediaResult> {
    try {
      // 1. Compress image to <= 1920px and JPEG quality
      const compressed = await compressAndPrepareImage(rawUri);

      if (Platform.OS === 'web') {
        return {
          localUri: compressed.uri,
          width: compressed.width,
          height: compressed.height,
        };
      }

      // 2. Ensure persistent offline folder exists
      await this.ensureOfflineDirectory();

      // 3. Copy to persistent offline directory
      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
      const persistentPath = `${OFFLINE_MEDIA_DIR}${filename}`;

      await FileSystem.copyAsync({
        from: compressed.uri,
        to: persistentPath,
      });

      const fileInfo = await FileSystem.getInfoAsync(persistentPath);

      return {
        localUri: persistentPath,
        fileSize: fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : compressed.fileSize,
        width: compressed.width,
        height: compressed.height,
      };
    } catch (error: any) {
      console.error('[MediaService] Failed to process and cache image:', error);
      throw error;
    }
  },

  /**
   * Uploads binary file to the backend media subsystem (/api/media/upload).
   */
  async uploadMedia(localUri: string, domain: string = 'maintenance/receipts'): Promise<UploadMediaResponse> {
    try {
      const token = await authService.getStoredToken();
      const uploadUrl = `${ENV.API_URL}/media/upload`;

      const uploadPromise = FileSystem.uploadAsync(uploadUrl, localUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        parameters: { domain },
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Media upload timed out (${MEDIA_UPLOAD_TIMEOUT_MS}ms limit)`)),
          MEDIA_UPLOAD_TIMEOUT_MS
        )
      );

      const uploadTask = await Promise.race([uploadPromise, timeoutPromise]);

      if (uploadTask.status >= 200 && uploadTask.status < 300) {
        const json = JSON.parse(uploadTask.body);
        return {
          storageKey: json.data.storageKey,
          url: json.data.url,
        };
      }

      throw new Error(`Upload failed with HTTP ${uploadTask.status}: ${uploadTask.body}`);
    } catch (error: any) {
      console.warn('[MediaService] Media upload failed, deferring to sync queue:', error?.message || error);
      networkSentinel.reportNetworkFailure();
      throw error;
    }
  },

  /**
   * Cleans up local cached file once safely synced or discarded.
   */
  async cleanupFile(uri: string): Promise<void> {
    if (Platform.OS === 'web' || !uri) return;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (e) {
      console.warn('[MediaService] Cleanup warning:', e);
    }
  },
};
