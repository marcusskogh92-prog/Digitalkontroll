/**
 * MoveFilesModal – Flytta filer mellan SharePoint-siter och mappar.
 * 2-kolumnslayout: Vänster = sites, Höger = mappnavigering.
 * Golden rule: mörk banner (rail), 14px rounded, soft shadow, SaaS 2026.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchCompanySharePointSiteMetas, getCompanySharePointSiteIdByRole, syncSharePointSiteVisibilityRemote } from '../../firebase';
import { getDriveItemByPath, moveDriveItemById, moveDriveItemAcrossSitesByPath } from '../../../services/azure/hierarchyService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import { ICON_RAIL } from '../../../constants/iconRailTheme';

const RAIL_BG = ICON_RAIL?.bg ?? '#0f1b2d';

function safeText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return null;
  if (r === 'projects' || r === 'project' || r === 'project-root') return 'projects';
  if (r === 'system' || r === 'system-base') return 'system';
  if (r === 'custom' || r === 'extra') return 'custom';
  return r;
}

export default function MoveFilesModal({
  visible,
  onClose,
  companyId,
  sourceSiteId,
  itemsToMove = [],
  sourceItemPaths = [], // [{ id, path }] for cross-site: path like "Projects/X/File.pdf"
  onMoveSuccess,
  showToast,
}) {
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);
  const [folderPath, setFolderPath] = useState('');
  const [folderBreadcrumb, setFolderBreadcrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [moveError, setMoveError] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  const toMove = Array.isArray(itemsToMove) ? itemsToMove.filter((it) => it?.id) : [];

  const loadSites = useCallback(async () => {
    if (!companyId) {
      setSites([]);
      return;
    }
    setSitesLoading(true);
    try {
      await syncSharePointSiteVisibilityRemote({ companyId }).catch(() => {});
      const [metas, systemSiteId] = await Promise.all([
        fetchCompanySharePointSiteMetas(companyId),
        getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: false }).catch(() => null),
      ]);
      const canShow = (m) => {
        const role = normalizeRole(m?.role);
        if (role === 'system') return false;
        return (role === 'projects' || role === 'custom') && m?.visibleInLeftPanel === true;
      };
      const isDkBas = (m) => /dk\s*bas/i.test(String(m?.siteName || m?.siteUrl || ''));
      const systemId = systemSiteId ? String(systemSiteId).trim() : null;
      const list = (metas || [])
        .filter((m) => m && canShow(m) && String(m.siteId || m.id || '').trim() && String(m.siteId || m.id).trim() !== systemId)
        .filter((m) => !isDkBas(m))
        .map((m) => ({
          id: String(m.siteId || m.id || '').trim(),
          name: String(m.siteName || m.siteUrl || m.webUrl || 'SharePoint-site'),
          webUrl: m.siteUrl || m.webUrl || null,
        }))
        .filter((s) => !!s.id);
      list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
      setSites(list);
    } catch (e) {
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (visible && companyId) loadSites();
  }, [visible, companyId, loadSites]);

  useEffect(() => {
    if (!visible) {
      setSelectedSite(null);
      setFolderPath('');
      setFolderBreadcrumb([]);
      setFolders([]);
      setSelectedFolder(null);
      setMoveError('');
    }
  }, [visible]);

  const loadFolders = useCallback(async (siteId, path) => {
    if (!siteId) return;
    setFoldersLoading(true);
    setMoveError('');
    try {
      const normalizedPath = path ? `/${path.replace(/^\/+|\/+$/g, '')}` : '/';
      const list = await getSharePointFolderItems(siteId, normalizedPath);
      const foldersOnly = (list || []).filter((x) => x?.type === 'folder');
      foldersOnly.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
      setFolders(foldersOnly);
    } catch (e) {
      setFolders([]);
      setMoveError(String(e?.message || e || 'Kunde inte ladda mappar'));
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedSite?.id) {
      setFolders([]);
      setFolderBreadcrumb([]);
      setSelectedFolder(null);
      return;
    }
    setFolderPath('');
    setFolderBreadcrumb([]);
    setSelectedFolder({ id: null, path: '', name: selectedSite.name });
    loadFolders(selectedSite.id, '');
  }, [selectedSite?.id, selectedSite?.name, loadFolders]);

  const handleSiteSelect = useCallback((site) => {
    setSelectedSite(site);
  }, []);

  const handleFolderSelect = useCallback((folder) => {
    const path = folderPath ? `${folderPath}/${folder.name}` : folder.name;
    setFolderPath(path);
    setFolderBreadcrumb((prev) => [...prev, { name: folder.name, path, id: folder.id }]);
    setSelectedFolder({ id: folder.id, name: folder.name, path });
    loadFolders(selectedSite.id, path);
  }, [folderPath, selectedSite?.id, loadFolders]);

  const handleBreadcrumbClick = useCallback((idx) => {
    if (idx < 0) {
      setFolderPath('');
      setFolderBreadcrumb([]);
      setSelectedFolder(null);
      loadFolders(selectedSite.id, '');
      return;
    }
    const crumb = folderBreadcrumb[idx];
    if (!crumb) return;
    setFolderPath(crumb.path);
    setFolderBreadcrumb((prev) => prev.slice(0, idx + 1));
    setSelectedFolder({ id: crumb.id, name: crumb.name, path: crumb.path });
    loadFolders(selectedSite.id, crumb.path);
  }, [folderBreadcrumb, selectedSite?.id, loadFolders]);

  const handleSelectRoot = useCallback(() => {
    if (!selectedSite?.id) return;
    setFolderPath('');
    setFolderBreadcrumb([]);
    setSelectedFolder({ id: null, path: '', name: selectedSite.name });
    loadFolders(selectedSite.id, '');
  }, [selectedSite?.id, selectedSite?.name, loadFolders]);

  const destDisplayText = useCallback(() => {
    if (!selectedSite?.name) return '';
    if (!selectedFolder || selectedFolder.path === '') return selectedSite.name;
    const parts = [selectedSite.name, ...folderBreadcrumb.map((c) => c.name)];
    return parts.join(' / ');
  }, [selectedSite?.name, selectedFolder, folderBreadcrumb]);

  const canMove = toMove.length > 0 && selectedSite?.id;
  const destFolderId = selectedFolder?.id;
  const destFolderPath = folderPath;

  const performMove = useCallback(async () => {
    if (!canMove || isMoving || toMove.length === 0) return;
    const destSiteId = selectedSite.id;
    const sameSite = String(destSiteId) === String(sourceSiteId || '');

    setIsMoving(true);
    setMoveError('');
    try {
      if (sameSite) {
        let parentId = destFolderId;
        if (!parentId && destFolderPath === '') {
          const rootItem = await getDriveItemByPath(destSiteId, '');
          parentId = rootItem?.id;
        }
        if (!parentId) throw new Error('Kunde inte hitta målmappen.');
        for (const item of toMove) {
          await moveDriveItemById(sourceSiteId, item.id, parentId);
        }
      } else {
        const paths = sourceItemPaths && sourceItemPaths.length === toMove.length
          ? sourceItemPaths
          : toMove.map((it) => ({ id: it.id, path: null }));
        for (let i = 0; i < toMove.length; i++) {
          const item = toMove[i];
          const srcPath = paths[i]?.path;
          if (!srcPath) throw new Error(`Saknar sökväg för ${item?.name || 'objekt'}.`);
          const destPath = destFolderPath || '';
          await moveDriveItemAcrossSitesByPath({
            sourceSiteId,
            sourcePath: srcPath.replace(/^\/+/, ''),
            destSiteId,
            destParentPath: destPath,
            destName: item?.name || null,
          });
        }
      }
      const destLabel = selectedFolder?.name || selectedSite?.name || 'destination';
      const n = toMove.length;
      if (typeof showToast === 'function') {
        showToast(n === 1 ? `1 fil flyttades till ${destLabel}` : `${n} filer flyttades till ${destLabel}`);
      }
      if (typeof onMoveSuccess === 'function') onMoveSuccess();
      onClose();
    } catch (e) {
      const msg = String(e?.message || e || 'Kunde inte flytta');
      setMoveError(msg);
      if (typeof console?.error === 'function') {
        console.error('[MoveFilesModal] performMove failed:', e);
      }
    } finally {
      setIsMoving(false);
    }
  }, [
    canMove,
    isMoving,
    toMove,
    selectedSite,
    destFolderId,
    destFolderPath,
    sourceSiteId,
    sourceItemPaths,
    showToast,
    onMoveSuccess,
    onClose,
  ]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.card}>
          <View style={[styles.banner, { backgroundColor: RAIL_BG }]}>
            <Text style={styles.bannerTitle}>Flytta filer – Välj destination</Text>
          </View>

          <View style={styles.columns}>
            <View style={styles.leftCol}>
              <Text style={styles.colLabel}>SharePoint-siter</Text>
              {sitesLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color="#64748b" />
                </View>
              ) : (
                <ScrollView style={styles.siteList} contentContainerStyle={styles.siteListContent}>
                  {sites.map((site) => {
                    const isSelected = selectedSite?.id === site.id;
                    return (
                      <Pressable
                        key={site.id}
                        onPress={() => handleSiteSelect(site)}
                        style={(state) => [
                          styles.siteRow,
                          isSelected && styles.siteRowActive,
                          (state?.pressed || state?.hovered) && !isSelected && styles.siteRowHover,
                        ]}
                      >
                        <Ionicons name="business-outline" size={18} color={isSelected ? '#2563eb' : '#64748b'} style={styles.siteIcon} />
                        <Text style={[styles.siteName, isSelected && styles.siteNameActive]} numberOfLines={1}>{site.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.rightCol}>
              <Text style={styles.colLabel}>Mappar</Text>
              {!selectedSite ? (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>Välj en site till vänster</Text>
                </View>
              ) : (
                <>
                  {folderBreadcrumb.length > 0 || folderPath ? (
                    <View style={styles.breadcrumb}>
                      <Pressable onPress={handleSelectRoot} style={(s) => [styles.crumb, (s?.hovered || s?.pressed) && styles.crumbHover]}>
                        <Text style={styles.crumbText}>Rot</Text>
                      </Pressable>
                      {folderBreadcrumb.map((c, idx) => (
                        <View key={c.path} style={styles.breadcrumbItem}>
                          <View style={styles.crumbSep}>
                            <Ionicons name="chevron-forward" size={12} color="#94a3b8" />
                          </View>
                          <Pressable
                            onPress={() => handleBreadcrumbClick(idx)}
                            style={(s) => [styles.crumb, (s?.hovered || s?.pressed) && styles.crumbHover]}
                          >
                            <Text style={styles.crumbText}>{c.name}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {foldersLoading ? (
                    <View style={styles.loadingWrap}>
                      <ActivityIndicator size="small" color="#64748b" />
                    </View>
                  ) : (
                    <ScrollView style={styles.folderList} contentContainerStyle={styles.folderListContent}>
                      {folderPath === '' && selectedFolder?.path === '' ? null : (
                        <Pressable
                          onPress={handleSelectRoot}
                          style={(state) => [
                            styles.folderRow,
                            selectedFolder?.path === '' && styles.folderRowActive,
                            (state?.pressed || state?.hovered) && styles.folderRowHover,
                          ]}
                        >
                          <Ionicons name="folder-open-outline" size={20} color="#94a3b8" />
                          <Text style={styles.folderName}>Root</Text>
                        </Pressable>
                      )}
                      {folders.map((f) => {
                        const isActive = selectedFolder?.id === f.id;
                        return (
                          <Pressable
                            key={f.id}
                            onPress={() => handleFolderSelect(f)}
                            style={(state) => [
                              styles.folderRow,
                              isActive && styles.folderRowActive,
                              (state?.pressed || state?.hovered) && !isActive && styles.folderRowHover,
                            ]}
                          >
                            <Ionicons name="folder-outline" size={20} color={isActive ? '#2563eb' : '#94a3b8'} />
                            <Text style={[styles.folderName, isActive && styles.folderNameActive]} numberOfLines={1}>{f.name}</Text>
                            <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          </View>

          {moveError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{moveError}</Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.destLabel} numberOfLines={1}>{destDisplayText() || 'Ingen destination vald'}</Text>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={(s) => [styles.btnSecondary, (s?.hovered || s?.pressed) && styles.btnSecondaryHover]}>
                <Text style={styles.btnSecondaryText}>Avbryt</Text>
              </Pressable>
              <Pressable
                onPress={performMove}
                disabled={!canMove || isMoving}
                style={(s) => [
                  styles.btnPrimary,
                  (!canMove || isMoving) && styles.btnPrimaryDisabled,
                  (s?.hovered || s?.pressed) && canMove && !isMoving && styles.btnPrimaryHover,
                ]}
              >
                {isMoving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.btnPrimaryText, (!canMove || isMoving) && styles.btnPrimaryTextDisabled]}>Flytta hit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999999,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 860,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }
      : { elevation: 12 }),
  },
  banner: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  columns: {
    flexDirection: 'row',
    flex: 1,
    minHeight: 360,
    maxHeight: 480,
  },
  leftCol: {
    width: 280,
    borderRightWidth: 1,
    borderRightColor: 'rgba(226, 232, 240, 0.9)',
    paddingVertical: 12,
  },
  rightCol: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 0,
  },
  colLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  siteList: {
    flex: 1,
  },
  siteListContent: {
    paddingBottom: 12,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 2,
    ...(Platform.OS === 'web' ? { transition: 'background-color 150ms ease' } : {}),
  },
  siteRowHover: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  siteRowActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  siteIcon: {
    marginRight: 10,
  },
  siteName: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  siteNameActive: {
    color: '#2563eb',
    fontWeight: '500',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#94a3b8',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 2,
  },
  crumb: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { transition: 'background-color 150ms ease' } : {}),
  },
  crumbHover: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbSep: {
    marginHorizontal: 2,
  },
  crumbText: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  folderList: {
    flex: 1,
  },
  folderListContent: {
    paddingBottom: 12,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 2,
    ...(Platform.OS === 'web' ? { transition: 'background-color 150ms ease' } : {}),
  },
  folderRowHover: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  folderRowActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  folderName: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
    marginLeft: 10,
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  folderNameActive: {
    color: '#2563eb',
    fontWeight: '500',
  },
  loadingWrap: {
    padding: 24,
    alignItems: 'center',
  },
  errorBox: {
    marginHorizontal: 24,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: '500',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.9)',
    backgroundColor: '#fafafa',
  },
  destLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 150ms ease' } : {}),
  },
  btnSecondaryHover: {
    backgroundColor: '#f8fafc',
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: RAIL_BG,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 150ms ease' } : {}),
  },
  btnPrimaryDisabled: {
    backgroundColor: '#94a3b8',
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' } : {}),
  },
  btnPrimaryHover: {
    backgroundColor: '#1a2742',
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  btnPrimaryTextDisabled: {
    opacity: 0.8,
  },
});
