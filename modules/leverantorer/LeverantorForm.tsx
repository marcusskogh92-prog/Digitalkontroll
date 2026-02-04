/**
 * Formulär för leverantör: Företagsnamn, Orgnr, Adress (gata), Postnr, Ort, Kategori, Byggdelar (rekommendation).
 */

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LEVERANTOR_KATEGORIER } from '../../constants/leverantorKategorier';
import type { ByggdelMall, Supplier } from './leverantorerService';
import SelectDropdown from '../../components/common/SelectDropdown';

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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  chipSelected: { backgroundColor: '#e2e8f0', borderColor: '#cbd5e1' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '400' },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 12 },
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

export interface LeverantorFormValues {
  companyName: string;
  organizationNumber: string;
  address: string;
  postalCode: string;
  city: string;
  category: string;
  categories: string[];
  byggdelTags: string[];
}

const emptyValues: LeverantorFormValues = {
  companyName: '',
  organizationNumber: '',
  address: '',
  postalCode: '',
  city: '',
  category: '',
  byggdelTags: [],
};

interface LeverantorFormProps {
  initial?: Supplier | null;
  byggdelar: ByggdelMall[];
  saving: boolean;
  onSave: (values: LeverantorFormValues) => Promise<void>;
  onCancel: () => void;
}

function byggdelLabel(m: ByggdelMall): string {
  const parts = [m.moment, m.name].filter(Boolean);
  return parts.length ? parts.join(' ') : m.id;
}

export default function LeverantorForm({
  initial,
  byggdelar,
  saving,
  onSave,
  onCancel,
}: LeverantorFormProps): React.ReactElement {
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [organizationNumber, setOrganizationNumber] = useState(
    initial?.organizationNumber ?? ''
  );
  const [address, setAddress] = useState(initial?.address ?? '');
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [categories, setCategories] = useState<string[]>(
    Array.isArray(initial?.categories)
      ? initial?.categories ?? []
      : initial?.category
        ? [initial.category]
        : []
  );
  const [selectedByggdelIds, setSelectedByggdelIds] = useState<string[]>(
    initial?.byggdelTags ?? []
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setCompanyName(initial.companyName ?? '');
      setOrganizationNumber(initial.organizationNumber ?? '');
      setAddress(initial.address ?? '');
      setPostalCode(initial.postalCode ?? '');
      setCity(initial.city ?? '');
      setCategories(
        Array.isArray(initial?.categories)
          ? initial?.categories ?? []
          : initial?.category
            ? [initial.category]
            : []
      );
      setSelectedByggdelIds(initial.byggdelTags ?? []);
    } else {
      setCompanyName('');
      setOrganizationNumber('');
      setAddress('');
      setPostalCode('');
      setCity('');
      setCategories([]);
      setSelectedByggdelIds([]);
    }
    setError('');
  }, [initial?.id]);

  const toggleByggdel = (id: string): void => {
    setSelectedByggdelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (): Promise<void> => {
    const cn = companyName.trim();
    if (!cn) {
      setError('Företagsnamn är obligatoriskt.');
      return;
    }
    setError('');
    await onSave({
      companyName: cn,
      organizationNumber: organizationNumber.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      categories,
      category: categories[0] || '',
      byggdelTags: selectedByggdelIds,
    });
  };

  return (
    <View style={styles.content}>
      <Text style={styles.label}>Företagsnamn *</Text>
      <TextInput
        style={[styles.input, !companyName.trim() && error ? styles.inputError : null]}
        value={companyName}
        onChangeText={setCompanyName}
        placeholder="Företagsnamn"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
      />

      <Text style={styles.label}>Organisationsnummer</Text>
      <TextInput
        style={styles.input}
        value={organizationNumber}
        onChangeText={setOrganizationNumber}
        placeholder="Organisationsnummer"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
      />

      <Text style={styles.label}>Adress (gata)</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Gatuadress"
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

      <Text style={styles.label}>Kategorier</Text>
      <SelectDropdown
        options={LEVERANTOR_KATEGORIER}
        value={categories}
        onChange={setCategories}
        placeholder="Välj kategorier"
        multiple
        searchable
        keepOpenOnSelect
        chipsPlacement="above"
        variant="modal"
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Byggdelar (rekommendation)</Text>
        <Text style={styles.hint}>
          Välj byggdelar som leverantören kan vara relevant för. Används som fingervisning vid förfrågningar.
        </Text>
        <View style={styles.chipWrap}>
          {byggdelar.map((m) => {
            const id = m.id;
            const selected = selectedByggdelIds.includes(id);
            return (
              <TouchableOpacity
                key={id}
                style={[styles.chip, selected ? styles.chipSelected : null]}
                onPress={() => toggleByggdel(id)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {byggdelLabel(m)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {error ? (
        <Text style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</Text>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btnPrimary, (!companyName.trim() || saving) ? styles.btnPrimaryDisabled : null]}
          onPress={handleSubmit}
          disabled={!companyName.trim() || saving}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' ? { cursor: saving ? 'not-allowed' : 'pointer' } : {})}
        >
          <Text
            style={[
              styles.btnPrimaryText,
              (!companyName.trim() || saving) ? styles.btnPrimaryTextDisabled : null,
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

export { emptyValues };
