/** Week 4 HTTP contract tests using an in-memory fake PostgreSQL adapter.
 * Real routing, authentication and idempotency middleware are exercised.
 * No connection to Neon or external services is made.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

let folder,server,base;
const fakeDB=String.raw`
const users = new Map(), jobs=new Map(), idempotency=new Map();
const result=(rows=[])=>({rows});
export async function one(sql,params=[],client) {
  if (/SELECT \* FROM users WHERE email/.test(sql)) return [...users.values()].find(u=>u.email===params[0])??null;
  if (/SELECT 1 FROM users WHERE id/.test(sql)) return [...users.values()].some(u=>u.id===params[0])?{ok:1}:null;
  if (/SELECT \* FROM jobs WHERE id/.test(sql)) return jobs.get(params[0])??null;
  if (/SELECT \* FROM jobs WHERE id=\$1 AND assigned_to/.test(sql)) {
    const j=jobs.get(params[0]);return j?.assigned_to===params[1]?j:null;
  }
  if (/SELECT \* FROM reports/.test(sql)) return null;
  if (/SELECT status, body FROM idempotency/.test(sql)) return idempotency.get(params[0])??null;
  if (/SELECT 1 FROM devices/.test(sql)) return null;
  throw Error('unexpected one SQL: '+sql);
}
export async function all(sql,params=[],client) {
  if (/FROM jobs WHERE assigned_to/.test(sql)) return [...jobs.values()].filter(j=>j.assigned_to===params[0] && j.updated_at>=params[1]);
  throw Error('unexpected all SQL: '+sql);
}
export async function query(sql,p=[],client) {
  if (/pg_advisory_xact_lock/.test(sql)) return result();
  if (/^INSERT INTO users/.test(sql)) {
    const [id,email,name,password_hash]=p;
    if ([...users.values()].some(u=>u.email===email)) throw Object.assign(new Error('duplicate'),{code:'23505'});
    users.set(id,{id,email,name,password_hash});return result();
  }
  if (/^INSERT INTO jobs/.test(sql)) {
    const [id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at,device_id]=p;
    if (jobs.has(id)) throw Object.assign(new Error('duplicate'),{code:'23505'});
    jobs.set(id,{id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at,device_id,version:1});return result();
  }
  if (/^UPDATE jobs SET title/.test(sql)) {
    const [title,description,customer,address,scheduled_at,device_id,updated_at,id,assigned_to]=p;
    const j=jobs.get(id);if (!j||j.assigned_to!==assigned_to) throw Error('missing job');
    Object.assign(j,{title,description,customer,address,scheduled_at,device_id,updated_at,version:j.version+1});return result();
  }
  if (/^INSERT INTO idempotency/.test(sql)) {
    const [key,status,body,created_at]=p;idempotency.set(key,{key,status,body,created_at});return result();
  }
  throw Error('unexpected query SQL: '+sql);
}
export async function transaction(fn) {
  const backup=[structuredClone([...users]),structuredClone([...jobs]),structuredClone([...idempotency])];
  try{return await fn({});}
  catch(error){for(const [m,values] of [[users,backup[0]],[jobs,backup[1]],[idempotency,backup[2]]]){
    m.clear();for(const [key,value] of values) m.set(key,value);
  }throw error;}
}
`;

before(async()=>{
  process.env.TOKEN_SECRET='unit-tests-only-secret-32-characters-long';
  folder=await mkdtemp(join(tmpdir(),'fieldops-week4-'));
  await writeFile(join(folder,'package.json'),'{"type":"module"}');
  const source=new URL('../src/',import.meta.url);
  for(const name of ['server.js','auth.js','report-service.js','report-validation.js','team-api.js']) {
    await cp(new URL(name,source),join(folder,name));
  }
  await writeFile(join(folder,'db.js'),fakeDB);
  const mod=await import(pathToFileURL(join(folder,'server.js')).href);
  server=mod.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  await new Promise(resolve=>server?.close(resolve));
  if(folder)await rm(folder,{recursive:true,force:true});
});
async function request(path,method='GET',body=null,token=null,key=null) {
  const headers={};if (body!==null)headers['Content-Type']='application/json';
  if (token) headers.Authorization=`Bearer ${token}`;
  if (key)headers['Idempotency-Key']=key;
  const response=await fetch(base+path,{method,headers,body:body===null?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
}

test('offline create uses stable ID, key replay does not create twice, mismatched version returns server copy',async()=>{
  const registration=await request('/api/register','POST',{name:'Testowy Serwisant',email:'week4-test@fieldops.example',password:'test-password-123'});
  assert.equal(registration.status,201);
  const token=registration.data.token;
  const job={id:'J-offline-test00000001',title:'Offline inspection',customer:'Firma Alfa',address:'Rzeszów',
    description:'Before upload',scheduledAt:'2026-11-01T12:00:00.000Z'};
  const missingKey=await request('/api/jobs','POST',job,token);
  assert.equal(missingKey.status,400);
  assert.equal(missingKey.data.error,'idempotency_key_required');
  const created=await request('/api/jobs','POST',job,token,'offline-create-1');
  assert.equal(created.status,201);
  assert.equal(created.data.job.id,job.id);
  assert.equal(created.data.job.version,1);
  const replay=await request('/api/jobs','POST',job,token,'offline-create-1');
  assert.equal(replay.status,201);
  assert.deepEqual(replay.data,created.data);
  const jobs=await request('/api/jobs', 'GET',null,token);
  assert.equal(jobs.status,200);
  assert.equal(jobs.data.jobs.filter(x=>x.id===job.id).length,1);
  const edited=await request('/api/jobs/'+job.id,'PATCH',{title:'Online edit',baseVersion:1},token,'web-edit-1');
  assert.equal(edited.status,200);
  assert.equal(edited.data.job.version,2);
  const clash=await request('/api/jobs/'+job.id,'PATCH',{title:'Stale offline edit',baseVersion:1},token,'offline-edit-2');
  assert.equal(clash.status,409);
  assert.equal(clash.data.error,'conflict');
  assert.equal(clash.data.server.version,2);
  assert.equal(clash.data.server.title,'Online edit');
  const next=await request('/api/jobs/'+job.id,'PATCH',{title:'Resolved offline edit',baseVersion:2},token,'offline-edit-3');
  assert.equal(next.status,200);
  assert.equal(next.data.job.version,3);
  const increment=await request('/api/jobs?since=2100-01-01T00%3A00%3A00.000Z','GET',null,token);
  assert.equal(increment.status,200);
  assert.equal(increment.data.jobs.length,0);
});
