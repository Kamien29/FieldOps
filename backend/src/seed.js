import { hashPassword } from './auth.js';

export const DEMO_PASSWORD = 'fieldops123';

export function seedIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) return false;
  const now = new Date();
  const iso = (h) => new Date(now.getTime() + h * 3600 * 1000).toISOString();
  const users = [
    ['u1', 'jan@fieldops.local', 'Jan Kowalski'],
    ['u2', 'anna@fieldops.local', 'Anna Nowak'],
  ];
  for (const [id, email, name] of users) {
    db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, email, name, hashPassword(DEMO_PASSWORD));
  }
  const jobs = [
    ['J-1001', 'u1', 'Przegląd klimatyzacji', 'Biurowiec Alfa', 'ul. Lubelska 12, Rzeszów', iso(1)],
    ['J-1002', 'u1', 'Wymiana pompy obiegowej', 'Kamienica Beta', 'ul. Grunwaldzka 5, Rzeszów', iso(4)],
    ['J-1003', 'u1', 'Serwis kotła gazowego', 'Dom jednorodzinny', 'ul. Podwisłocze 30, Rzeszów', iso(24)],
    ['J-1004', 'u1', 'Awaria wentylacji', 'Hala Gamma', 'ul. Przemysłowa 2, Rzeszów', iso(26)],
    ['J-1005', 'u1', 'Kontrola licznika ciepła', 'Osiedle Delta', 'ul. Warszawska 100, Rzeszów', iso(48)],
    ['J-2001', 'u2', 'Montaż rekuperatora', 'Dom Epsilon', 'ul. Kopisto 8, Rzeszów', iso(2)],
  ];
  for (const [id, user, title, customer, address, at] of jobs) {
    db.prepare('INSERT INTO jobs (id,assigned_to,title,customer,address,scheduled_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, user, title, customer, address, at, now.toISOString());
  }
  return true;
}
