type Listener = () => void;
const listeners = new Set<Listener>();

/** Screens subscribe to local DB changes (writes by UI or by the sync engine). */
export function onDataChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export const emitDataChange = () => listeners.forEach((l) => l());
