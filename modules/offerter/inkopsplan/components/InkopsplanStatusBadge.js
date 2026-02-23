import { StyleSheet, Text, View } from 'react-native';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function titleCase(s) {
  const t = safeText(s).toLowerCase();
  if (!t) return 'Utkast';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function getTone(status) {
  const s = safeText(status).toLowerCase();
  if (s === 'klar') return { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' };
  if (s === 'skickad') return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' };
  if (s === 'pågår' || s === 'pagar' || s === 'pagar') return { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' };
  return { bg: '#F3F4F6', border: '#E5E7EB', text: '#374151' };
}

export default function InkopsplanStatusBadge({ status }) {
  const tone = getTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}
    >
      <Text style={[styles.text, { color: tone.text }]} numberOfLines={1}>
        {titleCase(status || 'utkast')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
