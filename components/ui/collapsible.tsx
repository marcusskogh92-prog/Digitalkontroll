import { PropsWithChildren, ReactNode, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

export function Collapsible({ children, title, subtitle, defaultOpen, onOpenChange, headerRight, error, open }: PropsWithChildren & { title: string; subtitle?: string; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; headerRight?: ReactNode; error?: boolean; open?: boolean }) {
  const [isOpen, setIsOpen] = useState<boolean>(!!defaultOpen);
  const effectiveOpen = open !== undefined ? !!open : isOpen;
  const headingBg = '#E9ECEF';
  const headingBorder = '#D0D5DA';
  const headingText = '#263238';

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.heading,
          {
            backgroundColor: headingBg,
            borderColor: error ? '#D32F2F' : headingBorder,
            borderWidth: error ? 2 : 1,
          },
        ]}
        onPress={() => {
          const next = !effectiveOpen;
          if (open === undefined) {
            setIsOpen(next);
          }
          try { onOpenChange?.(next); } catch {}
        }}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={headingText}
          style={{ transform: [{ rotate: effectiveOpen ? '90deg' : '0deg' }] }}
        />

        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: headingText, fontWeight: '600', fontSize: 15 }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: '#555', fontSize: 12, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">· {subtitle}</Text>
          ) : null}
        </View>
        <View style={{ flexShrink: 0 }}>
          {headerRight}
        </View>
      </TouchableOpacity>
      {effectiveOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%'
  },
  content: {
    marginTop: 8,
  },
});
