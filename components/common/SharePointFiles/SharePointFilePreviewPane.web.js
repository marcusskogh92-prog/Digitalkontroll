import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fileExtFromName, safeText } from './sharePointFileUtils';

let pdfjsConfigured = false;

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

  const [PdfDocument, setPdfDocument] = useState(null);
  const [PdfPage, setPdfPage] = useState(null);

  useEffect(() => {
    if (variant !== 'modal') return;
    if (kind !== 'pdf') return;

    let cancelled = false;
    (async () => {
      try {
        const mod = await import('react-pdf');
        if (cancelled) return;

        // Configure worker once (web-only). Uses CDN to avoid bundler/worker pitfalls.
        if (!pdfjsConfigured && mod?.pdfjs?.version) {
          const v = mod.pdfjs.version;
          mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
          pdfjsConfigured = true;
        }

        setPdfDocument(() => mod.Document);
        setPdfPage(() => mod.Page);
      } catch (_e) {
        setPdfDocument(null);
        setPdfPage(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [variant, kind]);

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

  const canOpenModal = variant === 'panel' && typeof onOpenInModal === 'function';
  const canZoom = kind === 'pdf' || kind === 'image';
  const canPage = kind === 'pdf' && Number.isFinite(Number(numPages)) && Number(numPages) > 0;

  const resolvedZoom = clamp(zoom || 1, 0.5, 4);
  const resolvedNumPages = Number.isFinite(Number(numPages)) ? Number(numPages) : null;
  const resolvedPage = resolvedNumPages ? clamp(page || 1, 1, resolvedNumPages) : clamp(page || 1, 1, 9999);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{name || 'Förhandsvisning'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{safeText(ext).toUpperCase() || 'FIL'}</Text>
        </View>

        {variant === 'modal' && canPage ? (
          <View style={styles.pagePill}>
            <Text style={styles.pagePillText} numberOfLines={1}>
              Sida {resolvedPage} / {resolvedNumPages}
            </Text>
          </View>
        ) : null}

        {variant === 'modal' && canZoom ? (
          <ToolbarButton
            icon="remove-outline"
            label="Zoom"
            onPress={() => onZoomChange?.(clamp(resolvedZoom - 0.25, 0.5, 4))}
            disabled={!canZoom}
          />
        ) : null}

        {variant === 'modal' && canZoom ? (
          <ToolbarButton
            icon="add-outline"
            label="Zoom"
            onPress={() => onZoomChange?.(clamp(resolvedZoom + 0.25, 0.5, 4))}
            disabled={!canZoom}
          />
        ) : null}

        {variant === 'modal' && kind === 'pdf' ? (
          <ToolbarButton
            icon="chevron-back-outline"
            label="Föreg"
            onPress={() => onPageChange?.(Math.max(1, resolvedPage - 1))}
            disabled={resolvedPage <= 1}
          />
        ) : null}

        {variant === 'modal' && kind === 'pdf' ? (
          <ToolbarButton
            icon="chevron-forward-outline"
            label="Nästa"
            onPress={() => onPageChange?.(resolvedPage + 1)}
            disabled={resolvedNumPages ? resolvedPage >= resolvedNumPages : false}
          />
        ) : null}

        {canOpenModal ? (
          <ToolbarButton icon="expand-outline" label="Stor granskning" onPress={() => onOpenInModal?.()} />
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
          safeText(preferredUrl) ? (
            variant === 'modal' && PdfDocument && PdfPage ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.viewerScrollContent}>
                <View style={styles.pdfWrap}>
                  <PdfDocument
                    file={preferredUrl}
                    onLoadSuccess={(info) => {
                      const n = Number(info?.numPages);
                      if (Number.isFinite(n) && n > 0) onNumPages?.(n);
                      if (Number.isFinite(n) && n > 0) {
                        const nextPage = clamp(resolvedPage, 1, n);
                        if (nextPage !== resolvedPage) onPageChange?.(nextPage);
                      }
                    }}
                    loading={<Text style={styles.loadingText}>Laddar PDF…</Text>}
                    error={<Text style={styles.loadingText}>Kunde inte läsa PDF. Prova att öppna i ny flik.</Text>}
                    noData={<Text style={styles.loadingText}>Saknar PDF-data.</Text>}
                  >
                    <PdfPage
                      pageNumber={resolvedPage}
                      scale={resolvedZoom}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={<Text style={styles.loadingText}>Renderar sida…</Text>}
                    />
                  </PdfDocument>
                </View>
              </ScrollView>
            ) : (
              <iframe
                title={name || 'PDF'}
                src={preferredUrl}
                style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
              />
            )
          ) : (
            <View style={styles.bodyCentered}>
              <Text style={styles.muted}>Kunde inte ladda PDF (saknar länk).</Text>
            </View>
          )
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
  loadingText: {
    padding: 12,
    fontSize: 12,
    color: '#CBD5E1',
    textAlign: 'center',
  },
});
