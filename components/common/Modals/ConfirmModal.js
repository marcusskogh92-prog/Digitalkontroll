/**
 * Återanvändbar bekräftelsemodal – desktop-känsla, Digitalkontroll design.
 *
 * GOLDEN RULE för radera-modaler (danger=true):
 * - Röd cirkel med "!" + titel "Radera X?"
 * - Brödtext med radbrytning: "Du är på väg att ...\nDetta går inte att ångra."
 * - Avbryt (neutral) + Radera (röd), ESC/ENTER-hintar diskret under knapparna
 *
 * Används för: radera leverantör, kund, kontakt, byggdel, konto, kategori m.m.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Design tokens – samma känsla som övriga systemet
const CONFIRM_MODAL = {
  maxWidth: 480,
  /** När två val (t.ex. koppla bort / radera från register) – bredare så knapparna ryms */
  maxWidthTwoButtons: 520,
  borderRadius: 12,
  paddingTop: 24,
  paddingHorizontal: 24,
  paddingBottom: 14,
  paddingBottomNoHints: 12,
  overlay: 'rgba(0,0,0,0.35)',
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,

  titleFontSize: 18,
  titleFontWeight: '600',
  titleColor: '#0f172a',
  titleMarginBottom: 0,
  /** Röd cirkel med "!" – diameter (solid fill, ingen outline/skugga). */
  titleDangerIconSize: 24,
  titleIconGap: 12,
  titleRowMarginBottom: 8,

  messageFontSize: 14,
  messageColor: '#64748b',
  messageLineHeight: 1.55,
  messageMarginTop: 8,
  messageMarginBottom: 20,

  dividerColor: '#e2e8f0',
  dividerHeight: 1,
  buttonRowMarginTop: 20,
  buttonGap: 12,

  cancelBg: '#f1f5f9',
  cancelBgHover: '#e2e8f0',
  cancelText: '#0f172a',
  cancelBorderRadius: 8,
  cancelPaddingVertical: 10,
  cancelPaddingHorizontal: 16,
  cancelMinWidth: 88,

  dangerBg: '#DC2626',
  dangerBgHover: '#b91c1c',
  dangerText: '#fff',
  dangerBorderRadius: 8,
  dangerPaddingVertical: 10,
  dangerPaddingHorizontal: 16,
  dangerMinWidth: 100,

  /** Sekundär knapp (t.ex. "Koppla bort kontakt" när andra knappen är "Radera från kontaktregister") */
  secondaryBg: '#fff',
  secondaryBgHover: '#f1f5f9',
  secondaryBorderColor: '#cbd5e1',
  secondaryText: '#334155',
  /** Minbredd för de två valknapparna så att längre texter ryms */
  twoButtonMinWidth: 180,

  hintFontSize: 10,
  hintOpacity: 0.35,
  hintMarginTop: 4,
  hintLetterSpacing: 0.5,
  hintColor: '#64748b',

  warningColor: '#b91c1c',
  warningFontSize: 13,
  warningMarginBottom: 12,
};

