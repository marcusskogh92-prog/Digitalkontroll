import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    if (!cid || !pid) return () => {};

    setLoading(true);

    const unsubDoc = listenInkopsplanDoc(
      cid,
      pid,
      (d) => setPlanDoc(d),
      () => {},
    );

    const unsubRows = listenInkopsplanRows(
      cid,
      pid,
      (items) => {
        setRows(Array.isArray(items) ? items : []);
        setLoading(false);
      },
      () => setLoading(false),
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
        <InkopsplanTable companyId={companyId} projectId={projectId} rows={rows} onRowsChanged={triggerRefresh} />
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
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '400',
  },
  primaryBtn: {
    height: 40,
    paddingHorizontal: 14,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loading: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
