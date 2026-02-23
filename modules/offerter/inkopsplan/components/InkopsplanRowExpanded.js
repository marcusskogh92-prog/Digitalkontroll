import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
    addInkopsplanRowSupplier,
    ensureDefaultInkopsplanEmailTemplate,
    fetchCompanyPartiesForInkopsplan,
    listInkopsplanEmailTemplates,
    removeInkopsplanRowSupplier,
    setInkopsplanRowEmailTemplateId,
} from '../inkopsplanService';
import EmailTemplateEditorModal from './EmailTemplateEditorModal';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function SmallButton({ label, onPress, disabled, tone = 'neutral' }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.smallBtn,
        tone === 'primary' && styles.smallBtnPrimary,
        (pressed || hovered) && !disabled && styles.smallBtnHover,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.smallBtnText, tone === 'primary' && styles.smallBtnTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function InkopsplanRowExpanded({ row, companyId, projectId }) {
  const suppliers = Array.isArray(row?.suppliers) ? row.suppliers : [];

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [partyQuery, setPartyQuery] = useState('');
  const [parties, setParties] = useState([]);
  const [partiesLoading, setPartiesLoading] = useState(false);
  const [partiesError, setPartiesError] = useState('');

  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const selectedTemplateId = safeText(row?.emailTemplateId) || 'default';

  const selectedTemplateLabel = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    const found = list.find((t) => safeText(t?.id) === selectedTemplateId);
    return safeText(found?.name) || (selectedTemplateId === 'default' ? 'Standardmall' : selectedTemplateId);
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    let alive = true;
    if (!companyId || !projectId) return;
    setTemplatesLoading(true);
    setTemplatesError('');

    const run = async () => {
      try {
        await ensureDefaultInkopsplanEmailTemplate(companyId, projectId);
        const list = await listInkopsplanEmailTemplates(companyId, projectId);
        if (!alive) return;
        setTemplates(list);
      } catch (e) {
        if (!alive) return;
        setTemplatesError(String(e?.message || e || 'Kunde inte läsa mallar.'));
      } finally {
        if (!alive) return;
        setTemplatesLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [companyId, projectId]);

  useEffect(() => {
    let alive = true;
    if (!showAddSupplier) return;
    if (!companyId) return;
    if (Array.isArray(parties) && parties.length > 0) return;
    setPartiesLoading(true);
    setPartiesError('');

    const run = async () => {
      try {
        const list = await fetchCompanyPartiesForInkopsplan(companyId);
        if (!alive) return;
        setParties(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!alive) return;
        setPartiesError(String(e?.message || e || 'Kunde inte läsa registret.'));
      } finally {
        if (!alive) return;
        setPartiesLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [showAddSupplier, companyId, parties]);

  const matches = useMemo(() => {
    const q = String(partyQuery || '').trim().toLowerCase();
    const list = Array.isArray(parties) ? parties : [];
    if (!q) return list.slice(0, 8);
    return list
      .map((p) => {
        const name = safeText(p?.companyName).toLowerCase();
        const idx = name.indexOf(q);
        return { p, idx };
      })
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx || safeText(a?.p?.companyName).localeCompare(safeText(b?.p?.companyName), 'sv'))
      .slice(0, 8)
      .map((x) => x.p);
  }, [parties, partyQuery]);

  const handlePickParty = async (party) => {
    const rowId = safeText(row?.id);
    if (!companyId || !projectId || !rowId) return;
    try {
      await addInkopsplanRowSupplier({ companyId, projectId, rowId, party });
      setPartyQuery('');
      setShowAddSupplier(false);
    } catch (e) {
      Alert.alert('Kunde inte lägga till', e?.message || 'Okänt fel');
    }
  };

  const handleRemoveSupplier = async (supplierKey) => {
    const rowId = safeText(row?.id);
    if (!companyId || !projectId || !rowId) return;
    const key = safeText(supplierKey);
    if (!key) return;
    try {
      await removeInkopsplanRowSupplier({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte ta bort', e?.message || 'Okänt fel');
    }
  };

  const handleSelectTemplate = async (tid) => {
    const rowId = safeText(row?.id);
    const nextId = safeText(tid) || 'default';
    if (!companyId || !projectId || !rowId) return;
    setMenuOpen(false);
    setSavingTemplate(true);
    setTemplatesError('');
    try {
      await setInkopsplanRowEmailTemplateId({
        companyId,
        projectId,
        rowId,
        emailTemplateId: nextId,
      });
    } catch (e) {
      setTemplatesError(String(e?.message || e || 'Kunde inte spara val av mall.'));
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.title, { marginBottom: 0 }]}>Mailmall</Text>
        <View style={styles.headerActions}>
          <SmallButton
            label="Redigera"
            onPress={() => setEditorOpen(true)}
            disabled={!companyId || !projectId}
          />
        </View>
      </View>

      {templatesError ? <Text style={styles.errorText}>{templatesError}</Text> : null}

      <View style={styles.templateRow}>
        <Pressable
          onPress={() => setMenuOpen((v) => !v)}
          disabled={!companyId || !projectId || templatesLoading || savingTemplate}
          style={({ hovered, pressed }) => [
            styles.select,
            (hovered || pressed) && styles.selectHover,
            (!companyId || !projectId || templatesLoading || savingTemplate) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.selectText} numberOfLines={1}>
            {templatesLoading ? 'Laddar mallar…' : selectedTemplateLabel}
          </Text>
          <Text style={styles.selectChevron}>{menuOpen ? '▴' : '▾'}</Text>
        </Pressable>

        <Text style={styles.hint} numberOfLines={2}>
          Variabler ersätts vid generering/skick.
        </Text>
      </View>

      {menuOpen ? (
        <View style={styles.selectMenu}>
          {(Array.isArray(templates) && templates.length ? templates : [{ id: 'default', name: 'Standardmall' }]).map((t) => {
            const tid = safeText(t?.id) || 'default';
            const active = tid === selectedTemplateId;
            return (
              <Pressable
                key={tid}
                onPress={() => handleSelectTemplate(tid)}
                style={({ hovered, pressed }) => [
                  styles.selectItem,
                  (hovered || pressed) && styles.selectItemHover,
                  active && styles.selectItemActive,
                ]}
              >
                <Text style={[styles.selectItemText, active && styles.selectItemTextActive]} numberOfLines={1}>
                  {safeText(t?.name) || tid}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.sectionHeader}>
        <Text style={styles.title}>Leverantörer</Text>
        <View style={styles.headerActions}>
          <SmallButton
            label={showAddSupplier ? 'Stäng' : '+ Lägg till'}
            onPress={() => setShowAddSupplier((v) => !v)}
            disabled={!companyId || !projectId}
          />
        </View>
      </View>

      {showAddSupplier ? (
        <View style={styles.addSupplierBox}>
          {partiesError ? <Text style={styles.errorText}>{partiesError}</Text> : null}
          <View style={styles.addSupplierRow}>
            <TextInput
              value={partyQuery}
              onChangeText={setPartyQuery}
              placeholder="Sök kund eller leverantör…"
              style={styles.addSupplierInput}
              editable={!partiesLoading}
            />
          </View>

          {partiesLoading ? <Text style={styles.muted}>Laddar register…</Text> : null}

          {matches.length > 0 ? (
            <View style={styles.suggestBox}>
              {matches.map((p) => {
                const label = safeText(p?.companyName) || '—';
                const kind = safeText(p?.registryType) === 'customer' ? 'Kund' : 'Leverantör';
                const meta = safeText(p?.category);
                const key = safeText(p?.key) || `${label}-${kind}`;
                return (
                  <Pressable
                    key={key}
                    onPress={() => handlePickParty(p)}
                    style={({ pressed, hovered }) => [
                      styles.suggestRow,
                      (pressed || hovered) && styles.suggestRowHover,
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.suggestText} numberOfLines={1}>{label}</Text>
                      <Text style={styles.suggestMeta} numberOfLines={1}>
                        {kind}{meta ? ` · ${meta}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : partyQuery ? (
            <Text style={styles.muted}>Inga träffar.</Text>
          ) : null}
        </View>
      ) : null}

      {suppliers.length === 0 ? (
        <Text style={styles.muted}>Inga leverantörer kopplade ännu.</Text>
      ) : (
        suppliers.map((s, idx) => {
          const label = safeText(s?.companyName || s?.name || s?.id || s);
          const key = safeText(s?.key) || `${label}-${idx}`;
          return (
            <View key={key} style={styles.supplierRow}>
              <Text style={styles.supplier} numberOfLines={1}>{label}</Text>
              <Pressable
                onPress={() => handleRemoveSupplier(s?.key)}
                style={({ hovered, pressed }) => [
                  styles.removeLinkWrap,
                  (hovered || pressed) && styles.removeLinkHover,
                ]}
              >
                <Text style={styles.removeLink}>Ta bort</Text>
              </Pressable>
            </View>
          );
        })
      )}

      <EmailTemplateEditorModal
        visible={editorOpen}
        onClose={() => setEditorOpen(false)}
        companyId={companyId}
        projectId={projectId}
        templateId={selectedTemplateId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  muted: {
    fontSize: 13,
    color: '#64748B',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 8,
  },

  templateRow: {
    gap: 8,
    marginBottom: 8,
  },
  select: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectHover: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  selectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectChevron: {
    width: 18,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  selectMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  selectItem: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectItemHover: {
    backgroundColor: '#F8FAFC',
  },
  selectItemActive: {
    backgroundColor: '#0F172A',
  },
  selectItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectItemTextActive: {
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 12,
    color: '#64748B',
  },

  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 2,
  },
  supplier: {
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 2,
    flex: 1,
    minWidth: 0,
  },
  removeLinkWrap: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  removeLinkHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  removeLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
  },

  addSupplierBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  addSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addSupplierInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
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
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  suggestRowHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  suggestText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  suggestMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748b',
  },

  smallBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  smallBtnPrimary: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  smallBtnHover: {
    transform: [{ translateY: -1 }],
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  smallBtnTextPrimary: {
    color: '#FFFFFF',
  },
});
