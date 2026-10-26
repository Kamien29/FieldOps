import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMigrationAllowed, describeTarget } from '../src/migration-policy.js';

test('only allows local DB without explicit production consent', () => {
  const local = assertMigrationAllowed({DATABASE_URL:'postgresql://user:secret@localhost:5432/fieldops_demo'});
  assert.equal(local.database, 'fieldops_demo');
  assert.equal(local.isLocal, true);
});
test('refuses hosted database without explicit backup acknowledgement', () => {
  const url='postgresql://u:secret@ep-example.neon.tech/neondb?sslmode=require';
  assert.throws(() => assertMigrationAllowed({DATABASE_URL:url}), /backup/i);
  assert.deepEqual(assertMigrationAllowed({DATABASE_URL:url,FIELDOPS_MIGRATE_CONFIRM:'YES_I_HAVE_A_BACKUP'}), {
    host:'ep-example.neon.tech',database:'neondb',isLocal:false,
  });
});
test('rejects malformed or non-PostgreSQL URLs', () => {
  for (const bad of ['', 'not-a-url', 'https://host/db', 'postgresql://host/']) {
    assert.throws(() => describeTarget(bad));
  }
});
