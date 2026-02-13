/**
 * Header för AI Prompt Manager Drawer – mörk banner, titel, Ny prompt, Stäng.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { MODAL_THEME } from '../../constants/modalTheme';

const BANNER = MODAL_THEME.banner;

export default function PromptHeader({ categoryLabel, onNewPrompt, onClose }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: BANNER.paddingVertical,
        paddingHorizontal: BANNER.paddingHorizontal,
        backgroundColor: BANNER.backgroundColor,
        borderBottomWidth: 1,
        borderBottomColor: BANNER.borderBottomColor,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <View
          style={{
            width: BANNER.iconSize,
            height: BANNER.iconSize,
            borderRadius: BANNER.iconBgRadius,
            backgroundColor: BANNER.iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="sparkles-outline" size={20} color={BANNER.titleColor} />
        </View>
        <Text
          style={{
            fontSize: BANNER.titleFontSize,
            fontWeight: BANNER.titleFontWeight,
            color: BANNER.titleColor,
          }}
          numberOfLines={1}
        >
          AI-inställningar – {categoryLabel}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          onPress={onNewPrompt}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.3)',
          }}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Ny prompt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          style={{ padding: BANNER.closeBtnPadding }}
          accessibilityLabel="Stäng"
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Ionicons name="close" size={BANNER.closeIconSize} color={BANNER.subtitleColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
