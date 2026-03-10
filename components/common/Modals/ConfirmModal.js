/**
 * Återanvändbar bekräftelsemodal – desktop-känsla, Digitalkontroll design.
 *
 * GOLDEN RULE (docs/MODAL_GOLDEN_RULE.md §4):
 * - Röd cirkel med "!" + titel vid danger (t.ex. "Radera X?", "Uppdatera analys?")
 * - Avbryt: dimmad röd (#fef2f2, kant #fecaca, text #b91c1c). Padding 4px 10px, text 12px/500.
 * - Bekräfta/Primär: bannerns färg dimmad (#2D3A4B), vit text. Padding 4px 12px, text 12px/500.
 * - Ingen ESC/ENTER-text under knapparna (tangenterna fungerar fortfarande).
 *
 * Används för: radera leverantör, kund, kontakt, byggdel, konto, kategori; uppdatera AI-analys m.m.
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

  /** Avbryt – neutral grå (som tidigare i modalen) */
  cancelBg: '#f1f5f9',
  cancelBgHover: '#e2e8f0',
  cancelText: '#0f172a',
  cancelBorderRadius: 6,
  cancelPaddingVertical: 4,
  cancelPaddingHorizontal: 10,
  cancelMinWidth: 88,
  cancelFontSize: 12,

  /** Bekräfta (icke-danger) – primär mörk */
  primaryBg: '#2D3A4B',
  primaryBgHover: '#1E2A38',
  primaryText: '#fff',
  primaryBorderRadius: 6,
  primaryPaddingVertical: 4,
  primaryPaddingHorizontal: 12,
  primaryMinWidth: 96,
  primaryFontSize: 12,

  /** Danger (Radera / Kör ny AI-analys) – röd knapp + röd ikon-cirkel */
  dangerIconBg: '#DC2626',
  dangerBg: '#DC2626',
  dangerBgHover: '#b91c1c',
  dangerText: '#fff',
  dangerBorderRadius: 6,
  dangerPaddingVertical: 4,
  dangerPaddingHorizontal: 12,
  dangerMinWidth: 96,

  /** Sekundär knapp (t.ex. "Koppla bort kontakt" när andra knappen är "Radera från kontaktregister") */
  secondaryBg: '#fff',
  secondaryBgHover: '#f1f5f9',
  secondaryBorderColor: '#cbd5e1',
  secondaryText: '#334155',
  /** Minbredd för de två valknapparna så att längre texter ryms */
  twoButtonMinWidth: 180,

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
  /** Dölj ESC/ENTER-hintar under knapparna (golden rule: ingen korttext). Tangenterna fungerar fortfarande. */
  hideKeyboardHints = true,
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
            paddingBottom: CONFIRM_MODAL.paddingBottomNoHints,
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
                  backgroundColor: CONFIRM_MODAL.dangerIconBg,
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
                    fontSize: CONFIRM_MODAL.cancelFontSize,
                  }}
                >
                  {cancelLabel}
                </Text>
              </Pressable>
            ) : null}

            {/* Bekräfta – golden rule primär (#2D3A4B) eller sekundär om två val */}
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
                    borderRadius: CONFIRM_MODAL.primaryBorderRadius,
                    paddingVertical: CONFIRM_MODAL.primaryPaddingVertical,
                    paddingHorizontal: CONFIRM_MODAL.primaryPaddingHorizontal,
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
                  backgroundColor: pressed && !confirmDisabled
                    ? (danger ? CONFIRM_MODAL.dangerBgHover : CONFIRM_MODAL.primaryBgHover)
                    : (danger ? CONFIRM_MODAL.dangerBg : CONFIRM_MODAL.primaryBg),
                  borderRadius: danger ? CONFIRM_MODAL.dangerBorderRadius : CONFIRM_MODAL.primaryBorderRadius,
                  paddingVertical: danger ? CONFIRM_MODAL.dangerPaddingVertical : CONFIRM_MODAL.primaryPaddingVertical,
                  paddingHorizontal: danger ? CONFIRM_MODAL.dangerPaddingHorizontal : CONFIRM_MODAL.primaryPaddingHorizontal,
                  minWidth: danger ? CONFIRM_MODAL.dangerMinWidth : CONFIRM_MODAL.primaryMinWidth,
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
                  color: secondConfirmLabel ? CONFIRM_MODAL.secondaryText : (danger ? CONFIRM_MODAL.dangerText : CONFIRM_MODAL.primaryText),
                  fontWeight: '500',
                  fontSize: secondConfirmLabel ? 14 : CONFIRM_MODAL.primaryFontSize,
                }}
              >
                {confirmLabelDisplay}
              </Text>
            </Pressable>

            {/* Andra bekräftelsen (primär stil, t.ex. "Radera från kontaktregister") */}
            {secondConfirmLabel ? (
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
                    fontSize: CONFIRM_MODAL.primaryFontSize,
                  }}
                >
                  {String(secondConfirmLabel)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
