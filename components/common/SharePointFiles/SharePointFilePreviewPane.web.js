import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Use legacy (non-ESM) pdf.js build on web.
// This avoids runtime crashes in non-module bundles (e.g. "import.meta is only valid inside modules").
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf';

import { getSharePointDriveItemArrayBuffer } from '../../../services/sharepoint/sharePointFileContentService';
import { fileExtFromName, safeText } from './sharePointFileUtils';

let pdfjsConfigured = false;

function isPdfDebugEnabled() {
  try {
    return !!(typeof window !== 'undefined' && window.__DK_PDF_DEBUG__);
  } catch (_e) {
    return false;
  }
}

function logPdfDebug(...args) {
  if (!isPdfDebugEnabled()) return;
  console.debug('[PDFJS]', ...args);
}

function isProbablySafari() {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = safeText(navigator.userAgent);
    // Safari includes "Safari" but Chrome/Edge include "Chrome"/"Edg".
    return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium') && !ua.includes('Edg');
  } catch (_e) {
    return false;
  }
}

function getPdfJs() {
  const pdfjs = pdfjsLegacy?.default || pdfjsLegacy;
  if (pdfjs && !pdfjsConfigured) {
    const override = (() => {
      try {
        return typeof window !== 'undefined' ? safeText(window.__DK_PDF_WORKER_SRC__) : '';
      } catch (_e) {
        return '';
      }
    })();

    const version = safeText(pdfjs?.version) || '2.16.105';
    // Default to a classic worker (.js) from CDN.
    pdfjs.GlobalWorkerOptions.workerSrc =
      override || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;

    pdfjsConfigured = true;
    logPdfDebug('workerSrc', safeText(pdfjs?.GlobalWorkerOptions?.workerSrc));
  }
  return pdfjs;
}

function isImageExt(ext) {
  const e = safeText(ext).toLowerCase();
  return e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'webp';
}

function isOfficeExt(ext) {
  const e = safeText(ext).toLowerCase();
  return e === 'doc' || e === 'docx' || e === 'xls' || e === 'xlsx' || e === 'ppt' || e === 'pptx';
}

function getFileTypeLabel(ext) {
  const e = safeText(ext).toLowerCase();
  if (!e) return 'FIL';
  if (e === 'pdf') return 'PDF';
  if (e === 'doc' || e === 'docx') return 'WORD';
  if (e === 'xls' || e === 'xlsx') return 'EXCEL';
  if (e === 'ppt' || e === 'pptx') return 'POWERPOINT';
  if (isImageExt(e)) return 'BILD';
  return e.toUpperCase();
}

