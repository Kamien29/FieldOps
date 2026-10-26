import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { MAX_UPLOAD_PHOTO_BYTES } from './files';

/**
 * Each photo is a separate Base64 JSON request. A binary file above ~3 MiB
 * may exceed Vercel's 4.5 MB request cap. Compress BEFORE persisting in SQLite.
 * Works for camera and gallery, online and offline.
 */
export async function makeUploadReadyJpeg(uri: string): Promise<string> {
  for (const width of [1600, 1280, 1024, 800, 640]) {
    for (const quality of [0.75, 0.55, 0.40]) {
      const result = await ImageManipulator.manipulateAsync(uri, [{resize:{width}}], {
        compress:quality, format:ImageManipulator.SaveFormat.JPEG,
      });
      const info = await FileSystem.getInfoAsync(result.uri);
      if (info.exists && typeof info.size === 'number' && info.size > 0 && info.size <= MAX_UPLOAD_PHOTO_BYTES) {
        return result.uri;
      }
    }
  }
  throw new Error('Zdjęcie jest zbyt duże. Spróbuj wykonać zdjęcie niższej jakości.');
}
