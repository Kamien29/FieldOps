import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';
import { ApiError, NetworkError, apiFetch } from './api';
import * as db from './db';
import { emitDataChange } from './events';
import { MAX_UPLOAD_PHOTO_BYTES, PHOTO_DIR, photoUri } from './files';
import { makeUploadReadyJpeg } from './photo-processing';
import type { Job, OutboxRow, ServerJob } from './types';

class LocalError extends Error {}

/** Display actionable sync errors rather than raw HTTP status codes. */
function describePermanentFailure(error: ApiError): string {
  const messages: Record<string,string> = {
    invalid_file_type: 'Zdjęcie ma nieprawidłowy format. Dodaj je ponownie.',
    payload_too_large: 'Zdjęcie jest zbyt duże. Dodaj je ponownie po zmniejszeniu.',
    photo_total_too_large: 'Przekroczono łączny limit zdjęć (40 MiB).',
    too_many_photos: 'Maksymalnie 10 zdjęć w jednym raporcie.',
    invalid_signature: 'Podpis ma nieprawidłowy format. Złóż podpis ponownie.',
    invalid_recipientFullName: 'Raport wymaga imienia i nazwiska osoby odbierającej.',
    unknown_photo: 'Serwer nie potwierdził zdjęcia. Spróbuj zsynchronizować ponownie.',
    report_already_exists: 'Na serwerze jest już raport do tego zlecenia. Sprawdź wersję serwera.',
    job_not_in_progress: 'Zlecenie nie jest w trakcie realizacji na serwerze.',
  };
  return messages[error.code] ?? `Serwer odrzucił zmianę (${error.status}: ${error.code}).`;
}

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
          await db.markJobError(m.jobId, describePermanentFailure(e));
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
      if (!photo) { await db.ackMutation(m.id,job.id,job.version); return; }
      let uri = photoUri(photo.fileName);
      let info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) throw new LocalError('Brak pliku zdjęcia na telefonie');
      if (typeof info.size !== 'number' || info.size > MAX_UPLOAD_PHOTO_BYTES) {
        // Old SDK versions could save 10 MiB photos. Upgrade those drafts safely
        // without changing the stable photo ID in the already queued report.
        const resized = await makeUploadReadyJpeg(uri);
        const nextName = `${photo.id}-resized.jpg`;
        const nextUri = photoUri(nextName);
        await FileSystem.copyAsync({from:resized,to:nextUri});
        await db.setPhotoFileName(photo.id,nextName);
        await FileSystem.deleteAsync(uri,{idempotent:true}).catch(() => {});
        uri = nextUri;
        info = await FileSystem.getInfoAsync(uri);
      }
      if (!info.exists || typeof info.size !== 'number' || info.size > MAX_UPLOAD_PHOTO_BYTES) {
        throw new LocalError('Zdjęcie nie może zostać zmniejszone do 2,5 MiB.');
      }
      const dataBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      await apiFetch(`/api/jobs/${job.id}/photos`, { method: 'POST', body: { id: photo.id, mime: 'image/jpeg', dataBase64 }, timeoutMs: 60000 });
      await db.acknowledgePhotoUpload(photo.id,m.id,job.id);
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
  // Update local SQLite first. If media download fails, retry on next sync.
  await db.applyServerJobs(r.jobs);
  await db.setMeta('last_sync', r.serverTime);
  await cacheRemotePhotos();
}

/**
 * Private authenticated photo download, stored in the persistent document folder.
 * Download failure does not erase the report or block subsequent offline work.
 * Files not yet downloaded are retried on each sync, including after an app restart.
 */
async function cacheRemotePhotos() {
  const token = await SecureStore.getItemAsync('token');
  if (!token) return;
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, {intermediates:true});
  const missing = await db.listRemotePhotos();
  for (const photo of missing) {
    const destination = photoUri(photo.fileName);
    if ((await FileSystem.getInfoAsync(destination)).exists) continue;
    const temp = `${destination}.download`;
    try {
      const response = await FileSystem.downloadAsync(
        `${API_URL}/api/photos/${encodeURIComponent(photo.id)}`, temp,
        {headers:{Authorization:`Bearer ${token}`}},
      );
      if (response.status !== 200) throw new Error(`photo download: HTTP ${response.status}`);
      await FileSystem.moveAsync({from:temp,to:destination});
    } catch {
      await FileSystem.deleteAsync(temp,{idempotent:true}).catch(() => {});
      // Photo itself remains referenced in local SQLite for later retry.
    }
  }
}
