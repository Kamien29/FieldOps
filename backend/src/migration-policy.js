/** Protect remote databases from accidental schema modifications. */
export function describeTarget(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  let url;
  try {url=new URL(connectionString)} catch {throw new Error('Invalid DATABASE_URL format.');}
  if (!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL DATABASE_URL required.');
  const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  const database=decodeURIComponent(url.pathname.replace(/^\//,''));
  if (!host || !database) throw new Error('DATABASE_URL requires a host and database name.');
  const isLocal=['localhost','127.0.0.1','::1'].includes(host);
  return {host,database,isLocal};
}
/** Remote migrations require an explicit backup and opt-in. */
export function assertMigrationAllowed(env=process.env) {
  const target=describeTarget(env.DATABASE_URL);
  if (!target.isLocal && env.FIELDOPS_MIGRATE_CONFIRM!=='YES_I_HAVE_A_BACKUP') {
    throw new Error('Remote DB migration blocked. Make backup and set FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP.');
  }
  return target;
}
