import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeKey(value) {
  const s = safeText(value).toLowerCase();
  if (!s) return '';
  try {
    return s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  } catch (_e) {
    return s;
  }
}

function buildSearchKey(contact) {
  const name = safeText(contact?.name);
  const email = safeText(contact?.email);
  const company = safeText(contact?.contactCompanyName || contact?.companyName);
  return `${name} ${email} ${company}`.trim();
}

export default function ContactPickerInline({
  contacts,
  supplierId,
  disabled,
  onPick,
  onCreate,
  compact,
  currentContactName,
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const queryKey = normalizeKey(q);
  const sid = safeText(supplierId);

  const matches = useMemo(() => {
    const list = Array.isArray(contacts) ? contacts : [];
    if (!list.length) return [];
    const scored = list
      .map((c) => {
        const key = normalizeKey(buildSearchKey(c));
        const idx = queryKey ? key.indexOf(queryKey) : 0;
        const linked = sid && safeText(c?.linkedSupplierId) === sid;
        return { c, idx, linked };
      })
      .filter((x) => !queryKey || x.idx >= 0)
      .sort((a, b) => {
        if (a.linked !== b.linked) return a.linked ? -1 : 1;
        if (queryKey) return a.idx - b.idx;
        return safeText(a?.c?.name).localeCompare(safeText(b?.c?.name), 'sv');
      })
      .slice(0, 6)
      .map((x) => x.c);

    return scored;
  }, [contacts, queryKey, sid]);

  const exactExists = useMemo(() => {
    const nameKey = queryKey;
    if (!nameKey) return false;
    return (Array.isArray(contacts) ? contacts : []).some((c) => normalizeKey(c?.name) === nameKey);
  }, [contacts, queryKey]);

  const canCreate = Boolean(queryKey && !exactExists);

  const pick = async (contact) => {
    const c = contact && typeof contact === 'object' ? contact : null;
    if (!c) return;
    setQ('');
    await onPick?.(c);
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
          placeholder="Lägg till kontaktperson…"
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
          {matches.map((c) => (
            <Pressable
              key={safeText(c?.id) || safeText(c?.name)}
              onPress={() => pick(c)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.suggestRow,
                pressed && !disabled ? styles.suggestRowPressed : null,
                disabled ? styles.suggestRowDisabled : null,
              ]}
            >
              <Text style={styles.suggestText} numberOfLines={1}>{safeText(c?.name) || '—'}</Text>
              {safeText(c?.contactCompanyName || c?.companyName || c?.email) ? (
                <Text style={styles.suggestMeta} numberOfLines={1}>
                  {safeText(c?.contactCompanyName || c?.companyName || c?.email)}
                </Text>
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
