import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { MAX_UPLOAD_PHOTO_BYTES } from './files';
/** Rescale and compress each photo before uploading; never change the stable photo ID. */
export async function makeUploadReadyJpeg(uri: string): Promise<string> {
  for (const width of [1600,1280,1024,800,640]) {
    for (const compress of [0.75,0.55,0.4]) {
      const r=await ImageManipulator.manipulateAsync(uri,[{resize:{width}}],{
        compress,format:ImageManipulator.SaveFormat.JPEG});
      const info=await FileSystem.getInfoAsync(r.uri);
      if (info.exists && typeof info.size==='number' && info.size>0 && info.size<=MAX_UPLOAD_PHOTO_BYTES) return r.uri;
    }
  }
  throw new Error('Zdjęcie jest zbyt duże. Spróbuj wykonać zdjęcie w niższej rozdzielczości.');
}
