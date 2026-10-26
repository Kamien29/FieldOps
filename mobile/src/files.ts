import * as FileSystem from 'expo-file-system/legacy';
export const PHOTO_DIR = `${FileSystem.documentDirectory}photos/`;
export const photoUri = (fileName: string) => PHOTO_DIR + fileName;
// A Base64 JSON request must fit Vercel's 4.5 MiB request-body limit.
export const MAX_UPLOAD_PHOTO_BYTES = Math.floor(2.5 * 1024 * 1024);
