/**
 * Enkel modal för att skapa en ny byggdel i registret.
 * Fält: BD (1–3 siffror), Benämning, Anteckningar.
 * Samma stil som Välj byggdelar (mörk header, raka hörn).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../../constants/modalDesign2026';
import { useDraggableResizableModal } from '../../../hooks/useDraggableResizableModal';
import { ICON_RAIL } from '../../../constants/iconRailTheme';

const HEADER_BG = ICON_RAIL?.bg ?? '#1E2A38';

function normalizeCode(v) {
  return String(v ?? '').replace(/\D/g, '').slice(0, 3);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: D.overlayBg,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: D.radius,
    overflow: 'hidden',
    flexDirection: 'column',
    width: Platform.OS === 'web' ? 320 : '90%',
    maxWidth: 340,
    ...(Platform.OS === 'web' ? { boxShadow: D.shadow } : D.shadowNative),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 12,
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: HEADER_BG,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    padding: 2,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  contentScroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    padding: 16,
    paddingBottom: 8,
  },
  footerWrap: {
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: D.inputRadius,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111',
    backgroundColor: '#fff',
    marginBottom: 12,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  hint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: -8,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 8,
  },
  btnAvbryt: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: D.buttonCancelBorder,
    backgroundColor: D.buttonCancelBg,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  btnAvbrytText: { fontSize: 13, fontWeight: '500', color: D.buttonCancelText },
  btnSpara: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 0,
    backgroundColor: D.buttonSaveBg,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  btnSparaText: { fontSize: 13, fontWeight: '500', color: D.buttonSaveColor },
  error: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
});

export default function AddByggdelModal({
  visible,
  onClose,
  onSave,
  saving = false,
}) {
  const [bd, setBd] = useState('');
  const [benamning, setBenamning] = useState('');
  const [anteckningar, setAnteckningar] = useState('');
  const [error, setError] = useState('');

  const { boxStyle, overlayStyle, headerProps } = useDraggableResizableModal(!!visible, {
    defaultWidth: 320,
    defaultHeight: 320,
    minWidth: 280,
    minHeight: 300,
  });

  useEffect(() => {
    if (visible) {
      setBd('');
      setBenamning('');
      setAnteckningar('');
      setError('');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, onClose]);

  const handleSave = async () => {
    const code = normalizeCode(bd);
    const name = (benamning ?? '').trim();
    if (!code) {
      setError('Ange BD (1–3 siffror).');
      return;
    }
    if (!name) {
      setError('Ange benämning.');
      return;
    }
    setError('');
    try {
      await onSave?.({ code, name, notes: (anteckningar ?? '').trim() });
      onClose?.();
    } catch (e) {
      setError(e?.message || 'Kunde inte spara.');
    }
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.overlay, overlayStyle]} onPress={onClose}>
        <Pressable
          style={[styles.box, boxStyle, error ? { minHeight: 380 } : null]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[styles.header, headerProps?.style]}
            {...(Platform.OS === 'web' && headerProps?.onMouseDown ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <Text style={styles.title} numberOfLines={1}>Lägg till byggdel</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Stäng">
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <View style={styles.content}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.label}>BD (1–3 siffror)</Text>
              <TextInput
                value={bd}
                onChangeText={(v) => setBd(normalizeCode(v))}
                placeholder="t.ex. 45"
                keyboardType="number-pad"
                maxLength={3}
                style={styles.input}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { inputMode: 'numeric' } : {})}
              />
              <Text style={styles.hint}>Endast siffror 0–9</Text>
              <Text style={styles.label}>Benämning</Text>
              <TextInput
                value={benamning}
                onChangeText={setBenamning}
                placeholder="t.ex. Rivning"
                style={styles.input}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
              <Text style={styles.label}>Anteckningar (valfritt)</Text>
              <TextInput
                value={anteckningar}
                onChangeText={setAnteckningar}
                placeholder="Valfria anteckningar"
                style={[styles.input, { marginBottom: 0 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
            </View>
          </ScrollView>
          <View style={[styles.footer, styles.footerWrap]}>
            <TouchableOpacity style={styles.btnAvbryt} onPress={onClose} disabled={saving}>
              <Text style={styles.btnAvbrytText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnSpara}
              onPress={handleSave}
              disabled={saving}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.btnSparaText}>{saving ? 'Sparar…' : 'Spara'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
