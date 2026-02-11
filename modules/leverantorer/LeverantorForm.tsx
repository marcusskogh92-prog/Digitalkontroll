/**
 * Formulär för leverantör: Företagsnamn, Orgnr, Adress (gata), Postnr, Ort, Kategori, Byggdelar (rekommendation).
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SelectDropdown from '../../components/common/SelectDropdown';
import { formatOrganizationNumber } from '../../utils/formatOrganizationNumber';
import type { ByggdelMall, Supplier } from './leverantorerService';

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
  categoryTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  categoryTriggerText: { fontSize: 13, color: '#64748b' },
  categoryTriggerTextPlaceholder: { color: '#94a3b8' },
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
  /** När satt: kategorifältet öppnar Kategori-modalen vid klick/tab. Måste då även skicka categoryIdsForForm + onCategoryIdsChange. */
  onOpenKategoriRequest?: () => void;
  categoryIdsForForm?: string[];
  onCategoryIdsChange?: (ids: string[]) => void;
  /** När satt: byggdelsfältet öppnar Byggdel-modalen vid klick/tab. Måste då även skicka formByggdelIds + onByggdelIdsChange. */
  onOpenByggdelRequest?: () => void;
  formByggdelIds?: string[];
  onByggdelIdsChange?: (ids: string[]) => void;
}

/** Visar nummer (code eller moment) och beskrivning från företagets register */
function byggdelOptionLabel(m: ByggdelMall & { code?: string }): string {
  const code = (m as { code?: string }).code ?? m.moment ?? m.id;
  const desc = (m.name ?? '').trim();
  if (desc) return `${code} – ${desc}`;
  return String(code || m.id);
}

export interface LeverantorFormHandle {
  submit: () => void;
}

