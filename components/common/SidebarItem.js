import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LEFT_NAV } from '../../constants/leftNavTheme';

function resolveFontWeight(weight) {
  if (weight === undefined || weight === null) return undefined;
  return typeof weight === 'number' ? String(weight) : String(weight);
}

/**
 * Shared sidebar row.
 * - Works on native + web (hover/pressed via Pressable)
 * - Supports active + hover styling and optional left/right slots
 * - Uses native onClick / onDoubleClick (no timeout); chevron/children use stopPropagation to avoid row click
 */
export default function SidebarItem({
  label,
  onPress,
  onDoubleClick,
  onLongPress,
  onContextMenu,
  disabled = false,
  active = false,
  hovered: hoveredProp,
  muted = false,
  squareCorners = false,
  indent = 0,
  indentMode = 'margin',
  fullWidth = true,
  left,
  right,
  count,
  labelWeight,
  style,
  labelStyle,
  testID,
  accessibilityLabel,
  onHoverIn,
  onHoverOut,
}) {
  const showCount = typeof count === 'number' && Number.isFinite(count);
  const basePaddingHorizontal = LEFT_NAV.rowPaddingHorizontal;

  const isWeb = Platform.OS === 'web';

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onDoubleClick={isWeb && typeof onDoubleClick === 'function' ? onDoubleClick : undefined}
      onContextMenu={Platform.OS === 'web' ? onContextMenu : undefined}
      onHoverIn={Platform.OS === 'web' ? onHoverIn : undefined}
      onHoverOut={Platform.OS === 'web' ? onHoverOut : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof label === 'string' ? label : undefined)}
      style={({ hovered, pressed }) => {
        const isHovered = typeof hoveredProp === 'boolean' ? hoveredProp : Boolean(Platform.OS === 'web' && hovered);
        const backgroundColor = active
          ? LEFT_NAV.activeBg
          : isHovered
            ? LEFT_NAV.hoverBg
            : 'transparent';

        const borderRadius = squareCorners ? 0 : LEFT_NAV.rowBorderRadius;

        const isPaddingIndent = indentMode === 'padding';
        const paddingLeft = isPaddingIndent ? basePaddingHorizontal + Math.max(0, indent) : undefined;
        const paddingRight = isPaddingIndent ? basePaddingHorizontal : undefined;
        const marginLeft = isPaddingIndent ? 0 : indent;

        const widthStyle = fullWidth ? { width: '100%', alignSelf: 'stretch' } : null;

        return [
          styles.row,
          {
            marginLeft,
            ...(isPaddingIndent ? { paddingLeft, paddingRight } : {}),
            ...(widthStyle || {}),
            opacity: disabled ? 0.6 : 1,
            backgroundColor,
            borderLeftColor: active ? LEFT_NAV.activeBorder : 'transparent',
            borderRadius,
          },
          pressed ? styles.rowPressed : null,
          style,
        ];
      }}
    >
      {({ hovered, pressed }) => {
        const isHovered = typeof hoveredProp === 'boolean' ? hoveredProp : Boolean(Platform.OS === 'web' && hovered);
        const state = { hovered: isHovered, pressed, active, disabled, muted };

        const textColor = active
          ? LEFT_NAV.accent
          : isHovered
            ? LEFT_NAV.hoverText
            : muted
              ? LEFT_NAV.textMuted
              : LEFT_NAV.textDefault;

        const renderedLeft = typeof left === 'function' ? left(state) : left;
        const renderedRight = typeof right === 'function' ? right(state) : right;

        return (
          <>
            {renderedLeft ? <View style={styles.left}>{renderedLeft}</View> : null}

            {label ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  {
                    color: textColor,
                    fontWeight: resolveFontWeight(labelWeight) || (active ? '600' : '500'),
                    ...(Platform.OS === 'web' && LEFT_NAV.webFontFamily
                      ? { fontFamily: LEFT_NAV.webFontFamily }
                      : {}),
                  },
                  labelStyle,
                ]}
              >
                {label}
              </Text>
            ) : null}

            {renderedRight ? <View style={styles.right}>{renderedRight}</View> : null}

            {!renderedRight && showCount ? (
              <View style={styles.countPill}>
                <Text
                  style={[
                    styles.countText,
                    {
                      color: active ? LEFT_NAV.accent : muted ? LEFT_NAV.textMuted : LEFT_NAV.textDefault,
                      ...(Platform.OS === 'web' && LEFT_NAV.webFontFamily
                        ? { fontFamily: LEFT_NAV.webFontFamily }
                        : {}),
                    },
                  ]}
                >
                  {String(count)}
                </Text>
              </View>
            ) : null}
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: LEFT_NAV.rowPaddingVertical,
    paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
    borderRadius: LEFT_NAV.rowBorderRadius,
    borderLeftWidth: LEFT_NAV.rowBorderLeftWidth,
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s ease, border-left-color 0.15s ease, opacity 0.15s ease',
        }
      : {}),
  },
  rowPressed: {
    opacity: Platform.OS === 'web' ? 0.92 : 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: LEFT_NAV.rowIconGap,
  },
  label: {
    fontSize: LEFT_NAV.rowFontSize,
    flex: 1,
  },
  right: {
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countPill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: LEFT_NAV.countPillBg,
    borderWidth: 1,
    borderColor: LEFT_NAV.countPillBorder,
  },
  countText: {
    fontSize: LEFT_NAV.countTextSize,
    fontWeight: '700',
  },
});
