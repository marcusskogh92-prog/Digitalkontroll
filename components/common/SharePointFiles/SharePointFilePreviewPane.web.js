import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSharePointDriveItemArrayBuffer } from '../../../services/sharepoint/sharePointFileContentService';
import { fileExtFromName, safeText } from './sharePointFileUtils';

let pdfjsConfigured = false;
let pdfjsModulePromise = null;

async function getPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist/build/pdf.mjs');
  }
  const mod = await pdfjsModulePromise;
  const pdfjs = mod?.default || mod;
  if (pdfjs && !pdfjsConfigured) {
    const version = safeText(pdfjs?.version);
    if (version) {
      // Use CDN worker to avoid Metro/Expo worker wiring pitfalls.
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
    }
    pdfjsConfigured = true;
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
  containerWidth,
  onBasePageWidth,
  onRenderError,
}) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!pdf || !c) return;

    let cancelled = false;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);

        const baseViewport = page.getViewport({ scale: 1 });
        const baseWidth = Number(baseViewport?.width);
        if (Number.isFinite(baseWidth) && baseWidth > 0) {
          onBasePageWidth?.(baseWidth);
        }

        let resolvedScale = clamp(scale || 1, 0.5, 4);
        if (fitWidth && Number.isFinite(containerWidth) && containerWidth > 0 && Number.isFinite(baseWidth) && baseWidth > 0) {
          // Leave some breathing room around the page.
          const padding = 24;
          resolvedScale = clamp((containerWidth - padding) / baseWidth, 0.5, 4);
        }

        const viewport = page.getViewport({ scale: resolvedScale });
        const cssWidth = Math.max(1, Math.floor(viewport.width));
        const cssHeight = Math.max(1, Math.floor(viewport.height));

        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        c.width = Math.floor(cssWidth * dpr);
        c.height = Math.floor(cssHeight * dpr);
        c.style.width = `${cssWidth}px`;
        c.style.height = `${cssHeight}px`;

        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Saknar canvas context');

        if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
          try { renderTaskRef.current.cancel(); } catch (_e) {}
        }

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
        const task = page.render({ canvasContext: ctx, viewport, transform });
        renderTaskRef.current = task;

        await task.promise;
        if (cancelled) return;
      } catch (e) {
        if (cancelled) return;
        onRenderError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
        try { renderTaskRef.current.cancel(); } catch (_e) {}
      }
    };
  }, [pdf, pageNumber, scale, fitWidth, containerWidth, onBasePageWidth, onRenderError]);

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
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } : null),
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

  const itemId = safeText(item?.id);
  const pdfBytes = usePdfBytes({
    enabled: kind === 'pdf' && !!itemId,
    siteId,
    itemId,
    preferDownloadUrl: downloadUrl,
  });

  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfError, setPdfError] = useState('');
  const [fitWidth, setFitWidth] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const resolvedZoom = clamp(zoom || 1, 0.5, 4);
  const resolvedNumPages = Number.isFinite(Number(numPages)) ? Number(numPages) : null;
  const resolvedPage = resolvedNumPages ? clamp(page || 1, 1, resolvedNumPages) : clamp(page || 1, 1, 9999);

  useEffect(() => {
    if (kind !== 'pdf') {
      setPdfDoc(null);
      setPdfError('');
      return;
    }
    setPdfDoc(null);
    setPdfError('');
    setFitWidth(false);

    if (pdfBytes.loading) return;
    if (pdfBytes.error) {
      setPdfError(pdfBytes.error);
      return;
    }
    if (!pdfBytes.data) return;

    let cancelled = false;
    let loadingTask = null;

    (async () => {
      try {
        const pdfjs = await getPdfJs();
        if (cancelled) return;

        loadingTask = pdfjs.getDocument({ data: pdfBytes.data });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);

        const n = Number(doc?.numPages);
        if (Number.isFinite(n) && n > 0) {
          onNumPages?.(n);
          const nextPage = clamp(resolvedPage, 1, n);
          if (nextPage !== resolvedPage) onPageChange?.(nextPage);
        }
      } catch (_e) {
        if (cancelled) return;
        setPdfDoc(null);
        setPdfError('Förhandsvisning stöds inte – öppna i ny flik');
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try { loadingTask.destroy(); } catch (_e) {}
      }
    };
  }, [kind, pdfBytes.loading, pdfBytes.error, pdfBytes.data, onNumPages, onPageChange, resolvedPage]);

  const canOpenModal = variant === 'panel' && typeof onOpenInModal === 'function' && kind === 'pdf';
  const showPdfControls = kind === 'pdf' && variant === 'modal';
  const canZoom = kind === 'pdf' || kind === 'image';

  const onLayoutContainer = useCallback((e) => {
    const w = Number(e?.nativeEvent?.layout?.width);
    if (Number.isFinite(w) && w > 0) setContainerWidth(w);
  }, []);

  const onFitToWidth = useCallback(() => {
    setFitWidth(true);
  }, []);

  const onZoomDelta = useCallback((delta) => {
    setFitWidth(false);
    onZoomChange?.(clamp(resolvedZoom + delta, 0.5, 4));
  }, [onZoomChange, resolvedZoom]);

  if (!item) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>Förhandsvisning</Text>
        </View>
        <View style={styles.bodyCentered}>
          <Ionicons name="document-outline" size={22} color="#94A3B8" />
          <Text style={styles.muted}>Välj en fil för att förhandsvisa</Text>
        </View>
      </View>
    );
  }

  const showPageIndicator = kind === 'pdf';
  const pageIndicatorText = (kind === 'pdf')
    ? (resolvedNumPages ? `Sida ${resolvedPage} av ${resolvedNumPages}` : `Sida ${resolvedPage} av …`)
    : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{name || 'Förhandsvisning'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{safeText(ext).toUpperCase() || 'FIL'}</Text>
        </View>

        {showPageIndicator ? (
          <View style={styles.pagePill}>
            <Text style={styles.pagePillText} numberOfLines={1}>
              {pageIndicatorText}
            </Text>
          </View>
        ) : null}

        {showPdfControls ? (
          <ToolbarButton
            icon="remove-outline"
            label="Zoom −"
            onPress={() => onZoomDelta(-0.25)}
            disabled={!canZoom}
          />
        ) : null}

        {showPdfControls ? (
          <ToolbarButton
            icon="add-outline"
            label="Zoom +"
            onPress={() => onZoomDelta(0.25)}
            disabled={!canZoom}
          />
        ) : null}

        {showPdfControls ? (
          <ToolbarButton
            icon="scan-outline"
            label="Fit to width"
            onPress={onFitToWidth}
            disabled={!pdfDoc}
          />
        ) : null}

        {showPdfControls ? (
          <ToolbarButton
            icon="chevron-back-outline"
            label="Föreg"
            onPress={() => onPageChange?.(Math.max(1, resolvedPage - 1))}
            disabled={resolvedPage <= 1}
          />
        ) : null}

        {showPdfControls ? (
          <ToolbarButton
            icon="chevron-forward-outline"
            label="Nästa"
            onPress={() => onPageChange?.(resolvedPage + 1)}
            disabled={resolvedNumPages ? resolvedPage >= resolvedNumPages : false}
          />
        ) : null}

        {canOpenModal ? (
          <ToolbarButton icon="expand-outline" label="Öppna i granskning" onPress={() => onOpenInModal?.()} />
        ) : null}

        <ToolbarButton
          icon="open-outline"
          label="Öppna i ny flik"
          onPress={() => onOpenInNewTab?.(externalUrl)}
          disabled={!safeText(externalUrl)}
        />

        <Pressable
          onPress={() => onClose?.()}
          style={({ hovered, pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
          })}
        >
          <Ionicons name="close" size={18} color="#64748b" />
        </Pressable>
      </View>

      <View style={styles.body}>
        {kind === 'pdf' ? (
          <View style={styles.pdfStage} onLayout={onLayoutContainer}>
            {pdfBytes.loading ? (
              <Text style={styles.loadingText}>Laddar PDF…</Text>
            ) : null}

            {!pdfBytes.loading && (pdfError || pdfBytes.error) ? (
              <View style={styles.pdfFallback}>
                <Ionicons name="alert-circle-outline" size={22} color="#94A3B8" />
                <Text style={styles.unsupportedTitle} numberOfLines={2}>
                  Förhandsvisning stöds inte – öppna i ny flik
                </Text>
              </View>
            ) : null}

            {!pdfBytes.loading && !pdfError && !pdfBytes.error && pdfDoc ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.viewerScrollContent}>
                <View style={styles.pdfWrap}>
                  <PdfCanvasPage
                    pdf={pdfDoc}
                    pageNumber={resolvedPage}
                    scale={resolvedZoom}
                    fitWidth={fitWidth}
                    containerWidth={containerWidth}
                    onBasePageWidth={() => {}}
                    onRenderError={() => setPdfError('Förhandsvisning stöds inte – öppna i ny flik')}
                  />
                </View>
              </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
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
  actionText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#0F172A',
  },
  pagePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pagePillText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#334155',
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
  pdfWrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#0B1220',
  },
  pdfStage: {
    flex: 1,
    minHeight: 0,
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
