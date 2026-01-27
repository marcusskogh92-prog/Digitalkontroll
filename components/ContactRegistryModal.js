import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createCompanyContact, deleteCompanyContact, fetchAllCompanyContacts, fetchCompanyContacts, updateCompanyContact } from './firebase';

export default function ContactRegistryModal({ visible, onClose, companyId, companyName, allCompanies = false }) {
  const resolvedCompanyId = String(companyId || '').trim();
  const resolvedCompanyName = allCompanies ? 'Alla företag' : (String(companyName || '').trim() || resolvedCompanyId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const list = Array.isArray(contacts) ? contacts : [];
    const q = String(search || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      try {
        const n = String(c?.name || '').toLowerCase();
        const r = String(c?.role || '').toLowerCase();
        const p = String(c?.phone || '').toLowerCase();
        const e = String(c?.email || '').toLowerCase();
        return n.includes(q) || r.includes(q) || p.includes(q) || e.includes(q);
      } catch (_e) {
        return false;
      }
    });
  }, [contacts, search]);

  const clearForm = () => {
    setEditingId(null);
    setEditingCompanyId('');
    setName('');
    setRole('');
    setPhone('');
    setEmail('');
    setError('');
  };

  const startNew = () => {
    clearForm();
  };

  const startEdit = (contact) => {
    try {
      setEditingId(String(contact?.id || '').trim() || null);
      setEditingCompanyId(String(contact?.companyId || '').trim());
      setName(String(contact?.name || ''));
      setRole(String(contact?.role || ''));
      setPhone(String(contact?.phone || ''));
      setEmail(String(contact?.email || ''));
      setError('');
    } catch (_e) {}
  };

  const loadContacts = async () => {
    if (!allCompanies && !resolvedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const items = allCompanies
        ? await fetchAllCompanyContacts({ max: 5000 })
        : await fetchCompanyContacts(resolvedCompanyId);
      setContacts(Array.isArray(items) ? items : []);
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte hämta kontakter.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    clearForm();
    setContacts([]);
    setSearch('');
    if (!allCompanies && !resolvedCompanyId) return;
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resolvedCompanyId, allCompanies]);

  const handleSave = async () => {
    if (allCompanies) {
      // Global view: only allow updating an existing contact (we know its companyId).
      if (!editingId || !String(editingCompanyId || '').trim()) {
        setError('För att lägga till ny kontakt: välj företag och öppna kontaktregistret där.');
        return;
      }
    }

    const cid = allCompanies ? String(editingCompanyId || '').trim() : resolvedCompanyId;
    if (!cid) {
      setError('Välj ett företag först.');
      return;
    }
    const n = String(name || '').trim();
    if (!n) {
      setError('Namn är obligatoriskt.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: n,
        companyName: resolvedCompanyName,
        role: String(role || '').trim(),
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
      };

      if (editingId) {
        await updateCompanyContact({ id: editingId, patch: payload }, cid);
      } else {
        await createCompanyContact(payload, cid);
      }

      await loadContacts();
      clearForm();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    try {
      const cid = allCompanies ? String(contact?.companyId || '').trim() : resolvedCompanyId;
      if (!cid) return;
      const id = String(contact?.id || '').trim();
      if (!id) return;

      const label = String(contact?.name || '').trim() || 'kontakten';
      if (Platform.OS === 'web') {
        const ok = typeof window !== 'undefined' && window.confirm ? window.confirm(`Radera ${label}?`) : false;
        if (!ok) return;
      } else {
        const ok = await new Promise((resolve) => {
          Alert.alert('Radera kontakt', `Radera ${label}?`, [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!ok) return;
      }

      await deleteCompanyContact({ id }, cid);
      await loadContacts();
      if (editingId && editingId === id) clearForm();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte radera.'));
    }
  };

  const Body = (
    <View
      style={{
        width: 980,
        maxWidth: '94%',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 18,
        paddingHorizontal: 18,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <Ionicons name="book-outline" size={16} color="#fff" />
          </View>
          <View style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111' }} numberOfLines={1}>Kontaktregister</Text>
            <Text style={{ fontSize: 12, color: '#64748b' }} numberOfLines={1}>{resolvedCompanyName || 'Välj ett företag'}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={startNew}
            disabled={allCompanies || !resolvedCompanyId || saving}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: (!resolvedCompanyId || saving) ? '#e2e8f0' : '#e0f2fe', borderWidth: 1, borderColor: (!resolvedCompanyId || saving) ? '#e2e8f0' : '#bae6fd' }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 12 }}>Ny kontakt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f3f4f6' }}
          >
            <Text style={{ color: '#111', fontWeight: '800', fontSize: 12 }}>Stäng</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!allCompanies && !resolvedCompanyId ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: '#5D4037' }}>Välj ett företag i listan till vänster först.</Text>
        </View>
      ) : null}

      {allCompanies ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: '#1E3A8A' }}>
            Superadmin-läge: visar kontakter från alla företag. Ny kontakt skapas från respektive företagsvy.
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: '#C62828' }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', flexDirection: 'row', minHeight: 520 }}>
        <View style={{ flex: 1.25, padding: 14, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#E6E8EC' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>Kontakter</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Sök namn, roll, telefon, e-post"
              style={{ flex: 1, marginLeft: 10, borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 13 }}
            />
          </View>

          <View style={{ backgroundColor: '#F8FAFC', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E6E8EC', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row' }}>
              {allCompanies ? (
                <Text style={{ flex: 1.1, fontSize: 12, fontWeight: '800', color: '#334155' }}>Företag</Text>
              ) : null}
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '800', color: '#334155' }}>Namn</Text>
              <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '800', color: '#334155' }}>Roll</Text>
              <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '800', color: '#334155' }}>Telefon</Text>
              <Text style={{ flex: 1.4, fontSize: 12, fontWeight: '800', color: '#334155' }}>E-post</Text>
              <Text style={{ width: 86, fontSize: 12, fontWeight: '800', color: '#334155', textAlign: 'right' }}>Åtgärd</Text>
            </View>
          </View>

          {loading ? (
            <Text style={{ color: '#666', fontSize: 13 }}>Laddar…</Text>
          ) : filtered.length === 0 ? (
            <Text style={{ color: '#666', fontSize: 13 }}>Inga kontakter ännu.</Text>
          ) : (
            <View style={{ borderWidth: 1, borderColor: '#EEF0F3', borderRadius: 10, overflow: 'hidden' }}>
              {filtered.slice(0, 200).map((c) => (
                <View key={String(c?.id || '')} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF0F3' }}>
                  {allCompanies ? (
                    <Text style={{ flex: 1.1, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(c?.companyName || c?.companyId || '—')}</Text>
                  ) : null}
                  <TouchableOpacity onPress={() => startEdit(c)} style={{ flex: 1.2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#111' }} numberOfLines={1}>{String(c?.name || '—')}</Text>
                  </TouchableOpacity>
                  <Text style={{ flex: 1.0, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(c?.role || '—')}</Text>
                  <Text style={{ flex: 1.0, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(c?.phone || '—')}</Text>
                  <Text style={{ flex: 1.4, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(c?.email || '—')}</Text>
                  <View style={{ width: 86, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <TouchableOpacity onPress={() => handleDelete(c)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' }}>
                      <Text style={{ color: '#C62828', fontWeight: '800', fontSize: 12 }}>Radera</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ flex: 0.95, padding: 14, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#111', marginBottom: 10 }}>{editingId ? 'Redigera kontakt' : 'Lägg till kontakt'}</Text>

          <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Förnamn Efternamn"
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 10, backgroundColor: '#fff', marginBottom: 10, fontSize: 14, color: '#111' }}
          />

          <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Företag</Text>
          <View style={{ borderWidth: 1, borderColor: '#E6E8EC', padding: 10, borderRadius: 10, backgroundColor: '#F8FAFC', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, color: '#111', fontWeight: '700' }} numberOfLines={1}>{resolvedCompanyName || '—'}</Text>
          </View>

          <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Roll</Text>
          <TextInput
            value={role}
            onChangeText={setRole}
            placeholder="t.ex. Platschef"
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 10, backgroundColor: '#fff', marginBottom: 10, fontSize: 14, color: '#111' }}
          />

          <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Telefonnummer</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="t.ex. 070-123 45 67"
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 10, backgroundColor: '#fff', marginBottom: 10, fontSize: 14, color: '#111' }}
          />

          <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>E-post</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="t.ex. namn@foretag.se"
            autoCapitalize="none"
            keyboardType={Platform.OS === 'web' ? 'default' : 'email-address'}
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 10, backgroundColor: '#fff', marginBottom: 14, fontSize: 14, color: '#111' }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <TouchableOpacity
              onPress={clearForm}
              style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f3f4f6' }}
            >
              <Text style={{ color: '#111', fontWeight: '800', fontSize: 13 }}>Rensa</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={!resolvedCompanyId || saving}
              style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: (!resolvedCompanyId || saving) ? '#90A4AE' : '#0f172a', flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{saving ? 'Sparar…' : 'Spara'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  if (!visible) return null;

  if (Platform.OS === 'web') {
    return (
      <View
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 400,
        }}
      >
        {Body}
      </View>
    );
  }

  return (
    <Modal visible={true} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#f4f6fa', paddingTop: 40, paddingHorizontal: 12, paddingBottom: 12 }}>
        {Body}
      </View>
    </Modal>
  );
}
