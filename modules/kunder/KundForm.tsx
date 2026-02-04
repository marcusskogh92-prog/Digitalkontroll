/**
 * Formulär för kund: Namn, Person-/Organisationsnummer, Adress, Postnr, Ort, Typ av kund.
 */

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Customer } from './kunderService';
import { normalizeCustomerType } from './kunderService';

const styles = StyleSheet.create({
  content: { padding: 20 },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    backgroundColor: '#fff',
    color: '#111',
  },
  inputError: { borderColor: '#dc2626' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  section: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 10,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  segmentBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  segmentText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  btnPrimaryDisabled: { backgroundColor: '#cbd5e1' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  btnPrimaryTextDisabled: { color: '#94a3b8' },
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
});

export interface KundFormValues {
  name: string;
  personalOrOrgNumber: string;
  address: string;
  postalCode: string;
  city: string;
  customerType: string;
}

interface KundFormProps {
  initial?: Customer | null;
  saving: boolean;
  onSave: (values: KundFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function KundForm({
  initial,
  saving,
  onSave,
  onCancel,
}: KundFormProps): React.ReactElement {
  const [name, setName] = useState(initial?.name ?? '');
  const [personalOrOrgNumber, setPersonalOrOrgNumber] = useState(
    initial?.personalOrOrgNumber ?? ''
  );
  const [address, setAddress] = useState(initial?.address ?? '');
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [customerType, setCustomerType] = useState(
    normalizeCustomerType(initial?.customerType ?? '')
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setPersonalOrOrgNumber(initial.personalOrOrgNumber ?? '');
      setAddress(initial.address ?? '');
      setPostalCode(initial.postalCode ?? '');
      setCity(initial.city ?? '');
      setCustomerType(normalizeCustomerType(initial.customerType ?? ''));
    } else {
      setName('');
      setPersonalOrOrgNumber('');
      setAddress('');
      setPostalCode('');
      setCity('');
      setCustomerType('Företag');
    }
    setError('');
  }, [initial?.id]);

  const handleSubmit = async (): Promise<void> => {
    const n = name.trim();
    if (!n) {
      setError('Namn är obligatoriskt.');
      return;
    }
    setError('');
    await onSave({
      name: n,
      personalOrOrgNumber: personalOrOrgNumber.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      customerType: normalizeCustomerType(customerType),
    });
  };

  return (
    <View style={styles.content}>
      <Text style={styles.label}>Namn *</Text>
      <TextInput
        style={[styles.input, !name.trim() && error ? styles.inputError : null]}
        value={name}
        onChangeText={setName}
        placeholder="Namn"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
      />

      <Text style={styles.label}>Person-/Organisationsnummer</Text>
      <TextInput
        style={styles.input}
        value={personalOrOrgNumber}
        onChangeText={setPersonalOrOrgNumber}
        placeholder="Person-/Organisationsnummer"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
      />

      <Text style={styles.label}>Adress</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Adress"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Postnummer</Text>
          <TextInput
            style={styles.input}
            value={postalCode}
            onChangeText={setPostalCode}
            placeholder="Postnr"
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Ort</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Ort"
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Typ av kund</Text>
        {Platform.OS === 'web' ? (
          // @ts-ignore - web-only select
          <select
            style={StyleSheet.flatten(styles.input)}
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
          >
            <option value="Privatperson">Privatperson</option>
            <option value="Företag">Företag</option>
          </select>
        ) : (
          <TextInput
            style={styles.input}
            value={customerType}
            editable={false}
            placeholder="Välj typ"
            placeholderTextColor="#94a3b8"
          />
        )}
      </View>

      {error ? (
        <Text style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</Text>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btnPrimary, (!name.trim() || saving) ? styles.btnPrimaryDisabled : null]}
          onPress={handleSubmit}
          disabled={!name.trim() || saving}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' ? { cursor: saving ? 'not-allowed' : 'pointer' } : {})}
        >
          <Text
            style={[
              styles.btnPrimaryText,
              (!name.trim() || saving) ? styles.btnPrimaryTextDisabled : null,
            ]}
          >
            {saving ? 'Sparar…' : 'Spara'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={onCancel}
          disabled={saving}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.btnSecondaryText}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
