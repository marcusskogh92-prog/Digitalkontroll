/**
 * useDraggableResizableModal – för webb: gör modal draggable (drag i bannern) och resizable (dra i kant/hörn).
 * Steglös flytt och storleksändring som ett Windows-fönster.
 * På native returnerar hooken neutrala värden (ingen drag/resize).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

const MIN_W = 400;
const MIN_H = 300;
const DEFAULT_W = 900;
const DEFAULT_H = 600;

function getInitialPositionAndSize(winW, winH, defaultWidth, defaultHeight) {
  const w = typeof defaultWidth === 'number' ? defaultWidth : Math.min(DEFAULT_W, Math.floor(winW * 0.9));
  const h = typeof defaultHeight === 'number' ? defaultHeight : Math.min(DEFAULT_H, Math.floor(winH * 0.85));
  const x = Math.max(0, Math.floor((winW - w) / 2));
  const y = Math.max(0, Math.floor((winH - h) / 2));
  return { x, y, w, h };
}

export function useDraggableResizableModal(visible, options = {}) {
  const isWeb = Platform.OS === 'web';
  const {
    defaultWidth = DEFAULT_W,
    defaultHeight = DEFAULT_H,
    minWidth = MIN_W,
    minHeight = MIN_H,
  } = options;

  const [position, setPosition] = useState(null);
  const [size, setSize] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, direction: '' });

  // Vid öppning: centrera och sätt standardstorlek
  useEffect(() => {
    if (!isWeb || !visible) return;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
    const { x, y, w, h } = getInitialPositionAndSize(winW, winH, defaultWidth, defaultHeight);
    setPosition({ x, y });
    setSize({ w, h });
  }, [visible, isWeb, defaultWidth, defaultHeight]);

  const startDrag = useCallback(
    (e) => {
      if (!isWeb || !position || !size) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      dragStart.current = {
        x: e.clientX ?? e.nativeEvent?.pageX ?? 0,
        y: e.clientY ?? e.nativeEvent?.pageY ?? 0,
        left: position.x,
        top: position.y,
      };
      setIsDragging(true);
    },
    [isWeb, position]
  );

  const startResize = useCallback(
    (e, direction) => {
      if (!isWeb || !size || !position) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      resizeStart.current = {
        x: e.clientX ?? e.nativeEvent?.pageX ?? 0,
        y: e.clientY ?? e.nativeEvent?.pageY ?? 0,
        w: size.w,
        h: size.h,
        left: position.x,
        top: position.y,
        direction,
      };
      setIsResizing(true);
    },
    [isWeb, size, position]
  );

  useEffect(() => {
    if (!isWeb) return;

    const handleMouseMove = (e) => {
      const clientX = e.clientX ?? 0;
      const clientY = e.clientY ?? 0;

      if (isDragging) {
        const dx = clientX - dragStart.current.x;
        const dy = clientY - dragStart.current.y;
        setPosition({
          x: Math.max(0, dragStart.current.left + dx),
          y: Math.max(0, dragStart.current.top + dy),
        });
      } else if (isResizing) {
        const start = resizeStart.current;
        let newW = start.w;
        let newH = start.h;
        if (start.direction.includes('e')) newW = Math.max(minWidth, start.w + (clientX - start.x));
        if (start.direction.includes('s')) newH = Math.max(minHeight, start.h + (clientY - start.y));
        setSize({ w: newW, h: newH });
        resizeStart.current = { ...start, w: newW, h: newH, x: clientX, y: clientY };
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        dragStart.current = { x: 0, y: 0, left: 0, top: 0 };
      }
      if (isResizing) {
        setIsResizing(false);
        resizeStart.current = { x: 0, y: 0, w: 0, h: 0, direction: '' };
      }
    };

    if (isDragging || isResizing) {
      if (typeof document !== 'undefined') {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isWeb, isDragging, isResizing, minWidth, minHeight]);

  if (!isWeb || !visible) {
    return {
      boxStyle: {},
      overlayStyle: {},
      headerProps: {},
      resizeHandles: null,
    };
  }

  const hasPosition = position && size && typeof position.x === 'number' && typeof size.w === 'number';

  const boxStyle = hasPosition
    ? {
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: size.w,
        height: size.h,
        maxWidth: 'none',
        maxHeight: 'none',
        ...(isWeb ? { cursor: isDragging ? 'grabbing' : undefined } : {}),
      }
    : {};

  const overlayStyle = hasPosition
    ? { justifyContent: 'flex-start', alignItems: 'flex-start' }
    : {};

  const headerProps = {
    onMouseDown: startDrag,
    ...(isWeb ? { style: [{ cursor: isDragging ? 'grabbing' : 'move' }] } : {}),
  };

  /* Resize-handles: vid kant/hörn visas muspekaren som streck med pilar (Windows-liknande) för att markera storleksändring */
  const resizeHandles = hasPosition ? (
    <>
      <View
        role="presentation"
        style={[
          { position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, zIndex: 10 },
          isWeb && { cursor: 'ew-resize' },
        ]}
        {...(isWeb ? { onMouseDown: (e) => startResize(e, 'e') } : {})}
      />
      <View
        role="presentation"
        style={[
          { position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, zIndex: 10 },
          isWeb && { cursor: 'ns-resize' },
        ]}
        {...(isWeb ? { onMouseDown: (e) => startResize(e, 's') } : {})}
      />
      <View
        role="presentation"
        style={[
          { position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, zIndex: 11 },
          isWeb && { cursor: 'nwse-resize' },
        ]}
        {...(isWeb ? { onMouseDown: (e) => startResize(e, 'se') } : {})}
      />
    </>
  ) : null;

  return {
    boxStyle,
    overlayStyle,
    headerProps,
    resizeHandles,
  };
}
