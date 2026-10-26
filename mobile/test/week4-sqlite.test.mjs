/** Real SQLite tests for offline records and chronological outbox.
 * React Native sqlite APIs are adapted to the built-in node:sqlite engine.
 * Requires Node 22+; no Expo runtime, Android device or production database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

function harness() {
  const sqlite=new DatabaseSync(':memory:');
  const connection={
    execAsync: async(sql)=>sqlite.exec(sql),
    getAllAsync: async(sql,params=[])=>sqlite.prepare(sql).all(...params),
    getFirstAsync:async(sql,params=[])=>sqlite.prepare(sql).get(...params)??null,
    runAsync:async(sql,params=[])=>sqlite.prepare(sql).run(...params),
    withTransactionAsync:async(fn)=>{
      sqlite.exec('BEGIN');
      try {const out=await fn();sqlite.exec('COMMIT');return out;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    },
  };
  let code=readFileSync(new URL('../src/db.ts',import.meta.url),'utf8');
  code=code.replace("import * as SQLite from 'expo-sqlite';",'const SQLite={openDatabaseAsync:async()=>connection};')
    .replace("import { emitDataChange } from './events';",'const emitDataChange=()=>{};')
    .replace("import { uid } from './util';",'let ids=0;const uid=()=>`fixed-${++ids}`;');
  code=stripTypeScriptTypes(code,{mode:'transform'})
    .replace(/^export\s+/gm,'')
    .replace(/^import type .*;\s*$/gm,'');
  code+='\n globalThis.__testApi={getDb,createLocalJob,editLocalJob,listOutbox,listJobs,\n    getJob,startJob,submitReport,saveDraft,addPhoto,acknowledgePhotoUpload,\n    ackMutation,pendingCount,applyServerJobs,markConflict,resolveKeepMine,resolveUseServer,\n    getMeta,setMeta,retryJob};';
  const scope={connection,console,Date,JSON,Promise,Error,Set,Map};
  vm.runInNewContext(code,scope,{filename:'mobile/src/db.ts'});
  return {api:scope.__testApi,sqlite};
}

const job={title:'Przegląd offline',customer:'Firma Alfa',address:'Rzeszów',
  description:'Wymiana filtra',scheduledAt:'2026-11-01T12:00:00.000Z'};

test('offline create and edit remain separate durable ordered mutations',async()=>{
  const {api,sqlite}=harness();
  const id=await api.createLocalJob(job);
  assert.ok(id.startsWith('J-'));
  assert.equal((await api.listJobs()).length,1);
  assert.equal(await api.pendingCount(),1);
  assert.equal((await api.listOutbox())[0].kind,'create');
  await api.editLocalJob(id,{...job,title:'Nowy tytuł'});
  assert.equal(await api.pendingCount(),2);
  assert.deepEqual(Array.from(await api.listOutbox(),m=>m.kind),['create','edit']);
  assert.equal((await api.listOutbox())[1].payload.title,'Nowy tytuł');
  const rows=sqlite.prepare('SELECT * FROM outbox ORDER BY seq').all();
  assert.equal(rows.length,2);
  const recreated=sqlite.prepare('SELECT title FROM jobs WHERE id=?').get(id);
  assert.equal(recreated.title,'Nowy tytuł');
});

test('photo & report wait after create and status; acks preserve pending flag',async()=>{
  const {api}=harness();
  const id=await api.createLocalJob(job);
  await api.startJob(id);
  await api.addPhoto(id,'image-0001','image-0001.jpg');
  await api.saveDraft(id,{note:'Zmieniono filtr',recipientFullName:'Adam Kowalski',signatureSvg:'<svg/>'});
  await api.submitReport(id);
  assert.deepEqual(Array.from(await api.listOutbox(),x=>x.kind),['create','status','photo','report']);
  const rows=await api.listOutbox();
  await api.ackMutation(rows[0].id,id,1);
  await api.ackMutation(rows[1].id,id,2);
  await api.acknowledgePhotoUpload('image-0001',rows[2].id,id);
  assert.equal((await api.getJob(id)).syncState,'pending');
  await api.ackMutation(rows[3].id,id,3);
  assert.equal((await api.getJob(id)).syncState,'synced');
  assert.equal(await api.pendingCount(),0);
});

test('conflict protects local draft and does not overwrite offline edits on pull',async()=>{
  const {api}=harness();
  const id=await api.createLocalJob(job);
  const server={id,title:'Zmiana na serwerze',customer:job.customer,address:job.address,
    scheduledAt:job.scheduledAt,status:'new',version:4,updatedAt:new Date().toISOString(),report:null};
  await api.applyServerJobs([server]);
  assert.equal((await api.getJob(id)).title,job.title);
  await api.markConflict(id,server);
  assert.equal((await api.getJob(id)).syncState,'conflict');
  await api.resolveKeepMine(id);
  assert.equal((await api.getJob(id)).title,job.title);
  assert.equal((await api.getJob(id)).version,4);
});
