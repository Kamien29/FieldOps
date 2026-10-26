import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {pendingCount,getMeta} from './db';
import {onDataChange} from './events';
import {setAuthExpiredHandler,syncNow as runSync,type SyncResult} from './sync';

interface SyncApi {
  online:boolean;syncing:boolean;pending:number;
  lastResult:SyncResult|null;lastSuccessfulSync:string|null;
  syncNow:()=>Promise<void>;
}
const Ctx=createContext<SyncApi>({online:true,syncing:false,pending:0,lastResult:null,
  lastSuccessfulSync:null,syncNow:async()=>{}});
export const useSync=()=>useContext(Ctx);

export function SyncProvider({children,onAuthExpired}:{children:React.ReactNode;onAuthExpired:()=>void}) {
  const [online,setOnline]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [pending,setPending]=useState(0);
  const [lastResult,setLastResult]=useState<SyncResult|null>(null);
  const [lastSuccessfulSync,setLastSuccessfulSync]=useState<string|null>(null);
  const onlineRef=useRef(true);
  const showResult=useCallback(async(result:SyncResult)=>{
    setLastResult(result);
    setLastSuccessfulSync(await getMeta('last_sync_success'));
  },[]);
  const syncNow=useCallback(async()=>{
    setSyncing(true);
    try {await showResult(await runSync(true));}
    finally {setSyncing(false);}
  },[showResult]);
  const autoSync=useCallback(async(force=false)=>{
    setSyncing(true);
    try {await showResult(await runSync(force));}
    finally {setSyncing(false);}
  },[showResult]);
  useEffect(()=>{
    setAuthExpiredHandler(onAuthExpired);
    return ()=>setAuthExpiredHandler(null);
  },[onAuthExpired]);
  useEffect(()=>{
    const refresh=()=>{void pendingCount().then(setPending).catch(()=>{});};
    refresh();void getMeta('last_sync_success').then(setLastSuccessfulSync);
    return onDataChange(refresh);
  },[]);
  useEffect(()=>{
    const unsub=NetInfo.addEventListener((state)=>{
      const connected=!!state.isConnected && state.isInternetReachable!==false;
      const was=onlineRef.current;
      onlineRef.current=connected;
      setOnline(connected);
      if (connected && !was) void autoSync(true); // network regained: try immediately
    });
    void autoSync();
    const app=AppState.addEventListener('change',(next)=>{if(next==='active')void autoSync()});
    const timer=setInterval(()=>{if(onlineRef.current)void autoSync()},30_000);
    return ()=>{unsub();app.remove();clearInterval(timer)};
  },[autoSync]);
  const value=useMemo(()=>({online,syncing,pending,lastResult,lastSuccessfulSync,syncNow}),
    [online,syncing,pending,lastResult,lastSuccessfulSync,syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
