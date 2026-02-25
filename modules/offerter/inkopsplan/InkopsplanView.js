import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import CreateInkopsplanModal from './components/CreateInkopsplanModal';
import InkopsplanTable from './components/InkopsplanTable';
import { listenInkopsplanDoc, listenInkopsplanRows } from './inkopsplanService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.primaryBtn,
        (hovered || pressed) && !disabled && styles.primaryBtnHover,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={styles.primaryBtnText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function InkopsplanView({ companyId, projectId }) {
  const [planDoc, setPlanDoc] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    if (!cid || !pid) return () => {};

    setLoading(true);
    setError('');

    const unsubDoc = listenInkopsplanDoc(
      cid,
      pid,
      (d) => setPlanDoc(d),
      (e) => setError(String(e?.message || e || 'Kunde inte läsa inköpsplan.')),
    );

    const unsubRows = listenInkopsplanRows(
      cid,
      pid,
      (items) => {
        setRows(Array.isArray(items) ? items : []);
        setLoading(false);
      },
      (e) => {
        setError(String(e?.message || e || 'Kunde inte läsa inköpsplanrader.'));
        setLoading(false);
      },
    );

    return () => {
      try { unsubDoc?.(); } catch (_e) {}
      try { unsubRows?.(); } catch (_e) {}
    };
  }, [companyId, projectId, refreshNonce]);

  const triggerRefresh = () => setRefreshNonce((n) => n + 1);

  const planExists = Boolean(planDoc) || (Array.isArray(rows) && rows.length > 0);

  const existingRowKeySet = useMemo(() => {
    const set = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const type = safeText(r?.type);
      const sourceId = safeText(r?.sourceId);
      if (!type || !sourceId) return;
      set[`${type}:${sourceId}`] = true;
    });
    return set;
  }, [rows]);

  const topActionLabel = planExists ? 'Lägg till från register' : 'Skapa inköpsplan';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Inköpsplan</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            En strukturerad inköpsplan som genereras från företagets register.
          </Text>
        </View>
        <PrimaryButton
          label={topActionLabel}
          onPress={() => setIsModalOpen(true)}
          disabled={!companyId || !projectId}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {error ? (
            <View style={{ padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10 }}>
              <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>Inköpsplan kunde inte laddas</Text>
              <Text style={{ color: '#7f1d1d', fontSize: 12, marginTop: 4 }}>{error}</Text>
            </View>
          ) : null}
          <InkopsplanTable companyId={companyId} projectId={projectId} rows={rows} onRowsChanged={triggerRefresh} />
        </ScrollView>
      )}

      <CreateInkopsplanModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        companyId={companyId}
        projectId={projectId}
        mode={planExists ? 'add' : 'create'}
        existingRowKeySet={existingRowKeySet}
        onCreated={triggerRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    backgroundColor: isWeb() ? 'transparent' : '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748B',
    fontWeight: '400',
  },
  primaryBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  primaryBtnHover: {
    transform: [{ translateY: -1 }],
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loading: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});
