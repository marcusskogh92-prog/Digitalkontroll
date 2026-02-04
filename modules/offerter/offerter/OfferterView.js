import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import PackageNotesPanel from '../components/PackageNotesPanel';
import { addOfferterPackageNote, listenOfferterPackageNotes, listenOfferterPackages } from './offerterService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function formatTime(value) {
  try {
    if (!value) return '—';
    const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
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

function ListRow({ item, selected, onPress }) {
  const title = safeText(item?.title) || safeText(item?.supplierName) || 'Offert';
  const subtitle = safeText(item?.byggdelLabel) || safeText(item?.ref) || '';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, selected && styles.listRowSelected, pressed && styles.listRowPressed]}
    >
      <Text style={styles.listTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.listSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      <Text style={styles.listMeta} numberOfLines={1}>
        {formatTime(item?.createdAt)}
      </Text>
    </Pressable>
  );
}

export default function OfferterView({ companyId, projectId }) {
  const isWeb = Platform.OS === 'web';

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState(null);

  useEffect(() => {
    if (!companyId || !projectId) return () => {};
    setLoading(true);
    const unsub = listenOfferterPackages(
      companyId,
      projectId,
      (list) => {
        setPackages(Array.isArray(list) ? list : []);
        setLoading(false);
      },
      (_err) => setLoading(false),
    );

    return () => {
      try {
        unsub?.();
      } catch (_e) {}
    };
  }, [companyId, projectId]);

  useEffect(() => {
    if (!selectedPackageId && packages.length) setSelectedPackageId(packages[0]?.id || null);
  }, [packages, selectedPackageId]);

  const selectedPackage = useMemo(
    () => packages.find((p) => String(p?.id || '') === String(selectedPackageId || '')) || null,
    [packages, selectedPackageId],
  );

  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <View style={styles.leftPane}>
        <Text style={styles.paneTitle}>Offerter</Text>
        <Text style={styles.paneSubtitle}>Lista & detaljer (placeholder)</Text>

        <View style={styles.divider} />

        {loading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {packages.length === 0 ? <Text style={styles.muted}>Inga offerter än.</Text> : null}
            {packages.map((p) => (
              <ListRow
                key={p.id}
                item={p}
                selected={String(p.id) === String(selectedPackageId)}
                onPress={() => setSelectedPackageId(p.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.middlePane}>
        <Text style={styles.paneTitle}>Detaljer</Text>
        {selectedPackage ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle} numberOfLines={2}>
              {safeText(selectedPackage?.title) || safeText(selectedPackage?.supplierName) || 'Offert'}
            </Text>
            <Text style={styles.detailMeta}>
              Skapad: {formatTime(selectedPackage?.createdAt)}
            </Text>
            <Text style={styles.detailMuted}>
              Den här delen blir offert-detaljer (pris, rader, bilagor, mm).
            </Text>
          </View>
        ) : (
          <View style={styles.detailCard}>
            <Text style={styles.detailMuted}>Välj en offert i listan.</Text>
          </View>
        )}
      </View>

      <View style={styles.rightPane}>
        <PackageNotesPanel
          title="Kommentarer & historik"
          subtitle={
            selectedPackage
              ? `${safeText(selectedPackage?.byggdelLabel) || '—'} · ${safeText(selectedPackage?.supplierName) || '—'}`
              : ''
          }
          companyId={companyId}
          projectId={projectId}
          selectedItem={selectedPackage}
          listenNotes={listenOfferterPackageNotes}
          addNote={addOfferterPackageNote}
          history={
            selectedPackage
              ? [
                  { label: 'Skapad', value: formatTime(selectedPackage?.createdAt) },
                  { label: 'Ändrad', value: formatTime(selectedPackage?.updatedAt) },
                ]
              : []
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: '#fff',
  },
  containerWeb: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  leftPane: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    backgroundColor: '#fff',
    maxWidth: 340,
  },
  middlePane: {
    flex: 2,
    minHeight: 0,
    padding: 14,
    backgroundColor: '#fff',
  },
  rightPane: {
    flex: 1,
    minHeight: 0,
    minWidth: 320,
    maxWidth: 380,
    backgroundColor: '#fff',
  },
  paneTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  paneSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  centerPad: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 12,
    gap: 8,
  },
  muted: {
    fontSize: 12,
    color: '#94a3b8',
  },
  listRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  listRowSelected: {
    borderColor: '#60a5fa',
    backgroundColor: '#eff6ff',
  },
  listRowPressed: {
    opacity: 0.9,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  listSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#64748b',
  },
  listMeta: {
    marginTop: 6,
    fontSize: 11,
    color: '#94a3b8',
  },
  detailCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  detailMeta: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
  },
  detailMuted: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
});
