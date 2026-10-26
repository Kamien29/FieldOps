import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { ApiError, NetworkError, apiFetch } from './api';
import * as db from './db';
import { emitDataChange } from './events';
import { API_URL } from './config';
import { photoUri, PHOTO_DIR, MAX_UPLOAD_PHOTO_BYTES } from './files';
import { makeUploadReadyJpeg } from './photo-processing';
import { nextRetryAt, shouldRetry } from './retry-policy';
import type { Job, OutboxRow, ServerJob } from './types';

class LocalError extends Error {}

/** UI-friendly, actionable descriptions of permanent backend validation errors. */
function explain(error: ApiError): string {
  const known: Record<string, string> = {
    invalid_file_type: 'Nieprawidłowy format zdjęcia — dodaj zdjęcie ponownie.',
    payload_too_large: 'Zdjęcie przekracza limit serwera — zmniejsz je.',
    photo_total_too_large: 'Przekroczono łączny limit zdjęć dla raportu.',
    too_many_photos: 'Można dodać maksymalnie 10 zdjęć.',
    unknown_photo: 'Jedno ze zdjęć nie dotarło na serwer. Ponów synchronizację.',
    invalid_signature: 'Podpis klienta jest nieprawidłowy. Złóż go ponownie.',
    report_already_exists: 'Raport już istnieje na serwerze. Sprawdź konflikt.',
    job_not_in_progress: 'Zlecenie nie jest już w realizacji na serwerze.',
    job_id_taken: 'Identyfikator zlecenia jest już zajęty. Skontaktuj się z administratorem.',
  };
  return known[error.code] ?? `Serwer odrzucił operację (${error.status}, ${error.code}).`;
}

export interface SyncResult {
  ok: boolean;
  reason?: 'offline' | 'auth' | 'error' | 'backoff';
  sent: number;
  remaining: number;
  nextRetryAt?: number;
}
let authExpired: (() => void) | null = null;
export function setAuthExpiredHandler(fn: (() => void) | null) { authExpired = fn; }
let running: Promise<SyncResult> | null = null;
let rerun = false;

/** Single-flight: two callers cannot upload the same outbox row concurrently. */
export function syncNow(force = false): Promise<SyncResult> {
  if (running) { rerun = true; return running; }
  running = (async () => {
    try {
      let result: SyncResult;
      do {
        rerun = false;
        result = await runOnce(force);
      } while (rerun && result.ok);
      return result;
    } finally { running = null; }
  })();
  return running;
}

async function runOnce(force: boolean): Promise<SyncResult> {
  const deadline = Number((await db.getMeta('sync_next_retry')) || 0);
  if (!shouldRetry(Date.now(),deadline,force)) {
    return { ok:false, reason:'backoff', sent:0, remaining:await db.pendingCount(), nextRetryAt:deadline };
  }
  const before = await db.pendingCount();
  try {
    await push();
    await pull();
    await db.setMeta('sync_failures','0');
    await db.setMeta('sync_next_retry','0');
    await db.setMeta('last_sync_success',new Date().toISOString());
    const remaining = await db.pendingCount();
    return { ok:remaining === 0, reason: remaining ? 'error' : undefined,
      sent:Math.max(0,before - remaining),remaining };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Never clear SQLite/offline queue here; request re-login without losing drafts.
      authExpired?.();
      return {ok:false,reason:'auth',sent:0,remaining:await db.pendingCount()};
    }
    // Backoff only transient errors. Permanent per-job errors are marked in push()
    // and never stop the other jobs from syncing.
    const failures = Math.min(16,Number((await db.getMeta('sync_failures')) || 0) + 1);
    const next = nextRetryAt(Date.now(), failures);
    await db.setMeta('sync_failures',String(failures));
    await db.setMeta('sync_next_retry',String(next));
    return {ok:false, reason:e instanceof NetworkError ? 'offline' : 'error',
      sent:0,remaining:await db.pendingCount(),nextRetryAt:next};
  } finally { emitDataChange(); }
}

async function push(): Promise<void> {
  const blocked = new Set(await db.blockedJobIds());
  // Snapshot preserves original chronological order, including create -> status -> photos -> report.
  for (const mutation of await db.listOutbox()) {
    if (blocked.has(mutation.jobId)) continue;
    const job = await db.getJob(mutation.jobId);
    if (!job) {
      // Missing parent is a permanent local consistency error, not a successful upload.
      throw new LocalError(`Brak lokalnego zlecenia ${mutation.jobId}.`);
    }
    try { await sendOne(mutation,job); }
    catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.body?.server) await db.markConflict(mutation.jobId,e.body.server as ServerJob);
        else if (e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500) throw e;
        else await db.markJobError(mutation.jobId,explain(e));
        blocked.add(mutation.jobId);
        emitDataChange();
        continue;
      }
      if (e instanceof LocalError) {
        await db.markJobError(mutation.jobId,e.message);
        blocked.add(mutation.jobId);
        emitDataChange();
        continue;
      }
      throw e;
    }
  }
}

