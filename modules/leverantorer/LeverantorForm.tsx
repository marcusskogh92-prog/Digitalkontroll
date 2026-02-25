/**
 * Formulär för leverantör: Företagsnamn, Orgnr, Adress (gata), Postnr, Ort, Kategori, Byggdelar (rekommendation).
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelectDropdown from '../../components/common/SelectDropdown';
import { formatOrganizationNumber } from '../../utils/formatOrganizationNumber';
import type { ByggdelMall, Supplier } from './leverantorerService';
import SupplierRelationSection, { type RelationItem } from './SupplierRelationSection';

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
  /** Text för read-only fallback (inga modaler) */
  selectedCategoriesText: { fontSize: 13, color: '#475569', lineHeight: 20 },
  selectedCategoriesEmpty: { color: '#9ca3af' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  /** Avbryt – vänster, dimmad röd (MODAL_GOLDEN_RULE) */
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#b91c1c', fontSize: 14, fontWeight: '500' },
  /** Spara – höger, dimmad som bannern (#475569, golden rule) */
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#475569',
    alignItems: 'center',
  },
  btnPrimaryDisabled: { backgroundColor: '#cbd5e1' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  btnPrimaryTextDisabled: { color: '#94a3b8' },
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
  konton: string[];
}

const emptyValues: LeverantorFormValues = {
  companyName: '',
  organizationNumber: '',
  address: '',
  postalCode: '',
  city: '',
  category: '',
  byggdelTags: [],
  konton: [],
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
  /** Lista med { id, name } för att visa valda kategorier som text (annars visas bara antal). */
  categoryOptions?: { id: string; name?: string }[];
  /** När satt: byggdelsfältet öppnar Byggdel-modalen vid klick/tab. Måste då även skicka formByggdelIds + onByggdelIdsChange. */
  onOpenByggdelRequest?: () => void;
  formByggdelIds?: string[];
  onByggdelIdsChange?: (ids: string[]) => void;
  /** När satt: kontofältet öppnar Kontoplan-modalen vid klick/tab. Måste då även skicka formKontonIds + onKontonIdsChange. */
  onOpenKontonRequest?: () => void;
  formKontonIds?: string[];
  onKontonIdsChange?: (ids: string[]) => void;
  /** Lista med { konto, benamning } för att visa valda konton som text. */
  kontonOptions?: { konto?: string; benamning?: string; id?: string }[];
  /** Anropas när formuläret har ändrats (dirty) jämfört med initial. */
  onDirtyChange?: (isDirty: boolean) => void;
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
    categoryOptions = [],
    onOpenByggdelRequest,
    formByggdelIds,
    onByggdelIdsChange,
    onOpenKontonRequest,
    formKontonIds,
    onKontonIdsChange,
    kontonOptions = [],
    onDirtyChange,
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
  const useControlledKonton = typeof onOpenKontonRequest === 'function' && Array.isArray(formKontonIds);
  const [selectedKontonIds, setSelectedKontonIds] = useState<string[]>(
    Array.isArray(initial?.konton) ? initial.konton : []
  );
  const effectiveKontonIds = useControlledKonton ? formKontonIds : selectedKontonIds;
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
      setSelectedKontonIds(Array.isArray(initial.konton) ? initial.konton : []);
    } else {
      setCompanyName('');
      setOrganizationNumber('');
      setAddress('');
      setPostalCode('');
      setCity('');
      setCategories([]);
      setSelectedByggdelIds([]);
      setSelectedKontonIds([]);
    }
    setError('');
  }, [initial?.id]);

  const cats = useControlledCategories ? effectiveCategories : categories;
  const byggdelIds = useControlledByggdel ? effectiveByggdelIds : selectedByggdelIds;
  useEffect(() => {
    if (typeof onDirtyChange !== 'function') return;
    const initialName = (initial?.companyName ?? '').trim();
    const initialOrg = formatOrganizationNumber(initial?.organizationNumber ?? '').trim();
    const initialAddr = (initial?.address ?? '').trim();
    const initialPost = (initial?.postalCode ?? '').trim();
    const initialCity = (initial?.city ?? '').trim();
    const initialCats = Array.isArray(initial?.categories)
      ? [...initial.categories].sort()
      : initial?.category
        ? [initial.category]
        : [];
    const initialBygg = [...(initial?.byggdelTags ?? [])].sort();
    const initialKonton = [...(initial?.konton ?? [])].sort();
    const currentCats = [...cats].sort();
    const currentBygg = [...byggdelIds].sort();
    const currentKonton = [...(useControlledKonton ? (formKontonIds ?? []) : selectedKontonIds)].sort();
    const isDirty =
      companyName.trim() !== initialName ||
      organizationNumber.trim() !== initialOrg ||
      address.trim() !== initialAddr ||
      postalCode.trim() !== initialPost ||
      city.trim() !== initialCity ||
      currentCats.length !== initialCats.length ||
      currentCats.some((c, i) => c !== initialCats[i]) ||
      currentBygg.length !== initialBygg.length ||
      currentBygg.some((b, i) => b !== initialBygg[i]) ||
      currentKonton.length !== initialKonton.length ||
      currentKonton.some((k, i) => k !== initialKonton[i]);
    onDirtyChange(isDirty);
  }, [
    companyName,
    organizationNumber,
    address,
    postalCode,
    city,
    cats,
    byggdelIds,
    initial,
    onDirtyChange,
    useControlledCategories,
    useControlledByggdel,
    useControlledKonton,
    formKontonIds,
    selectedKontonIds,
  ]);

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
      categories: cats,
      category: cats[0] || '',
      byggdelTags: byggdelIds,
      konton: effectiveKontonIds ?? [],
    });
  };
  submitRef.current = handleSubmit;
  useImperativeHandle(ref, () => ({ submit: () => submitRef.current?.() }), []);

  const canSubmit = Boolean(companyName.trim()) && !saving;

  const categoryTriggerRef = useRef<View | null>(null);
  const categoryModalJustOpenedRef = useRef(false);
  const byggdelTriggerRef = useRef<View | null>(null);
  const byggdelModalJustOpenedRef = useRef(false);
  const kontonTriggerRef = useRef<View | null>(null);
  const kontonModalJustOpenedRef = useRef(false);
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

  const openKontonModal = (fromFocus?: boolean): void => {
    if (fromFocus && kontonModalJustOpenedRef.current) {
      kontonModalJustOpenedRef.current = false;
      return;
    }
    onOpenKontonRequest?.();
    kontonModalJustOpenedRef.current = true;
    if (Platform.OS === 'web') {
      setTimeout(() => {
        const el = kontonTriggerRef.current as unknown as HTMLElement | null;
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

      <View style={styles.section}>
        {typeof onOpenKategoriRequest === 'function' ? (
          <SupplierRelationSection
            title="Kategorier"
            items={((effectiveCategories ?? []).map((id) => ({
              id,
              label: categoryOptions.find((c) => c.id === id)?.name ?? id,
            })) as RelationItem[]).filter((i) => i.label)}
            onAdd={() => {
              openKategoriModal(false);
            }}
            onRemove={(id) => onCategoryIdsChange?.((effectiveCategories ?? []).filter((x) => x !== id))}
            emptyMessage="Inga valda ännu"
          />
        ) : (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Kategorier</Text>
            <Text style={[styles.selectedCategoriesText, styles.selectedCategoriesEmpty]}>
              {(effectiveCategories?.length ?? 0) > 0
                ? (effectiveCategories ?? []).map((id) => categoryOptions.find((c) => c.id === id)?.name ?? id).join(', ')
                : 'Inga valda ännu'}
            </Text>
          </View>
        )}

        {typeof onOpenByggdelRequest === 'function' ? (
          <SupplierRelationSection
            title="Byggdelar"
            items={(effectiveByggdelIds ?? []).map((code) => {
              const m = byggdelar.find((b) => ((b as ByggdelMall & { code?: string }).code ?? b.id) === code);
              return { id: code, label: m ? byggdelOptionLabel(m as ByggdelMall & { code?: string }) : code };
            })}
            onAdd={() => openByggdelModal(false)}
            onRemove={(id) => onByggdelIdsChange?.((effectiveByggdelIds ?? []).filter((x) => x !== id))}
            emptyMessage="Inga valda ännu"
          />
        ) : byggdelar.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Byggdelar</Text>
            <SelectDropdown
              value={selectedByggdelIds}
              options={byggdelar.map((m) => ({
                value: (m as ByggdelMall & { code?: string }).code ?? m.id,
                label: byggdelOptionLabel(m as ByggdelMall & { code?: string }),
              }))}
              multiple
              searchable
              placeholder="Välj byggdelar"
              onChange={(next: string[]) => setSelectedByggdelIds(next)}
              usePortal={Platform.OS === 'web'}
              variant="modal"
              fieldStyle={styles.input}
              listStyle={undefined}
              inputStyle={{ fontSize: 13, color: '#111' }}
              renderOptionRight={(_opt: { value: string }, selected?: boolean) =>
                selected ? <Ionicons name="checkmark" size={18} color="#2563eb" /> : null
              }
            />
          </View>
        ) : (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Byggdelar</Text>
            <Text style={[styles.selectedCategoriesText, styles.selectedCategoriesEmpty]}>
              Inga byggdelar i företagets register. Lägg till under Byggdelstabell.
            </Text>
          </View>
        )}

        {typeof onOpenKontonRequest === 'function' ? (
          <SupplierRelationSection
            title="Konton"
            items={(effectiveKontonIds ?? []).map((konto) => {
              const opt = kontonOptions.find((c) => (c.konto ?? c.id ?? '') === konto);
              const ben = (opt?.benamning ?? '').trim();
              const label = ben ? `${opt?.konto ?? konto} – ${ben}` : String(konto);
              return { id: konto, label };
            })}
            onAdd={() => openKontonModal(false)}
            onRemove={(id) => onKontonIdsChange?.((effectiveKontonIds ?? []).filter((x) => x !== id))}
            emptyMessage="Inga valda ännu"
          />
        ) : kontonOptions.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Konton</Text>
            <SelectDropdown
              value={effectiveKontonIds ?? []}
              options={kontonOptions.map((c) => {
                const val = c.konto ?? c.id ?? '';
                const ben = (c.benamning ?? '').trim();
                const label = ben ? `${val} – ${ben}` : val || '—';
                return { value: val, label };
              })}
              multiple
              searchable
              placeholder="Välj konton"
              onChange={(next: string[]) => {
                if (useControlledKonton) onKontonIdsChange?.(next);
                else setSelectedKontonIds(next);
              }}
              usePortal={Platform.OS === 'web'}
              variant="modal"
              fieldStyle={styles.input}
              listStyle={undefined}
              inputStyle={{ fontSize: 13, color: '#111' }}
              renderOptionRight={(_opt: { value: string }, selected?: boolean) =>
                selected ? <Ionicons name="checkmark" size={18} color="#2563eb" /> : null
              }
            />
          </View>
        ) : (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Konton</Text>
            <Text style={[styles.selectedCategoriesText, styles.selectedCategoriesEmpty]}>
              {(effectiveKontonIds?.length ?? 0) > 0 ? (effectiveKontonIds ?? []).join(', ') : 'Inga konton i företagets kontoplan.'}
            </Text>
          </View>
        )}
      </View>

      {error ? (
        <Text style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</Text>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={onCancel}
          disabled={saving}
          activeOpacity={0.8}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.btnSecondaryText}>Avbryt</Text>
        </TouchableOpacity>
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
      </View>
    </View>
  );
};

const LeverantorForm = forwardRef(LeverantorFormInner);
export default LeverantorForm;
export { emptyValues };
