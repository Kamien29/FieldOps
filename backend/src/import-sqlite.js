// One-time import of an old FieldOps SQLite database into an EMPTY PostgreSQL database.
// Prerequisite: npm run migrate. Export SQLITE_FILE=/absolute/path/to/fieldops.db
import { DatabaseSync } from 'node:sqlite';
import { access } from 'node:fs/promises';
import { transaction, all, query, getPool } from './db.js';

const file = process.env.SQLITE_FILE;
if (!file) { console.error('Set SQLITE_FILE to an existing SQLite database path'); process.exit(1); }
await access(file);
const sqlite = new DatabaseSync(file, { readOnly: true });
const tables = [
  ['users', ['id','email','name','password_hash']],
  ['devices', ['id','user_id','serial','name','model','location','generated','created_at','updated_at']],
  ['jobs', ['id','assigned_to','title','customer','address','scheduled_at','description','created_at','status','version','updated_at','device_id']],
  ['reports', ['job_id','note','lat','lng','device_code','signature_svg','photo_ids','updated_at']],
  ['photos', ['id','job_id','mime','data','created_at']],
  ['idempotency', ['key','status','body','created_at']],
];
try {
  await transaction(async client => {
    await query('SELECT pg_advisory_xact_lock(20261020, 2)', [], client);
    for (const [table] of tables) {
      if ((await all(`SELECT 1 FROM ${table} LIMIT 1`, [], client)).length) {
        throw new Error(`Target PostgreSQL table ${table} is not empty. Import cancelled, no rows were added.`);
      }
    }
    for (const [table, columns] of tables) {
      const found = sqlite.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
      if (!found.length) throw new Error(`Missing source table ${table}`);
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const present = columns.filter(col => found.includes(col));
        const params = present.map(col => row[col] instanceof Uint8Array ? Buffer.from(row[col]) : row[col] ?? null);
        await query(`INSERT INTO ${table} (${present.join(',')}) VALUES (${present.map((_,i)=>'$'+(i+1)).join(',')})`, params, client);
      }
      console.log(`Imported ${rows.length} records from ${table}`);
    }
  });
  console.log('Import complete. Run consistency checks before going live.');
} finally {
  sqlite.close();
  await getPool().end();
}
