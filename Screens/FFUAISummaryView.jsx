import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { httpsCallable } from 'firebase/functions';

import { functionsClient, getCompanySharePointSiteIdByRole } from '../components/firebase';
import { getSharePointFolderItems } from '../services/sharepoint/sharePointStructureService';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function joinPath(a, b) {
  const left = safeText(a).replace(/^\/+/, '').replace(/\/+$/, '');
  const right = safeText(b).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

function Badge({ label, tone = 'neutral' }) {
  const t = String(tone || 'neutral');
  const bg = t === 'success' ? '#E8F5E9' : t === 'warning' ? '#FFF8E1' : '#EEF2F7';
  const fg = t === 'success' ? '#1B5E20' : t === 'warning' ? '#7A4F00' : '#334155';
  const border = t === 'success' ? '#C8E6C9' : t === 'warning' ? '#FFE7A3' : '#D7DEE8';
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {safeText(label) || '—'}
      </Text>
    </View>
  );
}

function Card({ title, iconName, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={iconName} size={18} color="#334155" style={{ marginRight: 10 }} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function EmptyCardState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Ingen analys tillgänglig ännu</Text>
      <Text style={styles.emptyText}>Kör AI-analys för att generera innehåll</Text>
    </View>
  );
}

function SectionLabel({ children }) {
  return (
    <Text style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

export default function FFUAISummaryView({ projectId, companyId, project }) {
  const pid = safeText(projectId);
  const cid = safeText(companyId);

  // Later: load from Firestore
  const analysis = null;

  const [checkingFiles, setCheckingFiles] = useState(false);
  const [hasFfuFiles, setHasFfuFiles] = useState(false);
  const [fileCheckError, setFileCheckError] = useState('');
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);

  const status = analysisRunning ? 'Analyseras' : ((analysisCompleted || analysis) ? 'Analyserad' : 'Ej analyserad');
  const statusTone = analysisRunning ? 'warning' : ((analysisCompleted || analysis) ? 'success' : 'neutral');

  const ffuRootPath = useMemo(() => {
    const basePath = safeText(
      project?.rootFolderPath ||
      project?.rootPath ||
      project?.sharePointPath ||
      project?.sharepointPath ||
      project?.sharePointBasePath ||
      project?.sharepointBasePath ||
      project?.basePath,
    );
    const FORFRAGNINGSUNDERLAG_FOLDER = '02 - Förfrågningsunderlag';
    const root = joinPath(basePath, FORFRAGNINGSUNDERLAG_FOLDER);
    return root.replace(/^\/+/, '');
  }, [project]);

  const refreshHasFiles = useCallback(async () => {
    if (!cid || !pid || !ffuRootPath) {
      setHasFfuFiles(false);
      return;
    }

    setCheckingFiles(true);
    setFileCheckError('');
    try {
      const siteId = await getCompanySharePointSiteIdByRole(cid, 'workspace');
      if (!siteId) {
        setHasFfuFiles(false);
        setFileCheckError('Kunde inte läsa SharePoint-siteId för företaget.');
        return;
      }

      const items = await getSharePointFolderItems(siteId, `/${ffuRootPath}`);
      const files = (Array.isArray(items) ? items : []).filter((x) => x?.type === 'file');
      setHasFfuFiles(files.length > 0);
    } catch (e) {
      setHasFfuFiles(false);
      setFileCheckError(e?.message ? String(e.message) : 'Kunde inte kontrollera filer i SharePoint');
    } finally {
      setCheckingFiles(false);
    }
  }, [cid, pid, ffuRootPath]);

  useEffect(() => {
    refreshHasFiles();
  }, [refreshHasFiles]);

  const canRun = !checkingFiles && hasFfuFiles && !analysisRunning;

  const onRunAnalysis = useCallback(async () => {
    if (!canRun) return;
    if (!cid || !pid) return;

    setAnalysisRunning(true);
    setAnalysisCompleted(false);

    try {
      const fn = httpsCallable(functionsClient, 'analyzeFFUFromFiles');
      const res = await fn({ companyId: cid, projectId: pid });
      const payload = (res && res.data !== undefined) ? res.data : res;
      console.log('✅ analyzeFFUFromFiles result:', payload);
      setAnalysisCompleted(true);
    } catch (e) {
      console.error('❌ analyzeFFUFromFiles failed:', e);
    } finally {
      setAnalysisRunning(false);
    }
  }, [canRun, cid, pid]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.wrap}>
        {/* Zon 1 – Header / Status */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>AI-sammanställning – Förfrågningsunderlag</Text>
            <Text style={styles.subtitle}>AI-analys baserad på uppladdade dokument i förfrågningsunderlaget</Text>
          </View>
          <View style={{ marginLeft: 12, alignItems: 'flex-end' }}>
            <Badge label={status} tone={statusTone} />
          </View>
        </View>

        {/* Zon 2 – Åtgärd / Trigger */}
        <View style={styles.actionZone}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pressable
              onPress={onRunAnalysis}
              disabled={!canRun}
              style={({ pressed }) => [
                styles.primaryButton,
                !canRun ? styles.primaryButtonDisabled : null,
                pressed && canRun ? { opacity: 0.9 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Kör AI-analys</Text>
            </Pressable>
            {checkingFiles ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#64748b" />
                <Text style={styles.hintText}>Kontrollerar filer…</Text>
              </View>
            ) : null}
          </View>

          {!checkingFiles && !hasFfuFiles ? (
            <Text style={styles.hintText}>
              Ladda upp minst en fil i Förfrågningsunderlag för att köra analys.
            </Text>
          ) : null}

          {!checkingFiles && fileCheckError ? (
            <Text style={[styles.hintText, { color: '#7A4F00' }]} numberOfLines={3}>
              {fileCheckError}
            </Text>
          ) : null}

          {Platform.OS === 'web' && pid ? (
            <Text style={styles.metaText}>Projekt: {pid}</Text>
          ) : null}
        </View>

        {/* Zon 3 – Resultat */}
        <View style={styles.grid}>
          <Card title="Sammanfattning" iconName="bulb-outline">
            {analysis ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.bodyText}>{safeText(analysis?.summary?.text)}</Text>
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Projekttyp</Text>
                  <Text style={styles.kvVal}>{safeText(analysis?.summary?.projectType) || '—'}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Upphandlingsform</Text>
                  <Text style={styles.kvVal}>{safeText(analysis?.summary?.procurementForm) || '—'}</Text>
                </View>
              </View>
            ) : (
              <EmptyCardState />
            )}
          </Card>

          <Card title="Krav" iconName="list-outline">
            {analysis ? (
              <View style={{ gap: 14 }}>
                <View>
                  <SectionLabel>SKA-krav</SectionLabel>
                  {(Array.isArray(analysis?.requirements?.must) ? analysis.requirements.must : []).length ? (
                    (analysis.requirements.must || []).map((txt, idx) => (
                      <Text key={`must-${idx}`} style={styles.bullet}>• {safeText(txt)}</Text>
                    ))
                  ) : (
                    <Text style={styles.bodyMuted}>—</Text>
                  )}
                </View>
                <View>
                  <SectionLabel>BÖR-krav</SectionLabel>
                  {(Array.isArray(analysis?.requirements?.should) ? analysis.requirements.should : []).length ? (
                    (analysis.requirements.should || []).map((txt, idx) => (
                      <Text key={`should-${idx}`} style={styles.bullet}>• {safeText(txt)}</Text>
                    ))
                  ) : (
                    <Text style={styles.bodyMuted}>—</Text>
                  )}
                </View>
              </View>
            ) : (
              <EmptyCardState />
            )}
          </Card>

          <Card title="Risker & oklarheter" iconName="warning-outline">
            {analysis ? (
              <View style={{ gap: 12 }}>
                {(Array.isArray(analysis?.risks) ? analysis.risks : []).length ? (
                  (analysis.risks || []).map((r, idx) => (
                    <View key={`risk-${idx}`} style={styles.riskRow}>
                      <Text style={styles.riskTitle}>{safeText(r?.title) || `Risk ${idx + 1}`}</Text>
                      <Text style={styles.bodyText}>{safeText(r?.details)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.bodyMuted}>—</Text>
                )}
              </View>
            ) : (
              <EmptyCardState />
            )}
          </Card>

          <Card title="Öppna frågor" iconName="help-circle-outline">
            {analysis ? (
              <View style={{ gap: 8 }}>
                {(Array.isArray(analysis?.openQuestions) ? analysis.openQuestions : []).length ? (
                  (analysis.openQuestions || []).map((q, idx) => (
                    <Text key={`q-${idx}`} style={styles.bullet}>• {safeText(q)}</Text>
                  ))
                ) : (
                  <Text style={styles.bodyMuted}>—</Text>
                )}
              </View>
            ) : (
              <EmptyCardState />
            )}
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { padding: 18 },
  wrap: { width: '100%', maxWidth: 1100 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '500', color: '#0f172a', letterSpacing: 0.2 },
  subtitle: { marginTop: 6, fontSize: 13, fontWeight: '400', color: '#475569', lineHeight: 18 },

  badge: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '500' },

  actionZone: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 14 },
  primaryButton: {
    backgroundColor: '#1976D2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  primaryButtonDisabled: { backgroundColor: '#CBD5E1' },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  hintText: { marginLeft: 10, marginTop: 8, fontSize: 12, fontWeight: '400', color: '#64748b', lineHeight: 16 },
  metaText: { marginTop: 10, fontSize: 12, fontWeight: '400', color: '#94a3b8' },

  grid: { gap: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },

  emptyState: { borderWidth: 1, borderColor: '#EEF2F7', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12 },
  emptyTitle: { fontSize: 13, fontWeight: '500', color: '#334155' },
  emptyText: { marginTop: 4, fontSize: 12, fontWeight: '400', color: '#64748b', lineHeight: 16 },

  bodyText: { fontSize: 13, fontWeight: '400', color: '#0f172a', lineHeight: 18 },
  bodyMuted: { fontSize: 13, fontWeight: '400', color: '#64748b', lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 },
  bullet: { fontSize: 13, fontWeight: '400', color: '#0f172a', lineHeight: 18, marginBottom: 6 },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kvKey: { fontSize: 12, fontWeight: '500', color: '#334155' },
  kvVal: { fontSize: 12, fontWeight: '400', color: '#475569' },

  riskRow: { borderWidth: 1, borderColor: '#EEF2F7', borderRadius: 10, padding: 12, backgroundColor: '#fff' },
  riskTitle: { fontSize: 13, fontWeight: '500', color: '#0f172a', marginBottom: 6 },
});
