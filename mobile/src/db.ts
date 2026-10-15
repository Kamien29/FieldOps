import * as SQLite from 'expo-sqlite';
import { emitDataChange } from './events';
import { uid } from './util';
import type { Job, JobStatus, MutationKind, OutboxRow, Photo, Report, ServerJob } from './types';

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;
export const getDb = () => (dbp ??= init());

async function init() {
  const db = await SQLite.openDatabaseAsync('fieldops.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, customer TEXT NOT NULL, address TEXT NOT NULL,
      scheduled_at TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
      sync_state TEXT NOT NULL DEFAULT 'synced', sync_error TEXT, conflict_json TEXT
    );
    CREATE TABLE IF NOT EXISTS reports (
      job_id TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', lat REAL, lng REAL,
      device_code TEXT, signature_svg TEXT, submitted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, file_name TEXT NOT NULL,
      uploaded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, job_id TEXT NOT NULL,
      kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

/* ---------- mappers ---------- */
const mapJob = (r: any): Job => ({
  id: r.id, title: r.title, customer: r.customer, address: r.address, scheduledAt: r.scheduled_at,
  status: r.status, version: r.version, syncState: r.sync_state, syncError: r.sync_error,
  conflict: r.conflict_json ? JSON.parse(r.conflict_json) : null,
});
const mapReport = (r: any): Report => ({
  jobId: r.job_id, note: r.note, lat: r.lat, lng: r.lng, deviceCode: r.device_code,
  signatureSvg: r.signature_svg, submitted: !!r.submitted,
});
const mapPhoto = (r: any): Photo => ({
  id: r.id, jobId: r.job_id, fileName: r.file_name, uploaded: !!r.uploaded, createdAt: r.created_at,
});
const emptyReport = (jobId: string): Report => ({
  jobId, note: '', lat: null, lng: null, deviceCode: null, signatureSvg: null, submitted: false,
});

/* ---------- meta ---------- */
export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key=?', [key]);
  return r?.value ?? null;
}
export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
}

/* ---------- reads ---------- */
export async function listJobs(): Promise<Job[]> {
  const db = await getDb();
  return (await db.getAllAsync('SELECT * FROM jobs ORDER BY scheduled_at')).map(mapJob);
}
export async function getJob(id: string): Promise<Job | null> {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM jobs WHERE id=?', [id]);
  return r ? mapJob(r) : null;
}
export async function getReport(jobId: string): Promise<Report> {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM reports WHERE job_id=?', [jobId]);
  return r ? mapReport(r) : emptyReport(jobId);
}
export async function listPhotos(jobId: string): Promise<Photo[]> {
  const db = await getDb();
  return (await db.getAllAsync('SELECT * FROM photos WHERE job_id=? ORDER BY created_at', [jobId])).map(mapPhoto);
}
export async function getPhoto(id: string): Promise<Photo | null> {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM photos WHERE id=?', [id]);
  return r ? mapPhoto(r) : null;
}
export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  return r?.c ?? 0;
}
export async function listOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM outbox ORDER BY seq');
  return rows.map((r) => ({ seq: r.seq, id: r.id, jobId: r.job_id, kind: r.kind, payload: JSON.parse(r.payload) }));
}
export async function blockedJobIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>("SELECT id FROM jobs WHERE sync_state IN ('conflict','error')");
  return rows.map((r) => r.id);
}

/* ---------- local edits (UI) ---------- */
type Draft = Partial<Pick<Report, 'note' | 'lat' | 'lng' | 'deviceCode' | 'signatureSvg'>>;
const DRAFT_COLUMNS: Record<keyof Draft, string> = {
  note: 'note', lat: 'lat', lng: 'lng', deviceCode: 'device_code', signatureSvg: 'signature_svg',
};

export async function saveDraft(jobId: string, patch: Draft) {
  const db = await getDb();
  const keys = Object.keys(patch) as (keyof Draft)[];
  if (!keys.length) return;
  await db.runAsync('INSERT OR IGNORE INTO reports(job_id) VALUES(?)', [jobId]);
  const set = keys.map((k) => `${DRAFT_COLUMNS[k]}=?`).join(', ');
  await db.runAsync(`UPDATE reports SET ${set} WHERE job_id=? AND submitted=0`, [...keys.map((k) => patch[k] ?? null), jobId]);
  emitDataChange();
}

