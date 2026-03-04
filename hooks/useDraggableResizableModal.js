/**
 * useDraggableResizableModal – för webb: draggable (drag i bannern) och resizable (osynliga zoner vid kanter/hörn).
 * Windows-liknande: inga synliga handtag; vid hover nära kant visas cursor + subtil kantmarkering.
 * På native returnerar hooken neutrala värden (ingen drag/resize).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

const MIN_W = 400;
const MIN_H = 300;
const DEFAULT_W = 900;
const DEFAULT_H = 600;
const RESIZE_ZONE_PX = 8;
const HOVER_BORDER = '1px solid rgba(0,0,0,0.12)';

function getInitialPositionAndSize(winW, winH, defaultWidth, defaultHeight) {
  const w = typeof defaultWidth === 'number' ? defaultWidth : Math.min(DEFAULT_W, Math.floor(winW * 0.9));
  const h = typeof defaultHeight === 'number' ? defaultHeight : Math.min(DEFAULT_H, Math.floor(winH * 0.85));
  const x = Math.max(0, Math.floor((winW - w) / 2));
  const y = Math.max(0, Math.floor((winH - h) / 2));
  return { x, y, w, h };
}

const CURSORS = {
  e: 'ew-resize',
  w: 'ew-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

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
  const [hoverResizeZone, setHoverResizeZone] = useState(null);
  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, left: 0, top: 0, direction: '' });

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
        let newLeft = start.left;
        let newTop = start.top;
        if (start.direction.includes('e')) newW = Math.max(minWidth, start.w + (clientX - start.x));
        if (start.direction.includes('w')) {
          const dw = start.x - clientX;
          newW = Math.max(minWidth, start.w + dw);
          newLeft = start.left + (start.w - newW);
        }
        if (start.direction.includes('s')) newH = Math.max(minHeight, start.h + (clientY - start.y));
        if (start.direction.includes('n')) {
          newH = Math.max(minHeight, start.h + (start.y - clientY));
          newTop = start.top + start.h - newH;
        }
        setSize({ w: newW, h: newH });
        setPosition((prev) => ({
          ...prev,
          ...(start.direction.includes('w') ? { x: newLeft } : {}),
          ...(start.direction.includes('n') ? { y: newTop } : {}),
        }));
        resizeStart.current = { ...start, w: newW, h: newH, left: newLeft, top: newTop, x: clientX, y: clientY };
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        dragStart.current = { x: 0, y: 0, left: 0, top: 0 };
      }
      if (isResizing) {
        setIsResizing(false);
        setHoverResizeZone(null);
        resizeStart.current = { x: 0, y: 0, w: 0, h: 0, left: 0, top: 0, direction: '' };
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
    ...(isWeb ? { style: { cursor: isDragging ? 'grabbing' : 'move' } } : {}),
  };

  const zone = RESIZE_ZONE_PX;
  const isHover = (d) => hoverResizeZone === d;
  const getHoverBorder = (d) => {
    if (!isWeb || !isHover(d)) return {};
    if (d === 'e') return { borderRight: HOVER_BORDER };
    if (d === 'w') return { borderLeft: HOVER_BORDER };
    if (d === 's') return { borderBottom: HOVER_BORDER };
    if (d === 'n') return { borderTop: HOVER_BORDER };
    const o = {};
    if (d.startsWith('n')) o.borderTop = HOVER_BORDER;
    if (d.startsWith('s')) o.borderBottom = HOVER_BORDER;
    if (d.endsWith('w')) o.borderLeft = HOVER_BORDER;
    if (d.endsWith('e')) o.borderRight = HOVER_BORDER;
    return o;
  };

  const ResizeZone = ({ direction, style }) => (
    <View
      role="presentation"
      style={[
        { position: 'absolute', zIndex: 10 },
        style,
        isWeb && { cursor: CURSORS[direction] },
        getHoverBorder(direction),
      ]}
      onMouseDown={isWeb ? (e) => startResize(e, direction) : undefined}
      onMouseEnter={isWeb ? () => setHoverResizeZone(direction) : undefined}
      onMouseLeave={isWeb ? () => setHoverResizeZone(null) : undefined}
    />
  );

  const resizeHandles = hasPosition ? (
    <>
      <ResizeZone direction="e" style={{ right: 0, top: zone, bottom: zone, width: zone }} />
      <ResizeZone direction="w" style={{ left: 0, top: zone, bottom: zone, width: zone }} />
      <ResizeZone direction="s" style={{ left: zone, right: zone, bottom: 0, height: zone }} />
      <ResizeZone direction="n" style={{ left: zone, right: zone, top: 0, height: zone }} />
      <ResizeZone direction="ne" style={{ right: 0, top: 0, width: zone, height: zone, zIndex: 11 }} />
      <ResizeZone direction="nw" style={{ left: 0, top: 0, width: zone, height: zone, zIndex: 11 }} />
      <ResizeZone direction="se" style={{ right: 0, bottom: 0, width: zone, height: zone, zIndex: 11 }} />
      <ResizeZone direction="sw" style={{ left: 0, bottom: 0, width: zone, height: zone, zIndex: 11 }} />
    </>
  ) : null;

  return {
    boxStyle,
    overlayStyle,
    headerProps,
    resizeHandles,
  };
}
