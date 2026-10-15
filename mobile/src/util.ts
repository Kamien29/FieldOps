const rnd = () => Math.random().toString(36).slice(2, 10);
/** Client-generated id; matches the backend's /^[A-Za-z0-9-]{8,64}$/ */
export const uid = () => `${Date.now().toString(36)}-${rnd()}-${rnd()}`;

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
