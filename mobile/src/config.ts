/** Android Expo Go uses the public Vercel API, not localhost. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://fieldops-6mm7.vercel.app').replace(/\/$/, '');