function buildOfficeViewerUrl(sourceUrl) {
  const src = safeText(sourceUrl);
  if (!src) return '';
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;
}

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function usePdfBytes({ enabled, siteId, itemId, preferDownloadUrl }) {
  const [state, setState] = useState({ loading: false, error: '', data: null });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: '', data: null });
      return;
    }

    const sid = safeText(siteId);
    const id = safeText(itemId);
    if (!sid || !id) {
      setState({ loading: false, error: 'Saknar SharePoint-koppling för PDF-preview.', data: null });
      return;
    }

    let cancelled = false;

    setState({ loading: true, error: '', data: null });

    (async () => {
      try {
        const buf = await getSharePointDriveItemArrayBuffer(sid, id, { preferDownloadUrl });
        if (cancelled) return;
        setState({ loading: false, error: '', data: buf });
      } catch (e) {
        if (cancelled) return;
        setState({
          loading: false,
          error: String(e?.message || e || 'Förhandsvisning stöds inte – öppna i ny flik'),
          data: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, siteId, itemId, preferDownloadUrl]);

  return state;
}

function PdfCanvasPage({
  pdf,
  pageNumber,
  scale,
  fitWidth,
  fitPage,
  containerWidth,
  containerHeight,
  onBasePageWidth,
  onRenderError,
  onRenderSuccess,
}) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const callbacksRef = useRef({ onBasePageWidth, onRenderError, onRenderSuccess });

  useEffect(() => {
    callbacksRef.current = { onBasePageWidth, onRenderError, onRenderSuccess };
  }, [onBasePageWidth, onRenderError, onRenderSuccess]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!pdf || !c) return;

    let cancelled = false;

    (async () => {
      try {
        logPdfDebug('getPage', { pageNumber });
        const page = await pdf.getPage(pageNumber);

        const baseViewport = page.getViewport({ scale: 1 });
        const baseWidth = Number(baseViewport?.width);
        if (Number.isFinite(baseWidth) && baseWidth > 0) {
          callbacksRef.current?.onBasePageWidth?.(baseWidth);
        }

        let resolvedScale = clamp(scale || 1, 0.5, 4);
        const baseHeight = Number(baseViewport?.height);

        if (
          fitPage &&
          Number.isFinite(containerWidth) && containerWidth > 0 &&
          Number.isFinite(containerHeight) && containerHeight > 0 &&
          Number.isFinite(baseWidth) && baseWidth > 0 &&
          Number.isFinite(baseHeight) && baseHeight > 0
        ) {
          // Fit entire page into available space.
          const padding = 28;
          const sx = (containerWidth - padding) / baseWidth;
          const sy = (containerHeight - padding) / baseHeight;
          resolvedScale = clamp(Math.min(sx, sy), 0.2, 4);
        } else if (fitWidth && Number.isFinite(containerWidth) && containerWidth > 0 && Number.isFinite(baseWidth) && baseWidth > 0) {
          // Fit to width, but avoid clipping vertically in short containers.
          const paddingX = 16;
          resolvedScale = clamp((containerWidth - paddingX) / baseWidth, 0.5, 4);

          if (
            Number.isFinite(containerHeight) && containerHeight > 0 &&
            Number.isFinite(baseHeight) && baseHeight > 0
          ) {
            const paddingY = 16;
            const maxByHeight = (containerHeight - paddingY) / baseHeight;
            if (Number.isFinite(maxByHeight) && maxByHeight > 0) {
              resolvedScale = clamp(Math.min(resolvedScale, maxByHeight), 0.2, 4);
            }
          }
        }

        const viewportCss = page.getViewport({ scale: resolvedScale });
        const cssWidth = Math.max(1, Math.ceil(viewportCss.width));
        const cssHeight = Math.max(1, Math.ceil(viewportCss.height));

        if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) {
          throw new Error(`Ogiltig canvas-size: ${cssWidth}x${cssHeight}`);
        }

        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

        // WebKit can render blank/black when using the `transform` render parameter.
        // Instead, bake DPR into the viewport scale.
        const viewport = page.getViewport({ scale: resolvedScale * dpr });
        c.width = Math.max(1, Math.floor(viewport.width));
        c.height = Math.max(1, Math.floor(viewport.height));
        c.style.width = `${cssWidth}px`;
        c.style.height = `${cssHeight}px`;

        logPdfDebug('canvas size', { cssWidth, cssHeight, dpr, width: c.width, height: c.height });

        const ctx = c.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Saknar canvas context');

        // Canvas defaults to transparent. Since our preview stage uses a dark background,
        // force a white page background so we don't end up with a "black" preview.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.restore();

        if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
          try { renderTaskRef.current.cancel(); } catch (_e) {}
        }

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;

        logPdfDebug('render start', { pageNumber, scale: resolvedScale, fitWidth: !!fitWidth });

        await task.promise;
        if (cancelled) return;

        logPdfDebug('render done', { pageNumber });
        callbacksRef.current?.onRenderSuccess?.();
      } catch (e) {
        if (cancelled) return;
        logPdfDebug('render error', String(e?.message || e));
        callbacksRef.current?.onRenderError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
        try { renderTaskRef.current.cancel(); } catch (_e) {}
      }
    };
  }, [pdf, pageNumber, scale, fitWidth, fitPage, containerWidth, containerHeight]);

  return (
    <canvas ref={canvasRef} style={styles.pdfCanvas} />
  );
}

function ToolbarButton({ icon, label, onPress, disabled = false }) {
  return (
    <Pressable
      onPress={() => onPress?.()}
      disabled={disabled}
      style={({ hovered, pressed }) => ({
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } : {}),
      })}
    >
      <Ionicons name={icon} size={16} color={label === 'Öppna i ny flik' ? '#1976D2' : '#334155'} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

