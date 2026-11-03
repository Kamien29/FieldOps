import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#FAF7F2', card: '#FFFFFF', text: '#1F2937', muted: '#6B7280', border: '#E5E1D8',
  primary: '#B45309', primarySoft: '#FEF3C7', ok: '#15803D', warn: '#B45309', danger: '#B91C1C',
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: '700', color: colors.text },
  h2: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#fff', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
