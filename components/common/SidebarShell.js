/**
 * SidebarShell – gemensam wrapper för vänsterpaneler.
 * Samma bakgrund, kant och padding överallt (startsida + projektvy).
 * Använd runt SharePointLeftPanel-innehåll och PhaseLeftPanel-innehåll
 * så att layouten känns som en produkt.
 */

import { Platform, View } from 'react-native';
import { SIDEBAR_BG, SIDEBAR_BORDER_COLOR, SIDEBAR_PHASE_WIDTH } from './layoutConstants';

export default function SidebarShell({
  children,
  width,
  style,
  noBorder = false,
}) {
  const effectiveWidth = width ?? SIDEBAR_PHASE_WIDTH;
  return (
    <View
      style={[
        {
          backgroundColor: SIDEBAR_BG,
          borderRightWidth: noBorder ? 0 : 1,
          borderRightColor: SIDEBAR_BORDER_COLOR,
          paddingHorizontal: Platform.OS === 'web' ? 0 : 12,
          flexShrink: 0,
          minHeight: 0,
          alignSelf: 'stretch',
        },
        typeof effectiveWidth === 'number' && { width: effectiveWidth },
        Platform.OS === 'web' && typeof effectiveWidth === 'number' && {
          minWidth: effectiveWidth,
          maxWidth: effectiveWidth,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