export default function ConfirmModal({
  visible,
  title,
  message,
  cancelLabel = 'Avbryt',
  confirmLabel = 'Bekräfta',
  danger = false,
  busy = false,
  error = '',
  compact = false,
  /** Dölj ESC/ENTER-hintar under knapparna och minska nedre padding */
  hideKeyboardHints = false,
  /** Valfri varningsrad ovanför knapparna (t.ex. "Denna leverantör är kopplad till 3 kontakter.") */
  warningText = '',
  /** Inaktivera bekräfta-knappen (t.ex. när radering blockeras pga andra användare) */
  confirmDisabled = false,
  /** Valfri andra bekräftelseknapp (t.ex. "Radera från kontaktregister") */
  secondConfirmLabel = '',
  onSecondConfirm,
  /** Dölj Avbryt-knappen och visa stäng-kryss (X) uppe till höger + Esc för att stänga */
  hideCancel = false,
  onCancel,
  onConfirm,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  const handleCancel = useCallback(() => {
    if (busy) return;
    try {
      onCancel?.();
    } catch (_e) {}
  }, [busy, onCancel]);

  const handleConfirm = useCallback(() => {
    if (busy || confirmDisabled) return;
    try {
      onConfirm?.();
    } catch (_e) {}
  }, [busy, confirmDisabled, onConfirm]);

  const handleSecondConfirm = useCallback(() => {
    if (busy) return;
    try {
      onSecondConfirm?.();
    } catch (_e) {}
  }, [busy, onSecondConfirm]);

  // ESC = Avbryt, ENTER = Bekräfta (samma som Radera)
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, handleCancel, handleConfirm]);

  // Default fokus på Avbryt när modalen öppnas
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const t = setTimeout(() => {
      try {
        const el = cancelRef.current;
        if (el && typeof el.focus === 'function') el.focus();
      } catch (_e) {}
    }, 50);
    return () => clearTimeout(t);
  }, [visible]);

  // Lås bakgrundsscroll på web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const prevOverflow = document.body.style.overflow;
    if (visible) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  let titleDisplay = String(title ?? '').trim() || (danger ? 'Radera' : 'Bekräfta');
  if (danger && titleDisplay && !titleDisplay.endsWith('?')) titleDisplay += '?';
  const messageDisplay = String(message ?? '').trim();
  const confirmLabelDisplay =
    danger && (confirmLabel === 'Bekräfta' || confirmLabel === 'OK') ? 'Radera' : confirmLabel;

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: CONFIRM_MODAL.overlay,
          padding: 24,
        }}
      >
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          onPress={handleCancel}
          accessibilityLabel="Stäng (bakgrund)"
        />

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: CONFIRM_MODAL.borderRadius,
            paddingTop: CONFIRM_MODAL.paddingTop,
            paddingHorizontal: CONFIRM_MODAL.paddingHorizontal,
            paddingBottom: hideKeyboardHints ? CONFIRM_MODAL.paddingBottomNoHints : CONFIRM_MODAL.paddingBottom,
            width: '100%',
            maxWidth: secondConfirmLabel ? CONFIRM_MODAL.maxWidthTwoButtons : CONFIRM_MODAL.maxWidth,
            borderWidth: 1,
            borderColor: CONFIRM_MODAL.dividerColor,
            shadowColor: CONFIRM_MODAL.shadowColor,
            shadowOpacity: CONFIRM_MODAL.shadowOpacity,
            shadowRadius: CONFIRM_MODAL.shadowRadius,
            shadowOffset: CONFIRM_MODAL.shadowOffset,
            elevation: CONFIRM_MODAL.elevation,
          }}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => e.stopPropagation()}
        >
          {/* 1. Titelrad: vid danger = röd cirkel med "!" + titel; vid hideCancel = kryss till höger */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: CONFIRM_MODAL.titleIconGap,
              marginBottom: CONFIRM_MODAL.titleRowMarginBottom,
            }}
          >
            {danger ? (
              <View
                style={{
                  width: CONFIRM_MODAL.titleDangerIconSize,
                  height: CONFIRM_MODAL.titleDangerIconSize,
                  borderRadius: CONFIRM_MODAL.titleDangerIconSize / 2,
                  backgroundColor: CONFIRM_MODAL.dangerBg,
                  justifyContent: 'center',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>!</Text>
              </View>
            ) : null}
            <Text
              style={{
                fontSize: CONFIRM_MODAL.titleFontSize,
                fontWeight: CONFIRM_MODAL.titleFontWeight,
                color: CONFIRM_MODAL.titleColor,
                flex: 1,
                minWidth: 0,
              }}
            >
              {titleDisplay}
            </Text>
            {hideCancel ? (
              <TouchableOpacity
                onPress={handleCancel}
                disabled={busy}
                style={{
                  padding: 6,
                  borderRadius: 8,
                  backgroundColor: 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: busy ? 'not-allowed' : 'pointer', outlineStyle: 'none' } : {}),
                }}
                accessibilityLabel="Stäng"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* 2. Brödtext */}
          {messageDisplay ? (
            <Text
              style={{
                fontSize: CONFIRM_MODAL.messageFontSize,
                color: CONFIRM_MODAL.messageColor,
                lineHeight: CONFIRM_MODAL.messageLineHeight * CONFIRM_MODAL.messageFontSize,
                marginTop: CONFIRM_MODAL.messageMarginTop,
                marginBottom: CONFIRM_MODAL.messageMarginBottom,
                ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}),
              }}
            >
              {messageDisplay}
            </Text>
          ) : null}

          {/* Felmeddelande (befintlig API) */}
          {String(error ?? '').trim() ? (
            <View
              style={{
                marginBottom: 16,
                backgroundColor: '#FEF2F2',
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: '#FECACA',
              }}
            >
              <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '500', marginBottom: 4 }}>
                Kunde inte slutföra
              </Text>
              <Text
                style={{
                  color: '#7F1D1D',
                  fontSize: 13,
                  lineHeight: 18,
                  ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}),
                }}
              >
                {String(error).trim()}
              </Text>
            </View>
          ) : null}

          {/* 3. Divider */}
          <View
            style={{
              height: CONFIRM_MODAL.dividerHeight,
              backgroundColor: CONFIRM_MODAL.dividerColor,
              marginBottom: CONFIRM_MODAL.buttonRowMarginTop - 4,
            }}
          />

          {/* Varningsrad (t.ex. kopplade kontakter) */}
          {String(warningText ?? '').trim() ? (
            <Text
              style={{
                fontSize: CONFIRM_MODAL.warningFontSize,
                color: CONFIRM_MODAL.warningColor,
                marginBottom: CONFIRM_MODAL.warningMarginBottom,
                ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}),
              }}
            >
              {String(warningText).trim()}
            </Text>
          ) : null}

          {/* 4. Knapprad */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'flex-start',
              gap: CONFIRM_MODAL.buttonGap,
              marginTop: String(warningText ?? '').trim() ? 0 : 4,
              ...(secondConfirmLabel ? { flexWrap: 'wrap' } : {}),
            }}
          >
            {/* Avbryt (döljs om hideCancel) + ESC-hint */}
            {!hideCancel ? (
              <View style={{ alignItems: 'center' }}>
                <Pressable
                  ref={cancelRef}
                  onPress={handleCancel}
                  disabled={busy}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? CONFIRM_MODAL.cancelBgHover : CONFIRM_MODAL.cancelBg,
                    borderRadius: CONFIRM_MODAL.cancelBorderRadius,
                    paddingVertical: CONFIRM_MODAL.cancelPaddingVertical,
                    paddingHorizontal: CONFIRM_MODAL.cancelPaddingHorizontal,
                    minWidth: CONFIRM_MODAL.cancelMinWidth,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: busy ? 0.6 : 1,
                    ...(Platform.OS === 'web'
                      ? {
                          cursor: busy ? 'not-allowed' : 'pointer',
                          outlineStyle: 'none',
                        }
                      : {}),
                  })}
                  accessibilityLabel={cancelLabel}
                  accessibilityRole="button"
                  {...(Platform.OS === 'web' ? { tabIndex: 0 } : {})}
                >
                  <Text
                    style={{
                      color: CONFIRM_MODAL.cancelText,
                      fontWeight: '500',
                      fontSize: 14,
                    }}
                  >
                    {cancelLabel}
                  </Text>
                </Pressable>
                {!hideKeyboardHints ? (
                  <Text
                    style={{
                      fontSize: CONFIRM_MODAL.hintFontSize,
                      opacity: CONFIRM_MODAL.hintOpacity,
                      marginTop: CONFIRM_MODAL.hintMarginTop,
                      color: CONFIRM_MODAL.hintColor,
                      textTransform: 'uppercase',
                      letterSpacing: CONFIRM_MODAL.hintLetterSpacing,
                    }}
                  >
                    ESC
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Första bekräftelsen: sekundär stil (kant + ljus bakgrund) om det finns en andra röd knapp */}
            <View style={{ alignItems: 'center' }}>
              <Pressable
                ref={confirmRef}
                onPress={handleConfirm}
                disabled={busy || confirmDisabled}
                style={({ pressed }) => {
                  if (secondConfirmLabel) {
                    return {
                      backgroundColor: pressed && !confirmDisabled ? CONFIRM_MODAL.secondaryBgHover : CONFIRM_MODAL.secondaryBg,
                      borderWidth: 1,
                      borderColor: CONFIRM_MODAL.secondaryBorderColor,
                      borderRadius: CONFIRM_MODAL.dangerBorderRadius,
                      paddingVertical: CONFIRM_MODAL.dangerPaddingVertical,
                      paddingHorizontal: CONFIRM_MODAL.dangerPaddingHorizontal,
                      minWidth: CONFIRM_MODAL.twoButtonMinWidth,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      opacity: busy || confirmDisabled ? 0.75 : 1,
                      ...(Platform.OS === 'web'
                        ? { cursor: busy || confirmDisabled ? 'not-allowed' : 'pointer', outlineStyle: 'none' }
                        : {}),
                    };
                  }
                  return {
                    backgroundColor: danger
                      ? pressed && !confirmDisabled ? CONFIRM_MODAL.dangerBgHover : CONFIRM_MODAL.dangerBg
                      : pressed && !confirmDisabled ? '#1557b0' : '#1976D2',
                    borderRadius: danger ? CONFIRM_MODAL.dangerBorderRadius : CONFIRM_MODAL.cancelBorderRadius,
                    paddingVertical: danger ? CONFIRM_MODAL.dangerPaddingVertical : CONFIRM_MODAL.cancelPaddingVertical,
                    paddingHorizontal: danger ? CONFIRM_MODAL.dangerPaddingHorizontal : CONFIRM_MODAL.cancelPaddingHorizontal,
                    minWidth: CONFIRM_MODAL.dangerMinWidth,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    opacity: busy || confirmDisabled ? 0.75 : 1,
                    ...(Platform.OS === 'web'
                      ? { cursor: busy || confirmDisabled ? 'not-allowed' : 'pointer', outlineStyle: 'none' }
                      : {}),
                  };
                }}
                accessibilityLabel={confirmLabelDisplay}
                accessibilityRole="button"
                {...(Platform.OS === 'web' ? { tabIndex: 0 } : {})}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={secondConfirmLabel ? CONFIRM_MODAL.secondaryText : '#fff'} style={{ marginRight: 6 }} />
                ) : null}
                <Text
                  style={{
                    color: secondConfirmLabel ? CONFIRM_MODAL.secondaryText : (danger ? CONFIRM_MODAL.dangerText : '#fff'),
                    fontWeight: '500',
                    fontSize: 14,
                  }}
                >
                  {confirmLabelDisplay}
                </Text>
              </Pressable>
              {!hideKeyboardHints && !secondConfirmLabel ? (
                <Text
                  style={{
                    fontSize: CONFIRM_MODAL.hintFontSize,
                    opacity: CONFIRM_MODAL.hintOpacity,
                    marginTop: CONFIRM_MODAL.hintMarginTop,
                    color: CONFIRM_MODAL.hintColor,
                    textTransform: 'uppercase',
                    letterSpacing: CONFIRM_MODAL.hintLetterSpacing,
                  }}
                >
                  ENTER
                </Text>
              ) : null}
            </View>

            {/* Andra bekräftelsen (röd, t.ex. "Radera från kontaktregister") */}
            {secondConfirmLabel ? (
              <View style={{ alignItems: 'center' }}>
                <Pressable
                  onPress={handleSecondConfirm}
                  disabled={busy}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? CONFIRM_MODAL.dangerBgHover : CONFIRM_MODAL.dangerBg,
                    borderRadius: CONFIRM_MODAL.dangerBorderRadius,
                    paddingVertical: CONFIRM_MODAL.dangerPaddingVertical,
                    paddingHorizontal: CONFIRM_MODAL.dangerPaddingHorizontal,
                    minWidth: CONFIRM_MODAL.twoButtonMinWidth,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: busy ? 0.75 : 1,
                    ...(Platform.OS === 'web'
                      ? {
                          cursor: busy ? 'not-allowed' : 'pointer',
                          outlineStyle: 'none',
                        }
                      : {}),
                  })}
                  accessibilityLabel={secondConfirmLabel}
                  accessibilityRole="button"
                  {...(Platform.OS === 'web' ? { tabIndex: 0 } : {})}
                >
                  <Text
                    style={{
                      color: CONFIRM_MODAL.dangerText,
                      fontWeight: '500',
                      fontSize: 14,
                    }}
                  >
                    {String(secondConfirmLabel)}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
