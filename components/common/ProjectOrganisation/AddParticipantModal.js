import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { fetchCompanyContacts, fetchCompanyMembers } from '../../firebase';

function normalizeSearch(s) {
  return String(s || '').trim().toLowerCase();
}

function matchesCandidate(candidate, q) {
  if (!q) return true;
  const hay = [candidate?.name, candidate?.company, candidate?.email, candidate?.phone]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

export default function AddParticipantModal({
  visible,
  onClose,
  companyId,
  existingMemberKeys,
  onAdd,
}) {
  const COLORS = {
    blue: '#1976D2',
    blueHover: '#155FB5',
    neutral: '#6B7280',
    border: '#E6E8EC',
    borderStrong: '#D1D5DB',
    bgMuted: '#F8FAFC',
    text: '#111',
    textMuted: '#475569',
    textSubtle: '#64748b',
    inputBorder: '#E2E8F0',
    tableBorder: '#EEF0F3',
    danger: '#DC2626',
  };

  const cid = String(companyId || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelected(null);
    setRole('');
    setError('');
    setCandidates([]);

    if (!cid) {
      setError('Saknar companyId.');
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [membersRes, contactsRes] = await Promise.all([
          fetchCompanyMembers(cid),
          fetchCompanyContacts(cid),
        ]);

        const members = Array.isArray(membersRes?.out) ? membersRes.out : (Array.isArray(membersRes) ? membersRes : []);
        const contacts = Array.isArray(contactsRes) ? contactsRes : [];

        const mappedMembers = members
          .map((m) => {
            const refId = String(m?.uid || m?.id || '').trim();
            if (!refId) return null;
            return {
              source: 'internal',
              refId,
              name: String(m?.displayName || m?.name || m?.email || '—').trim(),
              company: cid,
              email: String(m?.email || '').trim(),
              phone: '',
              metaRole: String(m?.role || '').trim(),
            };
          })
          .filter(Boolean);

        const mappedContacts = contacts
          .map((c) => {
            const refId = String(c?.id || '').trim();
            if (!refId) return null;
            const companyName = String(c?.contactCompanyName || c?.companyName || cid).trim();
            return {
              source: 'contact',
              refId,
              name: String(c?.name || '—').trim(),
              company: companyName,
              email: String(c?.email || '').trim(),
              phone: String(c?.phone || '').trim(),
              metaRole: String(c?.role || '').trim(),
            };
          })
          .filter(Boolean);

        const all = [...mappedMembers, ...mappedContacts];
        if (!cancelled) setCandidates(all);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e || 'Kunde inte ladda personer.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, cid]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const keys = existingMemberKeys && typeof existingMemberKeys === 'object' ? existingMemberKeys : null;

    return (Array.isArray(candidates) ? candidates : [])
      .filter((c) => matchesCandidate(c, q))
      .map((c) => {
        const key = `${String(c?.source || '')}:${String(c?.refId || '')}`;
        const already = keys ? !!keys[key] : false;
        return { ...c, _key: key, _already: already };
      })
      .sort((a, b) => {
        if (a._already !== b._already) return a._already ? 1 : -1;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'sv');
      });
  }, [candidates, search, existingMemberKeys]);

  const canAdd = !!selected && String(role || '').trim().length > 0;

  const handleAdd = async () => {
    if (!selected) return;
    const roleText = String(role || '').trim();
    if (!roleText) return;

    try {
      await onAdd(selected, roleText);
      onClose();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte lägga till.'));
    }
  };

  if (!visible) return null;

  const Body = (
    <View
      style={{
        width: '100%',
        maxWidth: 920,
        maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.22)' } : {}),
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person-add-outline" size={16} color={COLORS.blue} />
          </View>
          <View style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.text }} numberOfLines={1}>Lägg till deltagare</Text>
            <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>Sök i interna användare och kontaktregister</Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          title={Platform.OS === 'web' ? 'Stäng' : undefined}
          style={({ hovered, pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: (hovered || pressed) ? '#EFF6FF' : '#fff',
            borderWidth: 1,
            borderColor: (hovered || pressed) ? '#BFDBFE' : COLORS.borderStrong,
          })}
        >
          {({ hovered, pressed }) => {
            const hot = hovered || pressed;
            return <Text style={{ color: hot ? COLORS.blue : COLORS.neutral, fontWeight: '800', fontSize: 12 }}>Stäng</Text>;
          }}
        </Pressable>
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        {error ? (
          <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' }}>
            <Text style={{ fontSize: 13, color: '#C62828' }}>{error}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="search-outline" size={16} color={COLORS.neutral} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Sök namn, företag, e-post, telefon"
            placeholderTextColor="#94A3B8"
            style={{ flex: 1, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
            autoCapitalize="none"
          />
        </View>

        <View style={{ borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ backgroundColor: COLORS.bgMuted, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder, flexDirection: 'row', gap: 10 }}>
            <Text style={{ width: 86, fontSize: 12, fontWeight: '900', color: '#334155' }}>Källa</Text>
            <Text style={{ flex: 1.4, fontSize: 12, fontWeight: '900', color: '#334155' }}>Namn</Text>
            <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '900', color: '#334155' }}>Företag</Text>
            <Text style={{ flex: 1.3, fontSize: 12, fontWeight: '900', color: '#334155' }}>E-post</Text>
            <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '900', color: '#334155' }}>Telefon</Text>
            <Text style={{ width: 90, fontSize: 12, fontWeight: '900', color: '#334155', textAlign: 'right' }}>Status</Text>
          </View>

          {loading ? (
            <View style={{ padding: 12 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>Laddar…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ padding: 12 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>Inga träffar.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filtered.slice(0, 250).map((c) => {
                const selectedKey = selected?._key;
                const isSelected = selectedKey && selectedKey === c._key;
                const bg = isSelected ? '#EFF6FF' : '#fff';
                const keyColor = isSelected ? COLORS.blue : COLORS.text;
                const sourceLabel = c.source === 'internal' ? 'Intern' : 'Kontakt';

                return (
                  <TouchableOpacity
                    key={c._key}
                    disabled={c._already}
                    onPress={() => {
                      setSelected(c);
                      setRole('');
                      setError('');
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: c._already ? 0.55 : 1 }}
                  >
                    <Text style={{ width: 86, fontSize: 12, fontWeight: '900', color: keyColor }}>{sourceLabel}</Text>
                    <Text style={{ flex: 1.4, fontSize: 13, fontWeight: '800', color: '#111' }} numberOfLines={1}>{String(c?.name || '—')}</Text>
                    <Text style={{ flex: 1.2, fontSize: 13, color: '#475569' }} numberOfLines={1}>{String(c?.company || '—')}</Text>
                    <Text style={{ flex: 1.3, fontSize: 13, color: '#475569' }} numberOfLines={1}>{String(c?.email || '—')}</Text>
                    <Text style={{ flex: 1.0, fontSize: 13, color: '#475569' }} numberOfLines={1}>{String(c?.phone || '—')}</Text>
                    <Text style={{ width: 90, fontSize: 12, fontWeight: '800', color: c._already ? COLORS.textSubtle : (isSelected ? COLORS.blue : COLORS.neutral), textAlign: 'right' }} numberOfLines={1}>
                      {c._already ? 'Finns' : (isSelected ? 'Vald' : '')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.text, marginBottom: 8 }}>Roll i projektet</Text>
          {selected ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="person-outline" size={16} color={COLORS.neutral} />
                <Text style={{ fontSize: 13, color: COLORS.text, fontWeight: '800' }} numberOfLines={1}>{String(selected?.name || '—')}</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>{String(selected?.company || '')}</Text>
              </View>
              <TextInput
                value={role}
                onChangeText={setRole}
                placeholder="t.ex. Platschef, Projektledare, BAS-U"
                placeholderTextColor="#94A3B8"
                style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                <Pressable
                  onPress={handleAdd}
                  disabled={!canAdd}
                  style={({ hovered, pressed }) => {
                    const disabled = !canAdd;
                    const bg = disabled ? '#9CA3AF' : (hovered || pressed ? COLORS.blueHover : COLORS.blue);
                    return { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 8 };
                  }}
                >
                  <Ionicons name="add-outline" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Lägg till</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Välj en person i listan ovan.</Text>
          )}
        </View>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ paddingHorizontal: 12, width: '100%', alignItems: 'center', justifyContent: 'center' }}>{Body}</View>
      </View>
    );
  }

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {Body}
      </View>
    </Modal>
  );
}
