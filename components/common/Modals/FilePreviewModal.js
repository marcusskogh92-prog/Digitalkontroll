import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import FileCommentsPanel from '../FileCommentsPanel';
import { subscribeFileComments } from '../../firebase';
import { classifyFileType } from '../SharePointFiles/sharePointFileUtils';

const POS = Platform.OS === 'web' ? 'fixed' : 'absolute';

const MIN_W = 420;
const MIN_H = 320;
const PAD = 24;

function getInitialRect() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { x: 0, y: 0, w: 900, h: 700 };
  }
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const w = Math.min(Math.max(0.85 * vw, MIN_W), vw - PAD);
  const h = Math.min(Math.max(0.85 * vh, MIN_H), vh - PAD);
  const x = Math.max(PAD / 2, (vw - w) / 2);
  const y = Math.max(PAD / 2, (vh - h) / 2);
  return { x, y, w, h };
}

function clampRect(x, y, w, h) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { x: 0, y: 0, w, h };
  }
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const maxW = vw - PAD;
  const maxH = vh - PAD;
  const nw = Math.min(maxW, Math.max(MIN_W, w));
  const nh = Math.min(maxH, Math.max(MIN_H, h));
  const nx = Math.max(0, Math.min(x, vw - nw - PAD / 2));
  const ny = Math.max(0, Math.min(y, vh - nh - PAD / 2));
  return { x: nx, y: ny, w: nw, h: nh };
}

