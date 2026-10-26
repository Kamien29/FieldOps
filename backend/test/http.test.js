import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { once } from 'node:events';

const secret = 'test-only-please-do-not-use-this-in-production-012345';
let dir, server, url;

test.before(async () => {
  dir = await mkdtemp(join(tmpdir(),'fieldops-api-'));
  for(const file of ['server.js','auth.js','report-validation.js','report-service.js']) await copyFile(new URL(`../src/${file}`, import.meta.url), join(dir,file));
  await copyFile(new URL('./fixtures/fake-db.js', import.meta.url), join(dir,'db.js'));
  await writeFile(join(dir,'package.json'),'{"type":"module"}');
  process.env.TOKEN_SECRET = secret;
  const { createServer: serve } = await import('file://' + join(dir,'server.js'));
  server = serve();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  url = `http://127.0.0.1:${server.address().port}`;
});
test.after(async()=>{await new Promise(resolve=>server?.close(resolve));await rm(dir,{recursive:true,force:true});});

async function api(path, opts={}) {
  const response=await fetch(url+path,{...opts,headers:{...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})}});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
}

test('health responds without authentication',async()=>{
  const x=await api('/api/health');
  assert.equal(x.status,200);assert.deepEqual(x.body,{ok:true});
});

test('register, duplicate, login and profile flows with CSRF safeguards',async()=>{
  let x=await api('/api/register',{method:'POST',body:JSON.stringify({name:'Ala Test',email:'Ala@Example.Com',password:'Password1234'})});
  assert.equal(x.status,201);assert.equal(x.body.user.email,'ala@example.com');
  assert.match(x.cookie,/Max-Age=2592000/);
  const cookie=x.cookie.split(';')[0];
  const token=x.body.token;
  x=await api('/api/register',{method:'POST',body:JSON.stringify({name:'Other',email:'ala@example.com',password:'Password1234'})});
  assert.equal(x.status,409); assert.equal(x.body.error,'email_taken');
  x=await api('/api/login',{method:'POST',body:JSON.stringify({email:'ala@example.com',password:'WRONG'})});
  assert.equal(x.status,401);
  x=await api('/api/login',{method:'POST',body:JSON.stringify({email:'ALA@EXAMPLE.COM',password:'Password1234'})});
  assert.equal(x.status,200);
  x=await api('/api/me',{headers:{Cookie:cookie}});
  assert.equal(x.status,200);assert.equal(x.body.user.name,'Ala Test');
  x=await api('/api/me',{method:'PATCH',headers:{Cookie:cookie},body:JSON.stringify({name:'Ala2',email:'ala@example.com'})});
  assert.equal(x.status,403);assert.equal(x.body.error,'csrf_blocked');
  x=await api('/api/me',{method:'PATCH',headers:{Cookie:cookie,'X-Requested-With':'fieldops-web'},body:JSON.stringify({name:'Ala2',email:'ala@example.com'})});
  assert.equal(x.status,200);assert.equal(x.body.user.name,'Ala2');
  x=await api('/api/me',{method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({name:'Ala2',email:'changed@example.com',currentPassword:'wrong'})});
  assert.equal(x.status,403);assert.equal(x.body.error,'invalid_current_password');
  x=await api('/api/me',{method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({name:'Ala2',email:'changed@example.com',currentPassword:'Password1234',newPassword:'NewPassword9876'})});
  assert.equal(x.status,200);assert.equal(x.body.user.email,'changed@example.com');
  x=await api('/api/login',{method:'POST',body:JSON.stringify({email:'changed@example.com',password:'Password1234'})});
  assert.equal(x.status,401);
  x=await api('/api/login',{method:'POST',body:JSON.stringify({email:'changed@example.com',password:'NewPassword9876'})});
  assert.equal(x.status,200);
  x=await api('/api/logout',{method:'POST'});
  assert.equal(x.status,200);assert.match(x.cookie,/Max-Age=0/);
  x=await api('/api/me');assert.equal(x.status,401);
});

test('registration checks TOKEN_SECRET before writing the new user', async () => {
  const { __testUsers } = await import('file://' + join(dir, 'db.js'));
  const before = __testUsers.size;
  delete process.env.TOKEN_SECRET;
  const originalLog = console.error;
  console.error = () => {}; // expected 500 is tested; do not print a fake production incident
  try {
    const x = await api('/api/register', {method:'POST',body:JSON.stringify({name:'New account',email:'must-not-be-saved@example.com',password:'Password1234'})});
    assert.equal(x.status,500);
    assert.equal(__testUsers.size,before);
  } finally {
    console.error = originalLog;
    process.env.TOKEN_SECRET = secret;
  }
});
