import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { pendingCount } from './db';
import { onDataChange } from './events';
import { setAuthExpiredHandler, syncNow as runSync } from './sync';

interface SyncApi { online: boolean; syncing: boolean; pending: number; syncNow: () => Promise<void> }
const Ctx = createContext<SyncApi>({ online: true, syncing: false, pending: 0, syncNow: async () => {} });
export const useSync = () => useContext(Ctx);

export function SyncProvider({ children, onAuthExpired }: { children: React.ReactNode; onAuthExpired: () => void }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const onlineRef = useRef(true);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try { await runSync(); } finally { setSyncing(false); }
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

  const value = useMemo(() => ({ online, syncing, pending, syncNow }), [online, syncing, pending, syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
