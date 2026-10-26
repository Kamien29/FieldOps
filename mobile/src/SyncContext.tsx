import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { pendingCount } from './db';
import { onDataChange } from './events';
import { setAuthExpiredHandler, syncNow as runSync } from './sync';

interface SyncApi { online: boolean; syncing: boolean; pending: number; syncError: string | null; syncNow: () => Promise<void> }
const Ctx = createContext<SyncApi>({ online: true, syncing: false, pending: 0, syncError:null, syncNow: async () => {} });
export const useSync = () => useContext(Ctx);

export function SyncProvider({ children, onAuthExpired }: { children: React.ReactNode; onAuthExpired: () => void }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncError,setSyncError] = useState<string | null>(null);
  const onlineRef = useRef(true);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await runSync();
      setSyncError(result.ok ? null : result.reason === 'offline'
        ? 'Brak połączenia z API FieldOps. Dane zostają w telefonie.'
        : result.reason === 'auth' ? 'Zaloguj się ponownie, aby wysłać zmiany.'
        : 'Synchronizacja nie powiodła się. Ponów próbę po sprawdzeniu serwera.');
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    setAuthExpiredHandler(onAuthExpired);
    return () => setAuthExpiredHandler(null);
  }, [onAuthExpired]);

  useEffect(() => {
    const refresh = () => { pendingCount().then(setPending).catch(() => {}); };
    refresh();
    return onDataChange(refresh);
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const isOnline = !!s.isConnected && s.isInternetReachable !== false;
      const wasOnline = onlineRef.current;
      onlineRef.current = isOnline;
      setOnline(isOnline);
      if (isOnline && !wasOnline) void syncNow();
    });
    void syncNow(); // initial sync on start
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void syncNow(); });
    const timer = setInterval(() => { if (onlineRef.current) void syncNow(); }, 60000);
    return () => { unsub(); sub.remove(); clearInterval(timer); };
  }, [syncNow]);

  const value = useMemo(() => ({ online, syncing, pending, syncError, syncNow }), [online, syncing, pending, syncError, syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
