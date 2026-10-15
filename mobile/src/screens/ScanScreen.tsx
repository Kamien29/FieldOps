import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav';
import { saveDraft } from '../db';
import { Btn } from '../ui';
import { s } from '../theme';
import { t } from '../strings';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

export default function ScanScreen({ route, navigation }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const done = useRef(false);

  if (!perm) return <View style={s.screen} />;
  if (!perm.granted) {
    return (
      <View style={[s.screen, s.pad, { justifyContent: 'center', gap: 12 }]}>
        <Text style={s.text}>{t.permCamera}</Text>
        {perm.canAskAgain && <Btn title={t.grantCamera} onPress={requestPerm} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current || !data) return;
          done.current = true; // camera fires repeatedly; accept the first code only
          saveDraft(route.params.jobId, { deviceCode: data.slice(0, 200) })
            .finally(() => navigation.goBack());
        }}
      />
      <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{t.scanHint}</Text>
      </View>
    </View>
  );
}
