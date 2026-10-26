import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';
import { getMeta, pendingCount, setMeta, wipeLocalData } from './db';

export class NetworkError extends Error {}
export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: any) {
    super(`${status} ${code}`);
  }
}

interface Opts { method?: string; body?: unknown; idempotencyKey?: string; auth?: boolean; timeoutMs?: number }

export async function apiFetch<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const token = await SecureStore.getItemAsync('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? 'GET', headers, signal: ctrl.signal,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new NetworkError('network');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'http_error', data);
  return data as T;
}

export async function login(email: string, password: string) {
  const r = await apiFetch<{ token: string; user: { id: string; name: string; email: string } }>(
    '/api/login', { method: 'POST', body: { email, password }, auth: false, timeoutMs: 15000 });
  const previousAccountId = (await getMeta('account_user_id')) ||
    (await SecureStore.getItemAsync('token'))?.split('.')[0] || null;
  if (previousAccountId && previousAccountId !== r.user.id) {
    if (await pendingCount() > 0) {
      throw new Error('Na telefonie są niewysłane zmiany innego konta. Zaloguj się na poprzednie konto i zsynchronizuj dane.');
    }
    await wipeLocalData();
  }
  await setMeta('account_user_id', r.user.id);
  await SecureStore.setItemAsync('token', r.token);
  return r.user;
}
