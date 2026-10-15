import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { createServer } from './server.js';

const db = openDb();
if (seedIfEmpty(db)) console.log('Seeded demo data (jan@fieldops.local / anna@fieldops.local, password: fieldops123)');
const port = Number(process.env.PORT || 3000);
createServer(db).listen(port, '0.0.0.0', () => console.log(`FieldOps backend listening on :${port}`));
