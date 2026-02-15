/**
 * AI Kalkyl-analys – analyserar underlag (FFU, Offerter, Risk, Möten) + alla Kalkyl-flikar.
 * Verifierar att fliken "Kalkyl" (03 - Kalkyl) innehåller allt som bör ligga i kalkylen.
 */

import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmModal } from '../components/common/Modals';
import { functionsClient, subscribeLatestProjectKalkylAnalysis } from '../components/firebase';

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

export default function AIKalkylAnalysView({ projectId, companyId, project }) {
  const pid = safeText(projectId);
  const cid = safeText(companyId);

  void project;

  const [analysisDoc, setAnalysisDoc] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotExists, setSnapshotExists] = useState(false);

  const [runError, setRunError] = useState('');
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const [rerunConfirm, setRerunConfirm] = useState({ visible: false, busy: false, error: '' });
  const subKeyRef = useRef('');

  const hasSavedAnalysis = snapshotExists;

  const effectiveStatus = safeText(analysisDoc?.status);
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

  const statusLabel = effectiveStatus === 'analyzing'
    ? 'Analyseras'
    : effectiveStatus === 'error'
      ? 'Misslyckad'
      : (effectiveStatus === 'success' || effectiveStatus === 'partial' || hasSavedAnalysis)
        ? (effectiveStatus === 'partial' ? 'Analyserad*' : 'Analyserad')
        : 'Ej analyserad';

  const statusTone = effectiveStatus === 'analyzing'
    ? 'warning'
    : effectiveStatus === 'error'
      ? 'warning'
      : (effectiveStatus === 'success' || effectiveStatus === 'partial' || hasSavedAnalysis)
        ? 'success'
        : 'neutral';

  const canRun = Boolean(cid && pid && !analysisRunning && !snapshotLoading && !rerunConfirm?.busy);

  useEffect(() => {
    if (!cid || !pid) {
      setAnalysisDoc(null);
      setSnapshotExists(false);
      return;
    }

    const subKey = `${cid}::${pid}`;
    subKeyRef.current = subKey;
    setSnapshotLoading(true);

    const unsubscribe = subscribeLatestProjectKalkylAnalysis(cid, pid, {
      onNext: (data, snap) => {
        if (subKeyRef.current !== subKey) return;
        const exists = !!(snap && typeof snap.exists === 'function' && snap.exists());
        setSnapshotExists(exists);
        setAnalysisDoc(exists ? (data || {}) : null);
        setSnapshotLoading(false);
      },
      onError: (err) => {
        if (subKeyRef.current !== subKey) return;
        setSnapshotLoading(false);
      },
    });

    return () => {
      try {
        unsubscribe?.();
      } catch (_e) {}
    };
  }, [cid, pid]);

  const runAnalysisAndPersist = useCallback(async () => {
    if (!canRun) return;
    if (!cid || !pid) return;

    setAnalysisRunning(true);
    setRunError('');

    try {
      const analyzeKalkyl = httpsCallable(functionsClient, 'analyzeKalkylFromSharePoint');
      const res = await analyzeKalkyl({ companyId: cid, projectId: pid });
      const data = res?.data || {};
      if (data?.error) throw new Error(data.error);
    } catch (e) {
      const msg = String(e?.details || e?.message || e?.code || '').trim();
      setRunError(msg || 'Kunde inte köra AI-analys. Försök igen.');
      throw e;
    } finally {
      setAnalysisRunning(false);
    }
  }, [canRun, cid, pid]);

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
    runAnalysisAndPersist().catch(() => {});
  }, [canRun, runAnalysisAndPersist]);

  const summary = safeText(analysisDoc?.summary);
  const gaps = Array.isArray(analysisDoc?.gaps) ? analysisDoc.gaps : [];
  const recommendations = Array.isArray(analysisDoc?.recommendations) ? analysisDoc.recommendations : [];
  const completenessNote = safeText(analysisDoc?.completenessNote);
  const sectionsAnalyzed = analysisDoc?.sectionsAnalyzed;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.wrap}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>AI-analys – Kalkyl</Text>
            <Text style={styles.subtitle}>
              Analyserar underlag (Förfrågningsunderlag, Inköp och offerter, Risk och möjligheter, Möten)
              och verifierar att fliken Kalkyl innehåller allt som bör ligga i kalkylen.
            </Text>
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
            ⚠️ Analysen är delvis baserad på underlaget (för stort material). Resultatet är ändå användbart som beslutsstöd.
          </Text>
        ) : null}

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
            {analysisRunning ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#64748b" />
                <Text style={styles.hintText}>AI analyserar kalkylen och underlag…</Text>
              </View>
            ) : null}
          </View>

          {runError ? (
            <Text style={[styles.hintText, { color: '#7A4F00' }]} numberOfLines={4}>
              {runError}
            </Text>
          ) : null}

          {sectionsAnalyzed ? (
            <Text style={styles.metaText}>Analyserade sektioner: {String(sectionsAnalyzed)}</Text>
          ) : null}
          {meta?.totalChars != null ? (
            <Text style={styles.metaText}>
              Underlag: {String(meta.totalChars)} tecken{meta.truncated ? ' (trunkerat)' : ''}
            </Text>
          ) : null}
          {model ? <Text style={styles.metaText}>Modell: {model}</Text> : null}
        </View>

        <View style={styles.grid}>
          <Card title="Sammanfattning" iconName="bulb-outline">
            {analysisDoc ? (
              <Text style={styles.bodyText}>{summary || '—'}</Text>
            ) : (
              <EmptyCardState />
            )}
          </Card>

          <Card title="Komplethet – fliken Kalkyl" iconName="checkmark-circle-outline">
            {analysisDoc ? (
              <View style={{ gap: 10 }}>
                {completenessNote ? (
                  <Text style={styles.bodyText}>{completenessNote}</Text>
                ) : null}
                {gaps.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.sectionLabel}>Saknas eller behöver kompletteras:</Text>
                    {gaps.map((g, idx) => (
                      <Text key={`gap-${idx}`} style={styles.bullet}>• {safeText(g)}</Text>
                    ))}
                  </View>
                ) : completenessNote ? null : (
                  <Text style={styles.bodyMuted}>Inga uppenbara luckor identifierade.</Text>
                )}
              </View>
            ) : (
              <EmptyCardState />
            )}
          </Card>

          <Card title="Rekommendationer" iconName="trending-up-outline">
            {analysisDoc ? (
              recommendations.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {recommendations.map((r, idx) => (
                    <Text key={`rec-${idx}`} style={styles.bullet}>• {safeText(r)}</Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.bodyMuted}>—</Text>
              )
            ) : (
              <EmptyCardState />
            )}
          </Card>
        </View>
      </View>

      <ConfirmModal
        visible={!!rerunConfirm?.visible}
        title="Uppdatera analys?"
        message="Detta ersätter tidigare sparad AI-analys för kalkyl. Vill du fortsätta?"
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
});
