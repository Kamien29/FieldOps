import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { SvgXml } from 'react-native-svg';
import type { RootStackParamList } from '../nav';
import {
  addPhoto, discardLocalChanges, getJob, getReport, listPhotos, removePhoto, resolveKeepMine,
  resolveUseServer, retryJob, saveDraft, startJob, submitReport,
} from '../db';
import { onDataChange } from '../events';
import { PHOTO_DIR, photoUri } from '../files';
import { useSync } from '../SyncContext';
import { Btn, Chip, SyncBar } from '../ui';
import { colors, s } from '../theme';
import { t } from '../strings';
import { fmtDate, uid } from '../util';
import type { Job, Photo, Report } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'JobDetail'>;

export default function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { syncNow } = useSync();
  const [job, setJob] = useState<Job | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'photo' | 'location' | null>(null);

  const latestNote = useRef('');
  const dirty = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noteLoaded = useRef(false);

  const load = useCallback(async () => {
    const [j, r, p] = await Promise.all([getJob(jobId), getReport(jobId), listPhotos(jobId)]);
    setJob(j); setReport(r); setPhotos(p);
    if (!noteLoaded.current || r.submitted) {
      setNote(r.note); latestNote.current = r.note; noteLoaded.current = true;
    }
  }, [jobId]);

  useEffect(() => { void load(); return onDataChange(() => { void load(); }); }, [load]);

  const flushNote = useCallback(async () => {
    clearTimeout(noteTimer.current);
    if (dirty.current) {
      dirty.current = false;
      await saveDraft(jobId, { note: latestNote.current });
    }
  }, [jobId]);
  useEffect(() => () => { void flushNote(); }, [flushNote]); // autosave when leaving the screen

  const onNote = (text: string) => {
    setNote(text);
    latestNote.current = text;
    dirty.current = true;
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => { void flushNote(); }, 600);
  };

  if (!job || !report) return <View style={s.screen} />;

  const locked = report.submitted || job.status === 'done';
  const canEdit = job.status !== 'new' && !locked && job.syncState !== 'conflict';

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert(t.permCamera); return; }
    setBusy('photo');
    try {
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (shot.canceled || !shot.assets[0]) return;
      const small = await ImageManipulator.manipulateAsync(
        shot.assets[0].uri, [{ resize: { width: 1600 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
      const id = uid();
      await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
      await FileSystem.copyAsync({ from: small.uri, to: photoUri(`${id}.jpg`) });
      await addPhoto(jobId, id, `${id}.jpg`);
      void syncNow();
    } catch (e) {
      Alert.alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  const askRemovePhoto = (p: Photo) => {
    Alert.alert(t.removePhoto, undefined, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: async () => {
        const f = await removePhoto(p.id);
        if (f) await FileSystem.deleteAsync(photoUri(f), { idempotent: true });
      } },
    ]);
  };

  const getLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { Alert.alert(t.permLocation); return; }
    setBusy('location');
    try {
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20000));
      let pos = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout]);
      if (!pos) pos = await Location.getLastKnownPositionAsync();
      if (!pos) { Alert.alert(t.locationFailed); return; }
      await saveDraft(jobId, { lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert(t.locationFailed);
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    if (!latestNote.current.trim()) { Alert.alert(t.noteRequired); return; }
    Alert.alert(t.confirmSubmitTitle, t.confirmSubmitBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: async () => {
        await flushNote();
        await submitReport(jobId);
        void syncNow();
        navigation.goBack();
      } },
    ]);
  };

  return (
    <View style={s.screen}>
      <SyncBar />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.muted}>{job.id}</Text>
              <Chip label={t.status[job.status]} />
            </View>
            <Text style={[s.h1, { marginVertical: 6 }]}>{job.title}</Text>
            <Text style={s.text}>{t.customer}: {job.customer}</Text>
            <Text style={s.text}>{t.address}: {job.address}</Text>
            <Text style={s.text}>{t.when}: {fmtDate(job.scheduledAt)}</Text>
          </View>

          {job.syncState === 'conflict' && job.conflict && (
            <View style={[s.card, { borderColor: colors.danger }]}>
              <Text style={[s.h2, { color: colors.danger }]}>{t.conflictTitle}</Text>
              <Text style={[s.text, { marginBottom: 8 }]}>{t.conflictBody}</Text>
              <Text style={s.h2}>{t.serverVersion}</Text>
              <Text style={s.text}>{t.status[job.conflict.status]} · {job.conflict.address}</Text>
              {!!job.conflict.report?.note && <Text style={s.muted}>„{job.conflict.report.note}”</Text>}
              <View style={{ gap: 8, marginTop: 12 }}>
                <Btn title={t.keepMine} onPress={async () => { await resolveKeepMine(jobId); void syncNow(); }} />
                <Btn title={t.useServer} kind="secondary" onPress={async () => { await resolveUseServer(jobId); void syncNow(); }} />
              </View>
            </View>
          )}

          {job.syncState === 'error' && (
            <View style={[s.card, { borderColor: colors.danger }]}>
              <Text style={[s.h2, { color: colors.danger }]}>{t.errorTitle}</Text>
              <Text style={s.muted}>{job.syncError}</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                <Btn title={t.retry} onPress={async () => { await retryJob(jobId); void syncNow(); }} />
                <Btn title={t.discard} kind="danger" onPress={async () => { await discardLocalChanges(jobId); void syncNow(); }} />
              </View>
            </View>
          )}

          {job.status === 'new' && (
            <Btn title={t.startJob} onPress={async () => { await startJob(jobId); void syncNow(); }} />
          )}

          {job.status !== 'new' && (
            <View style={s.card}>
              <Text style={s.h2}>{t.report}</Text>
              {locked && <Text style={[s.muted, { marginBottom: 8 }]}>{t.submittedInfo}</Text>}

              <Text style={s.muted}>{t.note}</Text>
              <TextInput
                style={[s.input, { minHeight: 100, textAlignVertical: 'top', marginBottom: 14 }]}
                multiline value={note} onChangeText={onNote} editable={canEdit} />

              <Text style={s.muted}>{t.deviceCode}</Text>
              <View style={[s.row, { marginBottom: 14, justifyContent: 'space-between' }]}>
                <Text style={[s.text, { flex: 1 }]}>{report.deviceCode ?? t.none}</Text>
                {canEdit && (
                  <Btn title={report.deviceCode ? t.rescan : t.scan} kind="secondary"
                    onPress={async () => { await flushNote(); navigation.navigate('Scan', { jobId }); }} />
                )}
              </View>

              <Text style={s.muted}>{t.location}</Text>
              <View style={[s.row, { marginBottom: 14, justifyContent: 'space-between' }]}>
                <Text style={[s.text, { flex: 1 }]}>
                  {report.lat != null && report.lng != null ? `${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}` : t.none}
                </Text>
                {canEdit && <Btn title={busy === 'location' ? t.gettingLocation : t.getLocation} kind="secondary" busy={busy === 'location'} onPress={getLocation} />}
              </View>

              <Text style={s.muted}>{t.photos} ({photos.length})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }}>
                {photos.map((p) => (
                  <Pressable key={p.id} onLongPress={() => canEdit && askRemovePhoto(p)}>
                    <Image source={{ uri: photoUri(p.fileName) }} style={{ width: 84, height: 84, borderRadius: 8 }} />
                    <Text style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 12 }}>{p.uploaded ? '✓' : '⏳'}</Text>
                  </Pressable>
                ))}
              </View>
              {canEdit && <View style={{ marginBottom: 14 }}><Btn title={t.addPhoto} kind="secondary" busy={busy === 'photo'} onPress={takePhoto} /></View>}

              <Text style={s.muted}>{t.signature}</Text>
              {report.signatureSvg ? (
                <View style={{ height: 110, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginVertical: 6 }}>
                  <SvgXml xml={report.signatureSvg} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
                </View>
              ) : <Text style={[s.text, { marginVertical: 6 }]}>{t.none}</Text>}
              {canEdit && (
                <Btn title={report.signatureSvg ? t.resign : t.sign} kind="secondary"
                  onPress={async () => { await flushNote(); navigation.navigate('Signature', { jobId }); }} />
              )}
            </View>
          )}

          {canEdit && <Btn title={t.submit} onPress={submit} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
