import * as FileSystem from 'expo-file-system/legacy';

/** Private persistent directory. Never store temporary camera-cache paths in SQLite. */
export const PHOTO_DIR = `${FileSystem.documentDirectory}photos/`;
/** DB stores names, not sandbox URLs; the directory may change on app upgrade. */
export const photoUri = (fileName: string) => PHOTO_DIR + fileName;

// Binary size safe for Base64 JSON inside Vercel's 4.5 MB request limit.
export const MAX_UPLOAD_PHOTO_BYTES = Math.floor(2.5 * 1024 * 1024);
