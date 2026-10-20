import { handleRequest } from '../src/server.js';

// Vercel Node.js function for /api/* (same-origin).
export default async function handler(req, res) {
  await handleRequest(req, res);
}
