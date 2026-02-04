import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { createCompanySupplier, fetchByggdelHierarchy, fetchCompanySuppliers } from '../../../../../../../../components/firebase';
import { ensureFolderPath } from '../../../../../../../../services/azure/fileService';
import {
    addOfferPackageNote,
    createOfferPackage,
    listenOfferPackageNotes,
    listenOfferPackages,
    OFFER_PACKAGE_STATUSES,
    updateOfferPackage,
} from '../../../../services/offertintagService';

function normalizePath(path) {
  if (!path || typeof path !== 'string') return '';
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

function safeFolderSegment(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function statusPillStyle(status) {
  const s = String(status || '').trim();
  if (s === 'Klar') return { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', color: '#166534' };
  if (s === 'Mottagen') return { backgroundColor: '#E0F2FE', borderColor: '#7DD3FC', color: '#075985' };
  if (s === 'Skickad') return { backgroundColor: '#FEF9C3', borderColor: '#FDE047', color: '#854D0E' };
  return { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', color: '#374151' };
}

function formatTime(value) {
  try {
    if (!value) return '—';
    const v = value?.toDate ? value.toDate() : value;
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '—';
    return d.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return '—';
  }
}

function getProjectBasePath(project) {
  const raw =
    project?.path ||
    project?.sharePointPath ||
    project?.projectPath ||
    project?.sharepointPath ||
    project?.sharePointProjectPath ||
    '';
  return normalizePath(String(raw || ''));
}

function deriveOfferterRootPath({ project, sectionNavigation, activeItem }) {
  const base = getProjectBasePath(project);
  if (!base) return '';
  const sectionName = String(sectionNavigation?.name || '').trim();
  const items = Array.isArray(sectionNavigation?.items) ? sectionNavigation.items : [];
  const itemObj = items.find((it) => String(it?.id || '') === String(activeItem || ''));
  const itemName = String(itemObj?.name || '').trim();
  if (!sectionName || !itemName) return '';
  return normalizePath(`${base}/${sectionName}/${itemName}`);
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        disabled ? styles.btnDisabled : null,
        pressed && !disabled ? styles.btnPressed : null,
      ]}
    >
      <Text style={[styles.primaryBtnText, disabled ? styles.btnTextDisabled : null]}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghostBtn,
        disabled ? styles.btnDisabled : null,
        pressed && !disabled ? styles.btnPressed : null,
      ]}
    >
      <Text style={[styles.ghostBtnText, disabled ? styles.btnTextDisabled : null]}>{label}</Text>
    </Pressable>
  );
}

