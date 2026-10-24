import * as FileSystem from 'expo-file-system/legacy';

export const PHOTO_DIR = `${FileSystem.documentDirectory}photos/`;
/** DB stores only the file name: the app sandbox path can change between app updates (iOS). */
export const photoUri = (fileName: string) => PHOTO_DIR + fileName;