export default function FilePreviewModal({
  visible,
  onClose,
  fileItem = null,
  onOpenInNewTab,
  maxWidth = 1400,
  companyId = null,
  projectId = null,
  pageNumber = null,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  onRequestPage = null,
  children,
}) {
  const show = !!visible;
  const name = (fileItem && (fileItem.name || fileItem.fileName)) ? String(fileItem.name || fileItem.fileName).trim() : '';
  const openUrl = (fileItem && (fileItem.webUrl || fileItem.downloadUrl)) ? String(fileItem.webUrl || fileItem.downloadUrl).trim() : '';
  const fileId = (fileItem != null && fileItem.id != null && String(fileItem.id).trim()) ? String(fileItem.id).trim() : '';
  const cid = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : '';
  const pid = (projectId != null && String(projectId).trim()) ? String(projectId).trim() : '';
  const showComments = Boolean(cid && pid && fileId);

  const [fileComments, setFileComments] = useState([]);
  useEffect(() => {
    if (!show || !showComments || !cid || !pid || !fileId) {
      setFileComments([]);
      return () => {};
    }
    const unsubscribe = subscribeFileComments(cid, pid, fileId, {
      onData(list) {
        setFileComments(Array.isArray(list) ? list : []);
      },
      onError() {
        setFileComments([]);
      },
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [show, showComments, cid, pid, fileId]);

  const commentCountByPage = useMemo(() => {
    const byPage = {};
    fileComments.forEach((c) => {
      const p = c.pageNumber ?? c.anchor?.pageNumber ?? null;
      const key = p != null && Number.isFinite(Number(p)) && Number(p) > 0 ? Number(p) : 0;
      byPage[key] = (byPage[key] || 0) + 1;
    });
    return byPage;
  }, [fileComments]);

  const typeMeta = useMemo(() => classifyFileType(name), [name]);
  const typeLabel = (typeMeta?.label || 'FIL').toUpperCase();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(true);
  const [rect, setRect] = useState(getInitialRect);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);

  const keyHandlerEnabled = Platform.OS === 'web' && show;
  const containerRef = useRef(null);
  const headerRef = useRef(null);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (show && isWeb) {
      setRect(getInitialRect());
      setIsFullscreen(false);
      if (showComments) setCommentsPanelOpen(true);
    }
  }, [show, isWeb, showComments]);

  useEffect(() => {
    if (!isWeb) return;
    if (!show) return;
    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body) return;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [show, isWeb]);

  useEffect(() => {
    if (!keyHandlerEnabled) return;
    const handler = (e) => {
      const key = String(e?.key || '');
      if (key === 'Escape') {
        e.preventDefault?.();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (typeof onClose === 'function') {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [keyHandlerEnabled, onClose, isFullscreen]);

  const handleHeaderMouseDown = useCallback((e) => {
    if (!isWeb || isFullscreen) return;
    if (e.button !== 0) return;
    const target = e.target;
    if (target && typeof target.closest === 'function' && target.closest('[data-resize-handle]')) return;
    e.preventDefault?.();
    setDragState({ startX: e.clientX, startY: e.clientY, startRect: rect });
  }, [isWeb, isFullscreen, rect]);

  const handleResizeMouseDown = useCallback((e, edge) => {
    if (!isWeb || isFullscreen) return;
    if (e.button !== 0) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    setResizeState({
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startRect: rect,
    });
  }, [isWeb, isFullscreen, rect]);

  useEffect(() => {
    if (!isWeb || !dragState) return;
    let lastX = dragState.startX;
    let lastY = dragState.startY;
    let lastRect = dragState.startRect;
    const onMove = (e) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const nx = Math.max(0, Math.min(lastRect.x + dx, vw - lastRect.w - PAD / 2));
      const ny = Math.max(0, Math.min(lastRect.y + dy, vh - lastRect.h - PAD / 2));
      lastRect = { ...lastRect, x: nx, y: ny };
      setRect(lastRect);
    };
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isWeb, dragState]);

  useEffect(() => {
    if (!isWeb || !resizeState) return;
    const { edge, startX, startY, startRect } = resizeState;
    const onMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let { x, y, w, h } = startRect;
      if (edge.includes('e')) w = Math.max(MIN_W, w + dx);
      if (edge.includes('w')) {
        const dw = Math.min(dx, w - MIN_W);
        x += dw;
        w -= dw;
      }
      if (edge.includes('s')) h = Math.max(MIN_H, h + dy);
      if (edge.includes('n')) {
        const dh = Math.min(dy, h - MIN_H);
        y += dh;
        h -= dh;
      }
      setRect(clampRect(x, y, w, h));
    };
    const onUp = () => setResizeState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isWeb, resizeState]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  const cardStyle = useMemo(() => {
    if (Platform.OS !== 'web') {
      return {
        width: '100%',
        maxWidth: typeof maxWidth === 'number' ? maxWidth : '90vw',
        height: '90%',
        maxHeight: '90%',
      };
    }
    if (isFullscreen) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh',
        borderRadius: 0,
      };
    }
    return {
      position: 'fixed',
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      maxWidth: rect.w,
      maxHeight: rect.h,
    };
  }, [maxWidth, isFullscreen, rect.x, rect.y, rect.w, rect.h]);

  if (!show) return null;

  const hasZoom = typeof onZoomIn === 'function' && typeof onZoomOut === 'function';
  const isWordFile = typeMeta?.kind === 'word';
  const ZOOM_MIN = 50;
  const ZOOM_MAX = isWordFile ? 150 : 300;
  const ZOOM_STEP = 5;
  const zoomValue = zoomLevel != null && Number.isFinite(Number(zoomLevel)) ? Number(zoomLevel) : 1;
  const zoomPct = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomValue * 100)));
  const handleZoomSliderChange = useCallback(
    (pct) => {
      const v = Math.max(50, Math.min(isWordFile ? 150 : 300, Number(pct))) / 100;
      if (typeof onZoomChange === 'function') onZoomChange(v);
    },
    [onZoomChange, isWordFile]
  );

  const headerContent = (
    <View
      ref={headerRef}
      style={[styles.header, isWeb && !isFullscreen ? styles.headerDraggable : null]}
      onMouseDown={isWeb ? handleHeaderMouseDown : undefined}
      {...(isWeb ? { onDoubleClick: () => setIsFullscreen((prev) => !prev) } : {})}
    >
      <View style={styles.headerLeft}>
        <Ionicons name={typeMeta.icon} size={20} color="#1976D2" />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {name ? `${name} (${typeLabel})` : 'Förhandsvisning'}
        </Text>
      </View>
      <View style={styles.headerRight}>
        {hasZoom ? (
          <View style={styles.headerZoomRow}>
            <Pressable
              onPress={() => onZoomOut?.()}
              style={({ hovered, pressed }) => [styles.headerBtn, styles.headerZoomBtn, (hovered || pressed) && styles.headerBtnHover]}
              accessibilityLabel="Zooma ut"
              {...(Platform.OS === 'web' ? { title: 'Zooma ut' } : {})}
            >
              <Ionicons name="remove-outline" size={18} color="#1976D2" />
            </Pressable>
            <View style={styles.headerZoomScale}>
              {Platform.OS === 'web' && typeof onZoomChange === 'function' ? (
                <input
                  type="range"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={ZOOM_STEP}
                  value={zoomPct}
                  onChange={(e) => handleZoomSliderChange(Number(e.target.value))}
                  style={{
                    width: '100%',
                    minWidth: 80,
                    maxWidth: 120,
                    height: 6,
                    accentColor: '#1976D2',
                    cursor: 'pointer',
                  }}
                  aria-label="Zoomnivå"
                />
              ) : null}
              <Text style={styles.headerZoomLabel}>{zoomPct}%</Text>
            </View>
            <Pressable
              onPress={() => onZoomIn?.()}
              style={({ hovered, pressed }) => [styles.headerBtn, styles.headerZoomBtn, (hovered || pressed) && styles.headerBtnHover]}
              accessibilityLabel="Zooma in"
              {...(Platform.OS === 'web' ? { title: 'Zooma in' } : {})}
            >
              <Ionicons name="add-outline" size={18} color="#1976D2" />
            </Pressable>
          </View>
        ) : null}
        {showComments ? (
          <Pressable
            onPress={() => setCommentsPanelOpen((prev) => !prev)}
            style={({ hovered, pressed }) => [
              styles.headerBtn,
              (hovered || pressed) && styles.headerBtnHover,
              commentsPanelOpen && styles.headerBtnActive,
            ]}
            accessibilityLabel={commentsPanelOpen ? 'Dölj kommentarer' : 'Visa kommentarer'}
            {...(Platform.OS === 'web' ? { title: commentsPanelOpen ? 'Dölj kommentarer' : 'Visa kommentarer' } : {})}
          >
            <Ionicons name={commentsPanelOpen ? 'chatbubbles' : 'chatbubbles-outline'} size={18} color="#1976D2" />
            {Platform.OS === 'web' ? <Text style={styles.headerBtnLabel}>{commentsPanelOpen ? 'Dölj kommentarer' : 'Kommentarer'}</Text> : null}
          </Pressable>
        ) : null}
        <Pressable
          onPress={toggleFullscreen}
          style={({ hovered, pressed }) => [styles.headerBtn, (hovered || pressed) && styles.headerBtnHover]}
          accessibilityLabel={isFullscreen ? 'Avsluta helskärm' : 'Helskärm'}
          {...(Platform.OS === 'web' ? { title: isFullscreen ? 'Avsluta helskärm' : 'Helskärm' } : {})}
        >
          <Ionicons name={isFullscreen ? 'contract-outline' : 'expand-outline'} size={18} color="#1976D2" />
          {Platform.OS === 'web' ? <Text style={styles.headerBtnLabel}>{isFullscreen ? 'Avsluta helskärm' : 'Helskärm'}</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => onOpenInNewTab?.(openUrl)}
          disabled={!openUrl}
          style={({ hovered, pressed }) => [styles.headerBtn, (hovered || pressed) && styles.headerBtnHover]}
          accessibilityLabel="Öppna i ny flik"
          {...(Platform.OS === 'web' ? { title: 'Öppna i ny flik' } : {})}
        >
          <Ionicons name="open-outline" size={18} color="#1976D2" />
          {Platform.OS === 'web' ? <Text style={styles.headerBtnLabel}>Öppna i ny flik</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => typeof onClose === 'function' && onClose()}
          style={({ hovered, pressed }) => [styles.headerBtn, (hovered || pressed) && styles.headerBtnHover]}
          accessibilityLabel="Stäng"
          {...(Platform.OS === 'web' ? { title: 'Stäng' } : {})}
        >
          <Ionicons name="close" size={20} color="#475569" />
        </Pressable>
      </View>
    </View>
  );

  const resizeHandles = isWeb && !isFullscreen ? (
    <>
      <View data-resize-handle data-edge="n" style={[styles.resizeHandle, styles.resizeN]} onMouseDown={(e) => handleResizeMouseDown(e, 'n')} />
      <View data-resize-handle data-edge="s" style={[styles.resizeHandle, styles.resizeS]} onMouseDown={(e) => handleResizeMouseDown(e, 's')} />
      <View data-resize-handle data-edge="e" style={[styles.resizeHandle, styles.resizeE]} onMouseDown={(e) => handleResizeMouseDown(e, 'e')} />
      <View data-resize-handle data-edge="w" style={[styles.resizeHandle, styles.resizeW]} onMouseDown={(e) => handleResizeMouseDown(e, 'w')} />
      <View data-resize-handle data-edge="ne" style={[styles.resizeHandle, styles.resizeNe]} onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} />
      <View data-resize-handle data-edge="nw" style={[styles.resizeHandle, styles.resizeNw]} onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} />
      <View data-resize-handle data-edge="se" style={[styles.resizeHandle, styles.resizeSe]} onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
      <View data-resize-handle data-edge="sw" style={[styles.resizeHandle, styles.resizeSw]} onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} />
    </>
  ) : null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (isFullscreen) setIsFullscreen(false);
        else if (typeof onClose === 'function') onClose();
      }}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={() => {
            if (isFullscreen) setIsFullscreen(false);
            else if (typeof onClose === 'function') onClose();
          }}
        />
        <View
          ref={containerRef}
          style={[styles.card, cardStyle]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => {}}
          pointerEvents="box-none"
        >
          {headerContent}
          <View style={[styles.body, showComments && commentsPanelOpen && styles.bodyRow]}>
            <View style={styles.previewArea} pointerEvents="box-none">
              {React.Children.count(children) === 1 && React.isValidElement(children)
                ? React.cloneElement(children, { commentCountByPage })
                : children}
            </View>
            {showComments && commentsPanelOpen ? (
              <View style={styles.commentsColumn}>
                <View style={styles.commentsPanelWrap}>
                  <FileCommentsPanel
                    companyId={cid}
                    projectId={pid}
                    fileId={fileId}
                    fileName={name}
                    pageNumber={pageNumber}
                    variant="sidebar"
                    comments={fileComments}
                    onNavigateToPage={typeof onRequestPage === 'function' ? onRequestPage : undefined}
                  />
                </View>
              </View>
            ) : null}
          </View>
          {resizeHandles}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: POS,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: PAD,
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 14px 40px rgba(0,0,0,0.30)' } : { elevation: 8 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(25, 118, 210, 0.2)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(25, 118, 210, 0.3)',
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
    gap: 12,
  },
  headerDraggable: {
    ...(Platform.OS === 'web' ? { cursor: 'move' } : {}),
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  headerBtnHover: {
    backgroundColor: 'rgba(25, 118, 210, 0.12)',
  },
  headerBtnLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  headerZoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerZoomBtn: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  headerZoomScale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 80,
  },
  headerZoomLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    minWidth: 40,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  bodyRow: {
    flexDirection: 'row',
  },
  previewArea: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  commentsColumn: {
    width: 400,
    minWidth: 400,
    maxWidth: 400,
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    backgroundColor: 'transparent',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    flexShrink: 0,
    minHeight: 0,
  },
  commentsPanelWrap: {
    maxHeight: '75%',
    minHeight: 280,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    borderTopLeftRadius: 10,
    overflow: 'visible',
    ...(Platform.OS === 'web' ? { boxShadow: '-4px 0 12px rgba(0,0,0,0.08)' } : { elevation: 4 }),
  },
  headerBtnActive: {
    backgroundColor: 'rgba(25, 118, 210, 0.12)',
  },
  resizeHandle: {
    position: 'absolute',
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  resizeN: {
    top: 0,
    left: 12,
    right: 12,
    height: 12,
    ...(Platform.OS === 'web' ? { cursor: 'n-resize' } : {}),
  },
  resizeS: {
    bottom: 0,
    left: 12,
    right: 12,
    height: 12,
    ...(Platform.OS === 'web' ? { cursor: 's-resize' } : {}),
  },
  resizeE: {
    top: 12,
    right: 0,
    bottom: 12,
    width: 12,
    ...(Platform.OS === 'web' ? { cursor: 'e-resize' } : {}),
  },
  resizeW: {
    top: 12,
    left: 0,
    bottom: 12,
    width: 12,
    ...(Platform.OS === 'web' ? { cursor: 'w-resize' } : {}),
  },
  resizeNe: {
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    ...(Platform.OS === 'web' ? { cursor: 'ne-resize' } : {}),
  },
  resizeNw: {
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    ...(Platform.OS === 'web' ? { cursor: 'nw-resize' } : {}),
  },
  resizeSe: {
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    ...(Platform.OS === 'web' ? { cursor: 'se-resize' } : {}),
  },
  resizeSw: {
    bottom: 0,
    left: 0,
    width: 20,
    height: 20,
    ...(Platform.OS === 'web' ? { cursor: 'sw-resize' } : {}),
  },
});