function NotesPanel({ companyId, projectId, selectedPackage }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!companyId || !projectId || !selectedPackage?.id) {
      setNotes([]);
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    const unsub = listenOfferPackageNotes(
      companyId,
      projectId,
      selectedPackage.id,
      (list) => {
        setNotes(Array.isArray(list) ? list : []);
        setLoading(false);
      },
      (_err) => setLoading(false),
    );

    return () => {
      try { unsub?.(); } catch (_e) {}
    };
  }, [companyId, projectId, selectedPackage?.id]);

  const canSubmit = Boolean(companyId && projectId && selectedPackage?.id && String(newText || '').trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    const t = String(newText || '').trim();
    if (!t) return;
    setSubmitting(true);
    try {
      await addOfferPackageNote(companyId, projectId, selectedPackage.id, t);
      setNewText('');
    } catch (e) {
      Alert.alert('Kunde inte spara', e?.message || 'Okänt fel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.notesPanel}>
      <Text style={styles.panelTitle}>Kommentarer</Text>
      {selectedPackage ? (
        <Text style={styles.panelSubtitle} numberOfLines={2}>
          {selectedPackage.byggdelLabel || '—'} · {selectedPackage.supplierName || '—'}
        </Text>
      ) : (
        <Text style={styles.panelSubtitle}>Välj ett offertpaket</Text>
      )}

      <View style={styles.divider} />

      {loading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView style={styles.notesList} contentContainerStyle={styles.notesListContent}>
          {notes.length === 0 ? <Text style={styles.muted}>Inga kommentarer än.</Text> : null}
          {notes.map((n) => (
            <View key={n.id} style={styles.noteCard}>
              <Text style={styles.noteMeta}>
                {String(n?.createdByName || '—')} · {formatTime(n?.createdAt)}
              </Text>
              <Text style={styles.noteText}>{String(n?.text || '').trim()}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.noteComposer}>
        <TextInput
          placeholder={selectedPackage ? 'Skriv en kommentar…' : 'Välj ett offertpaket först'}
          value={newText}
          onChangeText={setNewText}
          editable={Boolean(selectedPackage)}
          style={[styles.input, styles.noteInput, !selectedPackage ? styles.inputDisabled : null]}
          multiline
        />
        <PrimaryButton label={submitting ? 'Sparar…' : 'Skicka'} onPress={handleSubmit} disabled={!canSubmit || submitting} />
      </View>
    </View>
  );
}

export default function OffertintagView({ companyId, projectId, project, activeItem, sectionNavigation }) {
  const isWeb = Platform.OS === 'web';

  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [expandedPackageId, setExpandedPackageId] = useState(null);

  const [mode, setMode] = useState('byggdel');

  const [byggdelHierarchy, setByggdelHierarchy] = useState({ momentsByGroup: {} });
  const [byggdelInput, setByggdelInput] = useState('');
  const [byggdelPicked, setByggdelPicked] = useState(null); // { group, moment, label }

  const [suppliers, setSuppliers] = useState([]);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null); // {id, companyName}

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const [creatingPackage, setCreatingPackage] = useState(false);

  const offerterRootPath = useMemo(
    () => deriveOfferterRootPath({ project, sectionNavigation, activeItem }),
    [project, sectionNavigation, activeItem],
  );

  useEffect(() => {
    if (!companyId || !projectId) return () => {};
    setLoadingPackages(true);
    const unsub = listenOfferPackages(
      companyId,
      projectId,
      (items) => {
        setPackages(Array.isArray(items) ? items : []);
        setLoadingPackages(false);
      },
      (_err) => setLoadingPackages(false),
      { includeDeleted: false },
    );
    return () => {
      try { unsub?.(); } catch (_e) {}
    };
  }, [companyId, projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    (async () => {
      const h = await fetchByggdelHierarchy(companyId);
      if (!cancelled) setByggdelHierarchy(h || { momentsByGroup: {} });
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const reloadSuppliers = async () => {
    const list = await fetchCompanySuppliers(companyId);
    const safe = Array.isArray(list) ? list : [];
    setSuppliers(safe);
    return safe;
  };

  useEffect(() => {
    if (!companyId) return;
    reloadSuppliers();
  }, [companyId]);

  const byggdelSuggestions = useMemo(() => {
    const map = byggdelHierarchy && typeof byggdelHierarchy.momentsByGroup === 'object' ? byggdelHierarchy.momentsByGroup : {};
    const out = [];
    for (const [group, moments] of Object.entries(map)) {
      const list = Array.isArray(moments) ? moments : [];
      for (const m of list) {
        const moment = String(m || '').trim();
        if (!moment) continue;
        out.push({ group: String(group || '').trim(), moment, label: `${String(group || '').trim()} · ${moment}` });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label, 'sv'));

    const q = String(byggdelInput || '').trim().toLowerCase();
    if (!q) return out.slice(0, 12);
    return out.filter((x) => x.label.toLowerCase().includes(q)).slice(0, 12);
  }, [byggdelHierarchy, byggdelInput]);

  const filteredSuppliers = useMemo(() => {
    const q = String(supplierQuery || '').trim().toLowerCase();
    const list = Array.isArray(suppliers) ? suppliers : [];
    if (!q) return list.slice(0, 10);
    return list.filter((s) => String(s?.companyName || '').toLowerCase().includes(q)).slice(0, 10);
  }, [suppliers, supplierQuery]);

  const selectedPackage = useMemo(
    () => (Array.isArray(packages) ? packages.find((p) => p.id === selectedPackageId) : null) || null,
    [packages, selectedPackageId],
  );

  const canCreatePackage = Boolean(
    companyId &&
      projectId &&
      String(byggdelInput || '').trim() &&
      (selectedSupplier?.id || selectedSupplier?.companyName)
  );

  const handlePickByggdel = (s) => {
    setMode('byggdel');
    setByggdelPicked(s);
    setByggdelInput(String(s?.moment || s?.label || '').trim());
  };

  const handlePickSupplier = (s) => {
    setSelectedSupplier(s ? { id: s.id, companyName: s.companyName } : null);
    setSupplierQuery(s ? String(s.companyName || '').trim() : '');
  };

  const buildSharePointPackagePath = ({ byggdelLabel, supplierName }) => {
    if (!offerterRootPath) return '';
    const bd = safeFolderSegment(byggdelLabel);
    const sup = safeFolderSegment(supplierName);
    if (!bd || !sup) return '';
    return normalizePath(`${offerterRootPath}/${bd}/${sup}`);
  };

  const handleCreatePackage = async () => {
    if (!canCreatePackage || creatingPackage) return;

    const byggdelLabel = String(byggdelInput || '').trim();
    const supplierName = String(selectedSupplier?.companyName || '').trim();
    const supplierId = selectedSupplier?.id ? String(selectedSupplier.id).trim() : null;

    const sharePointFolderPath = buildSharePointPackagePath({ byggdelLabel, supplierName });

    setCreatingPackage(true);
    try {
      // Best-effort SharePoint folder creation (never blocks saving the package).
      if (sharePointFolderPath) {
        try {
          await ensureFolderPath(sharePointFolderPath, companyId, null, { siteRole: 'projects', strict: false });
        } catch (_e) {
          // ignore
        }
      }

      const created = await createOfferPackage(companyId, projectId, {
        mode,
        byggdelLabel,
        byggdelGroup: mode === 'byggdel' ? (byggdelPicked?.group || null) : null,
        byggdelMoment: mode === 'byggdel' ? (byggdelPicked?.moment || null) : null,
        supplierId,
        supplierName,
        status: 'Ej skickad',
        sharePointFolderPath: sharePointFolderPath || null,
      });

      setSelectedPackageId(created?.id || null);
      setExpandedPackageId(created?.id || null);
      setByggdelInput('');
      setByggdelPicked(null);
      setSelectedSupplier(null);
      setSupplierQuery('');
    } catch (e) {
      Alert.alert('Kunde inte skapa offertpaket', e?.message || 'Okänt fel');
    } finally {
      setCreatingPackage(false);
    }
  };

  const handleCreateSupplier = async () => {
    const name = String(newSupplierName || '').trim();
    if (!name || creatingSupplier) return;
    setCreatingSupplier(true);
    try {
      const id = await createCompanySupplier({ companyName: name }, companyId);
      const refreshed = await reloadSuppliers();
      const created = (Array.isArray(refreshed) ? refreshed : []).find((s) => s.id === id) || { id, companyName: name };
      handlePickSupplier(created);
      setShowNewSupplier(false);
      setNewSupplierName('');
    } catch (e) {
      Alert.alert('Kunde inte skapa leverantör', e?.message || 'Okänt fel');
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handleSetStatus = async (pkgId, status) => {
    try {
      await updateOfferPackage(companyId, projectId, pkgId, { status });
    } catch (e) {
      Alert.alert('Kunde inte uppdatera status', e?.message || 'Okänt fel');
    }
  };

  const handleEnsureSharePointForPackage = async (pkg) => {
    const byggdelLabel = String(pkg?.byggdelLabel || '').trim();
    const supplierName = String(pkg?.supplierName || '').trim();
    const folderPath = buildSharePointPackagePath({ byggdelLabel, supplierName });
    if (!folderPath) {
      Alert.alert('Saknar SharePoint-koppling', 'Projektet verkar sakna SharePoint-sökväg eller paketet saknar byggdel/leverantör.');
      return;
    }

    try {
      await ensureFolderPath(folderPath, companyId, null, { siteRole: 'projects', strict: false });
      await updateOfferPackage(companyId, projectId, pkg.id, { sharePointFolderPath: folderPath });
    } catch (e) {
      Alert.alert('Kunde inte skapa mappar', e?.message || 'Okänt fel');
    }
  };

  const sortedPackages = useMemo(() => {
    const list = Array.isArray(packages) ? [...packages] : [];
    const rank = (s) => {
      const idx = OFFER_PACKAGE_STATUSES.indexOf(String(s || '').trim());
      return idx === -1 ? 999 : idx;
    };
    list.sort((a, b) => {
      const ra = rank(a?.status);
      const rb = rank(b?.status);
      if (ra !== rb) return ra - rb;
      const an = `${a?.byggdelLabel || ''} ${a?.supplierName || ''}`.trim();
      const bn = `${b?.byggdelLabel || ''} ${b?.supplierName || ''}`.trim();
      return an.localeCompare(bn, 'sv');
    });
    return list;
  }, [packages]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Offertintag / Inköp</Text>
        <Text style={styles.subtitle}>
          Skapa offertpaket per byggdel och leverantör. Status, anteckningar och SharePoint-mappar hålls ihop.
        </Text>
        {!offerterRootPath ? (
          <Text style={styles.warning}>
            Saknar SharePoint-sökväg till “Offerter”. Paketen fungerar ändå, men mappskapande kan inte köras.
          </Text>
        ) : null}
      </View>

      <View style={[styles.content, isWeb ? styles.contentWeb : styles.contentMobile]}>
        <View style={styles.main}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nytt offertpaket</Text>

            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setMode('byggdel')}
                style={[styles.modePill, mode === 'byggdel' ? styles.modePillActive : null]}
              >
                <Text style={[styles.modeText, mode === 'byggdel' ? styles.modeTextActive : null]}>Byggdelstabell</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('manual')}
                style={[styles.modePill, mode === 'manual' ? styles.modePillActive : null]}
              >
                <Text style={[styles.modeText, mode === 'manual' ? styles.modeTextActive : null]}>Manuell</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Byggdel</Text>
            <TextInput
              value={byggdelInput}
              onChangeText={(t) => {
                setByggdelInput(t);
                if (mode !== 'manual') setMode('byggdel');
                setByggdelPicked(null);
              }}
              placeholder={mode === 'byggdel' ? 'Sök i byggdelstabellen…' : 'Skriv byggdel…'}
              style={styles.input}
            />

            {mode === 'byggdel' && byggdelSuggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {byggdelSuggestions.map((s, idx) => (
                  <Pressable key={`${s.label}:${idx}`} onPress={() => handlePickByggdel(s)} style={styles.suggestionRow}>
                    <Text style={styles.suggestionText}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.label}>Leverantör</Text>
            <TextInput
              value={supplierQuery}
              onChangeText={(t) => {
                setSupplierQuery(t);
                setSelectedSupplier(null);
              }}
              placeholder="Sök leverantör…"
              style={styles.input}
            />

            {filteredSuppliers.length > 0 ? (
              <View style={styles.suggestions}>
                {filteredSuppliers.map((s) => (
                  <Pressable key={s.id} onPress={() => handlePickSupplier(s)} style={styles.suggestionRow}>
                    <Text style={styles.suggestionText}>{String(s.companyName || '—')}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <PrimaryButton
                label={creatingPackage ? 'Skapar…' : 'Skapa offertpaket'}
                onPress={handleCreatePackage}
                disabled={!canCreatePackage || creatingPackage}
              />
              <GhostButton
                label={showNewSupplier ? 'Avbryt ny leverantör' : 'Skapa ny leverantör'}
                onPress={() => setShowNewSupplier((v) => !v)}
                disabled={creatingPackage}
              />
            </View>

            {showNewSupplier ? (
              <View style={styles.newSupplierBox}>
                <Text style={styles.label}>Företagsnamn</Text>
                <TextInput value={newSupplierName} onChangeText={setNewSupplierName} placeholder="Namn…" style={styles.input} />
                <View style={styles.actionsRow}>
                  <PrimaryButton
                    label={creatingSupplier ? 'Skapar…' : 'Spara leverantör'}
                    onPress={handleCreateSupplier}
                    disabled={!String(newSupplierName || '').trim() || creatingSupplier}
                  />
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>Offertpaket</Text>
            {loadingPackages ? <ActivityIndicator /> : <Text style={styles.muted}>{sortedPackages.length} st</Text>}
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {sortedPackages.length === 0 && !loadingPackages ? (
              <Text style={styles.muted}>Inga offertpaket ännu.</Text>
            ) : null}

            {sortedPackages.map((pkg) => {
              const isSelected = pkg.id === selectedPackageId;
              const isExpanded = pkg.id === expandedPackageId;
              const pill = statusPillStyle(pkg?.status);
              return (
                <View key={pkg.id} style={[styles.rowCard, isSelected ? styles.rowCardSelected : null]}>
                  <Pressable
                    onPress={() => {
                      setSelectedPackageId(pkg.id);
                      setExpandedPackageId((prev) => (prev === pkg.id ? null : pkg.id));
                    }}
                    style={styles.rowTop}
                  >
                    <View style={styles.rowMainText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {String(pkg?.byggdelLabel || '—')}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {String(pkg?.supplierName || '—')}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor }]}>
                      <Text style={[styles.statusPillText, { color: pill.color }]}>{String(pkg?.status || '—')}</Text>
                    </View>
                  </Pressable>

                  {isExpanded ? (
                    <View style={styles.rowDetails}>
                      <Text style={styles.detailLine}>
                        Senast uppdaterad: {formatTime(pkg?.updatedAt)}
                      </Text>

                      <View style={styles.statusRow}>
                        {OFFER_PACKAGE_STATUSES.map((s) => (
                          <Pressable
                            key={s}
                            onPress={() => handleSetStatus(pkg.id, s)}
                            style={[styles.statusMiniBtn, String(pkg?.status || '') === s ? styles.statusMiniBtnActive : null]}
                          >
                            <Text style={[styles.statusMiniText, String(pkg?.status || '') === s ? styles.statusMiniTextActive : null]}>
                              {s}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.actionsRow}>
                        <PrimaryButton
                          label="Skapa/Verifiera SharePoint-mappar"
                          onPress={() => handleEnsureSharePointForPackage(pkg)}
                          disabled={!offerterRootPath}
                        />
                      </View>

                      {pkg?.sharePointFolderPath ? (
                        <Text style={styles.detailLine} numberOfLines={2}>
                          SharePoint: {String(pkg.sharePointFolderPath)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>

        <NotesPanel companyId={companyId} projectId={projectId} selectedPackage={selectedPackage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: '#F4F6FA',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  warning: {
    marginTop: 10,
    fontSize: 12,
    color: '#92400E',
  },
  content: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  contentWeb: {
    flexDirection: 'row',
  },
  contentMobile: {
    flexDirection: 'column',
  },
  main: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  inputDisabled: {
    backgroundColor: '#F9FAFB',
    color: '#9CA3AF',
  },
  suggestions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  suggestionText: {
    fontSize: 13,
    color: '#0F172A',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
  },
  modePillActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  modeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modeTextActive: {
    color: '#1D4ED8',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ghostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnTextDisabled: {
    opacity: 0.9,
  },
  btnPressed: {
    opacity: 0.85,
  },
  newSupplierBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 4,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 16,
    gap: 10,
  },
  rowCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowCardSelected: {
    borderColor: '#93C5FD',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowMainText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  rowDetails: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  detailLine: {
    fontSize: 12,
    color: '#475569',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  statusMiniBtnActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  statusMiniText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  statusMiniTextActive: {
    color: '#1D4ED8',
  },
  notesPanel: {
    width: Platform.OS === 'web' ? 360 : '100%',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderTopWidth: Platform.OS === 'web' ? 0 : 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    minHeight: 0,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  panelSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  notesList: {
    flex: 1,
    minHeight: 0,
  },
  notesListContent: {
    paddingBottom: 12,
    gap: 10,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  noteMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  noteText: {
    marginTop: 6,
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 18,
  },
  noteComposer: {
    marginTop: 10,
    gap: 10,
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  muted: {
    fontSize: 12,
    color: '#64748B',
  },
  centerPad: {
    paddingVertical: 12,
  },
});
