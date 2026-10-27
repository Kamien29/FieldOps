/** Team API contract tests: isolated fake persistence, no Neon credentials/network.
 * Tests execute the real team route module and fake the SQL adapter boundary.
 */
import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

let dir,handler,fixtures;
const fakeDB=String.raw`
export const state={
  users:new Map([
    ['u-owner',{id:'u-owner',name:'Owner',email:'owner@test.pl'}],
    ['u-member',{id:'u-member',name:'Member',email:'member@test.pl'}],
    ['u-stranger',{id:'u-stranger',name:'Stranger',email:'stranger@test.pl'}],
  ]), orgs:new Map(),members:new Map(),invites:new Map(),offers:new Map(),jobs:new Map(), messages:[],photos:new Set(),reports:new Set(),
};
const member=(org,user)=>state.members.get(org+'|'+user);
const rows=(items)=>({rows:items});
export async function one(sql,p=[]) {
  if (sql.startsWith('SELECT role FROM organization_members')) {let role=member(p[0],p[1]);return role?{role}:null;}
  if (sql.includes('FROM organizations') && sql.includes('WHERE created_by=')) return [...state.orgs.values()].find(o=>o.created_by===p[0]&&o.name.toLowerCase()===p[1].toLowerCase())??null;
  if (sql.startsWith('SELECT email FROM users')) return state.users.get(p[0])??null;
  if (sql.includes('SELECT 1 FROM organization_members WHERE')) return member(p[0],p[1])?{ok:1}:null;
  if (sql.includes('SELECT * FROM organization_invitations')) return state.invites.get(p[0])??null;
  if (sql.includes('SELECT * FROM jobs WHERE id=')) return state.jobs.get(p[0])??null;
  if (sql.includes('SELECT 1 FROM jobs WHERE organization_id=')) return [...state.jobs.values()].some(j=>j.organization_id===p[0]&&j.assigned_to===p[1])?{ok:1}:null;
  if (sql.includes('SELECT 1 FROM reports')) return state.reports.has(p[0])?{ok:1}:null;
  if (sql.includes('SELECT 1 FROM photos')) return state.photos.has(p[0])?{ok:1}:null;
  if (sql.includes('SELECT id,name FROM users WHERE lower(email)')) return [...state.users.values()].find(x=>x.email===p[0])??null;
  if (sql.includes('SELECT 1 FROM job_offers')) return [...state.offers.values()].some(x=>x.job_id===p[0]&&x.status==='pending')?{ok:1}:null;
  if (sql.includes('SELECT * FROM job_offers')) return state.offers.get(p[0])??null;
  if (sql.startsWith('SELECT avatar_mime,avatar_data FROM users')) return state.users.get(p[0])??null;
  if (sql.includes('SELECT 1 FROM organization_members m JOIN users')) {
    return [...state.users.values()].some(u=>u.email===p[1]&&member(p[0],u.id))?{ok:1}:null;
  }
  throw Error('Unhandled one SQL: '+sql);
}
export async function all(sql,p=[]) {
  if (sql.includes('FROM organizations o JOIN organization_members')) return [...state.orgs.values()].filter(o=>member(o.id,p[0])).map(o=>({...o,role:member(o.id,p[0]), member_count:[...state.members.keys()].filter(k=>k.startsWith(o.id+'|')).length}));
  if (sql.includes('FROM organization_invitations i JOIN organizations')) return [...state.invites.values()].filter(i=>i.email===p[0] && i.status==='pending').map(i=>({...i,organization_name:state.orgs.get(i.organization_id).name,invited_by_name:state.users.get(i.invited_by).name}));
  if (sql.includes('FROM organization_members m') && sql.includes('JOIN users u')) return [...state.members.keys()].filter(k=>k.startsWith(p[0]+'|')).map(k=>{let u=state.users.get(k.split('|')[1]);return {...u,role:state.members.get(k),has_avatar:!!u.avatar_data};});
  if (sql.includes('FROM jobs j JOIN users u')) return [...state.jobs.values()].filter(j=>j.organization_id===p[0]).map(j=>({...j,assigned_name:state.users.get(j.assigned_to).name}));
  if (sql.includes('FROM job_offers f JOIN jobs')) return [...state.offers.values()].filter(o=>o.sender_id===p[0]||o.recipient_id===p[0]).map(o=>({...o,title:state.jobs.get(o.job_id).title,job_status:state.jobs.get(o.job_id).status,sender_name:state.users.get(o.sender_id).name,recipient_name:state.users.get(o.recipient_id).name,organization_name:state.orgs.get(o.organization_id)?.name}));
  if (sql.includes('INSERT INTO organization_messages')) {let i=state.messages.length+1;state.messages.push({id:i,organization_id:p[0],sender_id:p[1],recipient_id:p[2],content:p[3],created_at:p[4]});return [{id:i}];}
  if (sql.includes('FROM organization_messages m')) return state.messages.filter(m=>m.organization_id===p[0] && (p.length===1?!m.recipient_id:((m.sender_id===p[1]&&m.recipient_id===p[2])||(m.sender_id===p[2]&&m.recipient_id===p[1])))).map(m=>({...m,sender_name:state.users.get(m.sender_id).name})).reverse();
  throw Error('Unhandled all SQL: '+sql);
}
export async function query(sql,p=[]) {
  if (sql.startsWith('SELECT pg_advisory_xact_lock')) return rows([]);
  if (sql.startsWith('INSERT INTO organizations')) {state.orgs.set(p[0],{id:p[0],name:p[1],created_by:p[2],created_at:p[3]});return rows([]);}
  if (sql.startsWith('INSERT INTO organization_members')) {state.members.set(p[0]+'|'+p[1],sql.includes("'owner'")?'owner':'member');return rows([]);}
  if (sql.startsWith('INSERT INTO organization_invitations')) {state.invites.set(p[0],{id:p[0],organization_id:p[1],email:p[2],invited_by:p[3],status:'pending',created_at:p[4]});return rows([]);}
  if (sql.startsWith('UPDATE organization_invitations')) {let i=state.invites.get(p[2]);i.status=p[0];i.responded_at=p[1];return rows([]);}
  if (sql.startsWith('INSERT INTO job_offers')) {state.offers.set(p[0],{id:p[0],job_id:p[1],sender_id:p[2],recipient_id:p[3],organization_id:p[4],job_version:p[5],status:'pending',created_at:p[6]});return rows([]);}
  if (sql.startsWith("UPDATE job_offers SET status='expired'")) {let o=state.offers.get(p[1]);o.status='expired';return rows([]);}
  if (sql.startsWith('DELETE FROM organization_members')) {state.members.delete(p[0]+'|'+p[1]);return rows([]);}
  if (sql.startsWith('UPDATE job_offers')) {let o=state.offers.get(p[2]);o.status=p[0];return rows([]);}
  if (sql.startsWith('UPDATE jobs SET assigned_to=')) {let j=state.jobs.get(p[2]);j.assigned_to=p[0];j.device_id=null;j.version++;return rows([]);}
  if (sql.startsWith('INSERT INTO jobs')) {state.jobs.set(p[0],{id:p[0],assigned_to:p[1],title:p[2],customer:p[3],address:p[4],scheduled_at:p[5],description:p[6],status:'new',version:1,organization_id:p[8]});return rows([]);}
  if (sql.startsWith('UPDATE users SET avatar_mime=')) {Object.assign(state.users.get(p[2]),{avatar_mime:p[0],avatar_data:p[1]});return rows([]);}
  if (sql.startsWith('UPDATE users SET avatar_data=NULL')) {Object.assign(state.users.get(p[0]),{avatar_mime:null,avatar_data:null});return rows([]);}
  throw Error('Unhandled query SQL: '+sql);
}
export async function transaction(fn) {return fn({});}
`;

