import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, Text, View } from 'react-native';

export default function DashboardBanner({
  title,
  message,
  accentColor = '#1976D2',
  backgroundColor = '#F8F9FA',
  borderRadius = 8,
  borderLeftWidth = 3,
  padding = 12,
  marginBottom = 16,
  onClose,
  style,
  titleStyle,
  messageStyle,
  children,
}) {
  const hasHeader = !!(title || message || onClose);

  return (
    <View
      style={{
        marginBottom,
        padding,
        backgroundColor,
        borderRadius,
        borderLeftWidth,
        borderLeftColor: accentColor,
        ...(style || null),
      }}
    >
      {hasHeader ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: message ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? (
              <Text
                style={{
                  fontSize: 14,
                  color: '#495057',
                  fontWeight: '500',
                  marginBottom: message ? 4 : 0,
                  ...(titleStyle || null),
                }}
              >
                {title}
              </Text>
            ) : null}
            {message ? (
              <Text
                style={{
                  fontSize: 13,
                  color: '#6C757D',
                  ...(messageStyle || null),
                }}
              >
                {message}
              </Text>
            ) : null}
          </View>

          {onClose ? (
            <Pressable
              onPress={onClose}
              style={({ hovered, pressed }) => ({
                padding: 8,
                borderRadius: 10,
                backgroundColor:
                  pressed || (Platform.OS === 'web' && hovered)
                    ? 'rgba(0,0,0,0.05)'
                    : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              })}
              hitSlop={10}
              accessibilityLabel="Stäng"
            >
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {children ? (
        <View style={{ marginTop: hasHeader ? 8 : 0 }}>{children}</View>
      ) : null}
    </View>
  );
}
