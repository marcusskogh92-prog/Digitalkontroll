import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

// Hanterar vänster/höger kolumnbredder + pan-responders för HomeScreen (web + native)
export const useHomePaneResizing = () => {
  // Left column resizer state (default 300 för bättre bredd på web)
  const [leftWidth, setLeftWidth] = useState(300);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);
  const initialLeftRef = useRef(0);

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
        const newWidth = Math.max(240, Math.min(800, initialLeftRef.current + dx));
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
      setLeftWidth(300); // Startbredd för left panel
      setRightWidth(420); // Behåll default
      initialPaneWidthsSetRef.current = true;
    }
  }, []);

  return {
    leftWidth,
    rightWidth,
    panResponder,
    panResponderRight,
  };
};

export default useHomePaneResizing;