before(async()=>{
  dir=await mkdtemp(join(tmpdir(),'fieldops-team-api-'));
  await writeFile(join(dir,'package.json'),'{"type":"module"}');
  await cp(new URL('../src/team-api.js',import.meta.url),join(dir,'team-api.js'));
  await writeFile(join(dir,'db.js'),fakeDB);
  handler=(await import(pathToFileURL(join(dir,'team-api.js')).href)).handleTeamRoute;
  fixtures=(await import(pathToFileURL(join(dir,'db.js')).href)).state;
});
after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
async function run(path,method,actor,body) {
  const record={status:0,data:null,raw:null,headers:null};
  const res={
    writeHead(status,headers){record.status=status;record.headers=headers;},
    end(data){record.raw=data;},
  };
  const send=(resp,status,data)=>{resp.writeHead(status,{'content-type':'application/json'});resp.end(JSON.stringify(data));};
  const fail=(status,code)=>Object.assign(new Error(code),{status,code});
  try {
    const handled=await handler({req:{},res,p:path,m:method,userId:actor,readJson:async()=>body,send,fail,now:()=>new Date().toISOString()});
    record.data=record.headers?.['content-type']==='application/json'?JSON.parse(record.raw):null;
    return {...record,handled};
  }catch(error){return {status:error.status||500,error:error.code||error.message};}
}
const mkOrg=async()=>{
  const r=await run('/api/organizations','POST','u-owner',{name:'Serwis Alfa'});
  assert.equal(r.status,201);return r.data.organization.id;
};

