/**
 * Resursbank – personal. Modal för att hantera register/resursbank för personal (golden rules 2026).
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import ModalBase from '../../components/common/ModalBase';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';

function isWeb() {
  return Platform.OS === 'web';
}

export default function ResursbankModal({
  visible,
  onClose,
  resources = [],
  onAddPerson,
  onEditPerson,
}) {
  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 480,
    defaultHeight: 420,
    minWidth: 360,
    minHeight: 320,
  });

  const footer = (
    <View style={styles.footerRow}>
      <TouchableOpacity
        style={styles.footerBtnSecondary}
        onPress={onClose}
        {...(isWeb() ? { cursor: 'pointer', onClick: onClose } : {})}
      >
        <Text style={styles.footerBtnSecondaryText}>Stäng</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Resursbank – personal"
      subtitle="Register över personal som kan planeras"
      headerVariant="neutralCompact"
      titleIcon={<Ionicons name="people-outline" size={D.headerNeutralCompactIconPx} color={D.headerNeutralTextColor} />}
      boxStyle={boxStyle}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={styles.contentWrap}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.hint}>
          Här hanterar du din personal som resurser. Personal som läggs till kan planeras i planeringsrutan.
        </Text>
        <Pressable
          onPress={() => {
            onAddPerson?.();
            onClose?.();
          }}
          style={({ pressed, hovered }) => [styles.addBtn, (pressed || hovered) && styles.addBtnHover]}
        >
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Lägg till personal</Text>
        </Pressable>
        <Text style={styles.listLabel}>Personal i resursbanken ({resources.length})</Text>
        {resources.length === 0 ? (
          <Text style={styles.emptyText}>Ingen personal tillagd än. Klicka på «Lägg till personal» ovan.</Text>
        ) : (
          <View style={styles.list}>
            {resources.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => onEditPerson?.(r.id)}
                style={({ pressed, hovered }) => [styles.listRow, (pressed || hovered) && styles.listRowHover]}
              >
                <Text style={styles.listRowName} numberOfLines={1}>{r.name || '—'}</Text>
                {r.role ? <Text style={styles.listRowRole} numberOfLines={1}>{r.role}</Text> : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ModalBase>
  );
}

const styles = StyleSheet.create({
  contentWrap: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 24 },
  hint: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
    lineHeight: 20,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: D.buttonRadius,
    backgroundColor: '#2563eb',
    marginBottom: 16,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  addBtnHover: { backgroundColor: '#1d4ed8' },
  addBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  listLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  list: { gap: 0 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  listRowHover: { backgroundColor: '#f8fafc' },
  listRowName: { fontSize: 13, fontWeight: '500', color: '#0f172a', flex: 1, minWidth: 0 },
  listRowRole: { fontSize: 12, color: '#64748b', marginLeft: 8 },
  footerRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%' },
  footerBtnSecondary: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 18,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnSecondaryText: { fontSize: 12, fontWeight: '500', color: '#b91c1c' },
});
