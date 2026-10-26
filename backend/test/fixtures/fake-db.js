/**
 * Minimal, intentionally strict in-memory SQL adapter for isolated API tests.
 * This does NOT validate PostgreSQL syntax/constraints/performance. Real database
 * integration is a separate mandatory production check.
 */
const users = new Map();
export const __testUsers = users;
export async function query(sql, params = []) {
  if (/^SELECT 1\s*$/.test(sql)) return { rows: [{ '?column?': 1 }] };
  if (/^INSERT INTO users\(/.test(sql)) {
    const [id,email,name,password_hash] = params;
    if ([...users.values()].some(x=>x.email===email)) throw Object.assign(new Error('unique'),{code:'23505'});
    users.set(id,{id,email,name,password_hash});
    return {rows:[]};
  }
  if (/^UPDATE users SET name=/.test(sql)) {
    const [name,email,password_hash,id] = params;
    if ([...users.values()].some(x=>x.email===email && x.id!==id)) throw Object.assign(new Error('unique'),{code:'23505'});
    users.set(id,{id,email,name,password_hash});
    return {rows:[]};
  }
  if (/^SELECT/.test(sql) && /FROM users WHERE email=/.test(sql)) return { rows: [...users.values()].filter(u=>u.email===params[0]) };
  if (/^SELECT/.test(sql) && /FROM users WHERE id=/.test(sql)) {
    const u=users.get(params[0]);
    return {rows: u ? [sql.includes('SELECT 1')?{ '?column?':1 }: (sql.includes('SELECT id,name,email') && !sql.includes('password_hash'))? {id:u.id,name:u.name,email:u.email}:u] : []};
  }
  throw new Error(`Fake DB unsupported SQL: ${sql}`);
}
export async function one(sql,p=[],client){return (await query(sql,p,client)).rows[0] ?? null;}
export async function all(sql,p=[],client){return (await query(sql,p,client)).rows;}
export async function transaction(callback){return callback({});}