test('organization invitation is visible only to the invited address; outsider cannot enter chat',async()=>{
  const org=await mkOrg();
  let r=await run(`/api/organizations/${org}/messages`,'GET','u-stranger');
  assert.equal(r.status,404);
  r=await run(`/api/organizations/${org}/invites`,'POST','u-owner',{email:'member@test.pl'});
  assert.equal(r.status,201);
  assert.equal((await run('/api/invitations','GET','u-stranger')).data.invitations.length,0);
  const invitation=(await run('/api/invitations','GET','u-member')).data.invitations[0];
  assert.ok(invitation.id);
  assert.equal((await run(`/api/invitations/${invitation.id}/accept`,'POST','u-stranger')).status,404);
  assert.equal((await run(`/api/invitations/${invitation.id}/accept`,'POST','u-member')).status,200);
  assert.equal((await run(`/api/organizations/${org}/members`,'GET','u-member')).data.members.length,2);
  assert.equal((await run(`/api/organizations/${org}/members`,'GET','u-stranger')).status,404);
});

test('company chat and direct chat protect conversation membership',async()=>{
  const org=[...fixtures.orgs.keys()][0];
  let r=await run(`/api/organizations/${org}/messages`,'POST','u-owner',{content:'Dzień dobry, ekipo'});
  assert.equal(r.status,201);
  assert.equal((await run(`/api/organizations/${org}/messages`,'GET','u-member')).data.messages.length,1);
  assert.equal((await run(`/api/organizations/${org}/messages`,'GET','u-stranger')).status,404);
  assert.equal((await run(`/api/organizations/${org}/messages/u-stranger`,'POST','u-member',{content:'Tajne'})).status,404);
  assert.equal((await run(`/api/organizations/${org}/messages/u-member`,'POST','u-owner',{content:'Prywatna wiadomość'})).status,201);
  assert.equal((await run(`/api/organizations/${org}/messages/u-owner`,'GET','u-member')).data.messages[0].content,'Prywatna wiadomość');
  assert.equal((await run(`/api/organizations/${org}/messages`,'GET','u-member')).data.messages.length,1);
});

test('job offer requires owner and receiver acceptance; wrong receiver denied, replay blocked',async()=>{
  fixtures.jobs.set('J-test-12345',{id:'J-test-12345',assigned_to:'u-owner',status:'new',title:'Naprawa pompy',version:2,organization_id:null});
  assert.equal((await run('/api/job-offers','POST','u-member',{jobId:'J-test-12345',toEmail:'stranger@test.pl'})).status,404);
  let r=await run('/api/job-offers','POST','u-owner',{jobId:'J-test-12345',toEmail:'u-member@test.pl'});
  assert.equal(r.status,404); // recipient must be a registered user
  r=await run('/api/job-offers','POST','u-owner',{jobId:'J-test-12345',toEmail:'member@test.pl'});
  assert.equal(r.status,201);
  const offerId=r.data.offer.id;
  assert.equal((await run(`/api/job-offers/${offerId}/accept`,'POST','u-stranger')).status,404);
  assert.equal((await run(`/api/job-offers/${offerId}/accept`,'POST','u-member')).status,200);
  assert.equal(fixtures.jobs.get('J-test-12345').assigned_to,'u-member');
  assert.equal(fixtures.jobs.get('J-test-12345').version,3);
  assert.equal((await run(`/api/job-offers/${offerId}/accept`,'POST','u-member')).status,404);
});

