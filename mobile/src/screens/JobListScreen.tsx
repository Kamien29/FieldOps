import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav';
import { listJobs } from '../db';
import { onDataChange } from '../events';
import { useSync } from '../SyncContext';
import { useAuth } from '../auth';
import { Chip, SyncBar } from '../ui';
import { colors, s } from '../theme';
import { t } from '../strings';
import { fmtDate } from '../util';
import type { Job, JobStatus, SyncState } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Jobs'>;

const statusColor: Record<JobStatus, string> = { new: colors.muted, in_progress: colors.primary, done: colors.ok };
const syncColor: Record<SyncState, string> = { synced: colors.ok, pending: colors.warn, conflict: colors.danger, error: colors.danger };

export default function JobListScreen({ navigation }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const { syncNow, syncing } = useSync();
  const { logout } = useAuth();

  const load = useCallback(() => { listJobs().then(setJobs).catch(() => {}); }, []);
  useEffect(() => { load(); return onDataChange(load); }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => logout()} hitSlop={10}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{t.logout}</Text>
        </Pressable>
      ),
    });
  }, [navigation, logout]);

  return (
    <View style={s.screen}>
      <SyncBar />
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={s.pad}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncNow} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>{t.emptyJobs}</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
              <Text style={s.muted}>{item.id} · {fmtDate(item.scheduledAt)}</Text>
              <Chip label={t.status[item.status]} color={statusColor[item.status]} />
            </View>
            <Text style={[s.text, { fontWeight: '700' }]}>{item.title}</Text>
            <Text style={s.muted}>{item.customer}</Text>
            <Text style={s.muted}>{item.address}</Text>
            {item.syncState !== 'synced' && (
              <Text style={[s.muted, { marginTop: 6, color: syncColor[item.syncState], fontWeight: '600' }]}>
                {t.sync[item.syncState]}
              </Text>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
