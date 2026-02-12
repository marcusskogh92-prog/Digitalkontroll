import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

// Hanterar vänster/höger kolumnbredder + collapse + pan-responders för HomeScreen
const LEFT_PANEL_EXPANDED_DEFAULT = 280;
const LEFT_PANEL_COLLAPSED_WIDTH = 64;
const LEFT_PANEL_MIN_WIDTH = 180;
const LEFT_PANEL_MAX_WIDTH = 480;
const RIGHT_PANEL_MIN = 340;
const RIGHT_PANEL_MAX = 520;

export const useHomePaneResizing = () => {
  // Standard vid inloggning: vänster stängd, höger (kalender) öppen
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(true);
  const [leftWidth, setLeftWidth] = useState(LEFT_PANEL_EXPANDED_DEFAULT);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);
  const initialLeftRef = useRef(0);
  const effectiveLeftWidth = leftPanelCollapsed ? LEFT_PANEL_COLLAPSED_WIDTH : leftWidth;

  // Right column resizer state (default 420)
  const [rightWidth, setRightWidth] = useState(420);
  const rightWidthRef = useRef(rightWidth);
  useEffect(() => {
    rightWidthRef.current = rightWidth;
  }, [rightWidth]);
  const initialRightRef = useRef(0);

  // PanResponder for resizing the left column (works on web + native)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, // Låt ScrollView hantera först
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Aktivera bara om det är en tydlig horisontell drag (minst 10px och mer horisontell än vertikal)
        const dx = Math.abs(gestureState.dx || 0);
        const dy = Math.abs(gestureState.dy || 0);
        return dx > 10 && dx > dy * 1.5; // Kräv att horisontell rörelse är minst 1.5x större än vertikal
      },
      onPanResponderGrant: () => {
        initialLeftRef.current = leftWidthRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        const dx = gestureState.dx || 0;
        const newWidth = Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(LEFT_PANEL_MAX_WIDTH, initialLeftRef.current + dx));
        setLeftWidth(newWidth);
      },
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    }),
  ).current;

  // PanResponder for resizing the right column (works on web + native)
  const panResponderRight = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, // Låt ScrollView hantera först
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Aktivera bara om det är en tydlig horisontell drag (minst 10px och mer horisontell än vertikal)
        const dx = Math.abs(gestureState.dx || 0);
        const dy = Math.abs(gestureState.dy || 0);
        return dx > 10 && dx > dy * 1.5; // Kräv att horisontell rörelse är minst 1.5x större än vertikal
      },
      onPanResponderGrant: () => {
        initialRightRef.current = rightWidthRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        const dx = gestureState.dx || 0;
        // Dragging the left edge: moving right (dx>0) should decrease width, moving left (dx<0) should increase
        const newWidth = Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, initialRightRef.current - dx));
        setRightWidth(newWidth);
      },
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    }),
  ).current;

  // Ensure panes start at reasonable widths on web after first mount
  const initialPaneWidthsSetRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web' && !initialPaneWidthsSetRef.current) {
      setLeftWidth(LEFT_PANEL_EXPANDED_DEFAULT);
      setRightWidth(420);
      initialPaneWidthsSetRef.current = true;
    }
  }, []);

  // Web: steglös resize med mus (PanResponder fungerar dåligt i web)
  const leftResizeHandlersWeb = useMemo(() => ({
    onMouseDown(e) {
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftWidthRef.current;
      const onMouseMove = (e2) => {
        const dx = e2.clientX - startX;
        setLeftWidth(Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(LEFT_PANEL_MAX_WIDTH, startW + dx)));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
  }), []);

  const rightResizeHandlersWeb = useMemo(() => ({
    onMouseDown(e) {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightWidthRef.current;
      const onMouseMove = (e2) => {
        const dx = e2.clientX - startX;
        setRightWidth(Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, startW - dx)));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
  }), []);

  const leftResizeHandlers = Platform.OS === 'web' ? leftResizeHandlersWeb : panResponder.panHandlers;
  const rightResizeHandlers = Platform.OS === 'web' ? rightResizeHandlersWeb : panResponderRight.panHandlers;

  return {
    leftWidth,
    setLeftWidth,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    effectiveLeftWidth,
    rightWidth,
    panResponder,
    panResponderRight,
    leftResizeHandlers,
    rightResizeHandlers,
  };
};

export default useHomePaneResizing;
