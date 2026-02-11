import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

// Hanterar vänster/höger kolumnbredder + collapse + pan-responders för HomeScreen
const LEFT_PANEL_EXPANDED_DEFAULT = 240;
const LEFT_PANEL_COLLAPSED_WIDTH = 64;
const LEFT_PANEL_MIN_WIDTH = 180;
const LEFT_PANEL_MAX_WIDTH = 480;

export const useHomePaneResizing = () => {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
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
        const newWidth = Math.max(340, Math.min(520, initialRightRef.current - dx));
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

  return {
    leftWidth,
    setLeftWidth,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    effectiveLeftWidth,
    rightWidth,
    panResponder,
    panResponderRight,
  };
};

export default useHomePaneResizing;
