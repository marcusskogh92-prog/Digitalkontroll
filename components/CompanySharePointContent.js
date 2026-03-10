/**
 * SharePoint-flik i Företagsinställningar: visar siter kopplade till företaget.
 * Lyft från ManageCompany (gamla adminpanelen), anpassad till nya stilen.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../constants/modalDesign2026';
import { useSharePointStatus } from '../hooks/useSharePointStatus';
import ContextMenu from './ContextMenu';
import {
    fetchCompanyProfile,
    fetchCompanySharePointSiteMetas,
    getAvailableSharePointSitesWithToken,
    getCompanySharePointSiteId,
    getCompanySharePointSiteIdByRole,
    getSharePointNavigationConfig,
    saveSharePointNavigationConfig,
    syncSharePointSiteVisibilityRemote,
    upsertCompanySharePointSiteMeta,
} from './firebase';

const normalizeRoleLabel = (role) => {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return 'custom';
  if (r === 'projects' || r === 'project') return 'projects';
  if (r === 'system') return 'system';
  if (r === 'custom' || r === 'extra') return 'custom';
  return r;
};

const STATUS_COLUMN_WIDTH = 100;

export default function CompanySharePointContent({ companyId, companyName, isCompanyAdminForThisCompany = true }) {
  const cid = String(companyId || '').trim();
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({ companyId: cid, searchSpinAnim });

  const [metas, setMetas] = useState([]);
  const [systemSiteId, setSystemSiteId] = useState('');
  const [projectSiteId, setProjectSiteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingSiteName, setCreatingSiteName] = useState('');
  const [showCreateSiteModal, setShowCreateSiteModal] = useState(false);
  const [newSiteNameDraft, setNewSiteNameDraft] = useState('');
  const [refreshSpin, setRefreshSpin] = useState(0);
  const [kebabSiteId, setKebabSiteId] = useState(null);
  const [kebabPosition, setKebabPosition] = useState({ x: 0, y: 0 });
  const [renameSiteId, setRenameSiteId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [syncToOrgLoading, setSyncToOrgLoading] = useState(false);
  const [syncPickerVisible, setSyncPickerVisible] = useState(false);
  const [availableSitesFromGraph, setAvailableSitesFromGraph] = useState([]);
  const [syncError, setSyncError] = useState('');
  const [linkingSiteId, setLinkingSiteId] = useState(null);
  const kebabRefs = useRef({});

  const reload = useCallback(async (silent = true) => {
    if (!cid) {
      setSystemSiteId('');
      setMetas([]);
      setProjectSiteId('');
      return;
    }
    setLoading(true);
    try {
      try { await syncSharePointSiteVisibilityRemote({ companyId: cid }); } catch (_e) {}
      const sysId = await getCompanySharePointSiteIdByRole(cid, 'system', { syncIfMissing: true });
      setSystemSiteId(String(sysId || '').trim());
      const list = await fetchCompanySharePointSiteMetas(cid).catch(() => []);
      setMetas(Array.isArray(list) ? list : []);
      const projId = await getCompanySharePointSiteId(cid).catch(() => '');
      setProjectSiteId(String(projId || '').trim());
    } catch (_e) {
      setMetas([]);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    if (!cid) return;
    reload(true);
  }, [cid, reload]);

  // Efter återkomst från tenant-inloggning: trigga exchange om URL har code+state=tenant_, sedan öppna picker om PENDING_SYNC_PICKER_KEY matchar detta företag
  useEffect(() => {
    if (!cid || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const KEY = 'azure_pending_sync_picker';
    const tryOpenPickerFromPending = async () => {
      try {
        const raw = window.sessionStorage && window.sessionStorage.getItem(KEY);
        if (!raw) return;
        const { companyId, tenantId } = JSON.parse(raw);
        if (companyId !== cid) return;
        if (typeof console !== 'undefined' && console.info) console.info('[SharePoint Sync] Efter redirect: öppnar picker, companyId=', cid, 'tenantId=', tenantId?.slice(0, 8) + '…');
        const { getAccessTokenForTenant } = await import('../services/azure/authService');
        const token = await getAccessTokenForTenant(tenantId, cid);
        if (!token) {
          if (typeof console !== 'undefined' && console.warn) console.warn('[SharePoint Sync] Efter redirect: ingen token i lagring.');
          setSyncError('Kunde inte hämta token efter inloggning. Försök klicka på "Synka mot …" igen.');
          setSyncToOrgLoading(false);
          return;
        }
        let sites = [];
        try {
          sites = await getAvailableSharePointSitesWithToken(token);
        } catch (graphErr) {
          const msg = graphErr?.message || String(graphErr);
          setSyncError('Kunde inte hämta siter efter inloggning: ' + msg);
          setSyncToOrgLoading(false);
          return;
        }
        const siteList = Array.isArray(sites) ? sites : [];
        setAvailableSitesFromGraph(siteList);
        setSyncPickerVisible(true);
        if (siteList.length === 0) {
          setSyncError('Inga siter hämtades. Kontrollera att admin consent är gjord för er organisation och att du har åtkomst till SharePoint-siter i Wilzéns tenant.');
        } else {
          setSyncError('');
        }
        // Rensa INTE nyckeln här – annars anropar useSharePointHierarchy (t.ex. i HomeScreen) getAccessToken(),
        // får null och startar om inloggning = loop. Rensas istället när användaren stänger Företagsinställningar-modalen.
      } catch (e) {
        const msg = e?.message || String(e);
        setSyncError('Fel vid öppning av sitelista: ' + msg);
      }
      setSyncToOrgLoading(false);
    };
    const hash = (window.location.hash || '').slice(1);
    const search = (window.location.search || '').slice(1);
    const params = new URLSearchParams(hash || search);
    const code = params.get('code');
    const state = params.get('state');
    const isTenantReturn = code && state && String(state).startsWith('tenant_');
    if (isTenantReturn) {
      import('../services/azure/authService').then(({ processTenantReturnFromUrl }) => {
        processTenantReturnFromUrl().then(() => {}).catch(() => {}).finally(tryOpenPickerFromPending);
      });
    } else {
      tryOpenPickerFromPending();
    }
    // Fallback: om modalen öppnades av global effekt kan nyckeln sättas precis efter vår mount – försök igen efter kort delay
    const t = setTimeout(tryOpenPickerFromPending, 800);
    return () => clearTimeout(t);
  }, [cid]);

  const getMeta = useCallback((siteId) => {
    const id = String(siteId || '').trim();
    if (!id) return null;
    return metas.find((m) => String(m?.siteId || m?.id || '').trim() === id) || null;
  }, [metas]);

  const projectMeta = getMeta(projectSiteId);
  const systemMeta = getMeta(systemSiteId);
  const resolvedProjectName = String(projectMeta?.siteName || sharePointStatus?.siteName || '');
  const resolvedProjectUrl = String(projectMeta?.siteUrl || sharePointStatus?.siteUrl || '');
  const resolvedSystemName = String(systemMeta?.siteName || '');
  const resolvedSystemUrl = String(systemMeta?.siteUrl || '');

  const sortedMetas = [...metas].sort((a, b) => {
    const ar = normalizeRoleLabel(a?.role);
    const br = normalizeRoleLabel(b?.role);
    const weight = (r) => (r === 'system' ? 0 : r === 'projects' ? 1 : 2);
    if (weight(ar) !== weight(br)) return weight(ar) - weight(br);
    const an = String(a?.siteName || a?.siteUrl || '').toLowerCase();
    const bn = String(b?.siteName || b?.siteUrl || '').toLowerCase();
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });

  // DK Bas för knappen: använd systemSiteId om satt, annars första site med role system ELLER namn som innehåller "DK Bas"
  const dkBasSiteId = systemSiteId || (() => {
    const m = metas.find(
      (x) =>
        normalizeRoleLabel(x?.role) === 'system' ||
        /dk\s*bas/i.test(String(x?.siteName || x?.siteUrl || ''))
    );
    return m ? String(m.siteId || m.id || '').trim() || null : null;
  })();

  const buildEntries = useCallback(() => {
    const byId = new Map();
    const add = (m) => {
      const sid = String(m?.siteId || m?.id || '').trim();
      if (!sid || byId.has(sid)) return;
      byId.set(sid, {
        siteId: sid,
        siteName: String(m?.siteName || ''),
        siteUrl: String(m?.siteUrl || ''),
        role: normalizeRoleLabel(m?.role),
        visibleInLeftPanel: m?.visibleInLeftPanel === true,
      });
    };
    if (systemMeta) add(systemMeta);
    if (projectMeta) add(projectMeta);
    sortedMetas.forEach(add);
    if (projectSiteId && !byId.has(projectSiteId)) {
      byId.set(projectSiteId, {
        siteId: projectSiteId,
        siteName: resolvedProjectName || 'Projekt-site',
        siteUrl: resolvedProjectUrl,
        role: 'projects',
        visibleInLeftPanel: projectMeta ? projectMeta?.visibleInLeftPanel === true : true,
      });
    }
    if (systemSiteId && !byId.has(systemSiteId)) {
      byId.set(systemSiteId, {
        siteId: systemSiteId,
        siteName: resolvedSystemName || 'System-site',
        siteUrl: resolvedSystemUrl,
        role: 'system',
        visibleInLeftPanel: true,
      });
    }
    return Array.from(byId.values()).sort((a, b) => {
      const weight = (r) => (r === 'system' ? 0 : r === 'projects' ? 1 : 2);
      if (weight(a.role) !== weight(b.role)) return weight(a.role) - weight(b.role);
      return String(a.siteName || a.siteId).localeCompare(String(b.siteName || b.siteId), undefined, { sensitivity: 'base' });
    });
  }, [systemMeta, projectMeta, sortedMetas, projectSiteId, systemSiteId, resolvedProjectName, resolvedProjectUrl, resolvedSystemName, resolvedSystemUrl]);

  const displayCompanyName = String(companyName || '').trim() || 'företaget';
  const entries = buildEntries();
  const digitalkontrollEntries = entries.filter((e) => e.role === 'system' || e.role === 'projects');
  const companyTenantEntries = entries.filter((e) => e.role === 'custom');
  const companyTenantLabel = displayCompanyName === 'företaget' ? 'Företagets SharePoint-siter' : `${displayCompanyName}s SharePoint-siter`;
  const syncButtonLabel = displayCompanyName === 'företaget'
    ? 'Synka mot företagets interna SharePoint-miljö'
    : `Synka mot ${displayCompanyName} interna SharePoint-miljö`;

  const typLabel = (entry) => {
    const r = entry?.role;
    const name = String(entry?.siteName || '').trim();
    if (r === 'system') return 'System låst';
    if (r === 'projects') return 'System låst';
    if (/dk\s*bas/i.test(name)) return 'System låst';
    if (/dk\s*site/i.test(name)) return 'System låst';
    return 'Extra';
  };

  const spStatusInfo = (entry) => {
    const role = entry?.role;
    if (role === 'projects') {
      if (sharePointStatus?.checking) return { label: 'Synkar…', tone: 'neutral' };
      if (sharePointStatus?.error) return { label: 'Fel', tone: 'danger' };
      if (sharePointStatus?.connected) return { label: 'OK', tone: 'ok' };
      return { label: 'Synkar ej', tone: 'warn' };
    }
    if (String(entry?.siteUrl || '').trim()) return { label: 'OK', tone: 'ok' };
    return { label: 'Synkar ej', tone: 'warn' };
  };

  const spStatusPillStyle = (tone) => {
    if (tone === 'ok') return { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
    if (tone === 'warn') return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    if (tone === 'danger') return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  };

  const openInSharePoint = (url) => {
    const u = String(url || '').trim();
    if (!u) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.open) {
      try { window.open(u, '_blank', 'noopener,noreferrer'); } catch (_e) {}
    } else {
      Linking.openURL(u).catch(() => {});
    }
  };

  const handleOpenCreateSiteModal = useCallback(() => {
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Skapande av siter stöds i webbläget.');
      return;
    }
    setNewSiteNameDraft('');
    setShowCreateSiteModal(true);
  }, []);

  const handleCreateSiteSubmit = useCallback(async () => {
    if (!cid) return;
    const namePart = String(newSiteNameDraft || '').trim();
    if (!namePart) {
      if (Platform.OS === 'web' && window.alert) window.alert('Ange ett namn på siten.');
      return;
    }
    setShowCreateSiteModal(false);
    setCreatingSiteName(namePart);
    setCreating(true);
    try {
      const { functionsClient } = await import('./firebase');
      const { httpsCallable } = await import('firebase/functions');
      if (!functionsClient) throw new Error('Functions inte tillgänglig');
      const createSharePointSite = httpsCallable(functionsClient, 'createSharePointSite', { timeout: 200000 });
      const result = await createSharePointSite({
        companyId: cid,
        siteNamePart: namePart,
        companyName: companyName || cid,
      });
      const data = result?.data || {};
      const siteId = data?.siteId || data?.id;
      const siteUrl = data?.webUrl || data?.siteUrl;
      if (siteId) {
        await upsertCompanySharePointSiteMeta(cid, {
          siteId,
          siteName: namePart,
          siteUrl: siteUrl || '',
          role: 'projects',
          visibleInLeftPanel: true,
        });
        try { await syncSharePointSiteVisibilityRemote({ companyId: cid }); } catch (_e) {}
        await reload(true);
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
          window.alert(siteUrl ? `Site skapad.\n\nURL: ${siteUrl}` : 'Site skapad.');
        } else {
          Alert.alert('Site skapad', siteUrl ? `URL: ${siteUrl}` : 'Siten är skapad och kopplad till företaget.');
        }
      }
    } catch (e) {
      console.error('[CompanySharePointContent] createSharePointSite failed:', e);
      const msg = e?.message || String(e);
      const code = e?.code || '';
      const isTimeoutOrInternal = code === 'internal' || code === 'deadline-exceeded' || /internal|deadline|timeout/i.test(String(msg));
      const userMsg = isTimeoutOrInternal
        ? 'Skapandet tog för lång tid (SharePoint kan vara långsam). Siten kan ändå ha skapats – kontrollera i SharePoint eller under denna lista om några minuter. Försök gärna igen om den saknas.'
        : 'Kunde inte skapa site: ' + msg;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(userMsg);
      } else {
        Alert.alert(isTimeoutOrInternal ? 'Kan ha lyckats' : 'Kunde inte skapa site', userMsg);
      }
    } finally {
      setCreating(false);
      setCreatingSiteName('');
    }
  }, [cid, companyName, newSiteNameDraft, reload]);

  const handleCreateSite = useCallback(() => {
    if (!cid) return;
    handleOpenCreateSiteModal();
  }, [cid, handleOpenCreateSiteModal]);

  const handleDeleteSite = useCallback(async (siteId, siteName) => {
    if (!cid || !siteId) return;
    if (typeof window !== 'undefined' && !window.confirm(`Ta bort kopplingen till "${siteName}"?\n\nSiten tas bort från företaget i Digitalkontroll. Siten raderas inte i SharePoint.`)) {
      setKebabSiteId(null);
      return;
    }
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      await deleteDoc(doc(db, 'foretag', cid, 'sharepoint_sites', siteId));
      const cfg = await getSharePointNavigationConfig(cid).catch(() => null);
      const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
      const nextEnabled = enabledSites.filter((x) => String(x || '').trim() !== siteId);
      await saveSharePointNavigationConfig(cid, { ...(cfg || {}), enabledSites: nextEnabled });
      await reload(true);
    } catch (e) {
      console.error('[CompanySharePointContent] delete site meta failed:', e);
      if (typeof window !== 'undefined' && window.alert) window.alert('Kunde inte ta bort: ' + (e?.message || e));
    }
    setKebabSiteId(null);
  }, [cid, reload]);

  const handleRenameSave = useCallback(async () => {
    if (!cid || !renameSiteId || !renameDraft.trim()) {
      setRenameSiteId('');
      setRenameDraft('');
      return;
    }
    try {
      await upsertCompanySharePointSiteMeta(cid, {
        siteId: renameSiteId,
        siteName: String(renameDraft).trim(),
        visibleInLeftPanel: true,
      });
      await reload(true);
    } catch (e) {
      if (typeof window !== 'undefined' && window.alert) window.alert('Kunde inte spara namn: ' + (e?.message || e));
    }
    setRenameSiteId('');
    setRenameDraft('');
  }, [cid, renameSiteId, renameDraft, reload]);

  const handleSyncToOrgSharePoint = useCallback(async () => {
    if (!cid) return;
    setSyncToOrgLoading(true);
    setSyncError('');
    if (typeof console !== 'undefined' && console.info) console.info('[SharePoint Sync] Klick: synka mot företagets SharePoint, companyId=', cid);
    try {
      const profile = await fetchCompanyProfile(cid).catch(() => null);
      const azureTenantId = (profile && profile.azureTenantId) ? String(profile.azureTenantId).trim() : '';
      if (!azureTenantId) {
        setSyncError('Ange Företagets Tenant ID under fliken Microsoft-inloggning i Företagsinställningar. Då kan vi visa er organisations SharePoint-siter.');
        return;
      }
      if (typeof console !== 'undefined' && console.info) console.info('[SharePoint Sync] Tenant ID från profil:', azureTenantId?.slice(0, 8) + '…');
      const { getAccessTokenForTenant } = await import('../services/azure/authService');
      const token = await getAccessTokenForTenant(azureTenantId, cid);
      if (!token) {
        if (typeof console !== 'undefined' && console.info) console.info('[SharePoint Sync] Ingen token – omdirigerar till Microsoft-inloggning.');
        setSyncError('Omdirigerar till inloggning – logga in med ert företags Microsoft-konto. Efter inloggning öppnas denna sida igen.');
        return;
      }
      let sites = [];
      try {
        sites = await getAvailableSharePointSitesWithToken(token);
      } catch (graphErr) {
        const graphMsg = graphErr?.message || String(graphErr);
        setSyncError('Kunde inte hämta siter: ' + graphMsg + (typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? ' Kontrollera att http://' + window.location.host + '/ är tillagd som Redirect URI i Azure App-registreringen.' : ''));
        return;
      }
      const siteList = Array.isArray(sites) ? sites : [];
      if (typeof console !== 'undefined' && console.info) console.info('[SharePoint Sync] Graph returnerade', siteList.length, 'siter.');
      setAvailableSitesFromGraph(siteList);
      setSyncPickerVisible(true);
      if (siteList.length === 0) {
        setSyncError('Inga siter hämtades från Microsoft Graph. Kontrollera att du är inloggad med företagets konto, att admin consent är gjord för er organisation, och att appen har behörighet Sites.Read.All/Sites.ReadWrite.All.');
      } else {
        setSyncError('');
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setSyncError(msg);
      if (msg.includes('Redirecting') || msg.includes('redirect')) return;
      Alert.alert('Kunde inte ansluta', msg + '\n\nLogga in med ert företags arbetskonto när Microsoft öppnas.');
    } finally {
      setSyncToOrgLoading(false);
    }
  }, [cid]);

  const handlePickSiteFromGraph = useCallback(async (site) => {
    if (!cid || !site?.id) return;
    const siteId = String(site.id).trim();
    const siteName = String(site.name || site.displayName || '').trim() || 'SharePoint-site';
    const siteUrl = site.webUrl ? String(site.webUrl).trim() : null;
    setLinkingSiteId(siteId);
    try {
      await upsertCompanySharePointSiteMeta(cid, {
        siteId,
        siteName: siteName || null,
        siteUrl: siteUrl || null,
        role: 'custom',
        visibleInLeftPanel: true,
      });
      try {
        const cfg = await getSharePointNavigationConfig(cid).catch(() => null);
        const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
        const nextEnabled = enabledSites.includes(siteId) ? enabledSites : [...enabledSites, siteId];
        await saveSharePointNavigationConfig(cid, { ...(cfg || {}), enabledSites: nextEnabled });
      } catch (navErr) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[SharePoint] saveSharePointNavigationConfig:', navErr?.message || navErr);
      }
      try {
        await syncSharePointSiteVisibilityRemote({ companyId: cid });
      } catch (syncErr) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[SharePoint] syncSharePointSiteVisibilityRemote:', syncErr?.message || syncErr);
      }
      await reload(false);
      setSyncPickerVisible(false);
      setAvailableSitesFromGraph([]);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`"${siteName}" är nu kopplad till företaget och visas under Wilzéns Byggs SharePoint-siter.`);
      } else {
        Alert.alert('Kopplad', `"${siteName}" är nu kopplad till företaget.`);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Kunde inte koppla: ' + msg);
      } else {
        Alert.alert('Kunde inte koppla', msg);
      }
    } finally {
      setLinkingSiteId(null);
    }
  }, [cid, reload]);

  const kebabEntry = kebabSiteId ? entries.find((e) => String(e?.siteId || '').trim() === String(kebabSiteId || '').trim()) : null;
  const kebabRole = kebabEntry ? normalizeRoleLabel(kebabEntry?.role) : null;
  const isCustomRole = kebabRole === 'custom';
  const kebabItems = [];
  if (kebabEntry && String(kebabEntry?.siteUrl || '').trim()) kebabItems.push({ key: 'open', label: 'Öppna' });
  if (isCustomRole) {
    kebabItems.push({ key: 'rename', label: 'Byt namn' });
    kebabItems.push({ key: 'delete', label: 'Ta bort', danger: true });
  }

  if (!cid) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 12, color: '#64748b' }}>Välj ett företag.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {/* Modal: Ange namn på ny site – håller kvar i appen så att Företagsinställningar inte stängs */}
      <Modal visible={showCreateSiteModal} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={() => setShowCreateSiteModal(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }} onPress={(e) => e?.stopPropagation?.()}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 10 }}>Ny SharePoint-site</Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Namn på siten (t.ex. "Projekt" eller "Site 2"). Siten får visningsnamn: {companyName || cid} – [namn].</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: D.inputRadius, paddingVertical: 8, paddingHorizontal: 12, fontSize: 13, color: '#1e293b', marginBottom: 20 }}
              placeholder="t.ex. Projekt"
              placeholderTextColor="#94a3b8"
              value={newSiteNameDraft}
              onChangeText={setNewSiteNameDraft}
              editable={!creating}
              autoFocus
              onSubmitEditing={handleCreateSiteSubmit}
              returnKeyType="done"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <TouchableOpacity onPress={() => setShowCreateSiteModal(false)} style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#b91c1c' }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateSiteSubmit} style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: D.buttonPrimaryBg ?? '#2D3A4B' }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#fff' }}>Skapa site</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Picker: välj befintlig SharePoint-site från organisationen att koppla till företaget */}
      <Modal visible={syncPickerVisible} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={() => setSyncPickerVisible(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '80%' }} onPress={(e) => e?.stopPropagation?.()}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 }}>Välj SharePoint-site att koppla</Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 18 }}>
              Siter som ditt konto har åtkomst till. Välj en för att koppla den till företaget.
            </Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
              {availableSitesFromGraph.length === 0 ? (
                <View style={{ paddingVertical: 16, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 12, color: '#334155', fontWeight: '500', marginBottom: 6 }}>Inga siter hittades</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 18 }}>
                    Du ska se de siter du har åtkomst till i företagets SharePoint. Kontrollera att:{'\n'}
                    • Du är inloggad med ert företags Microsoft-konto (samma organisation som Tenant ID).{'\n'}
                    • Er IT har godkänt appen (admin consent) för er organisation.{'\n'}
                    {typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? '• Vid test på localhost: lägg till ' + (window.location.origin + '/') + ' som Redirect URI i Azure App-registreringen (Autentisering).' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Stäng och klicka igen på "Synka mot …" när ovan är kontrollerat.</Text>
                </View>
              ) : (
                availableSitesFromGraph.map((site) => {
                  const name = String(site.name || site.displayName || '').trim() || 'SharePoint-site';
                  const url = site.webUrl ? String(site.webUrl) : '';
                  const isLinking = linkingSiteId === site.id;
                  return (
                    <TouchableOpacity
                      key={site.id}
                      onPress={() => handlePickSiteFromGraph(site)}
                      disabled={isLinking}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        marginBottom: 4,
                        backgroundColor: isLinking ? '#f1f5f9' : '#f8fafc',
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 8,
                        ...(Platform.OS === 'web' ? { cursor: isLinking ? 'wait' : 'pointer' } : {}),
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: '#1e293b' }} numberOfLines={1}>{name}</Text>
                        {url ? <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} numberOfLines={1}>{url}</Text> : null}
                      </View>
                      {isLinking ? <ActivityIndicator size="small" color="#475569" /> : <Ionicons name="link" size={18} color="#0369a1" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity onPress={() => setSyncPickerVisible(false)} style={{ marginTop: 16, paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#475569' }}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Laddningsöverlägg när site skapas – tydlig feedback så att modalen inte kännas "stängd" */}
      {creating ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 10, borderRadius: 12 }}>
          <ActivityIndicator size="large" color="#1e293b" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginTop: 12 }}>Skapar site – {creatingSiteName || '…'}</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Det kan ta en halv minut. Stäng inte modalen.</Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
        Siter som företaget har tillgång till. DK Bas och DK Site är låsta och kan inte tas bort.
      </Text>

      <View
        style={{
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 10,
          padding: 12,
          marginBottom: 16,
          backgroundColor: '#f0f9ff',
          borderWidth: 1,
          borderColor: '#bae6fd',
          borderRadius: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Ionicons name="information-circle-outline" size={20} color="#0369a1" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 20 }}>
              Koppla företagets interna SharePoint-miljö så att användare kan nå dokument och listor direkt i appen.
            </Text>
            {!isCompanyAdminForThisCompany && (
              <Text style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 20, marginTop: 8, fontWeight: '500' }}>
                Denna koppling bör göras av en administratör för {displayCompanyName} med ett Microsoft-konto från företaget. Logga in som företagsadmin i Digitalkontroll och öppna Företagsinställningar → SharePoint. Som superadmin kan du också använda ett konto som tillhör företaget om du har det.
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          onPress={handleSyncToOrgSharePoint}
          disabled={syncToOrgLoading}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: D.buttonPaddingVertical,
            paddingHorizontal: D.buttonPaddingHorizontal,
            borderRadius: D.buttonRadius,
            backgroundColor: syncToOrgLoading ? '#e2e8f0' : (D.buttonPrimaryBg ?? '#2D3A4B'),
            alignSelf: 'flex-start',
            ...(Platform.OS === 'web' ? { cursor: syncToOrgLoading ? 'not-allowed' : 'pointer' } : {}),
          }}
        >
          {syncToOrgLoading ? <ActivityIndicator size="small" color="#64748b" /> : null}
          <Text style={{ fontSize: 12, fontWeight: '500', color: syncToOrgLoading ? '#64748b' : '#fff' }}>
            {syncButtonLabel}
          </Text>
        </TouchableOpacity>
        {syncError ? <Text style={{ fontSize: 12, color: '#b91c1c' }}>{syncError}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={handleCreateSite}
            disabled={creating || loading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: D.buttonPaddingVertical,
              paddingHorizontal: D.buttonPaddingHorizontal,
              borderRadius: D.buttonRadius,
              backgroundColor: (creating || loading) ? '#e2e8f0' : (D.buttonPrimaryBg ?? '#2D3A4B'),
              ...(Platform.OS === 'web' ? { cursor: (creating || loading) ? 'not-allowed' : 'pointer' } : {}),
            }}
          >
            {creating ? <ActivityIndicator size="small" color="#64748b" /> : <Ionicons name="add" size={16} color="#fff" />}
            <Text style={{ fontSize: 12, fontWeight: '500', color: (creating || loading) ? '#64748b' : '#fff' }}>{creating ? 'Skapar…' : 'Ny site'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setRefreshSpin((n) => n + 1); reload(false); }}
            disabled={loading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: '#f1f5f9',
              borderWidth: 1,
              borderColor: '#e2e8f0',
              alignItems: 'center',
              justifyContent: 'center',
              ...(Platform.OS === 'web' ? { cursor: loading ? 'wait' : 'pointer' } : {}),
            }}
          >
            <Ionicons name="refresh" size={18} color="#475569" style={Platform.OS === 'web' ? { transform: `rotate(${refreshSpin * 360}deg)`, transition: 'transform 0.3s ease' } : {}} />
          </TouchableOpacity>
        </View>
      </View>

      {syncError && syncError.includes('Omdirigerar') ? (
        <Text style={{ fontSize: 12, color: '#0369a1', marginBottom: 12 }}>
          Efter inloggning öppnas denna sida igen – då visas tillgängliga siter. Ser du inte pickern? Öppna Företagsinställningar → SharePoint igen och klicka på knappen ovan.
        </Text>
      ) : null}

      {(() => {
        const renderSiteTable = (list, emptyMessage) => {
          if (loading && list.length === 0) return null;
          if (list.length === 0) {
            return (
              <View style={{ padding: 20, backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>{emptyMessage}</Text>
              </View>
            );
          }
          return (
            <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: D.tableHeaderBackgroundColor ?? '#f8fafc', borderBottomWidth: 1, borderBottomColor: D.tableHeaderBorderColor ?? '#e2e8f0' }}>
                <Text style={{ fontSize: D.tableHeaderFontSize ?? 12, fontWeight: D.tableHeaderFontWeight ?? '500', color: D.tableHeaderColor ?? '#475569', flex: 1 }}>Site</Text>
                <Text style={{ fontSize: D.tableHeaderFontSize ?? 12, fontWeight: D.tableHeaderFontWeight ?? '500', color: D.tableHeaderColor ?? '#475569', width: 120 }}>Typ</Text>
                <Text style={{ fontSize: D.tableHeaderFontSize ?? 12, fontWeight: D.tableHeaderFontWeight ?? '500', color: D.tableHeaderColor ?? '#475569', width: STATUS_COLUMN_WIDTH }}>Status</Text>
                <View style={{ width: 48, flexShrink: 0 }} />
              </View>
              <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingBottom: 8 }}>
                {list.map((entry) => {
                  const sid = String(entry?.siteId || '').trim();
                  if (!sid) return null;
                  const status = spStatusInfo(entry);
                  const pill = spStatusPillStyle(status.tone);
                  const siteName = String(entry?.siteName || 'SharePoint-site').trim();
                  return (
                    <View key={sid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: D.tableCellFontSize ?? 13, fontWeight: '500', color: D.tableCellColor ?? '#1e293b' }} numberOfLines={1}>{siteName}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} numberOfLines={1}>{entry?.siteUrl || sid}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#475569', width: 120 }} numberOfLines={1}>{typLabel(entry)}</Text>
                      <View style={{ width: STATUS_COLUMN_WIDTH }}>
                        <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: pill.bg, borderWidth: 1, borderColor: pill.border, alignSelf: 'flex-start' }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: pill.color }}>{status.label}</Text>
                        </View>
                      </View>
                      <View style={{ width: 48, alignItems: 'flex-end' }}>
                        <TouchableOpacity
                          ref={(el) => { kebabRefs.current[sid] = el; }}
                          onPress={() => {
                            const node = kebabRefs.current[sid];
                            if (node && typeof node.measureInWindow === 'function') node.measureInWindow((x, y, w, h) => setKebabPosition({ x, y: y + (h || 0) + 4 }));
                            setKebabSiteId(sid);
                          }}
                          style={{ padding: 6, borderRadius: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                        >
                          <Ionicons name="ellipsis-vertical" size={18} color="#475569" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        };
        return (
          <>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 }}>Siter i Digitalkontroll</Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 18 }}>DK Bas, DK Site och övriga siter som skapats eller hanteras i systemet.</Text>
              {loading && digitalkontrollEntries.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator size="small" color="#1e293b" /><Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Laddar…</Text></View>
              ) : (
                renderSiteTable(digitalkontrollEntries, 'Inga Digitalkontroll-siter. DK Bas och DK Site skapas automatiskt.')
              )}
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 }}>{companyTenantLabel}</Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 18 }}>Siter kopplade från företagets egen SharePoint-miljö (via &quot;Synka mot … interna SharePoint-miljö&quot;). Dessa visas även i SharePoint-menyn i vänsterpanelen.</Text>
              {loading && companyTenantEntries.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator size="small" color="#1e293b" /><Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Laddar…</Text></View>
              ) : (
                renderSiteTable(companyTenantEntries, 'Inga siter från företagets SharePoint ännu. Klicka på knappen ovan för att synka och välja siter.')
              )}
            </View>
          </>
        );
      })()}

      <ContextMenu
        visible={!!kebabSiteId && kebabItems.length > 0}
        x={kebabPosition.x}
        y={kebabPosition.y}
        items={kebabItems}
        onClose={() => setKebabSiteId(null)}
        onSelect={(item) => {
          const key = item?.key;
          if (key === 'open' && kebabEntry?.siteUrl) openInSharePoint(kebabEntry.siteUrl);
          if (key === 'rename' && kebabSiteId) {
            setRenameSiteId(kebabSiteId);
            setRenameDraft(String(kebabEntry?.siteName || '').trim());
          }
          if (key === 'delete' && kebabSiteId) {
            handleDeleteSite(kebabSiteId, String(kebabEntry?.siteName || 'SharePoint-site').trim());
          }
          setKebabSiteId(null);
        }}
      />

      {renameSiteId ? (
        <View style={{ marginTop: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#f8fafc' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 8 }}>Byt namn på site</Text>
          <TextInput
            value={renameDraft}
            onChangeText={setRenameDraft}
            placeholder="Sitenamn"
            style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: D.inputRadius, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#1e293b', backgroundColor: '#fff', marginBottom: 12 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => { setRenameSiteId(''); setRenameDraft(''); }} style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#b91c1c' }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRenameSave} style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: D.buttonPrimaryBg ?? '#2D3A4B' }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#fff' }}>Spara</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
