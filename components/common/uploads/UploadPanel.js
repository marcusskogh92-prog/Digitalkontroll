import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useUploadManager } from './UploadManagerContext';

function safeText(value) {
  return String(value ?? '').trim();
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let u = 0;
  let v = n;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : (v >= 100 ? 0 : 1);
  try {
    return `${v.toLocaleString('sv-SE', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[u]}`;
  } catch (_e) {
    return `${v.toFixed(digits)} ${units[u]}`;
  }
}

function statusIcon(status) {
  const st = safeText(status);
  if (st === 'success') return { name: 'checkmark-circle', color: '#16A34A' };
  if (st === 'error') return { name: 'alert-circle', color: '#DC2626' };
  if (st === 'uploading') return { name: 'cloud-upload-outline', color: '#1976D2' };
  return { name: 'time-outline', color: '#64748B' };
}

function itemPct(loaded, total) {
  const t = Number(total || 0);
  const l = Number(loaded || 0);
  if (!Number.isFinite(t) || t <= 0) return 0;
  const p = l / t;
  return Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
}

export function UploadPanelTrigger() {
  const {
    panelOpen,
    batches,
    stats,
    togglePanel,
    closePanel,
    removeBatch,
    clearAll,
  } = useUploadManager();

  const hasAnything = Array.isArray(batches) && batches.length > 0;
  if (!hasAnything) return null;

  const pct = Math.round(Math.max(0, Math.min(1, Number(stats?.progress || 0))) * 100);
  const activeCount = Number(stats?.activeCount || 0);
  const errorCount = Number(stats?.errorCount || 0);

  const badgeText = activeCount > 0
    ? `${activeCount} pågår`
    : (errorCount > 0 ? `${errorCount} fel` : 'Klart');

  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onPress={togglePanel}
        style={({ hovered, pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: errorCount > 0 ? 'rgba(220,38,38,0.25)' : 'rgba(25,118,210,0.18)',
          backgroundColor: errorCount > 0 ? 'rgba(220,38,38,0.06)' : 'rgba(25,118,210,0.06)',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          opacity: pressed ? 0.85 : 1,
          ...(hovered ? { backgroundColor: errorCount > 0 ? 'rgba(220,38,38,0.10)' : 'rgba(25,118,210,0.10)' } : {}),
        })}
        accessibilityRole="button"
        accessibilityLabel="Uppladdningar"
      >
        <Ionicons name={errorCount > 0 ? 'alert-circle-outline' : 'cloud-upload-outline'} size={18} color={errorCount > 0 ? '#DC2626' : '#1976D2'} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: errorCount > 0 ? '#991B1B' : '#0F172A' }}>
          {badgeText}
        </Text>
        {stats?.totalBytes > 0 ? (
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155' }}>{pct}%</Text>
        ) : null}
        <Ionicons name={panelOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#64748B" />
      </Pressable>

      {panelOpen ? (
        <View
          style={{
            position: 'absolute',
            top: 42,
            right: 0,
            width: 420,
            maxWidth: 520,
            maxHeight: 520,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(15, 23, 42, 0.14)',
            backgroundColor: '#FFFFFF',
            padding: 12,
            zIndex: 99999,
            ...(Platform.OS === 'web'
              ? { boxShadow: '0 16px 28px rgba(0,0,0,0.18)' }
              : { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cloud-upload-outline" size={16} color="#1976D2" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>Uppladdningar</Text>
              {stats?.totalBytes > 0 ? (
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                  {formatBytes(stats.loadedBytes)} / {formatBytes(stats.totalBytes)}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={clearAll}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: hovered || pressed ? 'rgba(15,23,42,0.06)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>Rensa</Text>
              </Pressable>
              <Pressable
                onPress={closePanel}
                style={({ hovered, pressed }) => ({
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hovered || pressed ? 'rgba(15,23,42,0.06)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityRole="button"
                accessibilityLabel="Stäng"
              >
                <Ionicons name="close" size={16} color="#334155" />
              </Pressable>
            </View>
          </View>

          {stats?.totalBytes > 0 ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ height: 8, borderRadius: 8, backgroundColor: 'rgba(25,118,210,0.10)', overflow: 'hidden' }}>
                <View style={{ height: 8, width: `${Math.round((Number(stats.progress || 0)) * 100)}%`, backgroundColor: '#1976D2' }} />
              </View>
            </View>
          ) : null}

          <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ paddingBottom: 6 }}>
            {(Array.isArray(batches) ? batches : []).map((b) => {
              const bid = safeText(b?.id);
              const title = safeText(b?.title) || 'Uppladdning';
              const msg = safeText(b?.message);
              const items = Array.isArray(b?.items) ? b.items : [];

              const errors = items.filter((it) => safeText(it?.status) === 'error').length;
              const active = items.filter((it) => {
                const st = safeText(it?.status);
                return st === 'queued' || st === 'uploading';
              }).length;

              return (
                <View key={bid} style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>{title}</Text>
                      {msg ? (
                        <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 2 }}>{msg}</Text>
                      ) : null}
                      <Text style={{ fontSize: 12, fontWeight: '700', color: errors > 0 ? '#991B1B' : '#334155', marginTop: 6 }}>
                        {active > 0 ? `${active} pågår` : 'Klart'}{errors > 0 ? ` · ${errors} fel` : ''}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => removeBatch(bid)}
                      style={({ hovered, pressed }) => ({
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: hovered || pressed ? 'rgba(15,23,42,0.06)' : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="Ta bort"
                    >
                      <Ionicons name="close" size={16} color="#334155" />
                    </Pressable>
                  </View>

                  {items.slice(0, 12).map((it) => {
                    const icon = statusIcon(it?.status);
                    const name = safeText(it?.name) || 'Fil';
                    const st = safeText(it?.status);
                    const pct2 = Math.round(itemPct(it?.loaded, it?.total) * 100);

                    return (
                      <View key={safeText(it?.id)} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.06)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name={icon.name} size={16} color={icon.color} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{name}</Text>
                            {st === 'error' && safeText(it?.error) ? (
                              <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', color: '#991B1B', marginTop: 2 }}>{safeText(it?.error)}</Text>
                            ) : null}
                          </View>
                          {Number(it?.total || 0) > 0 ? (
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>{pct2}%</Text>
                          ) : null}
                        </View>

                        {Number(it?.total || 0) > 0 && (st === 'uploading' || st === 'success') ? (
                          <View style={{ marginTop: 6, height: 6, borderRadius: 6, backgroundColor: 'rgba(25,118,210,0.10)', overflow: 'hidden' }}>
                            <View style={{ height: 6, width: `${pct2}%`, backgroundColor: st === 'success' ? '#16A34A' : '#1976D2' }} />
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  {items.length > 12 ? (
                    <Text style={{ marginTop: 10, fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                      +{items.length - 12} till…
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
