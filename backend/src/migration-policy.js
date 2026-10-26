/** Never migrate a hosted database accidentally. No credentials are printed. */
export function describeTarget(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL has an invalid URL format.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL DATABASE_URL is required.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!host || !database) throw new Error('DATABASE_URL must contain a host and database name.');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
  return { host, database, isLocal };
}

/** Explicit opt-in prevents mistaken production migrations. Backup first. */
export function assertMigrationAllowed(env = process.env) {
  const target = describeTarget(env.DATABASE_URL);
  if (!target.isLocal && env.FIELDOPS_MIGRATE_CONFIRM !== 'YES_I_HAVE_A_BACKUP') {
    throw new Error('Hosted DB migration refused. Take a backup and set FIELDOPS_MIGRATE_CONFIRM=YES_I_HAVE_A_BACKUP.');
  }
  return target;
}
