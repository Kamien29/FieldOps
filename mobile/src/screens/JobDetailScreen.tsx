import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
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
  const [recipientFullName, setRecipientFullName] = useState('');
  const [busy, setBusy] = useState<'photo' | 'location' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const latestNote = useRef('');
  const dirty = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noteLoaded = useRef(false);
  const latestRecipientName = useRef('');
  const recipientDirty = useRef(false);
  const recipientTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const [j, r, p] = await Promise.all([getJob(jobId), getReport(jobId), listPhotos(jobId)]);
    setJob(j); setReport(r); setPhotos(p);
    if (!noteLoaded.current || r.submitted) {
      setNote(r.note); latestNote.current = r.note; noteLoaded.current = true;
      setRecipientFullName(r.recipientFullName);
      latestRecipientName.current = r.recipientFullName;
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
  const flushRecipientName = useCallback(async () => {
    clearTimeout(recipientTimer.current);
    if (recipientDirty.current) {
      recipientDirty.current = false;
      await saveDraft(jobId, { recipientFullName: latestRecipientName.current });
    }
  }, [jobId]);
  useEffect(() => () => { void flushNote(); void flushRecipientName(); }, [flushNote, flushRecipientName]);

  const onNote = (text: string) => {
    setNote(text);
    latestNote.current = text;
    dirty.current = true;
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => { void flushNote(); }, 600);
  };
  const onRecipientName = (text: string) => {
    setRecipientFullName(text);
    latestRecipientName.current = text;
    recipientDirty.current = true;
    clearTimeout(recipientTimer.current);
    recipientTimer.current = setTimeout(() => { void flushRecipientName(); }, 600);
  };

  if (!job || !report) return <View style={s.screen} />;

  const locked = report.submitted || job.status === 'done' || job.status === 'cancelled';
  const canEdit = job.status === 'in_progress' && !locked && job.syncState !== 'conflict';

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.cameraPermissionTitle, t.photoCameraPermissionDenied, [
        { text: t.cancel, style: 'cancel' },
        { text: t.cameraSettings, onPress: () => {
          void Linking.openSettings().catch(() => Alert.alert(t.cameraUnavailable));
        } },
      ]);
      return;
    }
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
      await saveDraft(jobId, {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        locationAccuracy: pos.coords.accuracy ?? null,
      });
    } catch {
      Alert.alert(t.locationFailed);
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    if (submitting) return;
    if (!latestNote.current.trim()) { Alert.alert(t.noteRequired); return; }
    if (latestRecipientName.current.trim().split(/\s+/).length < 2) { Alert.alert(t.recipientNameRequired); return; }
    if (!report.signatureSvg) { Alert.alert(t.signatureRequired); return; }
    Alert.alert(t.confirmSubmitTitle, t.confirmSubmitBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: async () => {
        setSubmitting(true);
        try {
          await flushNote();
          await flushRecipientName();
          await submitReport(jobId);
          void syncNow();
          navigation.goBack();
        } catch {
          Alert.alert(t.submitFailed);
        } finally {
          setSubmitting(false);
        }
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

          {job.status !== 'done' && job.status !== 'cancelled' && job.syncState !== 'conflict' && (
            <View style={{marginBottom:12}}><Btn title="Edytuj zlecenie (także offline)" kind="secondary"
              onPress={()=>navigation.navigate('JobEditor',{jobId})}/></View>
          )}

          {job.syncState === 'conflict' && job.conflict && (
            <View style={[s.card, { borderColor: colors.danger }]}>
              <Text style={[s.h2, { color: colors.danger }]}>{t.conflictTitle}</Text>
              <Text style={[s.text, { marginBottom: 8 }]}>{t.conflictBody}</Text>
              <Text style={s.h2}>Na telefonie → Na serwerze</Text>
              {([
                ['Tytuł',job.title,job.conflict.title],['Klient',job.customer,job.conflict.customer],
                ['Adres',job.address,job.conflict.address],['Termin',job.scheduledAt,job.conflict.scheduledAt],
                ['Status',job.status,job.conflict.status],['Opis',job.description,job.conflict.description??''],
              ] as [string,string,string][]).map(([field,local,remote])=>(
                <View key={field} style={{marginBottom:8}}>
                  <Text style={[s.muted,{fontWeight:'700',color:local===remote?colors.muted:colors.danger}]}>{field}</Text>
                  <Text style={s.text}>Telefon: {local}</Text><Text style={s.text}>Serwer: {remote}</Text>
                </View>
              ))}
              {!!job.conflict.report?.note && <Text style={s.muted}>„{job.conflict.report.note}”</Text>}
              <View style={{ gap: 8, marginTop: 12 }}>
                <Btn title={t.keepMine} onPress={async () => { await resolveKeepMine(jobId); void syncNow(); }} />
                <Btn title={t.useServer} kind="secondary" onPress={() => Alert.alert('Odrzucić zmiany z telefonu?',
                  'Wszystkie niewysłane zmiany tego zlecenia zostaną porzucone. To nieodwracalne.',[
                    {text:'Anuluj',style:'cancel'},
                    {text:'Przyjmij serwer',style:'destructive',onPress:async()=>{await resolveUseServer(jobId);void syncNow();}},
                  ])} />
              </View>
            </View>
          )}

          {job.syncState === 'error' && (
            <View style={[s.card, { borderColor: colors.danger }]}>
              <Text style={[s.h2, { color: colors.danger }]}>{t.errorTitle}</Text>
              <Text style={s.muted}>{job.syncError}</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                <Btn title={t.retry} onPress={async () => { await retryJob(jobId); void syncNow(); }} />
                <Btn title={t.discard} kind="danger" onPress={() => Alert.alert('Odrzucić zmiany?',
                  'Niewysłane zmiany tego zlecenia zostaną bezpowrotnie utracone.',[
                    {text:'Anuluj',style:'cancel'},
                    {text:'Odrzuć',style:'destructive',onPress:async()=>{await discardLocalChanges(jobId);void syncNow();}},
                  ])} />
              </View>
            </View>
          )}

          {job.status === 'new' && (
            <Btn title={t.startJob} onPress={async () => { await startJob(jobId); void syncNow(); }} />
          )}

          {(job.status === 'in_progress' || job.status === 'done') && (
            <View style={s.card}>
              <Text style={s.h2}>{t.report}</Text>
              {locked && <Text style={[s.muted, { marginBottom: 8 }]}>{t.submittedInfo}</Text>}

              <Text style={s.muted}>{t.note}</Text>
              <TextInput
                style={[s.input, { minHeight: 100, textAlignVertical: 'top', marginBottom: 14 }]}
                multiline value={note} onChangeText={onNote} editable={canEdit} />

              <Text style={s.muted}>{t.recipientName}</Text>
              <TextInput
                style={[s.input, { marginBottom: 14 }]}
                value={recipientFullName}
                onChangeText={onRecipientName}
                editable={canEdit}
                autoCapitalize="words"
                maxLength={200}
              />

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
                  {report.lat != null && report.lng != null
                    ? `${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}${report.locationAccuracy != null ? ` (±${Math.round(report.locationAccuracy)} m)` : ''}`
                    : t.none}
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
              {locked && (
                <View style={{ marginVertical: 8 }}>
                  <Text style={s.text}>{t.recipientName}: {report.recipientFullName || t.none}</Text>
                  <Text style={s.text}>{t.completedAt}: {report.completedAt ? fmtDate(report.completedAt) : t.none}</Text>
                </View>
              )}
              {canEdit && (
                <Btn title={report.signatureSvg ? t.resign : t.sign} kind="secondary"
                  onPress={async () => { await flushNote(); navigation.navigate('Signature', { jobId }); }} />
              )}
            </View>
          )}

          {canEdit && <Btn title={t.submit} busy={submitting} disabled={submitting} onPress={submit} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
