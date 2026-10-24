import React, { useRef, useState } from 'react';
import { Alert, Linking, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav';
import { saveDraft } from '../db';
import { ApiError, apiFetch } from '../api';
import { Btn } from '../ui';
import { s } from '../theme';
import { t } from '../strings';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

/** Read a device code with the camera or manually. Never block offline draft entry. */
export default function ScanScreen({ route, navigation }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const saving = useRef(false);
  const checking = useRef(false);
  const [serial, setSerial] = useState('');
  const [feedback, setFeedback] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function openSettings() {
    try { await Linking.openSettings(); }
    catch { Alert.alert(t.cameraUnavailable); }
  }

  async function saveCode(value: string) {
    const clean = value.trim().slice(0, 200);
    if (!clean) { setFeedback(t.deviceSerialRequired); return; }
    if (saving.current) return;
    saving.current = true;
    try {
      await saveDraft(route.params.jobId, { deviceCode: clean });
      navigation.goBack();
    } catch {
      saving.current = false;
      setFeedback(t.deviceLookupFailed);
    }
  }

  async function checkCode(value: string) {
    const clean = value.trim().slice(0, 200);
    if (!clean) { setFeedback(t.deviceSerialRequired); return; }
    if (checking.current || saving.current) return;
    checking.current = true;
    setSerial(clean);
    setFeedback(t.deviceLookupInProgress);
    setVerifying(true);
    try {
      await apiFetch(`/api/devices/identify?serial=${encodeURIComponent(clean)}`, { timeoutMs: 10000 });
      setFeedback(t.deviceVerified);
      await saveCode(clean);
    } catch (err) {
      setFeedback(err instanceof ApiError && err.status === 404 ? t.deviceScanNotFound : t.deviceLookupFailed);
      // The user can still save an unverified code while offline.
    } finally {
      checking.current = false;
      setVerifying(false);
    }
  }

  return (
    <View style={s.screen}>
      {perm?.granted ? (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8'] }}
            onMountError={() => setFeedback(t.cameraMountError)}
            onBarcodeScanned={({ data }) => { if (!verifying && data) void checkCode(data); }}
          />
          <Text style={{ color: '#fff', textAlign: 'center', padding: 10 }}>{t.scanHint}</Text>
        </View>
      ) : (
        <View style={[s.card, { margin: 16, gap: 10 }]}>
          <Text style={s.text}>{perm?.status === 'denied' ? t.cameraPermissionDenied : t.cameraScanRationale}</Text>
          {perm?.canAskAgain ? <Btn title={t.grantCamera} onPress={() => void requestPerm()} /> : null}
          {perm ? <Btn title={t.cameraSettings} kind="secondary" onPress={() => void openSettings()} /> : null}
        </View>
      )}
      <View style={[s.card, { margin: 16, gap: 10 }]}>
        <Text style={s.h2}>{t.deviceSerialField}</Text>
        <TextInput style={s.input} value={serial} onChangeText={setSerial}
          placeholder={t.deviceSerialField} accessibilityLabel={t.deviceSerialField} autoCapitalize="none" />
        {feedback ? <Text style={s.muted} accessibilityRole="alert">{feedback}</Text> : null}
        <Btn title={t.identifyDevice} kind="secondary" onPress={() => void checkCode(serial)} />
        <Btn title={t.saveUnregisteredCode} onPress={() => void saveCode(serial)} />
      </View>
    </View>
  );
}
