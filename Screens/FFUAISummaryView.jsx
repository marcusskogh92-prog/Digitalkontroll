import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmModal } from '../components/common/Modals';
import { functionsClient, setFFUAnalysisCancelRequested, subscribeLatestProjectFFUAnalysis } from '../components/firebase';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
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

const TASK_ID_AI_FFU = 'ai-analysis-ffu';

export default function FFUAISummaryView({ projectId, companyId, project }) {
  const pid = safeText(projectId);
  const cid = safeText(companyId);
  const { addTask, removeTask } = useBackgroundTasks();

  const projectHasPath = Boolean(
    project && (
      safeText(project.rootFolderPath) ||
      safeText(project.sharePointRootPath) ||
      safeText(project.rootPath) ||
      safeText(project.sharePointPath) ||
      safeText(project.path) ||
      safeText(project.projectPath)
    )
  );

  // Single source of truth: render ONLY from Firestore snapshot.
  const [analysisDoc, setAnalysisDoc] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotExists, setSnapshotExists] = useState(false);

  const [runError, setRunError] = useState('');
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);

  const [rerunConfirm, setRerunConfirm] = useState({ visible: false, busy: false, error: '' });
  const subKeyRef = useRef('');
  const aiAnalysisTaskTimeoutRef = useRef(null);

  const hasSavedAnalysis = snapshotExists;

  const effectiveStatus = safeText(analysisDoc?.status);
  const isAnalyzing = effectiveStatus === 'analyzing' || analysisTriggered;
  const docCancelRequested = analysisDoc?.cancelRequested === true;
  const cancelRequestedOrDoc = cancelRequested || docCancelRequested;
  const progress = analysisDoc?.progress != null && Number.isFinite(Number(analysisDoc.progress)) ? Math.max(0, Math.min(100, Number(analysisDoc.progress))) : null;
  const progressStep = safeText(analysisDoc?.progressStep);
  const meta = analysisDoc?.meta && typeof analysisDoc.meta === 'object' ? analysisDoc.meta : null;
  const analyzedAt = analysisDoc?.analyzedAt || null;
  const model = safeText(analysisDoc?.model);

  const analyzedAtLabel = useMemo(() => {
    try {
      if (!analyzedAt) return '';
      if (typeof analyzedAt?.toDate === 'function') {
        return analyzedAt.toDate().toLocaleString('sv-SE');
      }
      if (analyzedAt instanceof Date) {
        return analyzedAt.toLocaleString('sv-SE');
      }
      return '';
    } catch (_e) {
      return '';
    }
  }, [analyzedAt]);

  const statusLabel = cancelRequestedOrDoc
    ? 'Avbruten'
    : isAnalyzing
      ? 'Analyseras'
      : effectiveStatus === 'cancelled'
        ? 'Avbruten'
        : effectiveStatus === 'error'
          ? 'Misslyckad'
          : (effectiveStatus === 'success' || effectiveStatus === 'partial' || hasSavedAnalysis)
            ? (effectiveStatus === 'partial' ? 'Analyserad*' : 'Analyserad')
            : 'Ej analyserad';

  const statusTone = cancelRequestedOrDoc || effectiveStatus === 'cancelled'
    ? 'neutral'
    : isAnalyzing
      ? 'warning'
      : effectiveStatus === 'error'
        ? 'warning'
        : (effectiveStatus === 'success' || effectiveStatus === 'partial' || hasSavedAnalysis)
          ? 'success'
          : 'neutral';

  const showAnalyzingBlock = isAnalyzing && !cancelRequestedOrDoc;

  const canRun = Boolean(cid && pid && !snapshotLoading && !rerunConfirm?.busy && (!isAnalyzing || cancelRequestedOrDoc));

  useEffect(() => {
    if (!cid || !pid) {
      setAnalysisDoc(null);
      setSnapshotExists(false);
      return;
    }

    const subKey = `${cid}::${pid}`;
    subKeyRef.current = subKey;
    setSnapshotLoading(true);

    const unsubscribe = subscribeLatestProjectFFUAnalysis(cid, pid, {
      onNext: (data, snap) => {
        if (subKeyRef.current !== subKey) return;
        const status = data?.status;
        if (status && status !== 'analyzing') {
          if (aiAnalysisTaskTimeoutRef.current) {
            clearTimeout(aiAnalysisTaskTimeoutRef.current);
            aiAnalysisTaskTimeoutRef.current = null;
          }
          removeTask(TASK_ID_AI_FFU);
        }
        console.log('[FFU] Snapshot loaded', snap?.exists?.() === true, snap?.data?.());
        const exists = !!(snap && typeof snap.exists === 'function' && snap.exists());
        setSnapshotExists(exists);
        setAnalysisDoc(exists ? (data || {}) : null);
        setSnapshotLoading(false);
        setAnalysisTriggered((prev) => (prev ? false : prev));
        if (safeText(data?.status) === 'cancelled' || (safeText(data?.status) !== 'analyzing' && safeText(data?.status) !== '')) {
          setCancelRequested(false);
        }
      },
      onError: (err) => {
        if (subKeyRef.current !== subKey) return;
        const code = safeText(err?.code);
        if (code.includes('permission-denied')) {
          console.warn('[FFU] Permission denied loading analysis', { companyId: cid, projectId: pid, code });
        } else {
          console.warn('[FFU] Failed loading analysis', { companyId: cid, projectId: pid, code, message: safeText(err?.message) });
        }
        setSnapshotLoading(false);
      },
    });

    return () => {
      try {
        unsubscribe?.();
      } catch (_e) {}
    };
  }, [cid, pid, removeTask]);

  const runAnalysisAndPersist = useCallback(() => {
    if (!canRun) return Promise.resolve();
    if (!cid || !pid) return Promise.resolve();

    setRunError('');
    setAnalysisTriggered(true);
    addTask(TASK_ID_AI_FFU, 'Kör AI-analys', 'Förfrågningsunderlag');
    aiAnalysisTaskTimeoutRef.current = setTimeout(() => {
      aiAnalysisTaskTimeoutRef.current = null;
      removeTask(TASK_ID_AI_FFU);
    }, 120000);

    console.log('[FFU] Analysis started in background', { companyId: cid, projectId: pid });
    const analyzeFFU = httpsCallable(functionsClient, 'analyzeFFUFromFiles');
    return analyzeFFU({ companyId: cid, projectId: pid }).catch((e) => {
      if (aiAnalysisTaskTimeoutRef.current) {
        clearTimeout(aiAnalysisTaskTimeoutRef.current);
        aiAnalysisTaskTimeoutRef.current = null;
      }
      removeTask(TASK_ID_AI_FFU);
      const code = String(e?.code || '').trim();
      const msg = String(e?.details || e?.message || e?.code || '').trim();
      const isTimeout = code.includes('deadline') || code.includes('timeout') || msg.toLowerCase().includes('timeout');
      if (isTimeout) {
        console.log('[FFU] Client timeout – analysen fortsätter i bakgrunden', { companyId: cid, projectId: pid });
      } else {
        console.error('❌ analyzeFFUFromFiles failed to start:', e);
        setAnalysisTriggered(false);
        setRunError(msg || 'Kunde inte starta AI-analys. Försök igen.');
      }
    });
  }, [canRun, cid, pid, addTask, removeTask]);

  const onRunAnalysis = useCallback(() => {
    if (!canRun) return;
    if (!cid || !pid) return;
    if (!hasSavedAnalysis) {
      void runAnalysisAndPersist().catch(() => {});
      return;
    }
    setRerunConfirm({ visible: true, busy: false, error: '' });
  }, [canRun, cid, hasSavedAnalysis, pid, runAnalysisAndPersist]);

  const onConfirmRerun = useCallback(() => {
    if (!canRun) return;
    setRerunConfirm({ visible: false, busy: false, error: '' });
    runAnalysisAndPersist().catch((e) => {
      const msg = String(e?.message || e?.details || e?.code || e || '').trim();
      setRunError(msg || 'Kunde inte uppdatera analysen.');
    });
  }, [canRun, runAnalysisAndPersist]);

  const onCancelAnalysis = useCallback(() => {
    if (!cid || !pid) return;
    setCancelRequested(true);
    if (aiAnalysisTaskTimeoutRef.current) {
      clearTimeout(aiAnalysisTaskTimeoutRef.current);
      aiAnalysisTaskTimeoutRef.current = null;
    }
    removeTask(TASK_ID_AI_FFU);
    setAnalysisTriggered(false);
    setFFUAnalysisCancelRequested(cid, pid).catch(() => {});
  }, [cid, pid, removeTask]);

  const summaryText = safeText(analysisDoc?.summary);
  const reqObj = analysisDoc?.requirements && typeof analysisDoc.requirements === 'object' ? analysisDoc.requirements : null;
  const ska = Array.isArray(reqObj?.ska) ? reqObj.ska : (Array.isArray(reqObj?.must) ? reqObj.must : []);
  const bor = Array.isArray(reqObj?.bor) ? reqObj.bor : (Array.isArray(reqObj?.should) ? reqObj.should : []);
  const risks = Array.isArray(analysisDoc?.risks) ? analysisDoc.risks : [];
  const questions = Array.isArray(analysisDoc?.questions) ? analysisDoc.questions : [];

  const analysis = analysisDoc ? {
    summary: {
      text: summaryText,
      projectType: '',
      procurementForm: '',
    },
    requirements: {
      ska: Array.isArray(ska) ? ska : [],
      bor: Array.isArray(bor) ? bor : [],
    },
    risks: (Array.isArray(risks) ? risks : []).map((t, idx) => ({ title: `Risk ${idx + 1}`, details: safeText(t) })),
    openQuestions: Array.isArray(questions) ? questions : [],
  } : null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.wrap}>
        {/* Zon 1 – Header / Status */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>AI-sammanställning – Förfrågningsunderlag</Text>
            <Text style={styles.subtitle}>AI-analys baserad på uppladdade dokument i förfrågningsunderlaget</Text>
            {analyzedAtLabel ? (
              <Text style={[styles.metaText, { marginTop: 6 }]}>Senast analyserad: {analyzedAtLabel}</Text>
            ) : null}
          </View>
          <View style={{ marginLeft: 12, alignItems: 'flex-end' }}>
            <Badge label={statusLabel} tone={statusTone} />
          </View>
        </View>

        {effectiveStatus === 'partial' ? (
          <Text style={[styles.hintText, { marginLeft: 0, marginTop: 6 }]}>
            ⚠️ Analysen är delvis baserad på underlaget (för stort FFU). Resultatet är ändå användbart som beslutsstöd.
          </Text>
        ) : null}

        {!projectHasPath && pid ? (
          <View style={{ marginTop: 10, padding: 12, backgroundColor: '#FFF8E1', borderRadius: 8, borderWidth: 1, borderColor: '#FFE7A3' }}>
            <Text style={[styles.hintText, { color: '#7A4F00', fontWeight: '600', marginBottom: 4 }]}>
              Projektet har ingen SharePoint-lagringsplats kopplad
            </Text>
            <Text style={[styles.hintText, { color: '#92400e', marginLeft: 0 }]}>
              Gå till Kalkylskede → högerklick på projektet i sidomenyn → Ändra. Välj lagringsplats (SharePoint-mapp) och spara. Därefter fungerar AI-analysen.
            </Text>
          </View>
        ) : null}

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
              <Text style={styles.primaryButtonText}>{hasSavedAnalysis ? 'Uppdatera analys' : 'Kör AI-analys'}</Text>
            </Pressable>
            {snapshotLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#64748b" />
                <Text style={styles.hintText}>Laddar sparad analys…</Text>
              </View>
            ) : null}
            {showAnalyzingBlock ? (
              <View style={styles.analyzingBlock}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <ActivityIndicator size="small" color="#64748b" />
                  <Text style={styles.hintText}>
                    {progress != null ? `${progress}% – ${progressStep || 'Analyserar…'}` : 'AI analyserar förfrågningsunderlaget i bakgrunden…'}
                  </Text>
                </View>
                {progress != null ? (
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                  </View>
                ) : (
                  <Text style={[styles.hintText, { marginLeft: 0, fontStyle: 'italic' }]}>
                    Procent visas när servern svarar. Saknas det – kör om: firebase deploy --only functions
                  </Text>
                )}
                <Text style={[styles.hintText, { marginLeft: 0 }]}>Du kan byta sektion – analysen fortsätter.</Text>
                <Pressable
                  onPress={onCancelAnalysis}
                  style={({ pressed }) => [styles.cancelButton, pressed ? { opacity: 0.8 } : null]}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelButtonText}>Avbryt analys</Text>
                </Pressable>
              </View>
            ) : null}
            {cancelRequestedOrDoc && (isAnalyzing || effectiveStatus === 'analyzing') ? (
              <Text style={[styles.hintText, { marginLeft: 0, marginTop: 8 }]}>
                Avbryt begärd. Analysen stoppar när backend hinner – du kan köra en ny analys nedan när du vill.
              </Text>
            ) : null}
          </View>

          {(runError || (effectiveStatus === 'error' && safeText(analysisDoc?.errorMessage))) ? (
            <View style={{ marginTop: 4 }}>
              <Text style={[styles.hintText, { color: '#7A4F00' }]} numberOfLines={6}>
                {runError || safeText(analysisDoc?.errorMessage)}
              </Text>
              {(runError || analysisDoc?.errorMessage || '').toLowerCase().includes('sharepoint base path') || (runError || analysisDoc?.errorMessage || '').toLowerCase().includes('missing path') ? (
                <Text style={[styles.hintText, { color: '#334155', marginTop: 6 }]}>
                  Projektet saknar SharePoint-rotmapp. Gå till Kalkylskede → högerklick på projektet i sidomenyn → Ändra, och välj lagringsplats (SharePoint-mapp). Spara. Kör sedan analysen igen.
                </Text>
              ) : null}
            </View>
          ) : null}

          {Platform.OS === 'web' && pid ? (
            <Text style={styles.metaText}>Projekt: {pid}</Text>
          ) : null}

          {meta && meta.totalChars != null ? (
            <Text style={styles.metaText}>
              Underlag: {String(meta.totalChars)} tecken{meta.truncated ? ' (trunkerat)' : ''}
            </Text>
          ) : null}

          {model ? (
            <Text style={styles.metaText}>Modell: {model}</Text>
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
                  {(Array.isArray(analysis?.requirements?.ska) ? analysis.requirements.ska : []).length ? (
                    (analysis.requirements.ska || []).map((txt, idx) => (
                      <Text key={`must-${idx}`} style={styles.bullet}>• {safeText(txt)}</Text>
                    ))
                  ) : (
                    <Text style={styles.bodyMuted}>—</Text>
                  )}
                </View>
                <View>
                  <SectionLabel>BÖR-krav</SectionLabel>
                  {(Array.isArray(analysis?.requirements?.bor) ? analysis.requirements.bor : []).length ? (
                    (analysis.requirements.bor || []).map((txt, idx) => (
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

      <ConfirmModal
        visible={!!rerunConfirm?.visible}
        title="Uppdatera analys?"
        message="Detta ersätter tidigare sparad AI-analys för FFU. Vill du fortsätta?"
        cancelLabel="Avbryt"
        confirmLabel="Kör ny AI-analys"
        danger
        busy={!!rerunConfirm?.busy}
        error={safeText(rerunConfirm?.error)}
        onCancel={() => setRerunConfirm({ visible: false, busy: false, error: '' })}
        onConfirm={onConfirmRerun}
      />
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
  analyzingBlock: { flexDirection: 'column', gap: 8, marginTop: 4 },
  progressBarTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  progressBarFill: { height: '100%', backgroundColor: '#1976D2', borderRadius: 3 },
  cancelButton: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelButtonText: { fontSize: 13, fontWeight: '500', color: '#64748b' },
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
