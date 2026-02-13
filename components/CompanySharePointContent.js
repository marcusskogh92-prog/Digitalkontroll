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
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchCompanySharePointSiteMetas,
  getCompanySharePointSiteId,
  getCompanySharePointSiteIdByRole,
  getSharePointNavigationConfig,
  saveSharePointNavigationConfig,
  syncSharePointSiteVisibilityRemote,
  upsertCompanySharePointSiteMeta,
} from './firebase';
import ContextMenu from './ContextMenu';
import { useSharePointStatus } from '../hooks/useSharePointStatus';

const normalizeRoleLabel = (role) => {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return 'custom';
  if (r === 'projects' || r === 'project') return 'projects';
  if (r === 'system') return 'system';
  if (r === 'custom' || r === 'extra') return 'custom';
  return r;
};

const STATUS_COLUMN_WIDTH = 100;

export default function CompanySharePointContent({ companyId, companyName }) {
  const cid = String(companyId || '').trim();
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({ companyId: cid, searchSpinAnim });

  const [metas, setMetas] = useState([]);
  const [systemSiteId, setSystemSiteId] = useState('');
  const [projectSiteId, setProjectSiteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(0);
  const [kebabSiteId, setKebabSiteId] = useState(null);
  const [kebabPosition, setKebabPosition] = useState({ x: 0, y: 0 });
  const [renameSiteId, setRenameSiteId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
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
  }, [metas, systemMeta, projectMeta, sortedMetas, projectSiteId, systemSiteId, resolvedProjectName, resolvedProjectUrl, resolvedSystemName, resolvedSystemUrl]);

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

  const handleCreateSite = useCallback(async () => {
    if (!cid || Platform.OS !== 'web') {
      if (Platform.OS !== 'web') Alert.alert('Info', 'Skapande av siter stöds i webbläget.');
      return;
    }
    const baseName = String(companyName || cid).trim();
    const namePart = String((typeof window !== 'undefined' && window.prompt('Namn på ny site', '')) || '').trim();
    if (!namePart) return;
    setCreating(true);
    try {
      const { functionsClient } = await import('./firebase');
      const { httpsCallable } = await import('firebase/functions');
      if (!functionsClient) throw new Error('Functions inte tillgänglig');
      const createSharePointSite = httpsCallable(functionsClient, 'createSharePointSite');
      const result = await createSharePointSite({ companyId: cid, siteName: namePart });
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
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(siteUrl ? `Site skapad.\n\nURL: ${siteUrl}` : 'Site skapad.');
        }
      }
    } catch (e) {
      console.error('[CompanySharePointContent] createSharePointSite failed:', e);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Kunde inte skapa site: ' + (e?.message || String(e)));
      }
    } finally {
      setCreating(false);
    }
  }, [cid, companyName, reload]);

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

  const entries = buildEntries();
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
        <Text style={{ fontSize: 13, color: '#64748b' }}>Välj ett företag.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Siter som företaget har tillgång till. DK Bas och DK Site är låsta och kan inte tas bort.
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          marginBottom: 16,
          backgroundColor: '#f0f9ff',
          borderWidth: 1,
          borderColor: '#bae6fd',
          borderRadius: 8,
        }}
      >
        <Ionicons name="information-circle-outline" size={20} color="#0369a1" style={{ marginTop: 1 }} />
        <Text style={{ fontSize: 13, color: '#0c4a6e', flex: 1, lineHeight: 20 }}>
          Kopplingar mot externa SharePoint-siter är under utveckling. Det kommer möjliggöra att koppla Digitalkontroll mot er organisations befintliga SharePoint-miljö.
        </Text>
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
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 8,
              backgroundColor: (creating || loading) ? '#e2e8f0' : '#1e293b',
              ...(Platform.OS === 'web' ? { cursor: (creating || loading) ? 'not-allowed' : 'pointer' } : {}),
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Ny site</Text>
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

      <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', flex: 1 }}>Site</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', width: 120 }}>Typ</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', width: STATUS_COLUMN_WIDTH }}>Status</Text>
          <View style={{ width: 48, flexShrink: 0 }} />
        </View>

        {loading ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#1e293b" />
            <Text style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>Laddar siter…</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={{ padding: 24 }}>
            <Text style={{ fontSize: 13, color: '#64748b' }}>Inga siter ännu. Klicka på &quot;Ny site&quot; för att lägga till.</Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {entries.map((entry) => {
              const sid = String(entry?.siteId || '').trim();
              if (!sid) return null;
              const status = spStatusInfo(entry);
              const pill = spStatusPillStyle(status.tone);
              const siteName = String(entry?.siteName || 'SharePoint-site').trim();
              const siteUrl = String(entry?.siteUrl || '').trim();
              return (
                <View
                  key={sid}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: '#f1f5f9',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e293b' }} numberOfLines={1}>{siteName}</Text>
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} numberOfLines={1}>{sid}</Text>
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
                        if (node && typeof node.measureInWindow === 'function') {
                          node.measureInWindow((x, y, w, h) => setKebabPosition({ x, y: y + (h || 0) + 4 }));
                        }
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
        )}
      </View>

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
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 }}>Byt namn på site</Text>
          <TextInput
            value={renameDraft}
            onChangeText={setRenameDraft}
            placeholder="Sitenamn"
            style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1e293b', backgroundColor: '#fff', marginBottom: 12 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => { setRenameSiteId(''); setRenameDraft(''); }} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRenameSave} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#1e293b' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Spara</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