async function enqueueTx(db: SQLite.SQLiteDatabase, kind: MutationKind, jobId: string, payload: object, id = uid()) {
  await db.runAsync('INSERT INTO outbox(id,job_id,kind,payload,created_at) VALUES(?,?,?,?,?)',
    [id, jobId, kind, JSON.stringify(payload), new Date().toISOString()]);
  if (kind !== 'photo') {
    await db.runAsync("UPDATE jobs SET sync_state='pending' WHERE id=? AND sync_state='synced'", [jobId]);
  }
}

export async function addPhoto(jobId: string, id: string, fileName: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO photos(id,job_id,file_name,uploaded,created_at) VALUES(?,?,?,0,?)',
      [id, jobId, fileName, new Date().toISOString()]);
    await enqueueTx(db, 'photo', jobId, { photoId: id }, `photo-${id}`);
  });
  emitDataChange();
}
export async function removePhoto(id: string): Promise<string | null> {
  const db = await getDb();
  const p = await getPhoto(id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM photos WHERE id=?', [id]);
    await db.runAsync('DELETE FROM outbox WHERE id=?', [`photo-${id}`]);
  });
  emitDataChange();
  return p?.fileName ?? null;
}

async function setStatusTx(db: SQLite.SQLiteDatabase, jobId: string, status: JobStatus) {
  await db.runAsync('UPDATE jobs SET status=? WHERE id=?', [status, jobId]);
  await enqueueTx(db, 'status', jobId, { status });
}
export async function startJob(jobId: string) {
  const db = await getDb();
  await db.withTransactionAsync(() => setStatusTx(db, jobId, 'in_progress'));
  emitDataChange();
}
export async function submitReport(jobId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const r = await getReport(jobId);
    const photos = await listPhotos(jobId);
    await db.runAsync('INSERT OR IGNORE INTO reports(job_id) VALUES(?)', [jobId]);
    await db.runAsync('UPDATE reports SET submitted=1 WHERE job_id=?', [jobId]);
    await enqueueTx(db, 'report', jobId, {
      note: r.note, lat: r.lat, lng: r.lng, deviceCode: r.deviceCode,
      signatureSvg: r.signatureSvg, photoIds: photos.map((p) => p.id),
    });
    await setStatusTx(db, jobId, 'done');
  });
  emitDataChange();
}

/* ---------- sync engine helpers ---------- */
export async function deleteOutbox(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE id=?', [id]);
}
export async function markPhotoUploaded(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE photos SET uploaded=1 WHERE id=?', [id]);
}
/** A report/status mutation was accepted by the server. */
export async function ackMutation(mutationId: string, jobId: string, serverVersion: number) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox WHERE id=?', [mutationId]);
    await db.runAsync('UPDATE jobs SET version=? WHERE id=?', [serverVersion, jobId]);
    const left = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) AS c FROM outbox WHERE job_id=? AND kind IN ('report','status')", [jobId]);
    if (!left?.c) await db.runAsync("UPDATE jobs SET sync_state='synced', sync_error=NULL WHERE id=?", [jobId]);
  });
}
export async function markConflict(jobId: string, server: ServerJob) {
  const db = await getDb();
  await db.runAsync("UPDATE jobs SET sync_state='conflict', conflict_json=?, sync_error=NULL WHERE id=?", [JSON.stringify(server), jobId]);
}
export async function markJobError(jobId: string, message: string) {
  const db = await getDb();
  await db.runAsync("UPDATE jobs SET sync_state='error', sync_error=? WHERE id=?", [message, jobId]);
}

