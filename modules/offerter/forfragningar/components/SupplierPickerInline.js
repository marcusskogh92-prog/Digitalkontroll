import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeKey(v) {
  const s = safeText(v).toLowerCase();
  if (!s) return '';
  try {
    return s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  } catch (_e) {
    return s;
  }
}

export default function SupplierPickerInline({
  suppliers,
  disabled,
  onPick,
  onCreate,
}) {
  const [q, setQ] = useState('');
  const queryKey = normalizeKey(q);

  const matches = useMemo(() => {
    const list = Array.isArray(suppliers) ? suppliers : [];
    if (!queryKey) return list.slice(0, 6);

    const scored = list
      .map((s) => {
        const name = safeText(s?.companyName);
        const key = normalizeKey(name);
        const idx = key.indexOf(queryKey);
        return { s, idx };
      })
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx || safeText(a?.s?.companyName).localeCompare(safeText(b?.s?.companyName), 'sv'))
      .slice(0, 6)
      .map((x) => x.s);

    return scored;
  }, [suppliers, queryKey]);

  const exactExists = useMemo(() => {
    const nameKey = queryKey;
    if (!nameKey) return false;
    return (Array.isArray(suppliers) ? suppliers : []).some((s) => normalizeKey(s?.companyName) === nameKey);
  }, [suppliers, queryKey]);

  const canCreate = Boolean(queryKey && !exactExists);

  const pick = async (supplier) => {
    const s = supplier && typeof supplier === 'object' ? supplier : null;
    if (!s) return;
    setQ('');
    await onPick?.(s);
  };

  const create = async () => {
    const name = safeText(q);
    if (!name) return;
    if (!canCreate) return;
    setQ('');
    await onCreate?.(name);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Lägg till UE / leverantör…"
          editable={!disabled}
          style={[styles.input, disabled ? styles.inputDisabled : null]}
        />
        <Pressable
          onPress={create}
          disabled={disabled || !canCreate}
          style={({ pressed }) => [
            styles.btn,
            (disabled || !canCreate) && styles.btnDisabled,
            pressed && !(disabled || !canCreate) && styles.btnPressed,
          ]}
        >
          <Text style={styles.btnText}>Skapa</Text>
        </Pressable>
      </View>

      {matches.length > 0 ? (
        <View style={styles.suggestBox}>
          {matches.map((s) => (
            <Pressable
              key={safeText(s?.id) || safeText(s?.companyName)}
              onPress={() => pick(s)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.suggestRow,
                pressed && !disabled ? styles.suggestRowPressed : null,
                disabled ? styles.suggestRowDisabled : null,
              ]}
            >
              <Text style={styles.suggestText} numberOfLines={1}>{safeText(s?.companyName) || '—'}</Text>
              {safeText(s?.category) ? (
                <Text style={styles.suggestMeta} numberOfLines={1}>{safeText(s?.category)}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {queryKey && matches.length === 0 ? (
        <Text style={styles.hint}>Inga träffar. Skriv ett namn och tryck Skapa.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  btn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#334155',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.9,
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  suggestBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  suggestRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  suggestRowPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  suggestRowDisabled: {
    opacity: 0.6,
  },
  suggestText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0f172a',
  },
  suggestMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748b',
  },
  hint: {
    fontSize: 11,
    color: '#64748b',
  },
});