export default function SharePointFilePreviewPane({
  item,
  variant = 'panel',

  siteId = null,

  onClose,
  onOpenInNewTab,
  onOpenInModal,

  zoom = 1,
  onZoomChange,

  page = 1,
  numPages = null,
  onPageChange,
  onNumPages,
}) {
  const name = safeText(item?.name) || '';
  const ext = fileExtFromName(name);

  const webUrl = safeText(item?.webUrl);
  const downloadUrl = safeText(item?.downloadUrl);

  const preferredUrl = useMemo(() => downloadUrl || webUrl, [downloadUrl, webUrl]);
  const externalUrl = useMemo(() => webUrl || preferredUrl, [webUrl, preferredUrl]);

  const kind = useMemo(() => {
    const e = safeText(ext).toLowerCase();
    if (!e) return 'unknown';
    if (e === 'pdf') return 'pdf';
    if (isImageExt(e)) return 'image';
    if (isOfficeExt(e)) return 'office';
    return 'unsupported';
  }, [ext]);

  const fileTypeLabel = useMemo(() => getFileTypeLabel(ext), [ext]);

  const isCompactPdfPreview = variant === 'panel' && kind === 'pdf';
  const isPdfReview = variant === 'modal' && kind === 'pdf';

  const itemId = safeText(item?.id);

  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerReady = Number.isFinite(containerWidth) && containerWidth > 0 && Number.isFinite(containerHeight) && containerHeight > 0;

  const pdfBytes = usePdfBytes({
    enabled: kind === 'pdf' && !!itemId && (variant === 'modal' || containerReady),
    siteId,
    itemId,
    preferDownloadUrl: downloadUrl,
  });

  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfError, setPdfError] = useState('');
  const [fitWidth, setFitWidth] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [firstPageRendered, setFirstPageRendered] = useState(false);

  const fullscreenTargetRef = useRef(null);

  const activeLoadingTaskRef = useRef(null);
  const activePdfDocRef = useRef(null);

  const [renderCount, setRenderCount] = useState(0);

  const currentPageRef = useRef(1);

  const scrollRef = useRef(null);
  const pageLayoutsRef = useRef({}); // pageNumber -> { y, height }
  const [layoutNonce, setLayoutNonce] = useState(0);
  const wheelAccumRef = useRef(0);
  const lastWheelTsRef = useRef(0);

  const isPageControlled = typeof onPageChange === 'function';
  const isNumPagesControlled = typeof onNumPages === 'function';
  const isZoomControlled = typeof onZoomChange === 'function';

  const [internalPage, setInternalPage] = useState(1);
  const [internalNumPages, setInternalNumPages] = useState(null);
  const [internalZoom, setInternalZoom] = useState(1);

  const resolvedZoom = clamp(isZoomControlled ? (zoom || 1) : internalZoom, 0.5, isCompactPdfPreview ? 1 : 4);
  const resolvedNumPages = Number.isFinite(Number(numPages)) ? Number(numPages) : internalNumPages;
  const resolvedPage = resolvedNumPages
    ? clamp(isPageControlled ? (page || 1) : internalPage, 1, resolvedNumPages)
    : clamp(isPageControlled ? (page || 1) : internalPage, 1, 9999);

  useEffect(() => {
    currentPageRef.current = resolvedPage;
  }, [resolvedPage]);

  useEffect(() => {
    if (kind !== 'pdf') {
      setFirstPageRendered(false);
      return;
    }
    setFirstPageRendered(false);
  }, [kind, itemId, pdfBytes.loading, pdfBytes.error]);

  const requestFullscreen = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    try {
      const el = fullscreenTargetRef.current;
      if (!el) return;
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) return;

      if (doc.fullscreenElement) {
        await doc.exitFullscreen?.();
        return;
      }

      await el.requestFullscreen?.();
    } catch (e) {
      try { console.warn('[PDFJS] fullscreen failed', e); } catch (_e) {}
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return;

    const onFsChange = () => {
      try {
        setIsFullscreen(!!doc.fullscreenElement);
      } catch (_e) {}
    };

    doc.addEventListener?.('fullscreenchange', onFsChange);
    return () => {
      doc.removeEventListener?.('fullscreenchange', onFsChange);
    };
  }, []);

  const setPageValue = useCallback((next) => {
    const n = Number(next);
    if (!Number.isFinite(n) || n <= 0) return;
    if (isPageControlled) onPageChange?.(n);
    else setInternalPage(n);
  }, [isPageControlled, onPageChange]);

  const setZoomValue = useCallback((next) => {
    const z = clamp(next, 0.5, 4);
    if (isZoomControlled) onZoomChange?.(z);
    else setInternalZoom(z);
  }, [isZoomControlled, onZoomChange]);

  const setNumPagesValue = useCallback((next) => {
    const n = Number(next);
    if (!Number.isFinite(n) || n <= 0) return;
    // Always cache internally so we can clamp/disable navigation even if the parent
    // doesn't feed `numPages` back as a prop.
    setInternalNumPages(n);
    if (isNumPagesControlled) onNumPages?.(n);
  }, [isNumPagesControlled, onNumPages]);

  const cleanupPdfResources = useCallback(() => {
    try {
      const task = activeLoadingTaskRef.current;
      activeLoadingTaskRef.current = null;
      if (task && typeof task.destroy === 'function') {
        try { task.destroy(); } catch (_e) {}
      }
    } catch (_e) {}

    try {
      const doc = activePdfDocRef.current;
      activePdfDocRef.current = null;
      if (doc && typeof doc.destroy === 'function') {
        try { doc.destroy(); } catch (_e) {}
      }
    } catch (_e) {}
  }, []);

  useEffect(() => {
    if (kind !== 'pdf') {
      cleanupPdfResources();
      setPdfDoc(null);
      setPdfError('');
      setRenderCount(0);
      return;
    }
    cleanupPdfResources();
    setPdfDoc(null);
    setPdfError('');
    // Default: fit to width in the right-side panel and in review.
    // (Canvas rendering still caps by height to avoid clipping.)
    setFitWidth(true);
    setRenderCount(0);

    pageLayoutsRef.current = {};
    setLayoutNonce((x) => x + 1);
    if (!isPageControlled) setInternalPage(1);
    if (!isNumPagesControlled) setInternalNumPages(null);
    if (!isZoomControlled) setInternalZoom(1);

    if (pdfBytes.loading) return;
    if (pdfBytes.error) {
      setPdfError(pdfBytes.error);
      return;
    }
    if (!pdfBytes.data) return;

    let cancelled = false;

    (async () => {
      try {
        const pdfjs = getPdfJs();
        if (cancelled) return;

        const disableWorkerOverride = (() => {
          try {
            if (typeof window === 'undefined') return null;
            const v = window.__DK_PDF_DISABLE_WORKER__;
            return typeof v === 'boolean' ? v : null;
          } catch (_e) {
            return null;
          }
        })();
        const disableWorker = disableWorkerOverride !== null ? disableWorkerOverride : isProbablySafari();

        logPdfDebug('getDocument options', { disableWorker });
        const loadingTask = pdfjs.getDocument({
          data: pdfBytes.data,
          // Keep Safari safe mode; legacy worker is a classic .js.
          disableWorker,
        });
        activeLoadingTaskRef.current = loadingTask;

        const doc = await loadingTask.promise;
        if (cancelled) return;
        activePdfDocRef.current = doc;
        setPdfDoc(doc);

        const n = Number(doc?.numPages);
        if (Number.isFinite(n) && n > 0) {
          setNumPagesValue(n);
          const desiredPage = clamp(Number(currentPageRef.current) || 1, 1, n);
          // Avoid capturing resolvedPage here; use the ref (kept in sync) instead.
          if (desiredPage !== Number(currentPageRef.current || 0)) setPageValue(desiredPage);

          // Review (modal) renders sequentially and lazy-loads; preview (panel) renders only the current page.
          setRenderCount(isCompactPdfPreview ? 1 : Math.min(n, 6));
        }
      } catch (_e) {
        if (cancelled) return;
        try {
          console.warn('[PDFJS] getDocument failed', _e);
        } catch (_e2) {}
        setPdfDoc(null);
        setPdfError(isCompactPdfPreview ? 'Förhandsvisning kunde inte visas' : 'Förhandsvisning stöds inte – öppna i ny flik');
        setRenderCount(0);
      }
    })();

    return () => {
      cancelled = true;
      cleanupPdfResources();
    };
  }, [
    kind,
    pdfBytes.loading,
    pdfBytes.error,
    pdfBytes.data,
    isPageControlled,
    isNumPagesControlled,
    isZoomControlled,
    setNumPagesValue,
    setPageValue,
    cleanupPdfResources,
    isCompactPdfPreview,
    variant,
  ]);

  const showPdfControls = kind === 'pdf';
  const canZoom = kind === 'pdf' || kind === 'image';

  const onLayoutContainer = useCallback((e) => {
    const w = Number(e?.nativeEvent?.layout?.width);
    const h = Number(e?.nativeEvent?.layout?.height);
    if (Number.isFinite(w) && w > 0) setContainerWidth(w);
    if (Number.isFinite(h) && h > 0) setContainerHeight(h);
  }, []);

  const onFitToWidth = useCallback(() => {
    setFitWidth(true);
  }, []);

  const onZoomDelta = useCallback((delta) => {
    // In compact preview, keep zoom within [0.5..1] so a full page remains visible.
    if (isCompactPdfPreview) {
      setFitWidth(false);
      setZoomValue(clamp(resolvedZoom + delta, 0.5, 1));
      return;
    }
    setFitWidth(false);
    setZoomValue(resolvedZoom + delta);
  }, [isCompactPdfPreview, resolvedZoom, setZoomValue]);

  const onReviewZoomDelta = useCallback((delta) => {
    // Large review: clearer and gentler zoom steps.
    setFitWidth(false);
    setZoomValue(clamp(resolvedZoom + delta, 0.5, 3));
  }, [resolvedZoom, setZoomValue]);

  const computePageFromScrollY = useCallback((scrollY) => {
    const entries = Object.entries(pageLayoutsRef.current || {})
      .map(([k, v]) => ({ page: Number(k), y: Number(v?.y), height: Number(v?.height) }))
      .filter((x) => Number.isFinite(x.page) && Number.isFinite(x.y) && Number.isFinite(x.height) && x.page > 0)
      .sort((a, b) => a.page - b.page);

    if (entries.length === 0) return null;

    const y = Math.max(0, Number(scrollY) || 0);
    const probe = y + 80; // a bit below the top edge
    let current = entries[0].page;
    for (const e of entries) {
      if (probe >= e.y) current = e.page;
      else break;
    }
    return current;
  }, []);

  const onPdfScroll = useCallback((e) => {
    const y = Number(e?.nativeEvent?.contentOffset?.y);
    if (!Number.isFinite(y)) return;

    if (!isPdfReview) return;

    // Lazy-append more pages as we scroll.
    try {
      const contentH = Number(e?.nativeEvent?.contentSize?.height);
      const viewportH = Number(e?.nativeEvent?.layoutMeasurement?.height);
      if (Number.isFinite(contentH) && Number.isFinite(viewportH)) {
        const nearBottom = (y + viewportH) > (contentH - 1400);
        if (nearBottom) {
          const total = Number.isFinite(Number(resolvedNumPages)) ? Number(resolvedNumPages) : Number(pdfDoc?.numPages);
          if (Number.isFinite(total) && total > 0) {
            setRenderCount((prev) => Math.min(total, Math.max(prev || 0, 0) + 4));
          }
        }
      }
    } catch (_e) {}

    const p = computePageFromScrollY(y);
    if (!p) return;
    if (p !== resolvedPage) setPageValue(p);
  }, [computePageFromScrollY, isPdfReview, pdfDoc, resolvedNumPages, resolvedPage, setPageValue]);

  const scrollToPage = useCallback((targetPage) => {
    const tp = Number(targetPage);
    if (!Number.isFinite(tp) || tp <= 0) return;
    if (isCompactPdfPreview) {
      const total = resolvedNumPages || (Number.isFinite(Number(pdfDoc?.numPages)) ? Number(pdfDoc?.numPages) : null);
      const next = total ? clamp(tp, 1, total) : tp;
      setPageValue(next);
      return;
    }
    const meta = pageLayoutsRef.current?.[tp];
    const y = Number(meta?.y);
    if (Number.isFinite(y) && scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
      try {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 8), animated: true });
      } catch (_e) {}
    }
    setPageValue(tp);
  }, [isCompactPdfPreview, pdfDoc, resolvedNumPages, setPageValue]);

  const onPanelPdfWheel = useCallback((e) => {
    if (Platform.OS !== 'web') return;
    if (!isFullscreen) return;
    if (kind !== 'pdf') return;
    if (!isCompactPdfPreview) return;

    const deltaY = Number(e?.deltaY ?? e?.nativeEvent?.deltaY);
    if (!Number.isFinite(deltaY) || deltaY === 0) return;

    const now = Date.now();
    if (now - (lastWheelTsRef.current || 0) > 450) {
      wheelAccumRef.current = 0;
    }
    wheelAccumRef.current += deltaY;

    const threshold = 80;
    if (Math.abs(wheelAccumRef.current) < threshold) return;

    const direction = wheelAccumRef.current > 0 ? 1 : -1;
    wheelAccumRef.current = 0;
    lastWheelTsRef.current = now;

    const total = resolvedNumPages || (Number.isFinite(Number(pdfDoc?.numPages)) ? Number(pdfDoc?.numPages) : null);
    const next = direction > 0
      ? (total ? Math.min(total, resolvedPage + 1) : (resolvedPage + 1))
      : Math.max(1, resolvedPage - 1);

    scrollToPage(next);
    if (typeof e?.preventDefault === 'function') e.preventDefault();
  }, [isCompactPdfPreview, isFullscreen, kind, pdfDoc, resolvedNumPages, resolvedPage, scrollToPage]);

  const showPageIndicator = kind === 'pdf';
  const totalPdfPages = useMemo(() => {
    if (kind !== 'pdf') return null;
    const a = Number(resolvedNumPages);
    if (Number.isFinite(a) && a > 0) return a;
    const b = Number(pdfDoc?.numPages);
    if (Number.isFinite(b) && b > 0) return b;
    return null;
  }, [kind, pdfDoc, resolvedNumPages]);
  const pageIndicatorText = (() => {
    if (kind !== 'pdf') return '';
    if (isPdfReview) {
      return `Sida ${resolvedPage} av ${totalPdfPages ? String(totalPdfPages) : '…'}`;
    }
    return totalPdfPages ? `Sida ${resolvedPage} av ${totalPdfPages}` : `Sida ${resolvedPage} av …`;
  })();

  const pdfPages = useMemo(() => {
    if (isCompactPdfPreview) return [resolvedPage];
    const total = Number.isFinite(Number(resolvedNumPages)) ? Number(resolvedNumPages) : Number(pdfDoc?.numPages);
    if (!Number.isFinite(total) || total <= 0) return [];
    const count = Math.min(total, Math.max(0, Number(renderCount) || 0));
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [isCompactPdfPreview, pdfDoc, renderCount, resolvedNumPages, resolvedPage]);

  if (!item) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSticky}>
          <Text style={styles.title} numberOfLines={1}>Förhandsvisning</Text>
        </View>
        <View style={styles.bodyCentered}>
          <Ionicons name="document-outline" size={22} color="#94A3B8" />
          <Text style={styles.muted}>Välj en fil för att förhandsvisa</Text>
        </View>
      </View>
    );
  }

  return (
    <View ref={fullscreenTargetRef} style={styles.container}>
      <View style={[styles.headerSticky, variant === 'panel' ? styles.headerStickyPanel : null]}>
        <View style={styles.controlRow}>
          {Platform.OS === 'web' ? (
            <View style={[styles.controlRowWeb, isFullscreen ? styles.controlRowWebFullscreen : null]}>
              {!isPdfReview && variant !== 'panel' ? (
                <>
                  <Text
                    style={styles.fileNameText}
                    numberOfLines={1}
                    title={name}
                  >
                    {name || 'Förhandsvisning'}
                  </Text>

                  <View style={styles.fileTypePill}>
                    <Text style={styles.fileTypePillText}>{fileTypeLabel}</Text>
                  </View>
                </>
              ) : null}

              {showPdfControls && isPdfReview ? (
                <ToolbarButton icon="remove-outline" label="−" onPress={() => onReviewZoomDelta(-0.1)} disabled={!canZoom} />
              ) : null}

              {showPageIndicator ? (
                <View style={styles.pagePill}>
                  <Text style={styles.pagePillText}>{pageIndicatorText}</Text>
                </View>
              ) : null}

              {showPdfControls && isPdfReview ? (
                <ToolbarButton icon="add-outline" label="+" onPress={() => onReviewZoomDelta(0.1)} disabled={!canZoom} />
              ) : null}

              {isCompactPdfPreview ? (
                <ToolbarButton icon="chevron-back-outline" label="Föreg" onPress={() => scrollToPage(Math.max(1, resolvedPage - 1))} disabled={resolvedPage <= 1} />
              ) : null}
              {isCompactPdfPreview ? (
                <ToolbarButton icon="chevron-forward-outline" label="Nästa" onPress={() => scrollToPage(resolvedPage + 1)} disabled={totalPdfPages ? resolvedPage >= totalPdfPages : false} />
              ) : null}

              {showPdfControls && !isPdfReview && !isCompactPdfPreview ? (
                <ToolbarButton icon="remove-outline" label="Zoom −" onPress={() => onZoomDelta(-0.25)} disabled={!canZoom} />
              ) : null}
              {showPdfControls && !isPdfReview && !isCompactPdfPreview ? (
                <ToolbarButton icon="add-outline" label="Zoom +" onPress={() => onZoomDelta(0.25)} disabled={!canZoom} />
              ) : null}
              {showPdfControls && !isPdfReview && variant !== 'panel' ? (
                <ToolbarButton icon="scan-outline" label="Fit to width" onPress={onFitToWidth} disabled={!pdfDoc} />
              ) : null}

              {kind === 'pdf' ? (
                <ToolbarButton icon="expand-outline" label="Helskärm" onPress={() => requestFullscreen()} disabled={Platform.OS !== 'web'} />
              ) : null}

              <ToolbarButton icon="open-outline" label="Öppna i ny flik" onPress={() => onOpenInNewTab?.(externalUrl)} disabled={!safeText(externalUrl)} />

              <Pressable
                onPress={() => {
                  if (isFullscreen && Platform.OS === 'web') {
                    requestFullscreen();
                    return;
                  }
                  onClose?.();
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </Pressable>
            </View>
          ) : (
            <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.controlRowNative}>
              {!isPdfReview && variant !== 'panel' ? (
                <>
                  <Text style={styles.fileNameText} numberOfLines={1}>{name || 'Förhandsvisning'}</Text>
                  <View style={styles.fileTypePill}>
                    <Text style={styles.fileTypePillText}>{fileTypeLabel}</Text>
                  </View>
                </>
              ) : null}

              {showPageIndicator ? (
                <View style={styles.pagePill}>
                  <Text style={styles.pagePillText}>{pageIndicatorText}</Text>
                </View>
              ) : null}

              {showPdfControls && isPdfReview ? (
                <ToolbarButton icon="remove-outline" label="−" onPress={() => onReviewZoomDelta(-0.1)} disabled={!canZoom} />
              ) : null}
              {showPdfControls && isPdfReview ? (
                <ToolbarButton icon="add-outline" label="+" onPress={() => onReviewZoomDelta(0.1)} disabled={!canZoom} />
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {kind === 'pdf' ? (
          <View
            style={[styles.pdfStage, isPdfReview ? styles.pdfStageModal : styles.pdfStagePanel]}
            onLayout={onLayoutContainer}
            onWheel={onPanelPdfWheel}
          >
            {pdfBytes.loading ? (
              <Text style={styles.loadingText}>Laddar PDF…</Text>
            ) : null}

            {!pdfBytes.loading && (pdfError || pdfBytes.error) ? (
              <View style={styles.pdfFallback}>
                <Ionicons name="alert-circle-outline" size={22} color="#94A3B8" />
                <Text style={styles.unsupportedTitle} numberOfLines={2}>
                  {pdfError || pdfBytes.error || 'Förhandsvisning kunde inte visas'}
                </Text>
              </View>
            ) : null}

            {!pdfBytes.loading && !pdfError && !pdfBytes.error && pdfDoc ? (
              isPdfReview ? (
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={styles.pdfScrollContent}
                onScroll={onPdfScroll}
                scrollEventThrottle={16}
              >
                <View style={styles.pdfPagesWrap}>
                  {!firstPageRendered ? (
                    <Text style={styles.loadingText}>Renderar…</Text>
                  ) : null}
                  {renderCount > 0 && resolvedNumPages && renderCount < resolvedNumPages ? (
                    <Text style={styles.pdfHintText}>
                      Visar {renderCount} av {resolvedNumPages} sidor…
                    </Text>
                  ) : null}
                  {pdfPages.map((p) => (
                    <View
                      key={`p-${p}-${layoutNonce}`}
                      style={styles.pdfPageRow}
                      onLayout={(e) => {
                        const y = Number(e?.nativeEvent?.layout?.y);
                        const h = Number(e?.nativeEvent?.layout?.height);
                        if (!Number.isFinite(y) || !Number.isFinite(h)) return;
                        pageLayoutsRef.current = { ...(pageLayoutsRef.current || {}), [p]: { y, height: h } };
                      }}
                    >
                      <View style={styles.pdfPageFrame}>
                        <PdfCanvasPage
                          pdf={pdfDoc}
                          pageNumber={p}
                          scale={resolvedZoom}
                          fitWidth={fitWidth}
                          fitPage={false}
                          containerWidth={containerWidth}
                          containerHeight={fitWidth ? undefined : containerHeight}
                          onBasePageWidth={() => {}}
                          onRenderError={() => {
                            try {
                              console.warn('[PDFJS] render failed', { page: p, name });
                            } catch (_e) {}
                            setPdfError(isCompactPdfPreview ? 'Förhandsvisning kunde inte visas' : 'Förhandsvisning stöds inte – öppna i ny flik');
                          }}
                          onRenderSuccess={() => {
                            if (p === 1) setFirstPageRendered(true);
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
              ) : (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.pdfSinglePageScrollContent}
                  scrollEventThrottle={16}
                >
                  {!firstPageRendered ? (
                    <Text style={styles.loadingText}>Renderar…</Text>
                  ) : null}
                  <View style={styles.pdfPageFrame}>
                    <PdfCanvasPage
                      pdf={pdfDoc}
                      pageNumber={resolvedPage}
                      scale={resolvedZoom}
                      fitWidth={fitWidth}
                      fitPage={false}
                      containerWidth={containerWidth}
                      containerHeight={isCompactPdfPreview ? undefined : (fitWidth ? undefined : containerHeight)}
                      onBasePageWidth={() => {}}
                      onRenderError={() => {
                        try {
                          console.warn('[PDFJS] preview render failed', { page: resolvedPage, name });
                        } catch (_e) {}
                        setPdfError('Förhandsvisning kunde inte visas');
                      }}
                      onRenderSuccess={() => setFirstPageRendered(true)}
                    />
                  </View>
                </ScrollView>
              )
            ) : null}
          </View>
        ) : kind === 'image' ? (
          safeText(preferredUrl) ? (
            variant === 'modal' ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.viewerScrollContent}>
                <View style={styles.imageZoomWrap}>
                  <Image
                    source={{ uri: preferredUrl }}
                    style={[styles.image, { transform: [{ scale: resolvedZoom }] }]}
                    resizeMode="contain"
                  />
                </View>
              </ScrollView>
            ) : (
              <View style={styles.imageWrap}>
                <Image source={{ uri: preferredUrl }} style={styles.image} resizeMode="contain" />
              </View>
            )
          ) : (
            <View style={styles.bodyCentered}>
              <Text style={styles.muted}>Kunde inte ladda bild (saknar länk).</Text>
            </View>
          )
        ) : kind === 'office' ? (
          safeText(preferredUrl) ? (
            <iframe
              title={name || 'Office'}
              src={buildOfficeViewerUrl(preferredUrl)}
              style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
              allow="fullscreen"
            />
          ) : (
            <View style={styles.bodyCentered}>
              <Text style={styles.muted}>Kunde inte ladda dokument (saknar länk).</Text>
            </View>
          )
        ) : (
          <View style={styles.bodyCentered}>
            <Ionicons name="alert-circle-outline" size={22} color="#94A3B8" />
            <Text style={styles.unsupportedTitle} numberOfLines={2}>Förhandsvisning stöds inte ännu</Text>
            <Text style={styles.muted} numberOfLines={3}>{name}</Text>
            <Text style={styles.muted}>Filtyp: {safeText(ext).toUpperCase() || 'Okänd'}</Text>
            <Text style={styles.muted}>Öppna i ny flik för full vy.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  headerSticky: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    ...(Platform.OS === 'web'
      ? {
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }
      : null),
  },
  headerStickyPanel: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlRowWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    ...(Platform.OS === 'web'
      ? {
        overflowX: 'auto',
        overflowY: 'hidden',
      }
      : null),
  },
  controlRowWebFullscreen: {
    flex: 1,
    justifyContent: 'center',
  },
  controlRowNative: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: 320,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : {}),
  },
  fileNameSecondary: {
    fontSize: 12,
    color: '#64748b',
  },
  fileTypePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fileTypePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : {}),
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '400',
    color: '#64748b',
  },
  primaryActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#0F172A',
  },
  pagePill: {
    flexShrink: 0,
    minWidth: 112,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagePillText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#334155',
    flexShrink: 0,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : {}),
  },
  body: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#fff',
  },
  bodyCentered: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
    backgroundColor: '#fff',
  },
  muted: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    textAlign: 'center',
  },
  unsupportedTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
    textAlign: 'center',
  },
  imageWrap: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F8FAFC',
  },
  imageZoomWrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1220',
    padding: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  viewerScrollContent: {
    flexGrow: 1,
  },
  pdfScrollContent: {
    flexGrow: 1,
    paddingVertical: 14,
  },
  pdfPagesWrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  pdfSinglePageWrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  pdfSinglePageScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  pdfPageRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfPageFrame: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
  },
  pdfHintText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  pdfStage: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F1F5F9',
  },
  pdfStagePanel: {
    backgroundColor: '#E8EEF6',
  },
  pdfStageModal: {
    backgroundColor: '#0B1220',
  },
  pdfFallback: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },
  pdfCanvas: {
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  loadingText: {
    padding: 12,
    fontSize: 12,
    color: '#CBD5E1',
    textAlign: 'center',
  },
});
