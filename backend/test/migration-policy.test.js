import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMigrationAllowed} from '../src/migration-policy.js';
test('local DB migration is allowed',()=>{
  const local=assertMigrationAllowed({DATABASE_URL:'postgresql://me:pw@localhost:5432/fieldops_test'});
  assert.equal(local.isLocal,true);
});
test('remote DB migration demands explicit backup acknowledgement',()=>{
  const env={DATABASE_URL:'postgresql://user:secret@example.neon.tech/neondb'};
  assert.throws(()=>assertMigrationAllowed(env),/backup/i);
  assert.equal(assertMigrationAllowed({...env,FIELDOPS_MIGRATE_CONFIRM:'YES_I_HAVE_A_BACKUP'}).isLocal,false);
});
