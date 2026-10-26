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
      scheduled_at TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, version INTEGER NOT NULL,
      updated_at TEXT,
      has_report INTEGER NOT NULL DEFAULT 0,
      sync_state TEXT NOT NULL DEFAULT 'synced', sync_error TEXT, conflict_json TEXT
    );
    CREATE TABLE IF NOT EXISTS reports (
      job_id TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', recipient_full_name TEXT NOT NULL DEFAULT '',
      lat REAL, lng REAL, location_accuracy REAL, device_code TEXT, signature_svg TEXT, submitted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT, completed_at TEXT
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
  const reportColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reports)');
  const jobColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(jobs)');
  if (!jobColumns.some((column) => column.name === 'description')) {
    await db.execAsync("ALTER TABLE jobs ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  if (!jobColumns.some((column) => column.name === 'updated_at')) {
    await db.execAsync('ALTER TABLE jobs ADD COLUMN updated_at TEXT');
  }
  if (!jobColumns.some((column) => column.name === 'has_report')) {
    await db.execAsync('ALTER TABLE jobs ADD COLUMN has_report INTEGER NOT NULL DEFAULT 0');
  }
  if (!reportColumns.some((column) => column.name === 'recipient_full_name')) {
    await db.execAsync("ALTER TABLE reports ADD COLUMN recipient_full_name TEXT NOT NULL DEFAULT ''");
  }
  if (!reportColumns.some((column) => column.name === 'created_at')) {
    await db.execAsync('ALTER TABLE reports ADD COLUMN created_at TEXT');
  }
  if (!reportColumns.some((column) => column.name === 'completed_at')) {
    await db.execAsync('ALTER TABLE reports ADD COLUMN completed_at TEXT');
  }
  if (!reportColumns.some((column) => column.name === 'location_accuracy')) {
    await db.execAsync('ALTER TABLE reports ADD COLUMN location_accuracy REAL');
  }
  return db;
}

