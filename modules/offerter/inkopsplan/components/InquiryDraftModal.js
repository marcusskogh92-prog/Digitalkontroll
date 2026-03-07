/**
 * Generell förfrågan (AI-analys) – modal enligt golden rules 2026.
 * ModalBase + MODAL_DESIGN_2026: mörk kompakt banner, primärknapp dimmad banner, Stäng dimmad röd.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { MODAL_DESIGN_2026 as D } from '../../../../constants/modalDesign2026';
import ModalBase from '../../../../components/common/ModalBase';
import { useDraggableResizableModal } from '../../../../hooks/useDraggableResizableModal';
import { useModalKeyboard } from '../../../../hooks/useModalKeyboard';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

export default function InquiryDraftModal({
  visible,
  onClose,
  draftText,
  rowName,
  onSave,
  onGenerate,
  generating = false,
}) {
  const [editText, setEditText] = useState(safeText(draftText));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setEditText(safeText(draftText));
    }
  }, [visible, draftText]);

  const handleSave = async () => {
    if (typeof onSave !== 'function') return;
    setSaving(true);
    try {
      await onSave(editText);
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const canSave = typeof onSave === 'function' && !generating && !saving;

  useModalKeyboard(visible, onClose, handleSave, { canSave, saving: saving || generating, disabled: !visible });

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 640,
    defaultHeight: 480,
    minWidth: 400,
    minHeight: 320,
  });

  const footer = (
    <View style={styles.footerRow}>
      {typeof onGenerate === 'function' ? (
        <Pressable
          onPress={onGenerate}
          disabled={generating}
          style={({ hovered, pressed }) => [
            styles.footerBtnGenerate,
            (hovered || pressed) && !generating && styles.footerBtnGenerateHover,
            generating && { opacity: 0.6 },
          ]}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.footerBtnGenerateText}>Generera med AI</Text>
          )}
        </Pressable>
      ) : null}
      <View style={styles.footerRight}>
        <TouchableOpacity
          style={styles.footerBtnSecondary}
          onPress={onClose}
          {...(isWeb() ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.footerBtnSecondaryText}>Stäng</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtnPrimary, (!canSave || saving) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!canSave || saving}
          {...(isWeb() ? { cursor: !canSave || saving ? 'default' : 'pointer' } : {})}
        >
          <Text style={styles.footerBtnPrimaryText}>{saving ? 'Sparar…' : 'Spara'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Generell förfrågan (AI-analys)"
      subtitle={rowName ? `Utkast för ${rowName}` : 'AI-analys för generell förfrågan'}
      headerVariant="neutralCompact"
      titleIcon={<Ionicons name="sparkles-outline" size={D.headerNeutralCompactIconPx} color={D.headerNeutralTextColor} />}
      boxStyle={boxStyle}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={styles.contentWrap}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Förfrågetext (kan redigeras)</Text>
        <TextInput
          value={editText}
          onChangeText={setEditText}
          placeholder="Klicka på «Generera med AI» för att skapa ett generellt utkast utifrån projektets AI-analys, eller skriv din egen text. Anpassa sedan förfrågan per leverantör under Leverantörer."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={12}
          style={styles.input}
          textAlignVertical="top"
          {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
        />
      </ScrollView>
    </ModalBase>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 10,
  },
  input: {
    minHeight: 280,
    fontSize: 13,
    lineHeight: 22,
    color: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: D.inputRadius,
    backgroundColor: '#fff',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerBtnGenerate: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 16,
    borderRadius: D.buttonRadius,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnGenerateHover: {
    backgroundColor: '#16A34A',
  },
  footerBtnGenerateText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  footerBtnSecondary: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 18,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#b91c1c',
  },
  footerBtnPrimary: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 18,
    borderRadius: D.buttonRadius,
    backgroundColor: D.buttonPrimaryBg,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnPrimaryText: {
    fontSize: 12,
    fontWeight: D.buttonPrimaryFontWeight,
    color: D.buttonPrimaryColor,
  },
});
