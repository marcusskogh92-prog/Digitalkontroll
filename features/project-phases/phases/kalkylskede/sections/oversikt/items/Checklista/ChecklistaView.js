/**
 * ChecklistaView – visar projektets checklista (Excel).
 * Vid nytt projekt skapas en kopia av företagets mall i projektmappen.
 * För äldre projekt kan användaren skapa checklista från företagets mall med en knapp.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  listChecklistMallar,
  listProjectChecklistFiles,
  copyChecklistMallToProject,
} from '../../../../../../../../lib/mallarDkBasService';
import { getDriveItemPreviewUrl } from '../../../../../../../../services/azure/hierarchyService';

const OFFICE_EMBED_BASE = 'https://view.officeapps.live.com/op/embed.aspx';

export default function ChecklistaView({ projectId, companyId, project, hidePageHeader }) {
  const effectiveCompanyId = companyId || project?.companyId;
  const projectRootPath = project?.rootFolderPath || project?.sharePointRootPath || '';
  const projectSiteId = project?.sharePointSiteId || project?.siteId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectFiles, setProjectFiles] = useState([]);
  const [companyMall, setCompanyMall] = useState(null);
  const [creating, setCreating] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);
  const [embedLoading, setEmbedLoading] = useState(false);

  const load = useCallback(async () => {
    const cid = String(effectiveCompanyId || '').trim();
    setLoading(true);
    setError('');
    try {
      const [files, mallRes] = await Promise.all([
        projectSiteId && projectRootPath
          ? listProjectChecklistFiles(projectSiteId, projectRootPath)
          : Promise.resolve([]),
        cid ? listChecklistMallar(cid, 'kalkylskede').then((r) => r.active?.[0] || null) : Promise.resolve(null),
      ]);
      setProjectFiles(Array.isArray(files) ? files : []);
      setCompanyMall(mallRes || null);
    } catch (e) {
      setError(e?.message || 'Kunde inte hämta checklista');
      setProjectFiles([]);
      setCompanyMall(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, projectSiteId, projectRootPath]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateFromMall = useCallback(async () => {
    if (!effectiveCompanyId || !projectSiteId || !projectRootPath) return;
    setCreating(true);
    setError('');
    try {
      await copyChecklistMallToProject(effectiveCompanyId, projectSiteId, projectRootPath);
      await load();
    } catch (e) {
      setError(e?.message || 'Kunde inte skapa checklista');
    } finally {
      setCreating(false);
    }
  }, [effectiveCompanyId, projectSiteId, projectRootPath, load]);

  const displayFile = projectFiles.length > 0 ? projectFiles[0] : null;
  const webUrl = displayFile?.webUrl;
  const fallbackEmbedSrc = webUrl ? `${OFFICE_EMBED_BASE}?src=${encodeURIComponent(webUrl)}` : null;
  const hasProjectPath = Boolean(projectSiteId && projectRootPath);

  useEffect(() => {
    if (!displayFile?.id || !projectSiteId || Platform.OS !== 'web') {
      setEmbedUrl(null);
      return;
    }
    let cancelled = false;
    setEmbedLoading(true);
    setEmbedUrl(null);
    getDriveItemPreviewUrl(projectSiteId, displayFile.id)
      .then((url) => {
        if (!cancelled && url) setEmbedUrl(url);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEmbedLoading(false);
      });
    return () => { cancelled = true; };
  }, [displayFile?.id, projectSiteId]);

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Hämtar checklista...</Text>
      </View>
    );
  }

  if (error && !displayFile) {
    return (
      <View style={styles.centerWrap}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={32} color="#B45309" style={{ marginBottom: 8 }} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Försök igen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!displayFile && hasProjectPath && companyMall) {
    return (
      <ScrollView contentContainerStyle={styles.emptyScroll}>
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Ingen checklista för detta projekt</Text>
          <Text style={styles.emptyText}>
            Skapa en checklista för detta projekt genom att kopiera företagets mall (Excel) till projektmappen.
            Därefter visas den här.
          </Text>
          <Pressable
            onPress={handleCreateFromMall}
            disabled={creating}
            style={[styles.openBtn, creating && styles.openBtnDisabled]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="document-duplicate-outline" size={20} color="#fff" />
                <Text style={styles.openBtnText}>Skapa checklista från företagets mall</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.emptySub}>
            Mallen "{companyMall.name}" kopieras till projektets mapp (01 - Översikt / 01 - Checklista).
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!displayFile && !companyMall) {
    return (
      <ScrollView contentContainerStyle={styles.emptyScroll}>
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Ingen checklista-mall</Text>
          <Text style={styles.emptyText}>
            Lägg till en checklista-mall (Excel) under Företagsinställningar → Mallar. Välj skede Kalkylskede och
            ladda upp under Översikt → Checklista. Därefter kan du skapa checklista per projekt.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!displayFile && hasProjectPath && !companyMall) {
    return (
      <ScrollView contentContainerStyle={styles.emptyScroll}>
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Ingen checklista för detta projekt</Text>
          <Text style={styles.emptyText}>
            Företaget har ingen aktiv checklista-mall. Lägg till en under Mallar (Kalkylskede → Checklista),
            öppna sedan denna sida igen och klicka på "Skapa checklista från företagets mall".
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!displayFile) {
    return (
      <ScrollView contentContainerStyle={styles.emptyScroll}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Projektets mapp kunde inte hittas</Text>
          <Text style={styles.emptyText}>
            För äldre projekt kan projektmappen saknas i SharePoint. Öppna företagets checklista-mall i ny flik nedan.
          </Text>
          {companyMall?.webUrl ? (
            <Pressable
              onPress={() => (Platform.OS === 'web' ? window.open(companyMall.webUrl, '_blank') : Linking.openURL(companyMall.webUrl))}
              style={styles.openBtn}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.openBtnText}>Öppna företagets mall i ny flik</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  if (Platform.OS === 'web' && (embedUrl || fallbackEmbedSrc)) {
    const iframeSrc = embedUrl || fallbackEmbedSrc;
    return (
      <View style={styles.container}>
        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle} numberOfLines={1}>{displayFile.name}</Text>
          <Pressable onPress={() => window.open(webUrl, '_blank')} style={styles.openBtn}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.openBtnText}>Öppna i ny flik</Text>
          </Pressable>
        </View>
        {embedLoading ? (
          <View style={[styles.iframeWrap, styles.embedLoadingWrap]}>
            <ActivityIndicator size="large" color="#1976D2" />
            <Text style={styles.loadingText}>Laddar Excel-vy...</Text>
          </View>
        ) : (
          <View style={styles.iframeWrap}>
            <iframe title="Checklista" src={iframeSrc} style={styles.iframe} allowFullScreen />
          </View>
        )}
        <Text style={styles.embedHint}>
          {!embedUrl && iframeSrc
            ? 'Om det står "Det gick inte att hitta filen" ovan, använd "Öppna i ny flik" för att öppna filen i Excel/SharePoint.'
            : 'Vyn här är endast förhandsgranskning. För att redigera (skriva i celler m.m.) öppna filen i ny flik; ändringar syns här när du byter tillbaka. Scrollbaren i Excel-vyn styrs av Microsoft och kan ibland inte följa med visuellt.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.centerWrap}>
      <View style={styles.emptyCard}>
        <Ionicons name="document-text" size={48} color="#475569" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>{displayFile.name}</Text>
        <Pressable onPress={() => webUrl && Linking.openURL(webUrl)} style={styles.openBtn}>
          <Text style={styles.openBtnText}>Öppna checklista</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#f1f5f9',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    maxWidth: 400,
  },
  errorText: {
    fontSize: 14,
    color: '#991B1B',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  emptyScroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 520,
    alignSelf: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  toolbarTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    minWidth: 0,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  openBtnDisabled: { opacity: 0.7 },
  openBtnText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  iframeWrap: {
    flex: 1,
    minHeight: 400,
    ...(Platform.OS === 'web' ? { minHeight: 'calc(100vh - 220px)' } : {}),
  },
  embedLoadingWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iframe: {
    width: '100%',
    height: '100%',
    minHeight: 500,
    border: 'none',
    ...(Platform.OS === 'web' ? { display: 'block', backgroundColor: '#fff' } : {}),
  },
  embedHint: {
    fontSize: 11,
    color: '#94a3b8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
});
