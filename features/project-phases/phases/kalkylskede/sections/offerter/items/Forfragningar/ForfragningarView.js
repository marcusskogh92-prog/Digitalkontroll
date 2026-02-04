import ForfragningarView from '../../../../../../../../modules/offerter/forfragningar/ForfragningarView';

export default ForfragningarView;

/* Legacy implementation (disabled)
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    createCompanySupplier,
    fetchByggdelHierarchy,
    fetchCompanySuppliers,
    getCompanySharePointSiteId,
} from '../../../../../../../../components/firebase';
import { ensureFolderPath, getDriveItemByPath } from '../../../../../../../../services/azure/fileService';

import {
    addRfqPackageNote,
    createRfqByggdel,
    createRfqPackage,
    listenRfqByggdelar,
    listenRfqPackageNotes,
    listenRfqPackages,
    softDeleteRfqByggdel,
    updateRfqPackage
} from '../../../../services/forfragningarService';

function normalizePath(path) {
  if (!path || typeof path !== 'string') return '';
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/, '/')
    .replace(/\/+/g, '/');
}

function safeFolderSegment(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim();
}

function safeText(value) {
  const s = String(value ?? '').trim();
  return s || '';
}

function formatTime(value) {
  try {
    if (!value) return '—';
    const v = value?.toDate ? value.toDate() : value;
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '—';
    return d.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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
      style={({ pressed }) => [styles.primaryBtn, disabled && styles.btnDisabled, pressed && !disabled && styles.btnPressed]}
    >
      <Text style={[styles.primaryBtnText, disabled && styles.btnTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.ghostBtn, disabled && styles.btnDisabled, pressed && !disabled && styles.btnPressed]}
    >
      <Text style={[styles.ghostBtnText, disabled && styles.btnTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ status }) {
  const s = String(status || '').trim();
  const style =
    s === 'Besvarad'
      ? { backgroundColor: '#E0F2FE', borderColor: '#7DD3FC', color: '#075985' }
      : s === 'Skickad'
        ? { backgroundColor: '#FEF9C3', borderColor: '#FDE047', color: '#854D0E' }
        : { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', color: '#374151' };

  return (
    <View style={[styles.statusPill, { backgroundColor: style.backgroundColor, borderColor: style.borderColor }]}
    >
      <Text style={[styles.statusText, { color: style.color }]} numberOfLines={1}>
        {s || 'Ej skickad'}
      </Text>
    </View>
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
    const unsub = listenRfqPackageNotes(
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
      await addRfqPackageNote(companyId, projectId, selectedPackage.id, t);
      setNewText('');
    } catch (e) {
      Alert.alert('Kunde inte spara', e?.message || 'Okänt fel');
    } finally {
      setSubmitting(false);
    }
  };

  const historyRows = useMemo(() => {
    if (!selectedPackage) return [];
    return [
      { label: 'Skapad', value: formatTime(selectedPackage?.createdAt) },
      { label: 'Skickad', value: formatTime(selectedPackage?.sentAt) },
      { label: 'Besvarad', value: formatTime(selectedPackage?.answeredAt) },
      { label: 'Ändrad', value: formatTime(selectedPackage?.updatedAt) },
    ];
  }, [selectedPackage]);

  return (
    <View style={styles.notesPanel}>
      <Text style={styles.panelTitle}>Kommentarer & historik</Text>
      {selectedPackage ? (
        <Text style={styles.panelSubtitle} numberOfLines={2}>
          {safeText(selectedPackage.byggdelLabel) || '—'} · {safeText(selectedPackage.supplierName) || '—'}
        </Text>
      ) : (
        <Text style={styles.panelSubtitle}>Välj ett förfrågningspaket</Text>
      )}

      <View style={styles.divider} />

      {selectedPackage ? (
        <View style={styles.historyBox}>
          {historyRows.map((r) => (
            <View key={r.label} style={styles.historyRow}>
              <Text style={styles.historyLabel}>{r.label}</Text>
              <Text style={styles.historyValue} numberOfLines={1}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

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
                {safeText(n?.createdByName) || '—'} · {formatTime(n?.createdAt)}
              </Text>
              <Text style={styles.noteText}>{safeText(n?.text)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.noteComposer}>
        <TextInput
          placeholder={selectedPackage ? 'Skriv en kommentar…' : 'Välj ett paket först'}
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

export default function ForfragningarView({ companyId, projectId, project, activeItem, sectionNavigation }) {
  const isWeb = Platform.OS === 'web';

  const offerterRootPath = useMemo(
    () => deriveOfferterRootPath({ project, sectionNavigation, activeItem }),
    [project, sectionNavigation, activeItem],
  );

  const [byggdelHierarchy, setByggdelHierarchy] = useState({ momentsByGroup: {} });
  const [byggdelQuery, setByggdelQuery] = useState('');

  const [byggdelar, setByggdelar] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [suppliers, setSuppliers] = useState([]);

  const [selectedPackageId, setSelectedPackageId] = useState(null);

  // Per-byggdel supplier add UI state
  const [supplierQueryByByggdel, setSupplierQueryByByggdel] = useState({});
  const [selectedSupplierByByggdel, setSelectedSupplierByByggdel] = useState({});
  const [newSupplierNameByByggdel, setNewSupplierNameByByggdel] = useState({});
  const [creatingSupplierByByggdel, setCreatingSupplierByByggdel] = useState({});
  const [creatingPackageByByggdel, setCreatingPackageByByggdel] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return () => {};
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

  useEffect(() => {
    if (!companyId || !projectId) return () => {};
    setLoading(true);

    const unsubByggdel = listenRfqByggdelar(
      companyId,
      projectId,
      (items) => {
        setByggdelar(Array.isArray(items) ? items : []);
        setLoading(false);
      },
      (_err) => setLoading(false),
      { includeDeleted: false },
    );

    const unsubPackages = listenRfqPackages(
      companyId,
      projectId,
      (items) => setPackages(Array.isArray(items) ? items : []),
      (_err) => {},
      { includeDeleted: false },
    );

    return () => {
      try { unsubByggdel?.(); } catch (_e) {}
      try { unsubPackages?.(); } catch (_e) {}
    };
  }, [companyId, projectId]);

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

    const q = String(byggdelQuery || '').trim().toLowerCase();
    if (!q) return out.slice(0, 12);
    return out.filter((x) => x.label.toLowerCase().includes(q)).slice(0, 12);
  }, [byggdelHierarchy, byggdelQuery]);

  const byggdelIds = useMemo(() => new Set((Array.isArray(byggdelar) ? byggdelar : []).map((b) => String(b?.id || '').trim()).filter(Boolean)), [byggdelar]);

  const packagesByByggdel = useMemo(() => {
    const map = {};
    (Array.isArray(packages) ? packages : []).forEach((p) => {
      const bid = String(p?.byggdelId || '').trim();
      if (!bid) return;
      if (!byggdelIds.has(bid)) return;
      if (!map[bid]) map[bid] = [];
      map[bid].push(p);
    });
    Object.values(map).forEach((arr) => {
      arr.sort((a, b) => {
        const an = `${a?.supplierName || ''}`.trim();
        const bn = `${b?.supplierName || ''}`.trim();
        return an.localeCompare(bn, 'sv');
      });
    });
    return map;
  }, [packages, byggdelIds]);

  const selectedPackage = useMemo(
    () => (Array.isArray(packages) ? packages.find((p) => p.id === selectedPackageId) : null) || null,
    [packages, selectedPackageId],
  );

  const buildSharePointPackagePath = ({ byggdelLabel, supplierName }) => {
    if (!offerterRootPath) return '';
    const bd = safeFolderSegment(byggdelLabel);
    const sup = safeFolderSegment(supplierName);
    if (!bd) return '';
    // Supplier folder is optional here; can be created later.
    return sup ? normalizePath(`${offerterRootPath}/${bd}/${sup}`) : normalizePath(`${offerterRootPath}/${bd}`);
  };

  const handleAddByggdel = async (s) => {
    if (!companyId || !projectId) return;

    const label = safeText(s?.label || byggdelQuery);
    if (!label) return;

    const already = (Array.isArray(byggdelar) ? byggdelar : []).some((b) => safeText(b?.label).toLowerCase() === label.toLowerCase());
    if (already) {
      setByggdelQuery('');
      return;
    }

    try {
      // Best-effort SharePoint folder creation.
      const folderPath = buildSharePointPackagePath({ byggdelLabel: label, supplierName: '' });
      if (folderPath) {
        try {
          await ensureFolderPath(folderPath, companyId, null, { siteRole: 'projects', strict: false });
        } catch (_e) {}
      }

      await createRfqByggdel(companyId, projectId, {
        label,
        code: null,
        group: safeText(s?.group) || null,
        moment: safeText(s?.moment) || null,
      });

      setByggdelQuery('');
    } catch (e) {
      Alert.alert('Kunde inte lägga till byggdel', e?.message || 'Okänt fel');
    }
  };

  const handleRemoveByggdel = async (byggdel) => {
    if (!companyId || !projectId || !byggdel?.id) return;
    Alert.alert('Ta bort byggdel?', 'Byggdelen döljs från Förfrågningar. Befintliga paket påverkas inte direkt.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            await softDeleteRfqByggdel(companyId, projectId, byggdel.id);
            if (selectedPackageId && String(selectedPackage?.byggdelId || '') === String(byggdel.id)) {
              setSelectedPackageId(null);
            }
          } catch (e) {
            Alert.alert('Kunde inte ta bort', e?.message || 'Okänt fel');
          }
        },
      },
    ]);
  };

  const openUrl = async (url) => {
    const u = safeText(url);
    if (!u) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(u, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch (_e) {}

    try {
      await Linking.openURL(u);
    } catch (_e) {}
  };

  const openSharePointFolder = async (folderPath) => {
    const rel = normalizePath(folderPath);
    if (!companyId || !rel) return;

    try {
      const siteId = await getCompanySharePointSiteId(companyId);
      if (!siteId) throw new Error('Saknar SharePoint siteId');
      const item = await getDriveItemByPath(rel, siteId);
      const url = safeText(item?.webUrl);
      if (!url) throw new Error('Kunde inte öppna mappen (saknar webUrl)');
      await openUrl(url);
    } catch (e) {
      Alert.alert('Kunde inte öppna SharePoint', e?.message || 'Okänt fel');
    }
  };

  const handlePickSupplier = (byggdelId, supplier) => {
    setSelectedSupplierByByggdel((prev) => ({ ...(prev || {}), [byggdelId]: supplier ? { id: supplier.id, companyName: supplier.companyName } : null }));
    setSupplierQueryByByggdel((prev) => ({ ...(prev || {}), [byggdelId]: supplier ? safeText(supplier.companyName) : '' }));
  };

  const filteredSuppliersForByggdel = (byggdelId) => {
    const q = safeText(supplierQueryByByggdel?.[byggdelId]).toLowerCase();
    const list = Array.isArray(suppliers) ? suppliers : [];
    if (!q) return list.slice(0, 10);
    return list.filter((s) => safeText(s?.companyName).toLowerCase().includes(q)).slice(0, 10);
  };

  const handleCreateSupplierInline = async (byggdelId) => {
    const name = safeText(newSupplierNameByByggdel?.[byggdelId]);
    if (!companyId || !name) return;
    if (creatingSupplierByByggdel?.[byggdelId]) return;

    setCreatingSupplierByByggdel((prev) => ({ ...(prev || {}), [byggdelId]: true }));
    try {
      const id = await createCompanySupplier({ companyName: name }, companyId);
      const refreshed = await reloadSuppliers();
      const created = (Array.isArray(refreshed) ? refreshed : []).find((s) => s.id === id) || { id, companyName: name };
      handlePickSupplier(byggdelId, created);
      setNewSupplierNameByByggdel((prev) => ({ ...(prev || {}), [byggdelId]: '' }));
    } catch (e) {
      Alert.alert('Kunde inte skapa leverantör', e?.message || 'Okänt fel');
    } finally {
      setCreatingSupplierByByggdel((prev) => ({ ...(prev || {}), [byggdelId]: false }));
    }
  };

  const handleAddPackage = async (byggdel) => {
    if (!companyId || !projectId || !byggdel?.id) return;
    const supplier = selectedSupplierByByggdel?.[byggdel.id];
    const supplierName = safeText(supplier?.companyName);
    if (!supplierName) return;
    if (creatingPackageByByggdel?.[byggdel.id]) return;

    const existing = (packagesByByggdel?.[byggdel.id] || []).some((p) => safeText(p?.supplierName).toLowerCase() === supplierName.toLowerCase());
    if (existing) {
      Alert.alert('Finns redan', 'Denna leverantör är redan kopplad till byggdelen.');
      return;
    }

    setCreatingPackageByByggdel((prev) => ({ ...(prev || {}), [byggdel.id]: true }));
    try {
      const folderPath = buildSharePointPackagePath({ byggdelLabel: byggdel.label, supplierName });

      if (folderPath) {
        try {
          await ensureFolderPath(folderPath, companyId, null, { siteRole: 'projects', strict: false });
        } catch (_e) {}
      }

      const created = await createRfqPackage(companyId, projectId, {
        byggdelId: byggdel.id,
        byggdelLabel: byggdel.label,
        supplierId: supplier?.id ? String(supplier.id).trim() : null,
        supplierName,
        status: 'Ej skickad',
        sharePointFolderPath: folderPath || null,
      });

      setSelectedPackageId(created?.id || null);
      handlePickSupplier(byggdel.id, null);
    } catch (e) {
      Alert.alert('Kunde inte lägga till paket', e?.message || 'Okänt fel');
    } finally {
      setCreatingPackageByByggdel((prev) => ({ ...(prev || {}), [byggdel.id]: false }));
    }
  };

  const handleSetStatus = async (pkgId, status) => {
    try {
      await updateRfqPackage(companyId, projectId, pkgId, { status });
    } catch (e) {
      Alert.alert('Kunde inte uppdatera status', e?.message || 'Okänt fel');
    }
  };

  const handleEnsureSharePoint = async (pkg) => {
    const byggdelLabel = safeText(pkg?.byggdelLabel);
    const supplierName = safeText(pkg?.supplierName);
    const folderPath = buildSharePointPackagePath({ byggdelLabel, supplierName });
    if (!folderPath) {
      Alert.alert('Saknar SharePoint-koppling', 'Projektet verkar sakna SharePoint-sökväg eller paketet saknar byggdel/leverantör.');
      return;
    }

    try {
      await ensureFolderPath(folderPath, companyId, null, { siteRole: 'projects', strict: false });
      await updateRfqPackage(companyId, projectId, pkg.id, { sharePointFolderPath: folderPath });
    } catch (e) {
      Alert.alert('Kunde inte skapa mappar', e?.message || 'Okänt fel');
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Förfrågningar</Text>
        <Text style={styles.subtitle}>
          Välj byggdelar, koppla leverantörer och följ status. Mappar skapas automatiskt under “Offerter / Förfrågningar”.
        </Text>
        {!offerterRootPath ? (
          <Text style={styles.warning}>
            Saknar SharePoint-sökväg till “Offerter”. Förfrågningar fungerar ändå, men mappskapande kan inte köras.
          </Text>
        ) : null}
      </View>

      <View style={[styles.content, isWeb ? styles.contentWeb : styles.contentMobile]}>
        <View style={styles.main}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Byggdelar / discipliner</Text>
            <Text style={styles.cardHint}>Lägg till de byggdelar som ska ingå i förfrågan.</Text>

            <TextInput
              value={byggdelQuery}
              onChangeText={setByggdelQuery}
              placeholder="Sök i byggdelstabellen (t.ex. 84 VS, 85 Ventilation)…"
              style={styles.input}
            />

            {byggdelSuggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {byggdelSuggestions.map((s, idx) => (
                  <Pressable key={`${s.label}:${idx}`} onPress={() => handleAddByggdel(s)} style={styles.suggestionRow}>
                    <Text style={styles.suggestionText}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.chipsRow}>
              {(Array.isArray(byggdelar) ? byggdelar : []).map((b) => (
                <View key={b.id} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>{safeText(b?.label) || 'Byggdel'}</Text>
                  <Pressable onPress={() => handleRemoveByggdel(b)} style={styles.chipX}>
                    <Text style={styles.chipXText}>×</Text>
                  </Pressable>
                </View>
              ))}
              {loading ? <ActivityIndicator size="small" /> : null}
              {!loading && byggdelar.length === 0 ? <Text style={styles.muted}>Inga byggdelar valda ännu.</Text> : null}
            </View>
          </View>

          {(Array.isArray(byggdelar) ? byggdelar : []).map((b) => {
            const list = packagesByByggdel?.[b.id] || [];
            const supplierQuery = safeText(supplierQueryByByggdel?.[b.id]);
            const filtered = filteredSuppliersForByggdel(b.id);
            const picked = selectedSupplierByByggdel?.[b.id] || null;

            return (
              <View key={b.id} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle} numberOfLines={1}>{safeText(b?.label) || 'Byggdel'}</Text>
                  <Text style={styles.sectionMeta} numberOfLines={1}>{list.length} leverantör{list.length === 1 ? '' : 'er'}</Text>
                </View>

                <View style={styles.addRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TextInput
                      value={supplierQuery}
                      onChangeText={(t) => {
                        setSupplierQueryByByggdel((prev) => ({ ...(prev || {}), [b.id]: t }));
                        setSelectedSupplierByByggdel((prev) => ({ ...(prev || {}), [b.id]: null }));
                      }}
                      placeholder="Sök leverantör…"
                      style={styles.input}
                    />

                    {filtered.length > 0 ? (
                      <View style={styles.suggestions}>
                        {filtered.map((s) => (
                          <Pressable key={s.id} onPress={() => handlePickSupplier(b.id, s)} style={styles.suggestionRow}>
                            <Text style={styles.suggestionText}>{safeText(s.companyName) || '—'}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    {!picked && supplierQuery.trim().length >= 2 ? (
                      <View style={styles.inlineNewSupplier}>
                        <Text style={styles.inlineNewSupplierLabel}>Finns inte? Lägg till snabbt:</Text>
                        <View style={styles.inlineNewSupplierRow}>
                          <TextInput
                            value={safeText(newSupplierNameByByggdel?.[b.id])}
                            onChangeText={(t) => setNewSupplierNameByByggdel((prev) => ({ ...(prev || {}), [b.id]: t }))}
                            placeholder="Nytt leverantörsnamn"
                            style={[styles.input, { flex: 1 }]}
                          />
                          <PrimaryButton
                            label={creatingSupplierByByggdel?.[b.id] ? 'Skapar…' : 'Skapa'}
                            onPress={() => handleCreateSupplierInline(b.id)}
                            disabled={!safeText(newSupplierNameByByggdel?.[b.id]) || !!creatingSupplierByByggdel?.[b.id]}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>

                  <PrimaryButton
                    label={creatingPackageByByggdel?.[b.id] ? 'Lägger till…' : 'Lägg till'}
                    onPress={() => handleAddPackage(b)}
                    disabled={!picked || !!creatingPackageByByggdel?.[b.id]}
                  />
                </View>

                {list.length === 0 ? (
                  <Text style={styles.muted}>Inga leverantörer kopplade ännu.</Text>
                ) : (
                  <View style={styles.rows}>
                    {list.map((p) => {
                      const isSelected = selectedPackageId && String(selectedPackageId) === String(p.id);
                      const folderPath = safeText(p?.sharePointFolderPath);

                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => setSelectedPackageId(p.id)}
                          style={({ hovered, pressed }) => [
                            styles.row,
                            isSelected && styles.rowSelected,
                            (hovered || pressed) && styles.rowHover,
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{safeText(p?.supplierName) || 'Leverantör'}</Text>
                            <Text style={styles.rowSub} numberOfLines={1}>{safeText(p?.sharePointFolderPath) ? 'SharePoint-mapp kopplad' : 'Ingen mapp kopplad ännu'}</Text>
                          </View>

                          <StatusPill status={p?.status} />

                          <View style={styles.rowActions}>
                            {String(p?.status || '') !== 'Skickad' ? (
                              <GhostButton label="Markera skickad" onPress={() => handleSetStatus(p.id, 'Skickad')} />
                            ) : null}
                            {String(p?.status || '') !== 'Besvarad' ? (
                              <GhostButton label="Markera besvarad" onPress={() => handleSetStatus(p.id, 'Besvarad')} />
                            ) : null}

                            <GhostButton
                              label="Mapp"
                              onPress={() => {
                                if (folderPath) openSharePointFolder(folderPath);
                                else handleEnsureSharePoint(p);
                              }}
                            />
                            <GhostButton label="Kommentar" onPress={() => setSelectedPackageId(p.id)} />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {offerterRootPath ? (
                  <View style={styles.ensureHintRow}>
                    <GhostButton
                      label="Skapa/uppdatera mappar"
                      onPress={async () => {
                        // Best-effort: ensure byggdel folder.
                        try {
                          const folderPath = buildSharePointPackagePath({ byggdelLabel: b.label, supplierName: '' });
                          if (folderPath) await ensureFolderPath(folderPath, companyId, null, { siteRole: 'projects', strict: false });
                        } catch (_e) {}

                        // Best-effort: ensure each supplier folder.
                        for (const pkg of list) {
                          try {
                            await handleEnsureSharePoint(pkg);
                          } catch (_e) {}
                        }
                      }}
                      disabled={false}
                    />
                    <Text style={styles.ensureHintText} numberOfLines={2}>
                      Skapar mappar under SharePoint vid behov.
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          <View style={{ height: 16 }} />
        </View>

        <View style={styles.right}>
          <NotesPanel companyId={companyId} projectId={projectId} selectedPackage={selectedPackage} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: 16,
  },
  header: {
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  warning: {
    marginTop: 8,
    fontSize: 12,
    color: '#b45309',
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentWeb: {
    flexDirection: 'row',
    gap: 14,
  },
  contentMobile: {
    flexDirection: 'column',
    gap: 12,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  right: {
    width: Platform.OS === 'web' ? 360 : '100%',
    minWidth: 0,
    minHeight: 0,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  cardHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
  },

  sectionCard: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    padding: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionMeta: {
    fontSize: 12,
    color: '#64748b',
  },

  input: {
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#111827',
  },
  inputDisabled: {
    backgroundColor: '#F8FAFC',
    color: '#94A3B8',
  },

  suggestions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: {
    fontSize: 13,
    color: '#0f172a',
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6E8EC',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 12,
    color: '#0f172a',
    maxWidth: 220,
  },
  chipX: {
    marginLeft: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipXText: {
    color: '#334155',
    fontWeight: '700',
    marginTop: -1,
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  inlineNewSupplier: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E6E8EC',
  },
  inlineNewSupplierLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  inlineNewSupplierRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },

  rows: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#fff',
  },
  rowHover: {
    backgroundColor: '#F8FAFC',
  },
  rowSelected: {
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#1976D2',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },

  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },

  primaryBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#E6E8EC',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  ghostBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnTextDisabled: {
    opacity: 0.9,
  },

  ensureHintRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ensureHintText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
  },

  muted: {
    fontSize: 12,
    color: '#94A3B8',
  },

  notesPanel: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 14,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  panelSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEF2F7',
    marginVertical: 12,
  },
  centerPad: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesList: {
    flex: 1,
    minHeight: 0,
  },
  notesListContent: {
    paddingBottom: 10,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: '#E6E8EC',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  noteMeta: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 6,
  },
  noteText: {
    fontSize: 12,
    color: '#0f172a',
    lineHeight: 17,
  },
  noteComposer: {
    marginTop: 10,
    gap: 10,
  },
  noteInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },

  historyBox: {
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 4,
  },
  historyLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  historyValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
});
*/
