/**
 * Kontaktpersoner för en leverantör – synkas till Kontaktregistret (samma post återanvänds).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Contact, Supplier } from './leverantorerService';
import {
  addContactToSupplier,
  removeContactFromSupplier,
} from './leverantorerService';

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 8,
  },
  list: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { fontSize: 13, color: '#334155', fontWeight: '400', flex: 1 },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  removeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    marginLeft: 8,
  },
  addBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtnText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  modalBack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 400,
    maxWidth: '96%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: '#111',
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#475569', fontSize: 14, fontWeight: '500' },
  empty: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: '#94a3b8' },
});

interface LeverantorContactsProps {
  companyId: string | null;
  supplier: Supplier | null;
  allContacts: Contact[];
  onContactsChange: () => void;
}

export default function LeverantorContacts({
  companyId,
  supplier,
  allContacts,
  onContactsChange,
}: LeverantorContactsProps): React.ReactElement {
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  const contactIds = supplier?.contactIds ?? [];
  const contacts = contactIds
    .map((id) => allContacts.find((c) => c.id === id))
    .filter((c): c is Contact => !!c);

  const handleAdd = async (): Promise<void> => {
    const n = String(name ?? '').trim();
    if (!n) {
      if (Platform.OS === 'web') window.alert('Namn är obligatoriskt.');
      else Alert.alert('Namn krävs', 'Namn är obligatoriskt.');
      return;
    }
    if (!companyId || !supplier?.id) return;
    setSaving(true);
    try {
      await addContactToSupplier(companyId, supplier.id, supplier.companyName ?? '', {
        name: n,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role: role.trim() || undefined,
      });
      setName('');
      setEmail('');
      setPhone('');
      setRole('');
      setModalVisible(false);
      onContactsChange();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kunde inte lägga till kontakt';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Fel', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (contactId: string): Promise<void> => {
    if (!companyId || !supplier?.id) return;
    const ok =
      Platform.OS === 'web'
        ? window.confirm('Ta bort kontakten från leverantören?')
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Ta bort kontakt',
              'Koppla bort kontakten från denna leverantör? Kontakten finns kvar i Kontaktregistret.',
              [
                { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
              ]
            );
          });
    if (!ok) return;
    try {
      await removeContactFromSupplier(companyId, supplier.id, contactId);
      onContactsChange();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kunde inte ta bort';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Fel', msg);
    }
  };

  if (!supplier) return <View style={styles.section} />;

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Kontaktpersoner</Text>
      <View style={styles.list}>
        {contacts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Inga kontaktpersoner. Lägg till för att synka till Kontaktregistret.</Text>
          </View>
        ) : (
          contacts.map((c, i) => (
            <View
              key={c.id}
              style={[styles.row, i === contacts.length - 1 ? styles.rowLast : null]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{c.name}</Text>
                {(c.email || c.phone || c.role) ? (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[c.role, c.email, c.phone].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(c.id)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={18} color="#b91c1c" />
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Ionicons name="person-add-outline" size={18} color="#475569" />
          <Text style={styles.addBtnText}>Lägg till kontaktperson</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBack}
          onPress={() => !saving && setModalVisible(false)}
        >
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ny kontaktperson (synkas till Kontaktregistret)</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Namn *"
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="E-post"
              placeholderTextColor="#94a3b8"
              keyboardType="email-address"
              autoCapitalize="none"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
            />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefon"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
            />
            <TextInput
              style={styles.input}
              value={role}
              onChangeText={setRole}
              placeholder="Roll / titel"
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleAdd}
                disabled={saving || !name.trim()}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: saving ? 'not-allowed' : 'pointer' } : {})}
              >
                <Text style={styles.btnPrimaryText}>{saving ? 'Sparar…' : 'Lägg till'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => !saving && setModalVisible(false)}
                disabled={saving}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={styles.btnSecondaryText}>Avbryt</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