async function writeServerJob(db: SQLite.SQLiteDatabase, sj: ServerJob) {
  await db.runAsync(
    `INSERT INTO jobs(id,title,customer,address,scheduled_at,status,version,sync_state,sync_error,conflict_json)
     VALUES(?,?,?,?,?,?,?,'synced',NULL,NULL)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, customer=excluded.customer, address=excluded.address,
       scheduled_at=excluded.scheduled_at, status=excluded.status, version=excluded.version,
       sync_state='synced', sync_error=NULL, conflict_json=NULL`,
    [sj.id, sj.title, sj.customer, sj.address, sj.scheduledAt, sj.status, sj.version]);
  if (sj.report) {
    // Never overwrite an unsent local draft; overwrite submitted/missing local reports.
    const local = await db.getFirstAsync<{ submitted: number }>('SELECT submitted FROM reports WHERE job_id=?', [sj.id]);
    if (!local || local.submitted) {
      await db.runAsync(
        `INSERT INTO reports(job_id,note,lat,lng,device_code,signature_svg,submitted) VALUES(?,?,?,?,?,?,1)
         ON CONFLICT(job_id) DO UPDATE SET note=excluded.note, lat=excluded.lat, lng=excluded.lng,
           device_code=excluded.device_code, signature_svg=excluded.signature_svg, submitted=1`,
        [sj.id, sj.report.note, sj.report.lat, sj.report.lng, sj.report.deviceCode, sj.report.signatureSvg]);
    }
  }
}

/** Pull: apply server jobs, except those with local unsent work (push handles them / flags conflicts). */
export async function applyServerJobs(jobs: ServerJob[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const sj of jobs) {
      const busy = await db.getFirstAsync<{ c: number }>(
        `SELECT (SELECT COUNT(*) FROM outbox WHERE job_id=? AND kind IN ('report','status'))
              + (SELECT COUNT(*) FROM jobs WHERE id=? AND sync_state IN ('conflict','error')) AS c`, [sj.id, sj.id]);
      if (busy?.c) continue;
      await writeServerJob(db, sj);
    }
  });
}

/* ---------- conflict / error resolution ---------- */
export async function resolveKeepMine(jobId: string) {
  const db = await getDb();
  const job = await getJob(jobId);
  if (!job?.conflict) return;
  const s = job.conflict;
  // Adopt the server's base data (title/address/...) and version; keep my status + report, resend my mutations.
  await db.runAsync(
    `UPDATE jobs SET title=?, customer=?, address=?, scheduled_at=?, version=?,
       sync_state='pending', conflict_json=NULL, sync_error=NULL WHERE id=?`,
    [s.title, s.customer, s.address, s.scheduledAt, s.version, jobId]);
  emitDataChange();
}
export async function resolveUseServer(jobId: string) {
  const db = await getDb();
  const job = await getJob(jobId);
  if (!job?.conflict) return;
  const server = job.conflict;
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM outbox WHERE job_id=? AND kind IN ('report','status')", [jobId]);
    // Server has a report -> let it overwrite the local one (submitted=1 allows overwrite).
    // Server has none -> keep my text as an editable, unsent draft.
    await db.runAsync('UPDATE reports SET submitted=? WHERE job_id=?', [server.report ? 1 : 0, jobId]);
    await writeServerJob(db, server);
  });
  emitDataChange();
}
export async function retryJob(jobId: string) {
  const db = await getDb();
  await db.runAsync("UPDATE jobs SET sync_state='pending', sync_error=NULL WHERE id=?", [jobId]);
  emitDataChange();
}
export async function discardLocalChanges(jobId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox WHERE job_id=?', [jobId]);
    await db.runAsync('UPDATE reports SET submitted=0 WHERE job_id=?', [jobId]);
    await db.runAsync("UPDATE jobs SET sync_state='synced', sync_error=NULL, conflict_json=NULL WHERE id=?", [jobId]);
    await db.runAsync("UPDATE meta SET value='' WHERE key='last_sync'"); // force full pull to restore server state
  });
  emitDataChange();
}

export async function wipeLocalData() {
  const db = await getDb();
  await db.execAsync('DELETE FROM jobs; DELETE FROM reports; DELETE FROM photos; DELETE FROM outbox; DELETE FROM meta;');
  emitDataChange();
}