/* ---------- mappers ---------- */
const mapJob = (r: any): Job => ({
  id: r.id, title: r.title, customer: r.customer, address: r.address, scheduledAt: r.scheduled_at,
  description: r.description ?? '', updatedAt: r.updated_at ?? null,
  status: r.status, version: r.version, syncState: r.sync_state, syncError: r.sync_error,
  conflict: r.conflict_json ? JSON.parse(r.conflict_json) : null, hasReport: !!r.has_report,
});
const mapReport = (r: any): Report => ({
  jobId: r.job_id, note: r.note, recipientFullName: r.recipient_full_name ?? '',
  lat: r.lat, lng: r.lng, locationAccuracy: r.location_accuracy ?? null, deviceCode: r.device_code,
  signatureSvg: r.signature_svg, submitted: !!r.submitted, createdAt: r.created_at ?? null,
  completedAt: r.completed_at ?? null,
});
const mapPhoto = (r: any): Photo => ({
  id: r.id, jobId: r.job_id, fileName: r.file_name, uploaded: !!r.uploaded, createdAt: r.created_at,
});
const emptyReport = (jobId: string): Report => ({
  jobId, note: '', recipientFullName: '', lat: null, lng: null, locationAccuracy: null, deviceCode: null,
  signatureSvg: null, submitted: false, createdAt: null, completedAt: null,
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
/** Photo IDs received from web/another phone; missing bytes are downloaded later. */
export async function listRemotePhotos(): Promise<Photo[]> {
  const database=await getDb();
  const rows=await database.getAllAsync('SELECT * FROM photos WHERE file_name LIKE ?', ['remote-%']);
  return rows.map(mapPhoto);
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
type Draft = Partial<Pick<Report, 'note' | 'recipientFullName' | 'lat' | 'lng' | 'locationAccuracy' | 'deviceCode' | 'signatureSvg'>>;
const DRAFT_COLUMNS: Record<keyof Draft, string> = {
  note: 'note', recipientFullName: 'recipient_full_name', lat: 'lat', lng: 'lng', locationAccuracy: 'location_accuracy',
  deviceCode: 'device_code', signatureSvg: 'signature_svg',
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
  // Photos are pending work too; always count them in the UI.
  await db.runAsync("UPDATE jobs SET sync_state='pending' WHERE id=? AND sync_state='synced'", [jobId]);
}

/** Fields usable without connectivity. `id` is created on the device and kept on server. */
export interface JobInput {
  title: string; customer: string; address: string; scheduledAt: string; description?: string;
}
function checkJobInput(input: JobInput): Required<JobInput> {
  const title = input.title.trim();
  const customer = input.customer.trim();
  const address = input.address.trim();
  const description = (input.description ?? '').trim();
  const scheduledAt = new Date(input.scheduledAt);
  if (!title || title.length > 200 || !customer || customer.length > 200 ||
      !address || address.length > 300 || description.length > 5000 ||
      !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getUTCFullYear() < 2000 || scheduledAt.getUTCFullYear() > 2100) {
    throw new Error('Uzupełnij tytuł, klienta, adres i poprawny termin zlecenia.');
  }
  return { title, customer, address, description, scheduledAt: scheduledAt.toISOString() };
}
/** Atomic: job + outbox entry survive process termination as a single SQLite transaction. */
export async function createLocalJob(input: JobInput): Promise<string> {
  const values = checkJobInput(input);
  const id = `J-${uid().replace(/-/g, '').toUpperCase()}`;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO jobs(id,title,customer,address,scheduled_at,description,status,version,updated_at,sync_state)
       VALUES(?,?,?,?,?,?,'new',0,?,'pending')`,
      [id,values.title,values.customer,values.address,values.scheduledAt,values.description,new Date().toISOString()]);
    await enqueueTx(db,'create',id,{...values,id});
  });
  emitDataChange();
  return id;
}
/** Edit local fields immediately; queue changes in chronological order. */
export async function editLocalJob(jobId: string, input: JobInput): Promise<void> {
  const values = checkJobInput(input);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ sync_state: string }>('SELECT sync_state FROM jobs WHERE id=?',[jobId]);
    if (!row) throw new Error('Zlecenie nie istnieje.');
    if (row.sync_state === 'conflict' || row.sync_state === 'error') {
      throw new Error('Najpierw rozwiąż konflikt lub błąd synchronizacji.');
    }
    await db.runAsync(
      'UPDATE jobs SET title=?,customer=?,address=?,scheduled_at=?,description=?,updated_at=? WHERE id=?',
      [values.title,values.customer,values.address,values.scheduledAt,values.description,new Date().toISOString(),jobId]);
    // NEVER rewrite a pending CREATE payload: the HTTP request may already have
    // committed on the server even if the phone lost its response. Editing that
    // payload would silently lose this change when the idempotency replay returns.
    // Instead keep each edit as a separate ordered, stable outbox operation.
    await enqueueTx(db,'edit',jobId,values);
  });
  emitDataChange();
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
    if (p?.uploaded) {
      await enqueueTx(db, 'photo_delete', p.jobId, { photoId: id }, `delete-photo-${id}`);
    } else {
      await db.runAsync('DELETE FROM outbox WHERE id=?', [`photo-${id}`]);
    }
    await db.runAsync('DELETE FROM photos WHERE id=?', [id]);
  });
  emitDataChange();
  return p?.fileName ?? null;
}

async function setStatusTx(db: SQLite.SQLiteDatabase, jobId: string, status: JobStatus) {
  await db.runAsync('UPDATE jobs SET status=? WHERE id=?', [status, jobId]);
  await enqueueTx(db, 'status', jobId, { status });
}
export async function startJob(jobId: string) {
  const current = await getJob(jobId);
  if (!current || current.status !== 'new') throw new Error('Zlecenia nie można teraz rozpocząć.');
  const db = await getDb();
  await db.withTransactionAsync(() => setStatusTx(db, jobId, 'in_progress'));
  emitDataChange();
}
export async function submitReport(jobId: string) {
  const current = await getJob(jobId);
  if (!current || current.status !== 'in_progress') throw new Error('Zlecenie nie jest w realizacji.');
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const r = await getReport(jobId);
    const photos = await listPhotos(jobId);
    if (!r.note.trim()) throw new Error('note_required');
    if (r.recipientFullName.trim().split(/\s+/).length < 2) throw new Error('recipient_name_required');
    if (!r.signatureSvg) throw new Error('signature_required');
    const completedAt = new Date().toISOString();
    await db.runAsync('INSERT OR IGNORE INTO reports(job_id) VALUES(?)', [jobId]);
    await db.runAsync('UPDATE reports SET submitted=1,completed_at=? WHERE job_id=?', [completedAt, jobId]);
    await enqueueTx(db, 'report', jobId, {
      note: r.note, recipientFullName: r.recipientFullName.trim(),
      lat: r.lat, lng: r.lng, locationAccuracy: r.locationAccuracy, deviceCode: r.deviceCode,
      signatureSvg: r.signatureSvg, photoIds: photos.map((p) => p.id),
    });
    await db.runAsync("UPDATE jobs SET status='done',has_report=1 WHERE id=?", [jobId]);
  });
  emitDataChange();
}

/* ---------- sync engine helpers ---------- */
export async function deleteOutbox(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE id=?', [id]);
}
/** Photo progress and ack share one transaction so a crash cannot send it twice accidentally. */
export async function acknowledgePhotoUpload(photoId: string, mutationId: string, jobId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE photos SET uploaded=1 WHERE id=?',[photoId]);
    await db.runAsync('DELETE FROM outbox WHERE id=?',[mutationId]);
    const left = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox WHERE job_id=?',[jobId]);
    if (!left?.c) await db.runAsync("UPDATE jobs SET sync_state='synced',sync_error=NULL WHERE id=?",[jobId]);
  });
}
export async function setPhotoFileName(id: string, fileName: string) {
  const db = await getDb();
  await db.runAsync('UPDATE photos SET file_name=? WHERE id=? AND uploaded=0',[fileName,id]);
}
/** A report/status mutation was accepted by the server. */
export async function ackMutation(mutationId: string, jobId: string, serverVersion: number) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox WHERE id=?', [mutationId]);
    await db.runAsync('UPDATE jobs SET version=? WHERE id=?', [serverVersion, jobId]);
    const left = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM outbox WHERE job_id=?', [jobId]);
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
    `INSERT INTO jobs(id,title,customer,address,scheduled_at,description,status,version,updated_at,has_report,sync_state,sync_error,conflict_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,'synced',NULL,NULL)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, customer=excluded.customer, address=excluded.address,
       scheduled_at=excluded.scheduled_at,description=excluded.description,updated_at=excluded.updated_at,
       status=excluded.status, version=excluded.version, has_report=excluded.has_report,
       sync_state='synced', sync_error=NULL, conflict_json=NULL`,
    [sj.id, sj.title, sj.customer, sj.address, sj.scheduledAt, sj.description ?? '',
      sj.status, sj.version, sj.updatedAt ?? null, sj.report ? 1 : 0]);
  if (sj.report) {
    // Remote photos become locally addressable even when the phone is offline later.
    for (const id of sj.report.photoIds || []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO photos(id,job_id,file_name,uploaded,created_at)
         VALUES(?,?,?,1,?)`,
        [id,sj.id,`remote-${id}.jpg`,sj.report.completedAt || new Date().toISOString()]);
    }
    // Never overwrite an unsent local draft; overwrite submitted/missing local reports.
    const local = await db.getFirstAsync<{ submitted: number }>('SELECT submitted FROM reports WHERE job_id=?', [sj.id]);
    if (!local || local.submitted) {
      await db.runAsync(
        `INSERT INTO reports(job_id,note,recipient_full_name,lat,lng,location_accuracy,device_code,signature_svg,submitted,created_at,completed_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(job_id) DO UPDATE SET note=excluded.note, lat=excluded.lat, lng=excluded.lng,
           recipient_full_name=excluded.recipient_full_name, location_accuracy=excluded.location_accuracy,
           device_code=excluded.device_code,
           signature_svg=excluded.signature_svg, submitted=1, created_at=excluded.created_at,
           completed_at=excluded.completed_at`,
        [sj.id, sj.report.note, sj.report.recipientFullName, sj.report.lat, sj.report.lng, sj.report.locationAccuracy,
          sj.report.deviceCode, sj.report.signatureSvg, 1, sj.report.createdAt, sj.report.completedAt]);
    }
  }
}

/** Pull: apply server jobs, except those with local unsent work (push handles them / flags conflicts). */
export async function applyServerJobs(jobs: ServerJob[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const sj of jobs) {
      const busy = await db.getFirstAsync<{ c: number }>(
        `SELECT (SELECT COUNT(*) FROM outbox WHERE job_id=?)
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
  // Keep local field values and queued operations, adopt ONLY current server version.
  // An edit mutation will resubmit the local values against the new baseVersion.
  await db.runAsync(
    `UPDATE jobs SET version=?,sync_state='pending',conflict_json=NULL,sync_error=NULL WHERE id=?`,
    [s.version,jobId]);
  emitDataChange();
}
export async function resolveUseServer(jobId: string) {
  const db = await getDb();
  const job = await getJob(jobId);
  if (!job?.conflict) return;
  const server = job.conflict;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox WHERE job_id=?',[jobId]);
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