test('company jobs belong to a group, and outsider cannot create them',async()=>{
  const org=[...fixtures.orgs.keys()][0];
  const fields={title:'Przegląd',customer:'Klient',address:'Firma',scheduledAt:'2026-11-01T10:00:00Z'};
  assert.equal((await run(`/api/organizations/${org}/jobs`,'POST','u-stranger',fields)).status,404);
  const added=await run(`/api/organizations/${org}/jobs`,'POST','u-member',fields);
  assert.equal(added.status,201);
  assert.equal(fixtures.jobs.get(added.data.job.id).organization_id,org);
  assert.equal((await run(`/api/organizations/${org}/jobs`,'GET','u-stranger')).status,404);
});

test('avatar accepts valid image bytes and rejects invalid content',async()=>{
  let r=await run('/api/me/avatar','PUT','u-owner',{mime:'image/png',dataBase64:Buffer.from('not png').toString('base64')});
  assert.equal(r.status,400);
  const png=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  r=await run('/api/me/avatar','PUT','u-owner',{mime:'image/png',dataBase64:png.toString('base64')});
  assert.equal(r.status,200);
  assert.equal((await run('/api/me/avatar','GET','u-owner')).status,200);
  assert.equal((await run('/api/me/avatar','DELETE','u-owner')).status,200);
  assert.equal((await run('/api/me/avatar','GET','u-owner')).status,404);
});


test('owner cannot leave, member must first hand off company jobs; former member loses chat access',async()=>{
  const org=[...fixtures.orgs.keys()][0];
  assert.equal((await run(`/api/organizations/${org}/leave`,'POST','u-owner')).status,409);
  const jobId=[...fixtures.jobs.values()].find(j=>j.organization_id===org).id;
  assert.equal((await run(`/api/organizations/${org}/leave`,'POST','u-member')).status,409);
  const offer=await run('/api/job-offers','POST','u-member',{jobId,toEmail:'owner@test.pl'});
  assert.equal(offer.status,201);
  assert.equal((await run(`/api/job-offers/${offer.data.offer.id}/accept`,'POST','u-owner')).status,200);
  assert.equal((await run(`/api/organizations/${org}/leave`,'POST','u-member')).status,200);
  assert.equal((await run(`/api/organizations/${org}/messages`,'GET','u-member')).status,404);
});

test('stale job offer expires without changing job owner',async()=>{
  fixtures.jobs.set('J-stale-12345',{id:'J-stale-12345',assigned_to:'u-owner',status:'new',title:'Naprawa zaworu',version:1,organization_id:null});
  const offer=await run('/api/job-offers','POST','u-owner',{jobId:'J-stale-12345',toEmail:'member@test.pl'});
  assert.equal(offer.status,201);
  fixtures.jobs.get('J-stale-12345').version=2;
  const r=await run(`/api/job-offers/${offer.data.offer.id}/accept`,'POST','u-member');
  assert.equal(r.status,409);
  assert.equal(fixtures.offers.get(offer.data.offer.id).status,'expired');
  assert.equal(fixtures.jobs.get('J-stale-12345').assigned_to,'u-owner');
});


test('repeated company create by the same owner returns the existing company, not a duplicate', async()=>{
  const first=await run('/api/organizations','POST','u-owner',{name:'Unikalna firma testowa'});
  assert.equal(first.status,201);
  assert.equal(first.data.created,true);
  const repeated=await run('/api/organizations','POST','u-owner',{name:'  UNIKALNA FIRMA TESTOWA  '});
  assert.equal(repeated.status,200);
  assert.equal(repeated.data.created,false);
  assert.equal(repeated.data.organization.id,first.data.organization.id);
  assert.equal([...fixtures.orgs.values()].filter(o=>o.created_by==='u-owner' && o.name.toLowerCase()==='unikalna firma testowa').length,1);
  const secondOwner=await run('/api/organizations','POST','u-stranger',{name:'Unikalna firma testowa'});
  assert.equal(secondOwner.status,201);
  assert.notEqual(secondOwner.data.organization.id,first.data.organization.id);
});
