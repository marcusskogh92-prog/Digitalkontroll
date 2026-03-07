import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, PanResponder, View, StyleSheet } from 'react-native';

const DIVIDER_HEIGHT = 10;
const MIN_TOP_RATIO = 0.2;
const MIN_BOTTOM_RATIO = 0.2;
const DEFAULT_TOP_RATIO = 0.5;

/**
 * Vertikal split med steglöst justerbar divider.
 * topRatio 0..1 = andel av höjden som övre panelen får.
 */
export default function ResizableVerticalSplit({
  topChild,
  bottomChild,
  initialTopRatio = DEFAULT_TOP_RATIO,
  minTopRatio = MIN_TOP_RATIO,
  minBottomRatio = MIN_BOTTOM_RATIO,
  containerStyle,
}) {
  const [topRatio, setTopRatio] = useState(() => Math.max(minTopRatio, Math.min(1 - minBottomRatio, initialTopRatio)));
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const containerHeightRef = useRef(400);
  const ratioAtStartRef = useRef(topRatio);
  ratioAtStartRef.current = topRatio;

  const maxTop = 1 - minBottomRatio;

  const updateRatioFromClientY = useCallback(
    (clientY) => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      if (typeof el.getBoundingClientRect !== 'function') return;
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top;
      const h = rect.height;
      if (h <= 0) return;
      let r = y / h;
      r = Math.max(minTopRatio, Math.min(maxTop, r));
      setTopRatio(r);
    },
    [minTopRatio, maxTop],
  );

  // Web: global mouse move/up when dragging
  useEffect(() => {
    if (!isDragging || Platform.OS !== 'web') return;
    const onMove = (e) => {
      e.preventDefault();
      updateRatioFromClientY(e.clientY);
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener('mousemove', onMove, { capture: true, passive: false });
    document.addEventListener('mouseup', onUp, { capture: true });
    if (Platform.OS === 'web' && typeof document.body?.style !== 'undefined') {
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', onMove, { capture: true });
      document.removeEventListener('mouseup', onUp, { capture: true });
      if (Platform.OS === 'web' && typeof document.body?.style !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [isDragging, updateRatioFromClientY]);

  const handleDividerMouseDown = useCallback(
    (e) => {
      if (Platform.OS === 'web') {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        updateRatioFromClientY(e.clientY);
      }
    },
    [updateRatioFromClientY],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        ratioAtStartRef.current = ratioAtStartRef.current;
        setIsDragging(true);
      },
      onPanResponderMove: (_, gestureState) => {
        const h = containerHeightRef.current;
        if (h <= 0) return;
        const dy = gestureState.dy || 0;
        const deltaRatio = dy / h;
        let r = ratioAtStartRef.current + deltaRatio;
        r = Math.max(minTopRatio, Math.min(maxTop, r));
        setTopRatio(r);
      },
      onPanResponderRelease: () => setIsDragging(false),
      onPanResponderTerminate: () => setIsDragging(false),
    }),
  ).current;

  const onContainerLayout = useCallback((e) => {
    const h = e.nativeEvent?.layout?.height;
    if (Number.isFinite(h) && h > 0) containerHeightRef.current = h;
  }, []);

  return (
    <View ref={containerRef} style={[styles.container, containerStyle]} onLayout={onContainerLayout} collapsable={false}>
      <View style={[styles.panel, { flex: topRatio }]}>{topChild}</View>
      <View
        style={styles.dividerWrap}
        onMouseDown={handleDividerMouseDown}
        {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
        {...(Platform.OS === 'web' ? { cursor: 'ns-resize' } : {})}
      >
        <View style={[styles.divider, isDragging && styles.dividerActive]} />
      </View>
      <View style={[styles.panel, { flex: 1 - topRatio }]}>{bottomChild}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  panel: {
    minHeight: 0,
    overflow: 'hidden',
  },
  dividerWrap: {
    height: DIVIDER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'stretch',
    flexShrink: 0,
    ...(Platform.OS === 'web' ? { cursor: 'ns-resize' } : {}),
  },
  divider: {
    height: 4,
    backgroundColor: 'transparent',
    borderRadius: 2,
    marginHorizontal: 8,
  },
  dividerActive: {
    backgroundColor: '#94A3B8',
  },
});
