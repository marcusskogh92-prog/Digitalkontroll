import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Image, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function CompanyOverviewCard({
  companyName,
  companyId,
  logoUrl,
  statusLabel,
  companyEnabled,
  companyMemberCount,
  userLimit,
  seatsLeft,
  lastAuditText,
  onEditName,
  onChangeLogo,
  canEditUserLimit = false,
  onToggleCompanyEnabled,
  userLimitEditorOpen = false,
  userLimitDraft = '',
  onOpenUserLimitEditor,
  onChangeUserLimitDraft,
  onSaveUserLimit,
  onCancelUserLimitEditor,
  busy = false,
}) {
  const safeName = String(companyName || companyId || '').trim();
  const safeId = String(companyId || '').trim();
  const safeLogo = String(logoUrl || '').trim();

  const limitNumber = (() => {
    const parsed = parseInt(String(userLimit || ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const seatsLeftText = typeof seatsLeft === 'number' ? `${seatsLeft} st` : '—';
  const licenseUsageText = (typeof companyMemberCount === 'number' && typeof limitNumber === 'number')
    ? `${companyMemberCount} / ${limitNumber}`
    : '—';

  const fileInputRef = useRef(null);

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: '#eee',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', flex: 1, minWidth: 260 }}>
          <View style={{ gap: 8, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 120,
                height: 56,
                borderRadius: 12,
                backgroundColor: '#F3F4F6',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                padding: 8,
              }}
            >
              {safeLogo ? (
                <Image
                  source={{ uri: safeLogo }}
                  style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                />
              ) : (
                <Ionicons name="business-outline" size={24} color="#6B7280" />
              )}
            </View>

            {typeof onChangeLogo === 'function' ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    try { fileInputRef.current?.click?.(); } catch (_e) {}
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' }}
                >
                  <Ionicons name="image-outline" size={16} color="#111827" />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>Byt bild</Text>
                </TouchableOpacity>

                {/* Web-only file input (same approach as CompanyBanner) */}
                {Platform.OS === 'web' ? (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      try {
                        const file = e?.target?.files?.[0];
                        if (!file) return;
                        await onChangeLogo(file);
                      } finally {
                        try { if (e?.target) e.target.value = ''; } catch (_e) {}
                      }
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </View>

          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={{ fontSize: 12, fontWeight: '400', color: '#6B7280' }}>Företagsöversikt</Text>
            <Text style={{ fontSize: 20, fontWeight: '500', color: '#111827', marginTop: 2 }} numberOfLines={2}>
              {safeName || '—'}
            </Text>
            {safeId ? (
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
                ID: {safeId}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 10, minWidth: 180 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: companyEnabled ? '#E8F5E9' : '#FFEBEE' }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: companyEnabled ? '#2E7D32' : '#C62828' }}>
                {String(statusLabel || (companyEnabled ? 'Aktivt' : 'Pausat'))}
              </Text>
            </View>
          </View>

          {typeof onToggleCompanyEnabled === 'function' ? (
            <TouchableOpacity
              onPress={async () => {
                try { await onToggleCompanyEnabled?.(); } catch (_e) {}
              }}
              disabled={!!busy}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: busy ? '#ccc' : (companyEnabled ? '#3f7f3f' : '#C62828'),
                opacity: busy ? 0.6 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name={companyEnabled ? 'pause-outline' : 'play-outline'} size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>
                {companyEnabled ? 'Inaktivera företag' : 'Aktivera företag'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {typeof onEditName === 'function' ? (
            <TouchableOpacity
              onPress={onEditName}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' }}
            >
              <Ionicons name="create-outline" size={14} color="#111827" />
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>Ändra namn</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: '#F1F5F9', marginTop: 16, marginBottom: 16 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Metric label="Licenser" value={licenseUsageText} icon="id-card-outline" />
        <Metric label="Lediga" value={seatsLeftText} icon="checkmark-circle-outline" />
        <Metric label="Senast aktiv" value={lastAuditText ? String(lastAuditText) : '—'} icon="time-outline" wide />
      </View>

      {canEditUserLimit ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="people-outline" size={16} color="#6B7280" />
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#111827' }}>Användargräns</Text>
              <Text style={{ fontSize: 13, fontWeight: '400', color: '#6B7280' }}>{typeof limitNumber === 'number' ? `${limitNumber} st` : '—'}</Text>
            </View>

            {!userLimitEditorOpen ? (
              <TouchableOpacity
                onPress={() => {
                  try { onOpenUserLimitEditor?.(); } catch (_e) {}
                }}
                disabled={!!busy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', opacity: busy ? 0.6 : 1 }}
              >
                <Ionicons name="create-outline" size={14} color="#111827" />
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>Ändra</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {userLimitEditorOpen ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TextInput
                value={String(userLimitDraft || '')}
                onChangeText={(t) => {
                  try { onChangeUserLimitDraft?.(t); } catch (_e) {}
                }}
                keyboardType="numeric"
                placeholder="10"
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 90, backgroundColor: '#fff' }}
              />
              <TouchableOpacity
                onPress={async () => {
                  try { await onSaveUserLimit?.(); } catch (_e) {}
                }}
                disabled={!!busy}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#1976D2', opacity: busy ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#fff' }}>Spara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  try { onCancelUserLimitEditor?.(); } catch (_e) {}
                }}
                disabled={!!busy}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', opacity: busy ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>Avbryt</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Metric({ label, value, icon, wide = false }) {
  return (
    <View style={{
      minWidth: wide ? 260 : 140,
      flexGrow: wide ? 2 : 1,
      flexBasis: wide ? 260 : 140,
      borderWidth: 1,
      borderColor: '#EEF2F7',
      backgroundColor: '#FAFAFB',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    }}>
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color="#3730A3" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '400' }}>{label}</Text>
        <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500', marginTop: 1 }} numberOfLines={2}>
          {String(value || '—')}
        </Text>
      </View>
    </View>
  );
}
