import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors, s } from './theme';
import { useSync } from './SyncContext';
import { t } from './strings';

export function Btn({ title, onPress, kind = 'primary', disabled, busy }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; busy?: boolean;
}) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : '#fff';
  const fg = kind === 'secondary' ? colors.primary : '#fff';
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress} disabled={off} accessibilityRole="button"
      style={{ backgroundColor: bg, opacity: off ? 0.5 : 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
        alignItems: 'center', borderWidth: kind === 'secondary' ? 1 : 0, borderColor: colors.primary }}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, color = colors.primary, bg = colors.primarySoft }: { label: string; color?: string; bg?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function SyncBar() {
  const { online, syncing, pending, syncNow, lastResult, lastSuccessfulSync } = useSync();
  const text = !online ? t.offline : syncing ? t.syncing : pending > 0 ? t.pendingN(pending) : t.allSynced;
  const bg = !online ? '#FEE2E2' : pending > 0 ? colors.primarySoft : '#DCFCE7';
  const fg = !online ? colors.danger : pending > 0 ? colors.warn : colors.ok;
  return (
    <View style={{ backgroundColor: bg, paddingVertical: 6, paddingHorizontal: 16 }}>
      <View style={[s.row,{justifyContent:'space-between',alignItems:'center'}]}>
        <Text style={[s.muted,{color:fg,fontWeight:'600',flex:1}]}>{text}</Text>
        <Pressable accessibilityRole="button" disabled={syncing} onPress={()=>void syncNow()}
          style={{paddingHorizontal:12,paddingVertical:5,backgroundColor:'#fff',borderRadius:8}}>
          <Text style={{color:colors.primary,fontWeight:'700'}}>{syncing?'Trwa…':'Synchronizuj'}</Text>
        </Pressable>
      </View>
      {lastResult && <Text style={[s.muted,{color:fg,fontSize:11}]}>
        {lastResult.ok ? `Wysłano: ${lastResult.sent}; pozostało: ${lastResult.remaining}` :
          `Oczekuje: ${lastResult.remaining} — ${lastResult.reason==='backoff'?'ponowienie później':
            lastResult.reason==='offline'?'brak sieci':lastResult.reason==='auth'?'sesja wygasła':'sprawdź błędy zleceń'}`}
      </Text>}
      {lastSuccessfulSync && <Text style={[s.muted,{fontSize:10,color:fg}]}>
        Ostatnie pobranie: {new Date(lastSuccessfulSync).toLocaleString('pl-PL')}
      </Text>}
    </View>
  );
}
