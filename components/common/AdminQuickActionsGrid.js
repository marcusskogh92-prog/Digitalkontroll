import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';

export default function AdminQuickActionsGrid({
  title = 'Kärninställningar',
  subtitle = 'Genvägar till de vanligaste adminvyerna.',
  items = [],
}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return null;

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
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: '#111827' }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, fontWeight: '400', color: '#6B7280', marginTop: 4 }}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {list.map((item) => (
          <QuickActionCard key={String(item.key || item.title)} item={item} />
        ))}
      </View>
    </View>
  );
}

function QuickActionCard({ item }) {
  const title = String(item?.title || '').trim();
  const subtitle = String(item?.subtitle || '').trim();
  const icon = item?.icon || 'arrow-forward';
  const color = String(item?.color || '#1976D2');
  const disabled = !!item?.disabled;
  const onPress = typeof item?.onPress === 'function' ? item.onPress : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      style={{
        flexGrow: 1,
        flexBasis: 190,
        minWidth: 190,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#EEF2F7',
        backgroundColor: '#FBFDFF',
        padding: 14,
        opacity: (disabled || !onPress) ? 0.5 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(25,118,210,0.08)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#111827' }} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ fontSize: 11, fontWeight: '400', color: '#6B7280', marginTop: 2 }} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
}
