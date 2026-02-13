/**
 * Golden rule: Standardiserad laddningsindikator för systemet.
 * Animerad spinner + valfri text. Använd i modaler och vyer istället för enbart "Laddar…"-text.
 * Tema: constants/modalTheme.js (LOADING_THEME).
 * Se docs/MODAL_GOLDEN_RULE.md – Loading state.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LOADING_THEME } from '../../constants/modalTheme';

export default function LoadingState({ message = 'Laddar…', size = 'large', style, minHeight }) {
  const spinnerSize = size === 'small' ? LOADING_THEME.spinnerSizeSmall : LOADING_THEME.spinnerSizeLarge;
  const containerMinHeight = minHeight ?? LOADING_THEME.containerMinHeight;

  return (
    <View style={[styles.container, { minHeight: containerMinHeight }, style]}>
      <ActivityIndicator size={spinnerSize} color={LOADING_THEME.spinnerColor} />
      {message ? (
        <Text style={styles.text}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  text: {
    fontSize: LOADING_THEME.textFontSize,
    color: LOADING_THEME.textColor,
    marginTop: 12,
  },
});
