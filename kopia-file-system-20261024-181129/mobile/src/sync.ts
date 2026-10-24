import * as FileSystem from 'expo-file-system';
import { ApiError, NetworkError, apiFetch } from './api';
import * as db from './db';
import { emitDataChange } from './events';
import { photoUri } from './files';
import type { Job, OutboxRow, ServerJob } from './types';

class LocalError extends Error {}

export interface SyncResult { ok: boolean; reason?: 'offline' | 'auth' | 'error' }

let authExpired: (() => void) | null = null;
export const setAuthExpiredHandler = (fn: (() => void) | null) => { authExpired = fn; };

let running: Promise<SyncResult> | null = null;
let again = false;

/** Single-flight: concurrent calls coalesce; a call during a run schedules exactly one more run. */
export function syncNow(): Promise<SyncResult> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      let res: SyncResult;
      do { again = false; res = await runOnce(); } while (again && res.ok);
      return res;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runOnce(): Promise<SyncResult> {
  try {
    await push();
    await pull();
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { authExpired?.(); return { ok: false, reason: 'auth' }; }
    if (e instanceof NetworkError) return { ok: false, reason: 'offline' };
    return { ok: false, reason: 'error' };
  } finally {
    emitDataChange();
  }
}

async function push() {
  const blocked = new Set(await db.blockedJobIds());
  for (const m of await db.listOutbox()) {
    if (blocked.has(m.jobId)) continue; // keep order per job: nothing is sent after a conflict/error
    const job = await db.getJob(m.jobId);
    if (!job) { await db.deleteOutbox(m.id); continue; }
    try {
      await sendOne(m, job);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.body?.server) {
          await db.markConflict(m.jobId, e.body.server as ServerJob);
        } else if (e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500) {
          throw e; // transient: retry on next sync
        } else {
          await db.markJobError(m.jobId, `${e.status} ${e.code}`);
        }
        blocked.add(m.jobId);
        emitDataChange();
        continue;
      }
      if (e instanceof LocalError) {
        await db.markJobError(m.jobId, e.message);
        blocked.add(m.jobId);
        emitDataChange();
        continue;
      }
      throw e; // NetworkError or unexpected
    }
  }
}

async function sendOne(m: OutboxRow, job: Job) {
  switch (m.kind) {
    case 'photo': {
      const photo = await db.getPhoto(m.payload.photoId);
      if (!photo) { await db.deleteOutbox(m.id); return; }
      const uri = photoUri(photo.fileName);
      if (!(await FileSystem.getInfoAsync(uri)).exists) throw new LocalError('Brak pliku zdjęcia na telefonie');
      const dataBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      await apiFetch(`/api/jobs/${job.id}/photos`, { method: 'POST', body: { id: photo.id, mime: 'image/jpeg', dataBase64 }, timeoutMs: 60000 });
      await db.markPhotoUploaded(photo.id);
      await db.deleteOutbox(m.id);
      return;
    }
    case 'photo_delete': {
      await apiFetch(`/api/jobs/${job.id}/photos/${m.payload.photoId}`, { method: 'DELETE' });
      await db.ackMutation(m.id, job.id, job.version);
      return;
    }
    case 'status': {
      const r = await apiFetch<{ job: ServerJob }>(`/api/jobs/${job.id}/status`, {
        method: 'POST', idempotencyKey: m.id, body: { status: m.payload.status, baseVersion: job.version } });
      await db.ackMutation(m.id, job.id, r.job.version);
      return;
    }
    case 'report': {
      const r = await apiFetch<{ job: ServerJob }>(`/api/jobs/${job.id}/report`, {
        method: 'PUT', idempotencyKey: m.id, body: { ...m.payload, baseVersion: job.version } });
      await db.ackMutation(m.id, job.id, r.job.version);
      return;
    }
  }
}

async function pull() {
  const since = (await db.getMeta('last_sync')) ?? '';
  const r = await apiFetch<{ serverTime: string; jobs: ServerJob[] }>(`/api/jobs?since=${encodeURIComponent(since)}`);
  await db.applyServerJobs(r.jobs);
  await db.setMeta('last_sync', r.serverTime);
}
