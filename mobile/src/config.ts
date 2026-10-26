/** Public API origin. No /api suffix: apiFetch adds route paths itself. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://fieldops-6mm7.vercel.app')
  .trim().replace(/\/+$/, '');