const LeverantorFormInner: React.ForwardRefRenderFunction<LeverantorFormHandle, LeverantorFormProps> = function LeverantorForm(
  {
    initial,
    byggdelar,
    saving,
    onSave,
    onCancel,
    onOpenKategoriRequest,
    categoryIdsForForm,
    onCategoryIdsChange,
    onOpenByggdelRequest,
    formByggdelIds,
    onByggdelIdsChange,
  },
  ref
) {
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [organizationNumber, setOrganizationNumber] = useState(() =>
    formatOrganizationNumber(initial?.organizationNumber ?? '')
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
  const useControlledCategories = typeof onOpenKategoriRequest === 'function' && Array.isArray(categoryIdsForForm);
  const effectiveCategories = useControlledCategories ? categoryIdsForForm : categories;
  const [selectedByggdelIds, setSelectedByggdelIds] = useState<string[]>(
    initial?.byggdelTags ?? []
  );
  const useControlledByggdel = typeof onOpenByggdelRequest === 'function' && Array.isArray(formByggdelIds);
  const effectiveByggdelIds = useControlledByggdel ? formByggdelIds : selectedByggdelIds;
  const [error, setError] = useState('');
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (initial) {
      setCompanyName(initial.companyName ?? '');
      setOrganizationNumber(formatOrganizationNumber(initial.organizationNumber ?? ''));
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

  const handleSubmit = async (): Promise<void> => {
    const cn = companyName.trim();
    if (!cn) {
      setError('Företagsnamn är obligatoriskt.');
      return;
    }
    setError('');
    const cats = useControlledCategories ? effectiveCategories : categories;
    const byggdelIds = useControlledByggdel ? effectiveByggdelIds : selectedByggdelIds;
    await onSave({
      companyName: cn,
      organizationNumber: organizationNumber.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      categories: cats,
      category: cats[0] || '',
      byggdelTags: byggdelIds,
    });
  };
  submitRef.current = handleSubmit;
  useImperativeHandle(ref, () => ({ submit: () => submitRef.current?.() }), []);

  const canSubmit = Boolean(companyName.trim()) && !saving;

  const categoryTriggerRef = useRef<View | null>(null);
  const categoryModalJustOpenedRef = useRef(false);
  const byggdelTriggerRef = useRef<View | null>(null);
  const byggdelModalJustOpenedRef = useRef(false);
  const openKategoriModal = (fromFocus?: boolean): void => {
    if (fromFocus && categoryModalJustOpenedRef.current) {
      categoryModalJustOpenedRef.current = false;
      return;
    }
    onOpenKategoriRequest?.();
    categoryModalJustOpenedRef.current = true;
    if (Platform.OS === 'web') {
      setTimeout(() => {
        const el = categoryTriggerRef.current as unknown as HTMLElement | null;
        if (el?.blur) el.blur();
        else if (typeof document !== 'undefined' && document.activeElement?.blur) {
          (document.activeElement as HTMLElement).blur();
        }
      }, 0);
    }
  };

  const openByggdelModal = (fromFocus?: boolean): void => {
    if (fromFocus && byggdelModalJustOpenedRef.current) {
      byggdelModalJustOpenedRef.current = false;
      return;
    }
    onOpenByggdelRequest?.();
    byggdelModalJustOpenedRef.current = true;
    if (Platform.OS === 'web') {
      setTimeout(() => {
        const el = byggdelTriggerRef.current as unknown as HTMLElement | null;
        if (el?.blur) el.blur();
        else if (typeof document !== 'undefined' && document.activeElement?.blur) {
          (document.activeElement as HTMLElement).blur();
        }
      }, 0);
    }
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
        {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } } } : {})}
      />

      <Text style={styles.label}>Organisationsnummer</Text>
      <TextInput
        style={styles.input}
        value={organizationNumber}
        onChangeText={(v) => setOrganizationNumber(formatOrganizationNumber(v))}
        placeholder="xxxxxx-xxxx"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } } } : {})}
      />

      <Text style={styles.label}>Adress (gata)</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Gatuadress"
        placeholderTextColor="#94a3b8"
        {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } } } : {})}
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
            {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } } } : {})}
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
            {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } } } : {})}
          />
        </View>
      </View>

      <Text style={styles.label}>Kategorier</Text>
      {typeof onOpenKategoriRequest === 'function' ? (
        Platform.OS === 'web' ? (
          <View
            ref={categoryTriggerRef}
            style={[styles.categoryTrigger, { cursor: 'pointer' }]}
            tabIndex={0}
            onFocus={() => openKategoriModal(true)}
            onClick={() => openKategoriModal(false)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openKategoriModal(false);
              }
            }}
          >
            <Text
              style={[
                styles.categoryTriggerText,
                (effectiveCategories?.length ?? 0) === 0 && styles.categoryTriggerTextPlaceholder,
              ]}
              numberOfLines={1}
            >
              {(effectiveCategories?.length ?? 0) > 0
                ? `${effectiveCategories.length} kategorier valda`
                : 'Klicka eller tabba hit för att välja kategorier'}
            </Text>
            <Text style={[styles.categoryTriggerText, styles.categoryTriggerTextPlaceholder]}>▼</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.categoryTrigger}
            onPress={openKategoriModal}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.categoryTriggerText,
                (effectiveCategories?.length ?? 0) === 0 && styles.categoryTriggerTextPlaceholder,
              ]}
              numberOfLines={1}
            >
              {(effectiveCategories?.length ?? 0) > 0
                ? `${effectiveCategories.length} kategorier valda`
                : 'Klicka för att välja kategorier'}
            </Text>
          </TouchableOpacity>
        )
      ) : (
        <View style={styles.categoryTrigger}>
          <Text style={[styles.categoryTriggerText, styles.categoryTriggerTextPlaceholder]}>
            {(effectiveCategories?.length ?? 0) > 0 ? `${effectiveCategories.length} valda` : 'Inga kategorier'}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Byggdelar (rekommendation)</Text>
        <Text style={styles.hint}>
          Välj byggdelar som leverantören kan vara relevant för. Används som fingervisning vid förfrågningar.
        </Text>
        {typeof onOpenByggdelRequest === 'function' ? (
          Platform.OS === 'web' ? (
            <View
              ref={byggdelTriggerRef}
              style={[styles.categoryTrigger, { cursor: 'pointer' }]}
              tabIndex={0}
              onFocus={() => openByggdelModal(true)}
              onClick={() => openByggdelModal(false)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openByggdelModal(false);
                }
              }}
            >
              <Text
                style={[
                  styles.categoryTriggerText,
                  (effectiveByggdelIds?.length ?? 0) === 0 && styles.categoryTriggerTextPlaceholder,
                ]}
                numberOfLines={1}
              >
                {(effectiveByggdelIds?.length ?? 0) > 0
                  ? `${effectiveByggdelIds.length} byggdelar valda`
                  : 'Klicka eller tabba hit för att välja byggdelar'}
              </Text>
              <Text style={[styles.categoryTriggerText, styles.categoryTriggerTextPlaceholder]}>▼</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.categoryTrigger}
              onPress={() => openByggdelModal(false)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.categoryTriggerText,
                  (effectiveByggdelIds?.length ?? 0) === 0 && styles.categoryTriggerTextPlaceholder,
                ]}
                numberOfLines={1}
              >
                {(effectiveByggdelIds?.length ?? 0) > 0
                  ? `${effectiveByggdelIds.length} byggdelar valda`
                  : 'Klicka för att välja byggdelar'}
              </Text>
            </TouchableOpacity>
          )
        ) : byggdelar.length > 0 ? (
          <SelectDropdown
            value={selectedByggdelIds}
            options={byggdelar.map((m) => ({
              value: (m as ByggdelMall & { code?: string }).code ?? m.id,
              label: byggdelOptionLabel(m as ByggdelMall & { code?: string }),
            }))}
            multiple
            searchable
            placeholder="Välj byggdelar (nummer – beskrivning)"
            onChange={(next: string[]) => setSelectedByggdelIds(next)}
            usePortal={Platform.OS === 'web'}
            fieldStyle={styles.input}
            listStyle={undefined}
            inputStyle={{ fontSize: 13, color: '#111' }}
          />
        ) : (
          <View style={[styles.input, { marginBottom: 0 }]}>
            <Text style={[styles.chipText, { color: '#94a3b8' }]}>
              Inga byggdelar i företagets register. Lägg till under Byggdelstabell.
            </Text>
          </View>
        )}
      </View>

      {error ? (
        <Text style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</Text>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btnPrimary, !canSubmit ? styles.btnPrimaryDisabled : null]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' ? { cursor: canSubmit ? 'pointer' : 'not-allowed' } : {})}
        >
          <Text
            style={[
              styles.btnPrimaryText,
              !canSubmit ? styles.btnPrimaryTextDisabled : null,
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
};

const LeverantorForm = forwardRef(LeverantorFormInner);
export default LeverantorForm;
export { emptyValues };
