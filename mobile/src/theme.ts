import React, { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (mode: ThemePreference) => void }>({
  preference: 'system', setPreference: () => {},
});
export const useThemePreference = () => useContext(ThemeContext);

const light = {
  bg: '#FAF7F2', card: '#FFFFFF', text: '#1F2937', muted: '#6B7280', border: '#E5E1D8',
  primary: '#B45309', primarySoft: '#FEF3C7', ok: '#15803D', warn: '#B45309', danger: '#B91C1C',
};
const dark: typeof light = {
  bg: '#111827', card: '#1F2937', text: '#F9FAFB', muted: '#CBD5E1', border: '#374151',
  primary: '#FBBF24', primarySoft: '#45331B', ok: '#86EFAC', warn: '#FBBF24', danger: '#FCA5A5',
};
export const colors = { ...light };
const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 15, fontWeight: '700' as const, color: colors.text, marginBottom: 8 },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: colors.card, color: colors.text },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
});
export const s = makeStyles();
export function applyTheme(mode: 'light' | 'dark') {
  Object.assign(colors, mode === 'dark' ? dark : light);
  Object.assign(s, makeStyles());
}
