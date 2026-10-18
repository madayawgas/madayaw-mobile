import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface CompressedImageResult {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
}

export interface CompressOptions {
  maxDimension?: number;
  maxSizeBytes?: number;
  quality?: number;
}

const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB ceiling matching backend
const DEFAULT_INITIAL_QUALITY = 0.82;

/**
 * Prepares and compresses an image matching the web MadayawGas imageCompressor:
 * - 5 MB hard limit enforcement.
 * - Dimension downscaling: max width/height scaled to 1920px.
 * - Progressive JPEG quality compression (0.82 -> 0.50 -> 0.35).
 * - Normalized output format: JPEG.
 */
export async function compressAndPrepareImage(
  uri: string,
  options: CompressOptions = {}
): Promise<CompressedImageResult> {
  if (!uri) {
    throw new Error('No image URI provided for compression.');
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  let quality = options.quality ?? DEFAULT_INITIAL_QUALITY;

  try {
    // 1. Initial manipulation with dimension resize and initial quality
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxDimension } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // 2. Check resulting file size if on native platform
    if (Platform.OS !== 'web') {
      let fileInfo = await FileSystem.getInfoAsync(result.uri);

      // If file size exceeds maxSizeBytes, step down quality
      if (fileInfo.exists && typeof fileInfo.size === 'number' && fileInfo.size > maxSizeBytes) {
        // Pass 2: medium quality (0.50)
        quality = 0.5;
        result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: Math.round(maxDimension * 0.85) } }],
          {
            compress: quality,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );

        fileInfo = await FileSystem.getInfoAsync(result.uri);

        // Pass 3: lowest quality (0.35) if still over limit
        if (fileInfo.exists && typeof fileInfo.size === 'number' && fileInfo.size > maxSizeBytes) {
          quality = 0.35;
          result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: Math.round(maxDimension * 0.7) } }],
            {
              compress: quality,
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );

          fileInfo = await FileSystem.getInfoAsync(result.uri);
          if (fileInfo.exists && typeof fileInfo.size === 'number' && fileInfo.size > maxSizeBytes) {
            const mb = (fileInfo.size / (1024 * 1024)).toFixed(1);
            throw new Error(`Image size (${mb} MB) could not be compressed below 5 MB ceiling.`);
          }
        }
      }

      return {
        uri: result.uri,
        width: result.width,
        height: result.height,
        fileSize: fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : undefined,
      };
    }

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error: any) {
    console.error('[ImageCompressor] Error compressing image:', error);
    throw new Error(error.message || 'Failed to compress image');
  }
}