async function sendOne(m: OutboxRow, job: Job): Promise<void> {
  const path = `/api/jobs/${encodeURIComponent(job.id)}`;
  switch (m.kind) {
    case 'create': {
      const reply = await apiFetch<{job: ServerJob}>('/api/jobs', {
        method:'POST', idempotencyKey:m.id, body:{...m.payload,id:job.id},timeoutMs:30_000 });
      await db.ackMutation(m.id,job.id,reply.job.version);
      return;
    }
    case 'edit': {
      const reply = await apiFetch<{job: ServerJob}>(path, {
        method:'PATCH',idempotencyKey:m.id,body:{...m.payload,baseVersion:job.version} });
      await db.ackMutation(m.id,job.id,reply.job.version);
      return;
    }
    case 'status': {
      const reply = await apiFetch<{job: ServerJob}>(`${path}/status`, {
        method:'POST',idempotencyKey:m.id,body:{status:m.payload.status,baseVersion:job.version} });
      await db.ackMutation(m.id,job.id,reply.job.version);
      return;
    }
    case 'photo': {
      const photo = await db.getPhoto(m.payload.photoId);
      if (!photo) throw new LocalError('Nie znaleziono zdjęcia. Sprawdź lokalne pliki raportu.');
      let uri = photoUri(photo.fileName);
      let info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) throw new LocalError('Brak zdjęcia w pamięci telefonu.');
      if (typeof info.size !== 'number' || info.size > MAX_UPLOAD_PHOTO_BYTES) {
        const resized = await makeUploadReadyJpeg(uri);
        const nextFileName = `${photo.id}-small.jpg`;
        const nextUri = photoUri(nextFileName);
        await FileSystem.copyAsync({from:resized,to:nextUri});
        await db.setPhotoFileName(photo.id,nextFileName);
        await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{});
        uri=nextUri;
        info=await FileSystem.getInfoAsync(uri);
      }
      if (!info.exists || !info.size || info.size > MAX_UPLOAD_PHOTO_BYTES) {
        throw new LocalError('Nie udało się zmniejszyć zdjęcia do limitu 2,5 MiB.');
      }
      const dataBase64 = await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});
      await apiFetch(`${path}/photos`,{method:'POST',body:{id:photo.id,mime:'image/jpeg',dataBase64},timeoutMs:60_000});
      // Atomic: photo uploaded + remove outbox. A crash before ack retries same stable ID.
      await db.acknowledgePhotoUpload(photo.id,m.id,job.id);
      return;
    }
    case 'photo_delete': {
      await apiFetch(`${path}/photos/${encodeURIComponent(m.payload.photoId)}`,{method:'DELETE'});
      await db.ackMutation(m.id,job.id,job.version);
      return;
    }
    case 'report': {
      const reply=await apiFetch<{job:ServerJob}>(`${path}/report`,{
        method:'PUT',idempotencyKey:m.id,body:{...m.payload,baseVersion:job.version}});
      await db.ackMutation(m.id,job.id,reply.job.version);
      return;
    }
    default: {
      const never: never = m.kind;
      throw new LocalError(`Nieobsługiwany typ zmiany: ${never}`);
    }
  }
}

async function pull(): Promise<void> {
  const since=(await db.getMeta('last_sync')) ?? '';
  const response=await apiFetch<{serverTime:string;jobs:ServerJob[]}>(
    `/api/jobs?since=${encodeURIComponent(since)}`);
  await db.applyServerJobs(response.jobs);
  await db.setMeta('last_sync',response.serverTime); // only after successful SQLite update
  // Try remote image downloads separately. Their failure must not lose the server cursor.
  await cacheRemotePhotos();
}

async function cacheRemotePhotos(): Promise<void> {
  const token=await SecureStore.getItemAsync('token');
  if (!token) return;
  const missing=await db.listRemotePhotos();
  if (!missing.length) return;
  await FileSystem.makeDirectoryAsync(PHOTO_DIR,{intermediates:true});
  for (const photo of missing) {
    const destination=photoUri(photo.fileName);
    if ((await FileSystem.getInfoAsync(destination)).exists) continue;
    const temp=destination+'.download';
    try {
      const response=await FileSystem.downloadAsync(
        `${API_URL}/api/photos/${encodeURIComponent(photo.id)}`,temp,
        {headers:{Authorization:`Bearer ${token}`}});
      if (response.status!==200) throw new Error(`HTTP ${response.status}`);
      await FileSystem.moveAsync({from:temp,to:destination});
    } catch {
      await FileSystem.deleteAsync(temp,{idempotent:true}).catch(()=>{});
    }
  }
}
