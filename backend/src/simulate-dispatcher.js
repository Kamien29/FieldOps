// Simulates a dispatcher editing a job on the server (bumps version) -> lets you test conflict resolution.
// Usage: npm run simulate-change -- J-1001 "ul. Nowa 1, Rzeszów"
import { openDb } from './db.js';

const [id, address = 'ul. Zmieniona 1, Rzeszów'] = process.argv.slice(2);
if (!id) { console.error('Usage: npm run simulate-change -- <JOB_ID> [new address]'); process.exit(1); }
const db = openDb();
const r = db.prepare('UPDATE jobs SET address=?, version=version+1, updated_at=? WHERE id=?')
  .run(address, new Date().toISOString(), id);
if (!r.changes) { console.error(`Job ${id} not found`); process.exit(1); }
console.log(`Job ${id} updated on server:`, db.prepare('SELECT id,address,version FROM jobs WHERE id=?').get(id));
