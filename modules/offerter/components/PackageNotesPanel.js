import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function formatTime(value) {
  try {
    if (!value) return '—';
    const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '—';
    return d.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_e) {
    return '—';
  }
}

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.primaryBtn, disabled && styles.btnDisabled, pressed && !disabled && styles.btnPressed]}
    >
      <Text style={[styles.primaryBtnText, disabled && styles.btnTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export default function PackageNotesPanel({
  title,
  subtitle,
  companyId,
  projectId,
  selectedItem,
  listenNotes,
  addNote,
  history,
}) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!companyId || !projectId || !selectedItem?.id || typeof listenNotes !== 'function') {
      setNotes([]);
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    const unsub = listenNotes(
      companyId,
      projectId,
      selectedItem.id,
      (list) => {
        setNotes(Array.isArray(list) ? list : []);
        setLoading(false);
      },
      (_err) => setLoading(false),
    );

    return () => {
      try {
        unsub?.();
      } catch (_e) {}
    };
  }, [companyId, projectId, selectedItem?.id, listenNotes]);

  const canSubmit = Boolean(
    companyId &&
      projectId &&
      selectedItem?.id &&
      typeof addNote === 'function' &&
      String(newText || '').trim(),
  );

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    const t = String(newText || '').trim();
    if (!t) return;
    setSubmitting(true);
    try {
      await addNote(companyId, projectId, selectedItem.id, t);
      setNewText('');
    } catch (e) {
      Alert.alert('Kunde inte spara', e?.message || 'Okänt fel');
    } finally {
      setSubmitting(false);
    }
  };

  const historyRows = useMemo(() => {
    if (Array.isArray(history) && history.length) return history;
    if (!selectedItem) return [];
    return [
      { label: 'Skapad', value: formatTime(selectedItem?.createdAt) },
      { label: 'Ändrad', value: formatTime(selectedItem?.updatedAt) },
    ];
  }, [history, selectedItem]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{safeText(title) || 'Kommentarer & historik'}</Text>
      {selectedItem ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {safeText(subtitle) || 'Vald post'}
        </Text>
      ) : (
        <Text style={styles.subtitle}>Välj en post</Text>
      )}

      <View style={styles.divider} />

      {selectedItem ? (
        <View style={styles.historyBox}>
          {historyRows.map((r) => (
            <View key={r.label} style={styles.historyRow}>
              <Text style={styles.historyLabel}>{r.label}</Text>
              <Text style={styles.historyValue} numberOfLines={1}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.divider} />

      {loading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView style={styles.notesList} contentContainerStyle={styles.notesListContent}>
          {notes.length === 0 ? <Text style={styles.muted}>Inga kommentarer än.</Text> : null}
          {notes.map((n) => (
            <View key={n.id} style={styles.noteCard}>
              <Text style={styles.noteMeta}>
                {safeText(n?.createdByName) || '—'} · {formatTime(n?.createdAt)}
              </Text>
              <Text style={styles.noteText}>{safeText(n?.text)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.composer}>
        <TextInput
          placeholder={selectedItem ? 'Skriv en kommentar…' : 'Välj en post först'}
          value={newText}
          onChangeText={setNewText}
          editable={Boolean(selectedItem)}
          style={[styles.input, styles.noteInput, !selectedItem ? styles.inputDisabled : null]}
          multiline
        />
        <PrimaryButton
          label={submitting ? 'Sparar…' : 'Skicka'}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  historyBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  historyLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  historyValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
    maxWidth: 180,
  },
  centerPad: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesList: {
    flex: 1,
    minHeight: 0,
  },
  notesListContent: {
    paddingBottom: 12,
    gap: 10,
  },
  muted: {
    fontSize: 12,
    color: '#94a3b8',
  },
  noteCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
  },
  noteMeta: {
    fontSize: 11,
    color: '#64748b',
  },
  noteText: {
    marginTop: 6,
    fontSize: 13,
    color: '#111827',
    lineHeight: 18,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#111827',
  },
  noteInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
  },
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnTextDisabled: {
    color: '#e5e7eb',
  },
});
