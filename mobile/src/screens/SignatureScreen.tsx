import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav';
import { saveDraft } from '../db';
import { Btn } from '../ui';
import { colors, s } from '../theme';
import { t } from '../strings';

type Props = NativeStackScreenProps<RootStackParamList, 'Signature'>;
type Pt = { x: number; y: number };

const toPath = (stroke: Pt[]) =>
  stroke.length === 1
    ? `M${stroke[0].x.toFixed(1)} ${stroke[0].y.toFixed(1)}l0.1 0.1`
    : stroke.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');

export default function SignatureScreen({ route, navigation }: Props) {
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const live = useRef<Pt[][]>([]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      live.current = [...live.current, [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]];
      setStrokes(live.current);
    },
    onPanResponderMove: (e) => {
      const cur = live.current[live.current.length - 1];
      if (!cur) return;
      const next = [...cur, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      live.current = [...live.current.slice(0, -1), next];
      setStrokes(live.current);
    },
  }), []);

  const clear = () => { live.current = []; setStrokes([]); };

  const save = async () => {
    const d = strokes.map(toPath).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(size.w)}" height="${Math.round(size.h)}" viewBox="0 0 ${Math.round(size.w)} ${Math.round(size.h)}">` +
      `<path d="${d}" stroke="#000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    await saveDraft(route.params.jobId, { signatureSvg: svg });
    navigation.goBack();
  };

  return (
    <View style={[s.screen, s.pad, { gap: 12 }]}>
      <View
        {...pan.panHandlers}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
        <Svg width="100%" height="100%" pointerEvents="none">
          {strokes.map((st, i) => (
            <Path key={i} d={toPath(st)} stroke="#000" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <View style={s.row}>
        <View style={{ flex: 1 }}><Btn title={t.clear} kind="secondary" onPress={clear} /></View>
        <View style={{ flex: 1 }}><Btn title={t.save} onPress={save} disabled={!strokes.length || !size.w} /></View>
      </View>
    </View>
  );
}
