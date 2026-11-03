import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {getPool} from './db.js';
import {assertMigrationAllowed} from './migration-policy.js';

async function main() {
  const target=assertMigrationAllowed();
  console.log(`Migration target: ${target.host}/${target.database} (password hidden)`);
  const migrations=['001_initial.sql','002_report_completion.sql','003_teams_and_collaboration.sql'];
  const statements=await Promise.all(migrations.map(name=>readFile(
    fileURLToPath(new URL(`../db/migrations/${name}`,import.meta.url)),'utf8')));
  const pool=getPool();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(20261020, 1)');
    for(let i=0;i<statements.length;i++) {
      await client.query(statements[i]);
      console.log(`Applied: ${migrations[i]}`);
    }
    await client.query('COMMIT');
    console.log('FieldOps PostgreSQL schema ready');
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();await pool.end();}
}
main().catch(error=>{console.error('Migration failed:',error);process.exitCode=1});
