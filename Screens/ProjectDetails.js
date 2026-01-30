import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { v4 as uuidv4 } from 'uuid';
import { formatPersonName } from '../components/formatPersonName';
import { buildPdfHtmlForControl } from '../components/pdfExport';
import { emitProjectUpdated, onProjectUpdated } from '../components/projectBus';

import {
    ArbetsberedningControl,
    EgenkontrollControl,
    FuktmätningControl,
    MottagningskontrollControl,
    RiskbedömningControl,
    SkyddsrondControl,
} from '../features/kma/components/controls';
import ControlDetails from './ControlDetails';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import ProjectDocumentsView from '../components/common/ProjectDocumentsView';
import ProjectInternalNavigation from '../components/common/ProjectInternalNavigation';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../components/common/layoutConstants';
import { DEFAULT_CONTROL_TYPES, deleteControlFromFirestore, deleteDraftControlFromFirestore, fetchCompanyControlTypes, fetchCompanyMallar, fetchCompanyMembers, fetchCompanyProfile, fetchControlsForProject, fetchDraftControlsForProject } from '../components/firebase';
import { DEFAULT_PHASE, getProjectPhase } from '../features/projects/constants';
// Note: `expo-file-system` is used only on native; avoid static top-level import
// so web builds don't attempt to resolve native-only exports. Load dynamically
// inside functions when needed.
let FileSystem = null;

// Optional project-level summary HTML builder — not present in this repo by default.
const buildSummaryHtml = null;

// Minimal normalizeControl used across screens to ensure expected fields exist
function normalizeControl(obj) {
  const c = { ...(obj || {}) };
  c.materialDesc = c.materialDesc || c.material || '';
  c.qualityDesc = c.qualityDesc || '';
  c.coverageDesc = c.coverageDesc || '';
  if (c.mottagningsSignature && !c.mottagningsSignatures) c.mottagningsSignatures = [];
  if (!c.mottagningsSignatures) c.mottagningsSignatures = [];
  if (!Array.isArray(c.checklist)) c.checklist = [];
  return c;
}

// Normalize project data - format ansvarig name
function normalizeProject(p) {
  if (!p || typeof p !== 'object') return p;
  const formatted = formatPersonName(p.ansvarig || '');
  if (!formatted || formatted === p.ansvarig) return p;
  return { ...p, ansvarig: formatted };
}

// Persist a draft object by merging with existing matching draft(s) in AsyncStorage
const persistDraftObject = async (draftObj) => {
  let arr = [];
  try {
    const raw = await AsyncStorage.getItem('draft_controls');
    if (raw) arr = JSON.parse(raw) || [];
  } catch(_e) { arr = []; }
  let idx = -1;
  if (draftObj && draftObj.id) {
    idx = arr.findIndex(c => c.id === draftObj.id && c.project?.id === draftObj.project?.id && c.type === draftObj.type);
  }
  if (idx === -1 && draftObj && draftObj.project) {
    idx = arr.findIndex(c => c.project?.id === draftObj.project?.id && c.type === draftObj.type);
  }
  if (idx !== -1) {
    // naive merge: shallow merge existing with incoming
    arr[idx] = { ...(arr[idx] || {}), ...(draftObj || {}) };
  } else {
    arr.push(draftObj);
  }
  try { await AsyncStorage.setItem('draft_controls', JSON.stringify(arr)); } catch(_e) {}
  return arr;
};

// Utility: read a file URI as base64 if possible
async function readUriAsBase64(uri) {
  if (!uri) return null;
  try {
    // Dynamically load FileSystem only when running in an environment that supports it
    if (!FileSystem) {
      try {
        FileSystem = await import('expo-file-system');
      } catch (_e) {
        FileSystem = null;
      }
    }
    // If already a data URI, strip prefix and return raw base64
    if (typeof uri === 'string' && uri.startsWith('data:')) {
      const parts = uri.split(',');
      return parts[1] || null;
    }
    const encodingOption = (FileSystem && FileSystem.EncodingType && FileSystem.EncodingType.Base64) ? FileSystem.EncodingType.Base64 : 'base64';
    if (!FileSystem || typeof FileSystem.readAsStringAsync !== 'function') return null;
    const b = await FileSystem.readAsStringAsync(uri, { encoding: encodingOption });
    return b;
  } catch(e) {
    console.warn('[PDF] readUriAsBase64 failed for', uri, e);
    return null;
  }
}

// Try to convert an image URI (file:// or http(s)) to a data URI (base64). Returns original uri on failure.
async function toDataUri(uri) {
  if (!uri) return uri;
  try {
    if (typeof uri === 'string' && uri.startsWith('data:')) return uri;
    // Try direct read (works for file:// and sometimes cached local URIs)
    const b = await readUriAsBase64(uri);
    if (b) return 'data:image/jpeg;base64,' + b;
    // If http(s), try download to cache and read
    if (/^https?:\/\//i.test(uri)) {
      try {
        // Ensure FileSystem is available
        if (!FileSystem) {
          try { FileSystem = await import('expo-file-system'); } catch(_e) { FileSystem = null; }
        }
        const fileName = 'pdf-img-' + (Math.random().toString(36).slice(2, 9)) + '.jpg';
        const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
        if (baseDir && FileSystem && typeof FileSystem.downloadAsync === 'function') {
          const dest = baseDir + fileName;
          const dl = await FileSystem.downloadAsync(uri, dest);
          if (dl && dl.uri) {
            const b2 = await readUriAsBase64(dl.uri);
            if (b2) return 'data:image/jpeg;base64,' + b2;
          }
        }
      } catch(_e) {}
    }
  } catch(e) {
    console.warn('[PDF] toDataUri failed for', uri, e);
  }
  return uri;
}

// Embed images (photos/signatures/checklist photos) in a control object by converting URIs to data URIs where possible.
async function embedImagesInControl(ctrl) {
  if (!ctrl || typeof ctrl !== 'object') return ctrl;
  const c = JSON.parse(JSON.stringify(ctrl));
  try {
    // Mottagnings photos / photos
    const photoFields = ['mottagningsPhotos', 'photos'];
    for (const field of photoFields) {
      if (Array.isArray(c[field]) && c[field].length > 0) {
        const mapped = await Promise.all(c[field].map(async (p) => {
          try {
            if (!p) return p;
            if (typeof p === 'string') {
              const d = await toDataUri(p);
              return d || p;
            }
            // object with uri and comment
            const src = p.uri || p;
            const d = await toDataUri(src);
            return Object.assign({}, p, { uri: d || src });
          } catch(_e) { return p; }
        }));
        c[field] = mapped;
      }
    }

    // Signatures
    if (Array.isArray(c.mottagningsSignatures) && c.mottagningsSignatures.length > 0) {
      const sigs = await Promise.all(c.mottagningsSignatures.map(async (s) => {
        try {
          if (!s) return s;
          if (s.uri) {
            const d = await toDataUri(s.uri);
            return Object.assign({}, s, { uri: d || s.uri });
          }
          return s;
        } catch(_e) { return s; }
      }));
      c.mottagningsSignatures = sigs;
    }

    // Checklist photos (sections -> photos arrays)
    if (Array.isArray(c.checklist) && c.checklist.length > 0) {
      for (let si = 0; si < c.checklist.length; si++) {
        const sec = c.checklist[si];
        if (!sec) continue;
        if (Array.isArray(sec.photos) && sec.photos.length > 0) {
          const newPhotos = await Promise.all(sec.photos.map(async (entry) => {
            if (!entry) return entry;
            // entry might be array of uris or single uri/object
            if (Array.isArray(entry)) {
              return await Promise.all(entry.map(async (it) => {
                try {
                  if (!it) return it;
                  const src = it.uri || it;
                  const d = await toDataUri(src);
                  return (typeof it === 'string') ? (d || src) : Object.assign({}, it, { uri: d || src });
                } catch(_e) { return it; }
              }));
            }
            try {
              const src = entry.uri || entry;
              const d = await toDataUri(src);
              return (typeof entry === 'string') ? (d || src) : Object.assign({}, entry, { uri: d || src });
            } catch(_e) { return entry; }
          }));
          c.checklist[si].photos = newPhotos;
        }
      }
    }
  } catch(e) {
    console.warn('[PDF] embedImagesInControl failed', e);
  }
  return c;
}

function getWeekAndYear(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d)) return { week: '', year: '' };
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNo = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week: weekNo, year: d.getFullYear() };
}

function isValidIsoDateYmd(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [yStr, mStr, dStr] = v.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#fff' },
  subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  noControls: { fontSize: 16, fontStyle: 'italic', marginBottom: 12 },
  groupContainer: { marginBottom: 18, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', paddingVertical: 8, paddingHorizontal: 4 },
  groupTitle: { fontSize: 16, fontWeight: '700', marginLeft: 6, color: '#263238', flexShrink: 1 },
  groupBadge: { backgroundColor: '#1976D2', borderRadius: 12, paddingHorizontal: 8, marginLeft: 8 },
  groupBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  controlCard: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginVertical: 4, borderWidth: 1, borderColor: '#e0e0e0', minHeight: 54, flexDirection: 'row', alignItems: 'center' },
  controlCardWeb: { width: '100%', flex: 1, alignSelf: 'stretch', paddingVertical: 4, paddingHorizontal: 10, minHeight: 40, marginVertical: 2 },
  controlTextContainer: { flexDirection: 'column', flex: 1, minWidth: 0 },
  controlTextContainerWeb: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  controlLine: { flexShrink: 1 },
  controlTitle: { fontSize: 15, color: '#222', fontWeight: 'bold', flexShrink: 1 },
  controlTitleInlineWeb: { fontSize: 14, color: '#222', fontWeight: '400' },
  controlSubtitle: { color: '#555', fontSize: 13, marginTop: 4, flexShrink: 1 },
  controlSubtitleInline: { color: '#555', fontSize: 12, fontWeight: '400' },
  form: { backgroundColor: '#fff', borderRadius: 12, padding: 16, margin: 12 },
  selectedType: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  infoText: { fontSize: 14, color: '#555', marginBottom: 8 },
  linkText: { color: '#1976D2', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  saveButton: { backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelButton: { backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#222', fontWeight: '600', fontSize: 16 },
  undoBar: { backgroundColor: '#fffbe6', borderRadius: 8, padding: 10, margin: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  undoText: { color: '#222', fontSize: 15 },
  undoButtonText: { color: '#1976D2', fontWeight: '700', fontSize: 15 },
  noticeBar: { backgroundColor: '#e3f2fd', borderRadius: 8, padding: 10, margin: 12 },
  noticeText: { color: '#1976D2', fontSize: 15, textAlign: 'center' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 },
  modalText: { fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
  filterChip: { backgroundColor: '#e0e0e0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  filterChipSelected: { backgroundColor: '#1976D2' },
  filterChipText: { color: '#222', fontSize: 14 },
  filterChipTextSelected: { color: '#fff', fontWeight: '700' },
  centerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
});

export default function ProjectDetails({ route, navigation, inlineClose, refreshNonce }) {
  const { width: windowWidth } = useWindowDimensions();
              const [showControlTypeModal, setShowControlTypeModal] = useState(false);
            const [showDeleteModal, setShowDeleteModal] = useState(false);
            const [showDeleteWarning, setShowDeleteWarning] = useState(false);
            const [controlTypeScrollMetrics, setControlTypeScrollMetrics] = useState({
              contentHeight: 0,
              containerHeight: 0,
              scrollY: 0,
            });

            const controlTypeCanScroll = controlTypeScrollMetrics.contentHeight > (controlTypeScrollMetrics.containerHeight + 1);
            let controlTypeThumbHeight = 0;
            let controlTypeThumbTop = 0;
            if (controlTypeCanScroll) {
              const { containerHeight, contentHeight, scrollY } = controlTypeScrollMetrics;
              const minThumb = 24;
              const thumbHeightRaw = (containerHeight * containerHeight) / (contentHeight || 1);
              const thumbHeight = Math.max(minThumb, isFinite(thumbHeightRaw) ? thumbHeightRaw : minThumb);
              const maxThumbTop = Math.max(0, containerHeight - thumbHeight);
              const scrollableDistance = Math.max(0, contentHeight - containerHeight);
              const thumbTop = scrollableDistance > 0 ? (scrollY / scrollableDistance) * maxThumbTop : 0;
              controlTypeThumbHeight = thumbHeight;
              controlTypeThumbTop = thumbTop;
            }
          // Header on web is handled globally in App.js (breadcrumb + logos).
          // Keep the older native-only centered-logo header.
          React.useEffect(() => {
            if (Platform.OS === 'web') return;
            navigation.setOptions({
              headerTitle: () => (
                <View style={{ marginBottom: 4, marginLeft: -28 }}>
                  <DigitalKontrollHeaderLogo />
                </View>
              ),
              headerLeft: () => null,
              headerBackTitle: '',
            });
          }, [navigation]);
    // State för att låsa upp skapad-datum
    const [canEditCreated, setCanEditCreated] = useState(false);
        const handlePreviewPdf = async () => {
          if (!controls || controls.length === 0) return;
          setExportingPdf(true);
          try {
            try { Haptics.selectionAsync(); } catch {}

            // Prefer company profile logo for PDF (MVP branding: only on print/PDF)
            let profile = companyProfile;
            if (!profile && companyId) {
              try {
                profile = await fetchCompanyProfile(companyId);
                if (profile) setCompanyProfile(profile);
              } catch(_e) {}
            }
            const companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
            const companyLogoFromProfile = profile?.logoUrl || null;

            // Try to use a local file path for the logo for better reliability
            let logoForPrint = companyLogoFromProfile || companyLogoUri || null;
            if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
              try {
                const fileName = 'company-logo.preview.png';
                const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
                if (baseDir) {
                  const dest = baseDir + fileName;
                  const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                  if (dl?.uri) logoForPrint = dl.uri;
                }
              } catch {}
            }

            // Convert logo to base64 (if possible) to avoid asset-loading issues
            let logoBase64 = null;
            try {
              logoBase64 = await readUriAsBase64(logoForPrint);
              if (!logoBase64) {
                // Try bundled asset fallback
                try {
                  const a = Asset.fromModule(require('../assets/images/foretag_ab.png'));
                  await Asset.loadAsync(a);
                  const local = a.localUri || a.uri;
                  if (local) {
                    logoBase64 = await readUriAsBase64(local);
                    if (logoBase64) logoForPrint = 'data:image/png;base64,' + logoBase64;
                  }
                } catch(_e) {
                  // ignore
                }
              } else {
                logoForPrint = 'data:image/png;base64,' + logoBase64;
              }
            } catch(e) { console.warn('[PDF] logo base64 conversion failed', e); }

            // Build HTML safely and log length to aid debugging blank PDFs
            let html;
            try {
              if (typeof buildSummaryHtml === 'function') {
                html = buildSummaryHtml(exportFilter, logoForPrint);
              } else {
                console.warn('[PDF] buildSummaryHtml not available, falling back to per-control builder');
                const companyObj = { name: companyNameForPdf, logoUrl: companyLogoFromProfile, logoBase64 };
                const preparedControls = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
                html = (preparedControls || []).map(c => buildPdfHtmlForControl({ control: c, project, company: companyObj })).join('<div style="page-break-after:always"></div>');
              }
            } catch (hErr) {
              console.error('[PDF] error while building HTML for preview', hErr);
              html = null;
            }

            console.log('[PDF] preview HTML length:', html ? String(html).length : 0);
            if (!html || String(html).trim().length < 20) throw new Error('Empty or too-small HTML');

            try {
              const fileResult = await Print.printToFileAsync({ html });
              const pdfUri = fileResult?.uri;
              if (pdfUri) {
                try {
                  const avail = await Sharing.isAvailableAsync();
                  if (avail) await Sharing.shareAsync(pdfUri, { dialogTitle: 'Spara PDF' });
                  else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
                } catch (shareErr) {
                  console.warn('[PDF] shareAsync failed, opening print dialog as fallback', shareErr);
                  await Print.printAsync({ uri: pdfUri });
                }
              } else {
                throw new Error('printToFileAsync returned no uri');
              }
            } catch(e) {
              console.warn('[PDF] printToFileAsync with logo/fallback failed, retrying without logo', e);
              try {
                let html2 = null;
                if (typeof buildSummaryHtml === 'function') html2 = buildSummaryHtml(exportFilter, null);
                else {
                  const preparedControls2 = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
                  html2 = (preparedControls2 || []).map(c => buildPdfHtmlForControl({ control: c, project, company: { name: companyNameForPdf } })).join('<div style="page-break-after:always"></div>');
                }
                console.log('[PDF] retry HTML length:', html2 ? String(html2).length : 0);
                if (!html2 || String(html2).trim().length < 20) throw new Error('Empty retry HTML');
                const fileResult2 = await Print.printToFileAsync({ html: html2 });
                const pdfUri2 = fileResult2?.uri;
                if (pdfUri2) {
                  try {
                    const avail2 = await Sharing.isAvailableAsync();
                    if (avail2) await Sharing.shareAsync(pdfUri2, { dialogTitle: 'Spara PDF' });
                    else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri2 });
                  } catch (shareErr2) {
                    console.warn('[PDF] shareAsync failed (retry), falling back to print dialog', shareErr2);
                    await Print.printAsync({ uri: pdfUri2 });
                  }
                } else {
                  throw new Error('printToFileAsync retry returned no uri');
                }
              } catch (err2) { throw err2; }
            }
          } catch(e) {
            console.error('[PDF] Preview error:', e);
            setNotice({ visible: true, text: 'Kunde inte förhandsvisa PDF' });
            setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
          } finally {
            setExportingPdf(false);
          }
        };
      // PDF export-funktion
      const handleExportPdf = async () => {
        if (!controls || controls.length === 0) return;
        setExportingPdf(true);
        try {
          try { Haptics.selectionAsync(); } catch {}

          // Prefer company profile logo for PDF (MVP branding: only on print/PDF)
          let profile = companyProfile;
          if (!profile && companyId) {
            try {
              profile = await fetchCompanyProfile(companyId);
              if (profile) setCompanyProfile(profile);
            } catch(_e) {}
          }
          const companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
          const companyLogoFromProfile = profile?.logoUrl || null;

          let logoForPrint = companyLogoFromProfile || companyLogoUri || null;
          if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
            try {
                const fileName = 'company-logo.export.png';
              const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
              if (baseDir) {
                const dest = baseDir + fileName;
                const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                if (dl?.uri) logoForPrint = dl.uri;
              }
            } catch {}
          }
          // Try to convert logo to base64 for embedding
          let logoBase64 = null;
          try {
            logoBase64 = await readUriAsBase64(logoForPrint);
            if (!logoBase64) {
              try {
                const a = Asset.fromModule(require('../assets/images/foretag_ab.png'));
                await Asset.loadAsync(a);
                const local = a.localUri || a.uri;
                if (local) {
                  logoBase64 = await readUriAsBase64(local);
                  if (logoBase64) logoForPrint = 'data:image/png;base64,' + logoBase64;
                }
              } catch(_e) {}
            } else {
              logoForPrint = 'data:image/png;base64,' + logoBase64;
            }
          } catch(e) { console.warn('[PDF] logo base64 conversion failed', e); }

          // Bygg HTML för export (alla eller filtrerat) — säkrare bygg och logg
          let html;
          try {
            if (typeof buildSummaryHtml === 'function') html = buildSummaryHtml(exportFilter, logoForPrint);
            else {
                const companyObj = { name: companyNameForPdf, logoUrl: companyLogoFromProfile, logoBase64 };
                const preparedControls = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
              html = (preparedControls || []).map(c => buildPdfHtmlForControl({ control: c, project, company: companyObj })).join('<div style="page-break-after:always"></div>');
            }
          } catch (hErr) {
            console.error('[PDF] error while building HTML for export', hErr);
            html = null;
          }
          console.log('[PDF] export HTML length:', html ? String(html).length : 0);
          try {
            if (!html || String(html).trim().length < 20) throw new Error('Empty export HTML');
            const fileResult = await Print.printToFileAsync({ html });
            const pdfUri = fileResult?.uri;
            if (pdfUri) {
              try {
                const avail = await Sharing.isAvailableAsync();
                if (avail) await Sharing.shareAsync(pdfUri, { dialogTitle: 'Spara PDF' });
                else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
              } catch (shareErr) {
                console.warn('[PDF] shareAsync failed, falling back to open print dialog', shareErr);
                await Print.printAsync({ uri: pdfUri });
              }
            } else {
              throw new Error('printToFileAsync returned no uri');
            }
          } catch(e) {
            console.warn('[PDF] printToFileAsync with logo failed or HTML invalid, retrying without logo', e);
            try {
              let html2 = null;
              if (typeof buildSummaryHtml === 'function') html2 = buildSummaryHtml(exportFilter, null);
              else {
                const preparedControls2 = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
                html2 = (preparedControls2 || []).map(c => buildPdfHtmlForControl({ control: c, project, company: { name: companyNameForPdf } })).join('<div style="page-break-after:always"></div>');
              }
              console.log('[PDF] retry export HTML length:', html2 ? String(html2).length : 0);
              if (!html2 || String(html2).trim().length < 20) throw new Error('Empty retry export HTML');
              const fileResult2 = await Print.printToFileAsync({ html: html2 });
              const pdfUri2 = fileResult2?.uri;
              if (pdfUri2) {
                try {
                  const avail2 = await Sharing.isAvailableAsync();
                  if (avail2) await Sharing.shareAsync(pdfUri2, { dialogTitle: 'Spara PDF' });
                  else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri2 });
                } catch (shareErr2) {
                  console.warn('[PDF] shareAsync failed (retry), falling back to print dialog', shareErr2);
                  await Print.printAsync({ uri: pdfUri2 });
                }
              } else {
                throw new Error('printToFileAsync retry returned no uri');
              }
            } catch (err2) { throw err2; }
          }
          setNotice({ visible: true, text: 'PDF genererad' });
          setTimeout(() => setNotice({ visible: false, text: '' }), 3000);
        } catch(e) {
          console.error('[PDF] Export error:', e);
          setNotice({ visible: true, text: 'Kunde inte exportera PDF' });
          setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
        } finally {
          setExportingPdf(false);
        }
      };
    const [notice, setNotice] = useState({ visible: false, text: '' });
    const scrollRef = useRef(null);
  // Destructure navigation params
  const { project: initialProject, companyId, initialCreator, selectedAction } = route.params || {};
  
  // Local state for project that can be updated when project ID changes
  const [project, setProject] = useState(initialProject);
  
  // Internal navigation state
  const [activeSection, setActiveSection] = useState('overview');
  
  // Update project state when route params change
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject]);
  
  // Listen for project updates (e.g., when project ID changes)
  useEffect(() => {
    if (!project?.id) return;
    
    const unsubscribe = onProjectUpdated((updatedProject) => {
      if (!updatedProject || !updatedProject.id) return;
      
      // Check if this is the same project (by comparing IDs or old ID)
      const currentId = String(project.id);
      const newId = String(updatedProject.id);
      
      if (currentId === newId) {
        // Same ID, just update the project
        setProject(updatedProject);
      } else if (updatedProject._idChanged && updatedProject._oldId) {
        // Project ID changed - check if old ID matches current project
        const oldId = String(updatedProject._oldId);
        if (currentId === oldId) {
          console.log('[ProjectDetails] Project ID changed, updating from', oldId, 'to', newId);
          const updated = { ...updatedProject };
          delete updated._oldId;
          delete updated._idChanged;
          setProject(updated);
        }
      }
    });
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [project?.id]);
  
  // Loading state for kalkylskede projects
  // Check if project is in a phase that uses PhaseLayout
  // Only phase-based structures (kalkylskede/produktion/avslut/eftermarknad) use PhaseLayout.
  // "Valfri mappstruktur" (phase key: free) falls back to the classic ProjectDetails view.
  let projectPhaseKey = null;
  let PhaseLayoutComponent = null;
  const PHASE_LAYOUT_KEYS = new Set(['kalkylskede', 'produktion', 'avslut', 'eftermarknad']);
  
  if (project && companyId && project.id) {
    try {
      const projectPhase = getProjectPhase(project);
      const candidatePhaseKey = projectPhase?.key || (!project?.phase ? DEFAULT_PHASE : null);
      projectPhaseKey = candidatePhaseKey && PHASE_LAYOUT_KEYS.has(candidatePhaseKey) ? candidatePhaseKey : null;
      
      // Lazy load PhaseLayout for all phases
      if (projectPhaseKey) {
        try {
          const phaseModule = require('../features/project-phases/phases/PhaseLayout');
          PhaseLayoutComponent = phaseModule.default;
        } catch (importErr) {
          console.error('[ProjectDetails] Error importing PhaseLayout:', importErr);
          projectPhaseKey = null; // Fall back to normal view
        }
      }
    } catch (err) {
      console.error('[ProjectDetails] Error checking phase:', err);
      projectPhaseKey = null;
    }
  }
  
  // Handler for phase change - updates project phase in hierarchy
  const handleProjectPhaseChange = React.useCallback(async (newPhaseKey) => {
    if (!project?.id || !companyId) return;
    
    try {
      // Update project phase
      const updatedProject = {
        ...project,
        phase: newPhaseKey,
        updatedAt: new Date().toISOString(),
      };
      
      // Emit update so HomeScreen can update hierarchy
      emitProjectUpdated(updatedProject);
      
      // Update local project state
      setProject(updatedProject);
      
      // Update navigation params
      if (typeof navigation?.setParams === 'function') {
        navigation.setParams({ project: updatedProject });
      }
    } catch (error) {
      console.error('[ProjectDetails] Error changing project phase:', error);
      throw error;
    }
  }, [project, companyId, navigation]);

  // If project has a phase, render the PhaseLayout (full width, no internal leftpanel)
  if (projectPhaseKey && companyId && project?.id && PhaseLayoutComponent) {
    try {
      return (
        <View style={{ flex: 1, backgroundColor: '#f4f6fa', width: '100%' }}>
          <PhaseLayoutComponent
            companyId={companyId}
            projectId={project.id}
            project={project}
            phaseKey={projectPhaseKey}
            hideLeftPanel={true}
            externalActiveSection={route?.params?.phaseActiveSection}
            externalActiveItem={route?.params?.phaseActiveItem}
            onExternalSectionChange={route?.params?.onPhaseSectionChange}
            onExternalItemChange={route?.params?.onPhaseItemChange}
            onPhaseChange={handleProjectPhaseChange}
            reactNavigation={navigation}
          />
        </View>
      );
    } catch (err) {
      console.error('[ProjectDetails] Error rendering PhaseLayout:', err);
      // Fall through to normal rendering
    }
  }
  
  const [inlineControl, setInlineControl] = useState(null);
  const openInlineControl = useCallback((type, initialValues) => {
    if (!type) return;
    // Freeze the project snapshot at time of opening so the form can't "jump"
    // if parent selection changes.
    setInlineControl({ type, initialValues: initialValues || undefined, projectSnapshot: project || null });
    try {
      if (scrollRef?.current && typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ y: 0, animated: false });
      }
    } catch(_e) {}
  }, [project]);
  const closeInlineControl = useCallback(() => setInlineControl(null), []);

  const onInlineLockChange = route?.params?.onInlineLockChange;
  const onInlineViewChange = route?.params?.onInlineViewChange;
  const inlineControlType = inlineControl?.type;

  // Inform parent (HomeScreen) when an inline FORM is open on web.
  // This is used to lock the project tree so the user can't switch projects mid-control.
  useEffect(() => {
    try {
      const isWeb = Platform.OS === 'web';
      const isInlineFormOpen = isWeb && !!(inlineControlType && inlineControlType !== 'ControlDetails');
      const cb = onInlineLockChange;
      // Backwards-compatible: allow both prop injection patterns
      // 1) route.params.onInlineLockChange (if parent can't pass real props)
      if (typeof cb === 'function') cb(isInlineFormOpen);
    } catch(_e) {}
  }, [inlineControlType, onInlineLockChange]);

  // Inform parent (HomeScreen) about which inline view is active (breadcrumb leaf).
  useEffect(() => {
    try {
      if (Platform.OS !== 'web') return;
      const cb = onInlineViewChange;
      if (typeof cb !== 'function') return;

      if (!inlineControlType) {
        cb(null);
        return;
      }

      const explicitType = String(inlineControl?.type || '').trim();
      const detailsType = String(inlineControl?.initialValues?.control?.type || '').trim();
      const label = (explicitType === 'ControlDetails' ? detailsType : explicitType) || explicitType;
      cb({ label });
    } catch (_e) {}
  }, [inlineControlType, onInlineViewChange]);

  // When HomeScreen passes a selectedAction (e.g. open a draft from the dashboard),
  // process it once and open the corresponding inline control.
  const lastProcessedActionIdRef = useRef('');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = selectedAction && selectedAction.id ? String(selectedAction.id) : '';
    if (!id) return;
    if (lastProcessedActionIdRef.current === id) return;
    lastProcessedActionIdRef.current = id;
    try {
      if (selectedAction.kind === 'closeInline') {
        closeInlineControl();
        return;
      }
      if (selectedAction.kind === 'openDraft' && selectedAction.type) {
        openInlineControl(selectedAction.type, selectedAction.initialValues || undefined);
      }
      if (selectedAction.kind === 'openControlDetails' && selectedAction.control) {
        try { openInlineControl('ControlDetails', { control: selectedAction.control }); } catch(_e) {}
      }
      // Överblick för eftermarknad: inget att göra här, hanteras i render
    } catch(_e) {}
  }, [openInlineControl, closeInlineControl, selectedAction]);
  const [adminPickerVisible, setAdminPickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [companyAdminsError, setCompanyAdminsError] = useState(null);
  
  // States for editing project info modal
  const [editingInfo, setEditingInfo] = useState(false);
  const [editableProject, setEditableProject] = useState(() => normalizeProject(project));
  const [originalProjectId, setOriginalProjectId] = useState(project?.id || null);
  
  // States for participants (deltagare)
  const [editProjectParticipants, setEditProjectParticipants] = useState([]);
  const [editProjectParticipantsSearch, setEditProjectParticipantsSearch] = useState('');
  const [companyMembers, setCompanyMembers] = useState([]);
  const [loadingCompanyMembers, setLoadingCompanyMembers] = useState(false);
  const [companyMembersPermissionDenied, setCompanyMembersPermissionDenied] = useState(false);
  const [responsibleDropdownOpen, setResponsibleDropdownOpen] = useState(false);
  const responsibleDropdownRef = useRef(null);
  const [focusedInput, setFocusedInput] = useState(null);
  const [participantsDropdownOpen, setParticipantsDropdownOpen] = useState(false);
  const participantsDropdownRef = useRef(null);

  // Load company admins (for responsible dropdown) - fetch both admin and superadmin
  useEffect(() => {
    let cancelled = false;
    const loadAdmins = async () => {
      if (!editingInfo && !responsibleDropdownOpen) return;
      if (!companyId) {
        setCompanyAdmins([]);
        setCompanyAdminsError('Saknar företag (companyId).');
        return;
      }

      setLoadingCompanyAdmins(true);
      setCompanyAdminsError(null);
      try {
        // Fetch both admin and superadmin users for responsible person dropdown
        const [admins, superadmins] = await Promise.all([
          fetchCompanyMembers(companyId, { role: 'admin' }),
          fetchCompanyMembers(companyId, { role: 'superadmin' })
        ]);
        // Combine and deduplicate by id
        const allAdmins = [...(Array.isArray(admins) ? admins : []), ...(Array.isArray(superadmins) ? superadmins : [])];
        const uniqueAdmins = allAdmins.filter((m, idx, arr) => arr.findIndex(x => x.id === m.id) === idx);
        if (!cancelled) setCompanyAdmins(uniqueAdmins);
      } catch(e) {
        if (!cancelled) {
          setCompanyAdmins([]);
          const msg = e?.code === 'permission-denied'
            ? 'Behörighet saknas för att läsa admins.'
            : 'Kunde inte ladda admins.';
          setCompanyAdminsError(msg);
        }
      } finally {
        if (!cancelled) setLoadingCompanyAdmins(false);
      }
    };

    loadAdmins();
    return () => {
      cancelled = true;
    };
  }, [editingInfo, responsibleDropdownOpen, companyId]);

  // Load all company members (for participants dropdown)
  useEffect(() => {
    let cancelled = false;
    const loadMembers = async () => {
      if (!editingInfo) return;
      if (!companyId) {
        setCompanyMembers([]);
        setCompanyMembersPermissionDenied(false);
        return;
      }

      setLoadingCompanyMembers(true);
      setCompanyMembersPermissionDenied(false);
      try {
        // Fetch ALL members (no role filter) for participants
        const allMembers = await fetchCompanyMembers(companyId);
        if (!cancelled) setCompanyMembers(Array.isArray(allMembers) ? allMembers : []);
      } catch(e) {
        if (!cancelled) {
          const msg = String(e?.message || e || '').toLowerCase();
          if (e?.code === 'permission-denied' || msg.includes('permission')) {
            setCompanyMembersPermissionDenied(true);
          }
          setCompanyMembers([]);
        }
      } finally {
        if (!cancelled) setLoadingCompanyMembers(false);
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [editingInfo, companyId]);

  // Initialize participants from editableProject when modal opens or overblick is shown
  useEffect(() => {
    const shouldLoadParticipants = editingInfo || (selectedAction?.kind === 'overblick');
    if (shouldLoadParticipants && editableProject?.participants) {
      const participants = Array.isArray(editableProject.participants) 
        ? editableProject.participants.map(p => ({
            uid: p.uid || p.id,
            displayName: p.displayName || p.name || null,
            email: p.email || null,
            role: p.role || null,
          }))
        : [];
      setEditProjectParticipants(participants);
    } else if (!shouldLoadParticipants) {
      setEditProjectParticipants([]);
      setEditProjectParticipantsSearch('');
    }
  }, [editingInfo, editableProject?.participants, selectedAction?.kind]);

  // Handle click outside for responsible and participants dropdowns (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    
    const handleClickOutside = (e) => {
      if (responsibleDropdownRef.current && !responsibleDropdownRef.current.contains(e.target)) {
        setResponsibleDropdownOpen(false);
      }
      if (participantsDropdownRef.current && !participantsDropdownRef.current.contains(e.target)) {
        setParticipantsDropdownOpen(false);
      }
    };

    if (responsibleDropdownOpen || participantsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [responsibleDropdownOpen, participantsDropdownOpen]);
  const hasValidProject = !!(project && typeof project === 'object' && project.id);
  const [controls, setControls] = useState([]);
  // Sökfält för kontroller
  const [searchText, setSearchText] = useState('');

  // Ladda både utkast (pågående) och slutförda kontroller för projektet
  const loadControls = useCallback(async () => {
    if (!project?.id) return;
    let allControls = [];
    // Hämta utkast (pågående)
    try {
      const draftsRaw = await AsyncStorage.getItem('draft_controls');
      if (draftsRaw) {
        const drafts = JSON.parse(draftsRaw);
        drafts.filter(d => d.project?.id === project.id).forEach(draft => {
          allControls.push({ ...draft, isDraft: true });
        });
      }
    } catch {}
    // Hämta slutförda
    try {
      const completedRaw = await AsyncStorage.getItem('completed_controls');
      if (completedRaw) {
        const completed = JSON.parse(completedRaw);
        completed.filter(c => c.project?.id === project.id).forEach(ctrl => {
          allControls.push({ ...ctrl, isDraft: false });
        });
      }
    } catch {}
    // Try fetching from Firestore as well (merge remote completed controls)
    try {
      const remote = await fetchControlsForProject(project.id, companyId);
      if (Array.isArray(remote) && remote.length > 0) {
        remote.forEach(r => {
          // avoid duplicates if already in allControls by id
          if (!allControls.find(c => c.id && r.id && c.id === r.id)) {
            allControls.push(Object.assign({}, r, { isDraft: false }));
          }
        });
      }
    } catch(_e) { /* ignore Firestore errors - we already have local fallback */ }

    // Fetch remote drafts too so a draft created in app can be finished on web
    try {
      const remoteDrafts = await fetchDraftControlsForProject(project.id, companyId);
      if (Array.isArray(remoteDrafts) && remoteDrafts.length > 0) {
        remoteDrafts.forEach(r => {
          if (!allControls.find(c => c.id && r.id && c.id === r.id)) {
            allControls.push(Object.assign({}, r, { isDraft: true }));
          }
        });
      }
    } catch(_e) { /* ignore */ }
    // Sort controls by date (prefer date || savedAt || createdAt) descending
    allControls.sort((a,b) => {
      const ta = new Date(a.date || a.savedAt || a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.date || b.savedAt || b.createdAt || 0).getTime() || 0;
      return tb - ta;
    });
    setControls(allControls);
  }, [project?.id, companyId]);

  // Web: allow parent (HomeScreen header) to force-refresh the list.
  useEffect(() => {
    if (refreshNonce == null) return;
    loadControls();
  }, [refreshNonce, loadControls]);

  // Ladda kontroller när sidan visas (fokus)
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadControls();
    });
    loadControls();
    return unsubscribe;
  }, [navigation, loadControls]);

  // Update editableProject when parent passes a new project (e.g., selecting another project inline)
  React.useEffect(() => {
    setEditableProject(normalizeProject(project));
    setOriginalProjectId(project?.id || null);
  }, [project]);
  const [showForm, setShowForm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [undoState, setUndoState] = useState({ visible: false, item: null, index: -1 });
  const [companyLogoUri] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [skyddsrondWeeksPickerVisible, setSkyddsrondWeeksPickerVisible] = useState(false);
  const [projectInfoExpanded, setProjectInfoExpanded] = useState(false);
  const projectInfoSpin = useRef(new Animated.Value(0)).current;

  const toggleProjectInfo = () => {
    const next = !projectInfoExpanded;
    setProjectInfoExpanded(next);
    try {
      Animated.timing(projectInfoSpin, {
        toValue: next ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: (Platform && Platform.OS === 'web') ? false : true,
      }).start();
    } catch (_e) {}
  };

  const projectInfoRotate = projectInfoSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const skyddsrondInfo = React.useMemo(() => {
    const enabled = editableProject?.skyddsrondEnabled !== false;
    const intervalWeeksRaw = Number(editableProject?.skyddsrondIntervalWeeks);
    const intervalDaysRaw = Number(editableProject?.skyddsrondIntervalDays);
    const intervalDays = (Number.isFinite(intervalWeeksRaw) && intervalWeeksRaw > 0)
      ? (intervalWeeksRaw * 7)
      : (Number.isFinite(intervalDaysRaw) && intervalDaysRaw > 0 ? intervalDaysRaw : 14);
    const intervalWeeks = Math.max(1, Math.min(4, Math.round(intervalDays / 7) || 2));

    const MS_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const toMs = (v) => {
      try {
        if (!v) return 0;
        if (typeof v === 'number') return v;
        const t = new Date(v).getTime();
        return Number.isFinite(t) ? t : 0;
      } catch(_e) {
        return 0;
      }
    };

    let lastMs = 0;
    try {
      (controls || []).forEach((c) => {
        if (!c || c.isDraft) return;
        if (c.type !== 'Skyddsrond') return;
        const ts = toMs(c.date || c.savedAt || c.updatedAt || c.createdAt || null);
        if (ts > lastMs) lastMs = ts;
      });
    } catch(_e) {}

    const createdMs = toMs(editableProject?.createdAt || null);
    const firstDueMs = toMs(editableProject?.skyddsrondFirstDueDate || null);
    const baselineMs = lastMs || createdMs || now;
    const nextDueMs = lastMs
      ? (baselineMs + intervalDays * MS_DAY)
      : (firstDueMs || (baselineMs + intervalDays * MS_DAY));

    const overdue = now > nextDueMs;
    const daysUntil = Math.ceil((nextDueMs - now) / MS_DAY);
    const soon = !overdue && Number.isFinite(daysUntil) && daysUntil <= 3;

    const fmt = (ms) => {
      try {
        if (!ms) return '—';
        return new Date(ms).toLocaleDateString('sv-SE');
      } catch(_e) {
        return '—';
      }
    };

    if (!enabled) {
      return {
        enabled: false,
        intervalWeeks,
        intervalDays,
        lastLabel: lastMs ? fmt(lastMs) : 'Ingen registrerad',
        nextLabel: fmt(nextDueMs),
        overdue: false,
        soon: false,
      };
    }

    return {
      enabled: true,
      intervalWeeks,
      intervalDays,
      lastLabel: lastMs ? fmt(lastMs) : 'Ingen registrerad',
      nextLabel: fmt(nextDueMs),
      overdue,
      soon,
    };
  }, [controls, editableProject?.createdAt, editableProject?.skyddsrondEnabled, editableProject?.skyddsrondIntervalWeeks, editableProject?.skyddsrondIntervalDays, editableProject?.skyddsrondFirstDueDate]);
  // Kontrolltyper: använd samma company-specifika lista som HomeScreen
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
        if (mounted && Array.isArray(list) && list.length > 0) {
          setControlTypes(list);
        } else if (mounted) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const controlTypeOptions = React.useMemo(() => {
    const baseList = Array.isArray(controlTypes) && controlTypes.length > 0
      ? controlTypes
      : DEFAULT_CONTROL_TYPES;

    // Om vi har custom-typer (från registret) använder vi den listan rätt upp och ned
    // och bortser från äldre "enabledControlTypes" i companyProfile.
    const hasCustomTypes = baseList.some(ct => ct && ct.builtin === false);

    let visible = baseList.filter(ct => ct && ct.hidden !== true);

    const enabled = companyProfile?.enabledControlTypes;
    if (!hasCustomTypes && Array.isArray(enabled) && enabled.length > 0) {
      const enabledSet = new Set(enabled.map(v => String(v || '').trim()).filter(Boolean));
      visible = visible.filter((ct) => {
        const name = String(ct.name || '').trim();
        const key = String(ct.key || '').trim();
        if (!enabledSet.size) return true;
        return (name && enabledSet.has(name)) || (key && enabledSet.has(key));
      });
    }

    return visible.map((ct) => ({
      type: ct.name || ct.key || '',
      key: ct.key || '',
      icon: ct.icon || 'document-text-outline',
      color: ct.color || '#455A64',
    })).filter(o => o.type);
  }, [controlTypes, companyProfile]);
  const [templates, setTemplates] = useState([]);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [templatePickerLabel, setTemplatePickerLabel] = useState('');
  const [templatePickerItems, setTemplatePickerItems] = useState([]);
  const [templatePickerSearch, setTemplatePickerSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!companyId) {
          if (!cancelled) setTemplates([]);
          return;
        }
        const items = await fetchCompanyMallar(companyId).catch(() => []);
        if (cancelled) return;
        const list = Array.isArray(items) ? items : [];
        // Filtrera bort mallar utan kontrolltyp; sortering sker redan i fetchCompanyMallar
        const active = list.filter(tpl => String(tpl?.controlType || '').trim());
        setTemplates(active);
      } catch (_e) {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const openTemplatePicker = (label, items) => {
    setTemplatePickerLabel(label || '');
    setTemplatePickerItems(Array.isArray(items) ? items : []);
    setTemplatePickerSearch('');
    setTemplatePickerVisible(true);
  };

  const handleStartControl = async (keyOrName, labelOverride) => {
    const raw = String(keyOrName || '').trim();
    const v = raw.toLowerCase();
    const label = labelOverride || raw;

    // Native: om det finns mallar för denna kontrolltyp, använd TemplateControlScreen
    if (Platform.OS !== 'web') {
      const relevantTemplates = (templates || []).filter((tpl) => {
        const ct = String(tpl?.controlType || '').trim();
        if (!ct) return false;
        return ct === label;
      });

      if (relevantTemplates.length === 1) {
        const tpl = relevantTemplates[0];
        navigation.navigate('TemplateControlScreen', {
          project,
          controlType: label,
          templateId: tpl.id,
          template: tpl,
          companyId,
        });
        return;
      }

      if (relevantTemplates.length > 1) {
        openTemplatePicker(label, relevantTemplates);
        return;
      }
    }

    switch (v) {
      case 'arbetsberedning':
      case 'riskbedömning':
      case 'riskbedomning':
      case 'fuktmätning':
      case 'fuktmatning':
      case 'egenkontroll':
      case 'mottagningskontroll':
      case 'skyddsrond':
        // Alla KMA-kontroller navigerar till KMAScreen
        if (Platform.OS === 'web') {
          openInlineControl(v === 'riskbedomning' ? 'Riskbedömning' : (v.charAt(0).toUpperCase() + v.slice(1)));
        } else {
          navigation.navigate('KMAScreen', { project, controlType: v });
        }
        break;
      default:
        {
            const meta = (controlTypeOptions || []).find(o => (o.key && o.key.toLowerCase() === v) || o.type === label) || null;
            const iconName = meta && meta.icon ? meta.icon : undefined;
            const iconColor = meta && meta.color ? meta.color : undefined;
            if (Platform.OS === 'web') {
              openInlineControl(label);
            } else {
              navigation.navigate('ControlForm', {
                project,
                controlType: label,
                controlIcon: iconName,
                controlColor: iconColor,
              });
            }
        }
    }
  };
  const [exportFilter, setExportFilter] = useState('Alla');
  const [, setSelectedControl] = useState(null);
  const [, setShowControlOptions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ visible: false, control: null });
  const undoTimerRef = useRef(null);
  const [quickControlSlots, setQuickControlSlots] = useState(['', '', '', '']);
  const [quickSlotConfigIndex, setQuickSlotConfigIndex] = useState(null);
  const [showQuickSlotModal, setShowQuickSlotModal] = useState(false);
  const quickSlotsLoadedRef = useRef(false);
  // ...existing code...

  // Prefetch company profile for PDF branding (logo/name) without affecting UI
  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setCompanyProfile(null);
      return () => { active = false; };
    }
    fetchCompanyProfile(companyId)
      .then((p) => { if (active) setCompanyProfile(p || null); })
      .catch((e) => { /* ignore */ });
    return () => { active = false; };
  }, [companyId]);

  // Load and persist per-user quick control button choices
  const quickSlotsStorageKey = React.useMemo(() => {
    const userKey = (initialCreator && (initialCreator.uid || initialCreator.id || initialCreator.email))
      ? String(initialCreator.uid || initialCreator.id || initialCreator.email)
      : 'local';
    const companyKey = companyId ? String(companyId) : 'global';
    return `quick_control_slots_${companyKey}_${userKey}`;
  }, [companyId, initialCreator]);

  React.useEffect(() => {
    if (!controlTypeOptions || controlTypeOptions.length === 0) return;
    if (quickSlotsLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(quickSlotsStorageKey);
        if (cancelled) return;
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            setQuickControlSlots([
              String(arr[0] || ''),
              String(arr[1] || ''),
              String(arr[2] || ''),
              String(arr[3] || ''),
            ]);
            quickSlotsLoadedRef.current = true;
            return;
          }
        }
      } catch (_e) {}
      // No saved prefs: default to first four visible control types (store key when möjligt)
      const defaults = (controlTypeOptions || []).slice(0, 4).map(o => o.key || o.type);
      setQuickControlSlots([
        defaults[0] || '',
        defaults[1] || '',
        defaults[2] || '',
        defaults[3] || '',
      ]);
      quickSlotsLoadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [controlTypeOptions, quickSlotsStorageKey]);

  const persistQuickSlots = React.useCallback(async (slots) => {
    try {
      await AsyncStorage.setItem(quickSlotsStorageKey, JSON.stringify(slots));
    } catch (_e) {}
  }, [quickSlotsStorageKey]);

  const openQuickSlotConfig = (index) => {
    setQuickSlotConfigIndex(index);
    setShowQuickSlotModal(true);
  };

  // Handler for long-press on a control
  const handleControlLongPress = (control) => {
    setSelectedControl(control);
    setShowControlOptions(true);
  };

  // Handler for deleting selected control
  const handleDeleteSelectedControl = async () => {
    if (!deleteConfirm.control) return;
    await actuallyDeleteControl(deleteConfirm.control);
    setDeleteConfirm({ visible: false, control: null });
    setShowControlOptions(false);
    setSelectedControl(null);
    loadControls && loadControls();
  };

  // Delete logic for a control (draft or completed)
  const actuallyDeleteControl = async (control) => {
    if (!control) return;
    if (control.isDraft) {
      // Remove from draft_controls
      const draftsRaw = await AsyncStorage.getItem('draft_controls');
      let drafts = draftsRaw ? JSON.parse(draftsRaw) : [];
      drafts = drafts.filter(
        c => c.id !== control.id
      );
      await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));

      // Best-effort: delete remote draft too
      try { await deleteDraftControlFromFirestore(control.id, companyId); } catch(_e) {}
    } else {
      // Remove from completed_controls
      const completedRaw = await AsyncStorage.getItem('completed_controls');
      let completed = completedRaw ? JSON.parse(completedRaw) : [];
      completed = completed.filter(
        c => c.id !== control.id
      );
      await AsyncStorage.setItem('completed_controls', JSON.stringify(completed));

      // Best-effort: delete remote control too
      try { await deleteControlFromFirestore(control.id, companyId); } catch(_e) {}
    }
  };

  // Create a new draft control locally and refresh list
  const handleAddControl = async () => {
    try {
      if (!newControl || !newControl.type) {
        setNotice({ visible: true, text: 'Välj en kontrolltyp' });
        setTimeout(() => setNotice({ visible: false, text: '' }), 3000);
        return;
      }
      const id = uuidv4();
      const draft = normalizeControl({
        ...newControl,
        id,
        project,
        type: newControl.type,
        status: 'UTKAST',
        savedAt: new Date().toISOString(),
        isDraft: true,
      });
      await persistDraftObject(draft);
      setShowForm(false);
      setNewControl({ type: '', date: '', description: '', byggdel: '' });
      try { loadControls && loadControls(); } catch (_e) {}
      setNotice({ visible: true, text: 'Utkast sparat' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 2500);
    } catch (e) {
      console.warn('[ProjectDetails] handleAddControl failed', e);
      setNotice({ visible: true, text: 'Kunde inte skapa kontroll' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 3500);
    }
  };

  // Undo a recently deleted control (restore into local storage)
  const handleUndo = async () => {
    try {
      if (!undoState || !undoState.item) return;
      const item = undoState.item;
      if (item.isDraft) {
        const raw = await AsyncStorage.getItem('draft_controls');
        const arr = raw ? (JSON.parse(raw) || []) : [];
        const idx = (typeof undoState.index === 'number' && undoState.index >= 0) ? undoState.index : arr.length;
        arr.splice(idx, 0, item);
        await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
      } else {
        const raw = await AsyncStorage.getItem('completed_controls');
        const arr = raw ? (JSON.parse(raw) || []) : [];
        const idx = (typeof undoState.index === 'number' && undoState.index >= 0) ? undoState.index : arr.length;
        arr.splice(idx, 0, item);
        await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      }
      setUndoState({ visible: false, item: null, index: -1 });
      if (undoTimerRef.current) {
        try { clearTimeout(undoTimerRef.current); } catch (_e) {}
        undoTimerRef.current = null;
      }
      try { loadControls && loadControls(); } catch (_e) {}
    } catch (e) {
      console.warn('[ProjectDetails] handleUndo failed', e);
    }
  };

  // Huvud-UI return
  if (!hasValidProject) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 18, color: '#D32F2F', textAlign: 'center' }}>
          Kunde inte läsa projektdata.
        </Text>
        <Text style={{ fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center' }}>
          Projektet är inte korrekt laddat eller saknar ID.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, padding: 12, backgroundColor: '#1976D2', borderRadius: 8 }}
          onPress={() => {
            if (typeof inlineClose === 'function') inlineClose();
            else navigation.goBack();
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Web: keep header/tree and render control forms inside the right pane
  if (Platform.OS === 'web' && inlineControl && inlineControl.type) {
    const isInlineFormOpen = !!(inlineControl && inlineControl.type && inlineControl.type !== 'ControlDetails');

    const handleInlineBack = () => {
      // For forms: always route through the BaseControlForm exit-confirm flow
      // so the user doesn't accidentally leave without saving/finishing.
      if (isInlineFormOpen) {
        try {
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('dkInlineAttemptExit', { detail: { reason: 'headerBack' } }));
            return;
          }
        } catch(_e) {}
      }

      // For non-form inline views (e.g. ControlDetails), just go back to the project page.
      closeInlineControl();
    };

    const getInlineHeaderMeta = () => {
      const explicitType = String(inlineControl?.type || '').trim();
      const detailsType = String(inlineControl?.initialValues?.control?.type || '').trim();
      const type = (explicitType === 'ControlDetails' ? detailsType : explicitType) || explicitType;
      const map = {
        Arbetsberedning: { icon: 'construct-outline', color: '#1976D2', label: 'Arbetsberedning' },
        Egenkontroll: { icon: 'checkmark-done-outline', color: '#388E3C', label: 'Egenkontroll' },
        Fuktmätning: { icon: 'water-outline', color: '#0288D1', label: 'Fuktmätning' },
        Mottagningskontroll: { icon: 'checkbox-outline', color: '#7B1FA2', label: 'Mottagningskontroll' },
        Riskbedömning: { icon: 'warning-outline', color: '#FFD600', label: 'Riskbedömning' },
        Skyddsrond: { icon: 'shield-half-outline', color: '#388E3C', label: 'Skyddsrond' },
      };

      const meta = map[type] || null;
      if (meta) return meta;
      if (type) return { icon: null, color: '#1976D2', label: type };
      return { icon: null, color: '#1976D2', label: 'Kontrolldetaljer' };
    };

    const getInlineProjectLabel = () => {
      const effectiveProject = inlineControl?.projectSnapshot || project;
      const id = String(effectiveProject?.id || '').trim();
      const name = String(effectiveProject?.name || '').trim();
      const combined = `${id} ${name}`.trim();
      return combined || name || id || 'Projekt';
    };

    const wrapInlineControlWithBack = (child) => (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', alignItems: 'center' }}>
          {(() => {
            const meta = getInlineHeaderMeta();
            const projectLabel = getInlineProjectLabel();
            const linkStyle = { color: '#1976D2', fontWeight: '700' };
            const sepStyle = { color: '#9E9E9E', fontWeight: '600' };
            const currentStyle = { color: '#222', fontWeight: '700' };

            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, height: 32 }}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 14, flexShrink: 1 }}>
                  <Text onPress={handleInlineBack} style={linkStyle}>
                    Projekt
                  </Text>
                  <Text style={sepStyle}> / </Text>
                  <Text onPress={handleInlineBack} style={linkStyle}>
                    {projectLabel}
                  </Text>
                  <Text style={sepStyle}> / </Text>
                  <Text style={currentStyle}>{meta?.label || ''}</Text>
                </Text>

                {meta?.icon ? (
                  <Ionicons name={meta.icon} size={18} color={meta.color} style={{ marginLeft: 10 }} />
                ) : null}
              </View>
            );
          })()}
        </View>
        {child}
      </View>
    );

    const effectiveProject = inlineControl?.projectSnapshot || project;
    const commonProps = {
      project: effectiveProject,
      initialValues: inlineControl.initialValues,
      onExit: closeInlineControl,
      onFinished: () => {
        closeInlineControl();
        loadControls();
      },
    };

    switch (inlineControl.type) {
      case 'Arbetsberedning':
        return wrapInlineControlWithBack(<ArbetsberedningControl {...commonProps} />);
      case 'Riskbedömning':
        return wrapInlineControlWithBack(<RiskbedömningControl {...commonProps} />);
      case 'Fuktmätning':
        return wrapInlineControlWithBack(<FuktmätningControl {...commonProps} />);
      case 'Egenkontroll':
        return wrapInlineControlWithBack(<EgenkontrollControl {...commonProps} />);
      case 'Mottagningskontroll':
        return wrapInlineControlWithBack(<MottagningskontrollControl {...commonProps} />);
      case 'Skyddsrond':
        return wrapInlineControlWithBack(<SkyddsrondControl {...commonProps} />);
      case 'ControlDetails':
        return wrapInlineControlWithBack(
          <ControlDetails
            route={{
              params: {
                control: inlineControl?.initialValues?.control,
                project: effectiveProject,
                companyId,
              },
            }}
          />
        );
      default:
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 16, color: '#D32F2F', textAlign: 'center' }}>
              Okänd kontrolltyp: {String(inlineControl.type)}
            </Text>
            <TouchableOpacity
              style={{ marginTop: 16, padding: 12, backgroundColor: '#1976D2', borderRadius: 8 }}
              onPress={closeInlineControl}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Tillbaka</Text>
            </TouchableOpacity>
          </View>
        );
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, Platform.OS === 'web' ? { backgroundColor: '#F7FAFC' } : null]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
    >
      {/* Rubrik för projektinfo (med tillbaka-pil i appen och redigera-knapp till höger) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              onPress={() => {
                if (inlineClose) {
                  inlineClose();
                } else {
                  try { navigation.goBack(); } catch (_e) {}
                }
              }}
              style={{ padding: 6, marginRight: 8 }}
              accessibilityLabel="Tillbaka"
            >
              <Ionicons name="chevron-back" size={20} color="#1976D2" />
            </TouchableOpacity>
          )}
          {Platform.OS !== 'web' ? (
            <>
              <Ionicons name="document-text-outline" size={20} color="#1976D2" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">Projektinformation</Text>
            </>
          ) : null}
        </View>
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 12 }}>
            <TouchableOpacity
              onPress={() => setEditingInfo(true)}
              accessibilityLabel="Ändra projektinfo"
              style={{ padding: 6, marginRight: 8 }}
            >
              <Ionicons name="create-outline" size={22} color="#1976D2" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setEditingInfo(true)}
            accessibilityLabel="Ändra projektinfo"
            style={{ padding: 6 }}
          >
            <Ionicons name="create-outline" size={22} color="#1976D2" />
          </TouchableOpacity>
        )}
      </View>
      {/* Project Header - Show project name and number prominently */}
      <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: editableProject?.status === 'completed' ? '#222' : '#43A047',
            marginRight: 12,
            borderWidth: 2,
            borderColor: '#bbb',
          }} />
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#222', marginRight: 12 }}>
            {editableProject?.id || project?.id || project?.number || ''}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#222', flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            {editableProject?.name || project?.name || project?.fullName || 'Projekt'}
          </Text>
        </View>
        {editableProject?.phase && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 14, color: '#666' }}>
              Fas: {getProjectPhase(editableProject).name}
            </Text>
          </View>
        )}
      </View>

      {/* Internal Navigation */}
      <ProjectInternalNavigation
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        project={editableProject || project}
      />

      {/* Section Content */}
      {activeSection === 'documents' && (
        <ProjectDocumentsView
          project={editableProject || project}
          companyId={companyId}
        />
      )}

      {/* Overview Section - Show project info */}
      {activeSection === 'overview' && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#222' }}>
            Projektinformation
          </Text>
          {/* Projektinfo med logga, status, projektnummer, projektnamn (expanderbar) */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18, padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' }}>
            {companyLogoUri ? (
              <View style={{ marginRight: 16 }}>
                <Image source={{ uri: companyLogoUri }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' }} resizeMode="contain" />
              </View>
            ) : null}
            <View style={{ flex: 1, position: 'relative' }}>
              {/* Header-rad med projektnummer/namn och chevron */}
              <TouchableOpacity
                onPress={toggleProjectInfo}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: projectInfoExpanded ? 8 : 0 }}
              >
                <View style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: editableProject?.status === 'completed' ? '#222' : '#43A047',
                  marginRight: 8,
                  borderWidth: 2,
                  borderColor: '#bbb',
                }} />
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', marginRight: 8 }}>{editableProject?.id}</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{editableProject?.name}</Text>
                <Animated.View style={{ marginLeft: 8, transform: [{ rotate: projectInfoRotate }] }}>
                  <Ionicons name={projectInfoExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                </Animated.View>
              </TouchableOpacity>

          {projectInfoExpanded && (
          <View style={{ marginBottom: 2 }}>
            <View style={{ marginBottom: 2 }}>
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Skapad:</Text> {editableProject?.createdAt
                  ? <Text>{new Date(editableProject.createdAt).toLocaleDateString()}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Ansvarig:</Text> {editableProject?.ansvarig
                  ? <Text>{formatPersonName(editableProject.ansvarig)}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Status:</Text> {editableProject?.status === 'completed'
                  ? <Text>Avslutat</Text>
                  : editableProject?.status === 'ongoing'
                    ? <Text>Pågående</Text>
                    : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Kund:</Text> {editableProject?.client
                  ? <Text>{editableProject.client}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Adress:</Text> {editableProject?.adress
                  ? <Text>{editableProject.adress}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Fastighetsbeteckning:</Text> {editableProject?.fastighetsbeteckning
                  ? <Text>{editableProject.fastighetsbeteckning}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Valfritt</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Skyddsronder:</Text>{' '}
                {skyddsrondInfo.enabled
                  ? (
                    <>
                      var {skyddsrondInfo.intervalWeeks} veckor. Senaste: {skyddsrondInfo.lastLabel}. Nästa senast:{' '}
                      <Text
                        style={{
                          color: skyddsrondInfo.overdue ? '#D32F2F' : (skyddsrondInfo.soon ? '#FFD600' : '#555'),
                          fontWeight: (skyddsrondInfo.overdue || skyddsrondInfo.soon) ? '700' : '400',
                        }}
                      >
                        {skyddsrondInfo.nextLabel}
                      </Text>
                    </>
                  )
                  : <Text>Inaktiverad</Text>
                }
              </Text>
            </View>
          </View>
          )}
        </View>
      </View>
        </View>
      )}

      {/* Modal för ändra projektinfo - uppdaterad layout liknande Skapa nytt projekt */}
      <Modal visible={editingInfo} transparent animationType="fade" onRequestClose={() => setEditingInfo(false)}>
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Pressable
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              onPress={() => setEditingInfo(false)}
            />
            {(() => {
              const isSmallScreen = windowWidth < 900;
              const cardStyle = {
                backgroundColor: '#fff',
                borderRadius: 18,
                width: 1050,
                maxWidth: '96%',
                minWidth: Platform.OS === 'web' ? 600 : 340,
                height: isSmallScreen ? 'auto' : 740,
                maxHeight: '90%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 18,
                elevation: 12,
                overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
              };

              const headerStyle = {
                height: 56,
                borderBottomWidth: 1,
                borderBottomColor: '#E6E8EC',
                backgroundColor: '#F8FAFC',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 16,
              };

              const sectionTitle = { fontSize: 13, fontWeight: '500', color: '#111', marginBottom: 10 };
              const labelStyle = { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 };
              const inputStyleBase = {
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 10,
                fontSize: 13,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web' ? {
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  outline: 'none',
                } : {}),
              };

              const requiredBorder = (ok, isFocused = false) => {
                if (isFocused && ok) {
                  return { 
                    borderColor: '#1976D2', 
                    ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)' } : {}),
                  };
                }
                return { borderColor: ok ? '#E2E8F0' : '#EF4444' };
              };

              const initials = (person) => {
                const name = String(person?.displayName || person?.name || person?.email || '').trim();
                if (!name) return '?';
                const parts = name.split(/\s+/).filter(Boolean);
                const a = (parts[0] || '').slice(0, 1);
                const b = (parts[1] || '').slice(0, 1);
                return (a + b).toUpperCase();
              };

              const toggleParticipant = (m) => {
                try {
                  const id = (m.uid || m.id);
                  const exists = (editProjectParticipants || []).find((p) => (p.uid || p.id) === id);
                  if (exists) {
                    setEditProjectParticipants((prev) => (prev || []).filter((p) => (p.uid || p.id) !== id));
                  } else {
                    setEditProjectParticipants((prev) => ([...(prev || []), { uid: id, displayName: m.displayName || null, email: m.email || null, role: m.role || null }]));
                  }
                } catch (_e) {}
              };

              const q = String(editProjectParticipantsSearch || '').trim().toLowerCase();
              const visibleMembers = (companyMembers || []).filter((m) => {
                if (!q) return true;
                const n = String(m?.displayName || m?.name || '').toLowerCase();
                const e = String(m?.email || '').toLowerCase();
                return n.includes(q) || e.includes(q);
              });

              // Helper to get address fields (handle both old string format and new object format)
              const getAddressStreet = () => {
                if (editableProject?.address?.street) return editableProject.address.street;
                if (editableProject?.adress) return editableProject.adress; // Old format
                return '';
              };
              const getAddressPostal = () => editableProject?.address?.postalCode || '';
              const getAddressCity = () => editableProject?.address?.city || '';
              const getClientContactName = () => editableProject?.clientContact?.name || '';
              const getClientContactPhone = () => editableProject?.clientContact?.phone || '';
              const getClientContactEmail = () => editableProject?.clientContact?.email || '';

              return (
                <View style={cardStyle}>
                  <View style={headerStyle}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>Projektinformation</Text>
                    <TouchableOpacity
                      style={{ position: 'absolute', right: 12, top: 10, padding: 6 }}
                      onPress={() => setEditingInfo(false)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={22} color="#111" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ 
                    flex: 1, 
                    flexDirection: Platform.OS === 'web' ? (isSmallScreen ? 'column' : 'row') : 'row',
                  }}>
                    {/* Left column */}
                    <View style={{ 
                      flex: 1, 
                      borderRightWidth: Platform.OS === 'web' && !isSmallScreen ? 1 : 0,
                      borderBottomWidth: Platform.OS === 'web' && isSmallScreen ? 1 : 0,
                      borderRightColor: '#E6E8EC',
                      borderBottomColor: '#E6E8EC',
                      backgroundColor: '#fff' 
                    }}>
                      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 22 }}>
                        <Text style={sectionTitle}>Projektinformation</Text>

                        <View style={{ marginBottom: 12 }}>
                          <Text style={labelStyle}>Projektnummer *</Text>
                          <TextInput
                            value={editableProject?.id || ''}
                            onChangeText={(v) => setEditableProject(p => ({ ...p, id: v }))}
                            onFocus={() => setFocusedInput('projectNumber')}
                            onBlur={() => setFocusedInput(null)}
                            placeholder="Projektnummer..."
                            placeholderTextColor="#94A3B8"
                            style={{
                              ...inputStyleBase,
                              ...requiredBorder(String(editableProject?.id || '').trim() !== '', focusedInput === 'projectNumber'),
                            }}
                            autoCapitalize="none"
                          />
                        </View>

                        <View style={{ marginBottom: 12 }}>
                          <Text style={labelStyle}>Projektnamn *</Text>
                          <TextInput
                            value={editableProject?.name || ''}
                            onChangeText={(v) => setEditableProject(p => ({ ...p, name: v }))}
                            onFocus={() => setFocusedInput('projectName')}
                            onBlur={() => setFocusedInput(null)}
                            placeholder="Projektnamn..."
                            placeholderTextColor="#94A3B8"
                            style={{
                              ...inputStyleBase,
                              ...requiredBorder(String(editableProject?.name || '').trim() !== '', focusedInput === 'projectName'),
                            }}
                            autoCapitalize="words"
                          />
                        </View>

                        <View style={{ marginBottom: 12 }}>
                          <Text style={labelStyle}>Skapad</Text>
                          <TouchableOpacity
                            activeOpacity={1}
                            onLongPress={() => setCanEditCreated(true)}
                            delayLongPress={2000}
                          >
                            <TextInput
                              style={{
                                ...inputStyleBase,
                                backgroundColor: canEditCreated ? '#fff' : '#F1F5F9',
                                color: canEditCreated ? '#111' : '#64748B',
                                pointerEvents: 'none',
                              }}
                              value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                              editable={false}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor="#94A3B8"
                            />
                            {!canEditCreated && (
                              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, textAlign: 'center' }}>
                                Håll in 2 sekunder för att ändra datum
                              </Text>
                            )}
                          </TouchableOpacity>
                          {canEditCreated && (
                            <Modal visible={canEditCreated} transparent animationType="fade" onRequestClose={() => setCanEditCreated(false)}>
                              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj nytt skapad-datum</Text>
                                  <TextInput
                                    style={{ borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fafafa', color: '#222', marginBottom: 12 }}
                                    value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                                    onChangeText={v => {
                                      const today = new Date();
                                      const inputDate = new Date(v);
                                      if (inputDate > today) return;
                                      setEditableProject(p => ({ ...p, createdAt: v }));
                                    }}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor="#bbb"
                                    keyboardType="numeric"
                                  />
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <TouchableOpacity
                                      style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginRight: 8 }}
                                      onPress={() => setCanEditCreated(false)}
                                    >
                                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Spara</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
                                      onPress={() => setCanEditCreated(false)}
                                    >
                                      <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            </Modal>
                          )}
                        </View>

                        <Text style={labelStyle}>Kund</Text>
                        <TextInput
                          value={editableProject?.customer || editableProject?.client || ''}
                          onChangeText={(v) => setEditableProject(p => ({ ...p, customer: v, client: v }))}
                          placeholder="Kundens företagsnamn..."
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, marginBottom: 14 }}
                        />

                        <Text style={{ ...labelStyle, marginBottom: 8 }}>Uppgifter till projektansvarig hos beställaren</Text>
                        <TextInput
                          value={getClientContactName()}
                          onChangeText={(v) => setEditableProject(p => ({
                            ...p,
                            clientContact: {
                              ...(p?.clientContact || {}),
                              name: v,
                            },
                          }))}
                          placeholder="Namn"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, marginBottom: 10 }}
                        />
                        <TextInput
                          value={getClientContactPhone()}
                          onChangeText={(v) => setEditableProject(p => ({
                            ...p,
                            clientContact: {
                              ...(p?.clientContact || {}),
                              phone: v,
                            },
                          }))}
                          placeholder="Telefonnummer"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, marginBottom: 10 }}
                        />
                        <TextInput
                          value={getClientContactEmail()}
                          onChangeText={(v) => setEditableProject(p => ({
                            ...p,
                            clientContact: {
                              ...(p?.clientContact || {}),
                              email: v,
                            },
                          }))}
                          placeholder="namn@foretag.se"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, marginBottom: 14 }}
                        />

                        <Text style={labelStyle}>Adress</Text>
                        <TextInput
                          value={getAddressStreet()}
                          onChangeText={(v) => setEditableProject(p => ({
                            ...p,
                            address: {
                              ...(p?.address || {}),
                              street: v,
                            },
                            adress: v, // Keep old format for compatibility
                          }))}
                          placeholder="Gata och nr..."
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, marginBottom: 10 }}
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                          <TextInput
                            value={getAddressPostal()}
                            onChangeText={(v) => setEditableProject(p => ({
                              ...p,
                              address: {
                                ...(p?.address || {}),
                                postalCode: v,
                              },
                            }))}
                            placeholder="Postnummer"
                            placeholderTextColor="#94A3B8"
                            style={{ ...inputStyleBase, flex: 0.45 }}
                          />
                          <TextInput
                            value={getAddressCity()}
                            onChangeText={(v) => setEditableProject(p => ({
                              ...p,
                              address: {
                                ...(p?.address || {}),
                                city: v,
                              },
                            }))}
                            placeholder="Ort"
                            placeholderTextColor="#94A3B8"
                            style={{ ...inputStyleBase, flex: 0.55 }}
                          />
                        </View>
                        <TextInput
                          value={editableProject?.propertyDesignation || editableProject?.fastighetsbeteckning || ''}
                          onChangeText={(v) => setEditableProject(p => ({ ...p, propertyDesignation: v, fastighetsbeteckning: v }))}
                          placeholder="Fastighetsbeteckning"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, marginBottom: 14 }}
                        />
                      </ScrollView>
                    </View>

                    {/* Right column */}
                    <View style={{ flex: 1, backgroundColor: '#fff', overflow: 'visible' }}>
                      <View style={{ flex: 1, padding: 18, paddingBottom: 10, overflow: 'visible' }}>
                        <Text style={sectionTitle}>Ansvariga och deltagare</Text>

                        <View style={{ marginBottom: 12, position: 'relative', zIndex: responsibleDropdownOpen ? 1000 : 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={labelStyle}>Ansvarig *</Text>
                            {editableProject?.ansvarig ? (
                              <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                            ) : null}
                          </View>
                          <View style={{ position: 'relative', zIndex: responsibleDropdownOpen ? 1001 : 1 }} ref={responsibleDropdownRef}>
                            <TouchableOpacity
                              style={{
                                ...inputStyleBase,
                                ...(editableProject?.ansvarig ? {} : { borderColor: '#EF4444' }),
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                ...(focusedInput === 'responsible' && editableProject?.ansvarig ? {
                                  borderColor: '#1976D2',
                                  ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)' } : {}),
                                } : {}),
                                ...(responsibleDropdownOpen && Platform.OS === 'web' ? {
                                  borderColor: '#1976D2',
                                  borderBottomLeftRadius: 0,
                                  borderBottomRightRadius: 0,
                                  boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)',
                                } : {}),
                              }}
                              onPress={() => {
                                if (Platform.OS === 'web') {
                                  setFocusedInput('responsible');
                                  setResponsibleDropdownOpen(!responsibleDropdownOpen);
                                } else {
                                  setAdminPickerVisible(true);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={{ fontSize: 13, color: editableProject?.ansvarig ? '#111' : '#94A3B8', fontWeight: '700' }} numberOfLines={1}>
                                {editableProject?.ansvarig ? formatPersonName(editableProject.ansvarig) : 'Välj ansvarig...'}
                              </Text>
                              <Ionicons 
                                name={responsibleDropdownOpen ? "chevron-up" : "chevron-down"} 
                                size={16} 
                                color="#111" 
                              />
                            </TouchableOpacity>

                            {/* Web dropdown menu */}
                            {Platform.OS === 'web' && responsibleDropdownOpen && (
                              <View
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  backgroundColor: '#fff',
                                  borderWidth: 1,
                                  borderColor: '#1976D2',
                                  borderTopWidth: 0,
                                  borderRadius: 10,
                                  borderTopLeftRadius: 0,
                                  borderTopRightRadius: 0,
                                  maxHeight: 280,
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 4 },
                                  shadowOpacity: 0.15,
                                  shadowRadius: 12,
                                  elevation: 8,
                                  zIndex: 1002,
                                  overflow: 'hidden',
                                  ...(Platform.OS === 'web' ? {
                                    opacity: 1,
                                    backgroundColor: '#ffffff',
                                  } : {}),
                                }}
                              >
                                {loadingCompanyAdmins ? (
                                  <View style={{ padding: 16, alignItems: 'center' }}>
                                    <Text style={{ color: '#64748b', fontSize: 13 }}>Laddar...</Text>
                                  </View>
                                ) : companyAdminsError ? (
                                  <View style={{ padding: 16 }}>
                                    <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>
                                      {companyAdminsError}
                                    </Text>
                                  </View>
                                ) : companyAdmins.length === 0 ? (
                                  <View style={{ padding: 16 }}>
                                    <Text style={{ color: '#64748b', fontSize: 13 }}>Inga admins hittades.</Text>
                                  </View>
                                ) : (
                                  <ScrollView 
                                    style={{ 
                                      maxHeight: 280,
                                      backgroundColor: '#fff',
                                    }}
                                    contentContainerStyle={{
                                      paddingBottom: 4,
                                    }}
                                    nestedScrollEnabled
                                  >
                                    {companyAdmins.map((m) => {
                                      const isSelected = editableProject?.ansvarigId && (
                                        editableProject.ansvarigId === (m.uid || m.id)
                                      );
                                      return (
                                        <TouchableOpacity
                                          key={m.id || m.uid || m.email}
                                          style={{
                                            paddingVertical: 12,
                                            paddingHorizontal: 12,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#EEF0F3',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 10,
                                            backgroundColor: isSelected ? '#EFF6FF' : '#fff',
                                            ...(Platform.OS === 'web' ? {
                                              cursor: 'pointer',
                                              transition: 'background-color 0.15s',
                                              opacity: 1,
                                            } : {}),
                                          }}
                                          onPress={() => {
                                            const uid = m.uid || m.id || null;
                                            const name = formatPersonName(m);
                                            setEditableProject(p => ({
                                              ...(p || {}),
                                              ansvarig: name,
                                              ansvarigId: uid,
                                            }));
                                            setResponsibleDropdownOpen(false);
                                            setFocusedInput(null);
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <View style={{ 
                                            width: 24, 
                                            height: 24, 
                                            borderRadius: 12, 
                                            backgroundColor: '#1E40AF', 
                                            alignItems: 'center', 
                                            justifyContent: 'center' 
                                          }}>
                                            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>
                                              {initials(m)}
                                            </Text>
                                          </View>
                                          <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text 
                                              numberOfLines={1} 
                                              style={{ 
                                                fontSize: 13, 
                                                fontWeight: isSelected ? '700' : '600', 
                                                color: '#111' 
                                              }}
                                            >
                                              {formatPersonName(m)}
                                            </Text>
                                          </View>
                                          {isSelected && (
                                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                                          )}
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </ScrollView>
                                )}
                              </View>
                            )}
                          </View>
                          {!editableProject?.ansvarig && !responsibleDropdownOpen ? (
                            <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '700' }}>
                              Du måste välja ansvarig.
                            </Text>
                          ) : null}
                        </View>

                        {/* Native admin picker modal */}
                        {Platform.OS !== 'web' && (
                          <Modal
                            visible={adminPickerVisible}
                            transparent
                            animationType="fade"
                            onRequestClose={() => setAdminPickerVisible(false)}
                          >
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
                              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 280, maxWidth: 360 }}>
                                <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 10, textAlign: 'center' }}>
                                  Välj ansvarig
                                </Text>

                                {loadingCompanyAdmins ? (
                                  <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                                    Laddar...
                                  </Text>
                                ) : (companyAdminsError ? (
                                  <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                                    {companyAdminsError}
                                  </Text>
                                ) : (companyAdmins.length === 0 ? (
                                  <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                                    Inga admins hittades i företaget.
                                  </Text>
                                ) : (
                                  companyAdmins.length <= 5 ? (
                                    <View>
                                      {companyAdmins.map((m) => (
                                        <TouchableOpacity
                                          key={m.id || m.uid || m.email}
                                          style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                          onPress={() => {
                                            const uid = m.uid || m.id || null;
                                            const name = formatPersonName(m);
                                            setEditableProject(p => ({
                                              ...(p || {}),
                                              ansvarig: name,
                                              ansvarigId: uid,
                                            }));
                                            setAdminPickerVisible(false);
                                          }}
                                        >
                                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                            {formatPersonName(m)}
                                          </Text>
                                        </TouchableOpacity>
                                      ))}
                                    </View>
                                  ) : (
                                    <ScrollView style={{ maxHeight: 260 }}>
                                      {companyAdmins.map((m) => (
                                        <TouchableOpacity
                                          key={m.id || m.uid || m.email}
                                          style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                          onPress={() => {
                                            const uid = m.uid || m.id || null;
                                            const name = formatPersonName(m);
                                            setEditableProject(p => ({
                                              ...(p || {}),
                                              ansvarig: name,
                                              ansvarigId: uid,
                                            }));
                                            setAdminPickerVisible(false);
                                          }}
                                        >
                                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                            {formatPersonName(m)}
                                          </Text>
                                        </TouchableOpacity>
                                      ))}
                                    </ScrollView>
                                  )
                                )))}

                                <TouchableOpacity
                                  style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                                  onPress={() => setAdminPickerVisible(false)}
                                >
                                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </Modal>
                        )}

                        <View style={{ marginBottom: 12, position: 'relative', zIndex: participantsDropdownOpen ? 2000 : 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={labelStyle}>Deltagare</Text>
                            {(editProjectParticipants || []).length > 0 && (
                              <View style={{ marginLeft: 8, backgroundColor: '#2563EB', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{(editProjectParticipants || []).length}</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ position: 'relative', zIndex: participantsDropdownOpen ? 2001 : 1 }} ref={participantsDropdownRef}>
                            <TouchableOpacity
                              style={{
                                ...inputStyleBase,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                ...(participantsDropdownOpen && Platform.OS === 'web' ? {
                                  borderColor: '#1976D2',
                                  borderBottomLeftRadius: 0,
                                  borderBottomRightRadius: 0,
                                  boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)',
                                } : {}),
                              }}
                              onPress={() => {
                                if (Platform.OS === 'web') {
                                  setParticipantsDropdownOpen(!participantsDropdownOpen);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={{ fontSize: 13, color: (editProjectParticipants || []).length > 0 ? '#111' : '#94A3B8', fontWeight: '700' }} numberOfLines={1}>
                                {(editProjectParticipants || []).length > 0 
                                  ? `${(editProjectParticipants || []).length} ${(editProjectParticipants || []).length === 1 ? 'deltagare vald' : 'deltagare valda'}`
                                  : 'Välj deltagare...'}
                              </Text>
                              <Ionicons 
                                name={participantsDropdownOpen ? "chevron-up" : "chevron-down"} 
                                size={16} 
                                color="#111" 
                              />
                            </TouchableOpacity>

                            {/* Web dropdown menu */}
                            {Platform.OS === 'web' && participantsDropdownOpen && (
                              <View
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  backgroundColor: '#fff',
                                  borderWidth: 1,
                                  borderColor: '#1976D2',
                                  borderTopWidth: 0,
                                  borderRadius: 10,
                                  borderTopLeftRadius: 0,
                                  borderTopRightRadius: 0,
                                  maxHeight: 750,
                                  minHeight: 200,
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 4 },
                                  shadowOpacity: 0.15,
                                  shadowRadius: 12,
                                  elevation: 8,
                                  zIndex: 2002,
                                  overflow: 'hidden',
                                  ...(Platform.OS === 'web' ? {
                                    opacity: 1,
                                    backgroundColor: '#ffffff',
                                  } : {}),
                                }}
                              >
                                {/* Search field inside dropdown */}
                                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#F8FAFC' }}>
                                  <View style={{ ...inputStyleBase, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                                    <Ionicons name="search" size={16} color="#64748b" />
                                    <TextInput
                                      value={editProjectParticipantsSearch}
                                      onChangeText={(v) => setEditProjectParticipantsSearch(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                                      placeholder="Sök användare..."
                                      placeholderTextColor="#94A3B8"
                                      style={{ flex: 1, fontSize: 13, color: '#111' }}
                                      autoFocus
                                    />
                                  </View>
                                </View>

                                {/* Members list */}
                                {loadingCompanyMembers ? (
                                  <View style={{ padding: 16, alignItems: 'center' }}>
                                    <Text style={{ color: '#64748b', fontSize: 13 }}>Laddar…</Text>
                                  </View>
                                ) : companyMembersPermissionDenied ? (
                                  <View style={{ padding: 16 }}>
                                    <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>Saknar behörighet att läsa användare.</Text>
                                  </View>
                                ) : visibleMembers.length === 0 ? (
                                  <View style={{ padding: 16 }}>
                                    <Text style={{ color: '#64748b', fontSize: 13 }}>Inga träffar.</Text>
                                  </View>
                                ) : (
                                  <ScrollView 
                                    style={{ 
                                      flex: 1,
                                      backgroundColor: '#fff',
                                      maxHeight: 670,
                                    }}
                                    contentContainerStyle={{
                                      paddingBottom: 4,
                                    }}
                                    nestedScrollEnabled
                                  >
                                    {(() => {
                                      const selectedIds = new Set((editProjectParticipants || []).map(p => p.uid || p.id));
                                      const sorted = [...visibleMembers].sort((a, b) => {
                                        const aSelected = selectedIds.has(a.uid || a.id);
                                        const bSelected = selectedIds.has(b.uid || b.id);
                                        if (aSelected && !bSelected) return -1;
                                        if (!aSelected && bSelected) return 1;
                                        return formatPersonName(a).localeCompare(formatPersonName(b), 'sv');
                                      });
                                      return sorted.slice(0, 200).map((m) => {
                                        const id = m.id || m.uid || m.email;
                                        const selected = selectedIds.has(m.uid || m.id);
                                        return (
                                          <TouchableOpacity
                                            key={id}
                                            onPress={() => {
                                              toggleParticipant(m);
                                            }}
                                            style={{
                                              paddingVertical: 12,
                                              paddingHorizontal: 12,
                                              borderBottomWidth: 1,
                                              borderBottomColor: '#EEF0F3',
                                              flexDirection: 'row',
                                              alignItems: 'center',
                                              gap: 10,
                                              backgroundColor: selected ? '#EFF6FF' : '#fff',
                                              ...(Platform.OS === 'web' ? {
                                                cursor: 'pointer',
                                                transition: 'background-color 0.15s',
                                                opacity: 1,
                                              } : {}),
                                            }}
                                            activeOpacity={0.7}
                                          >
                                            <View style={{ 
                                              width: 32, 
                                              height: 32, 
                                              borderRadius: 16, 
                                              backgroundColor: selected ? '#2563EB' : '#1E40AF', 
                                              alignItems: 'center', 
                                              justifyContent: 'center' 
                                            }}>
                                              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>
                                                {initials(m)}
                                              </Text>
                                            </View>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                              <Text 
                                                numberOfLines={1} 
                                                style={{ 
                                                  fontSize: 13, 
                                                  fontWeight: selected ? '800' : '600', 
                                                  color: '#111' 
                                                }}
                                              >
                                                {formatPersonName(m)}
                                              </Text>
                                              <Text 
                                                numberOfLines={1} 
                                                style={{ 
                                                  fontSize: 12, 
                                                  color: '#64748b' 
                                                }}
                                              >
                                                {String(m?.role || '').trim() || 'Användare'}
                                              </Text>
                                            </View>
                                            {selected && (
                                              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                                            )}
                                          </TouchableOpacity>
                                        );
                                      });
                                    })()}
                                  </ScrollView>
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E6E8EC', backgroundColor: '#fff', position: 'relative', zIndex: 1 }}>
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Status</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity
                              style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 10,
                                backgroundColor: editableProject?.status !== 'completed' ? '#E8F5E9' : '#fff',
                                borderWidth: editableProject?.status !== 'completed' ? 2 : 1,
                                borderColor: editableProject?.status !== 'completed' ? '#43A047' : '#E2E8F0',
                              }}
                              onPress={() => setEditableProject(p => ({ ...p, status: 'ongoing' }))}
                              activeOpacity={0.8}
                            >
                              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#43A047', marginRight: 8 }} />
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>Pågående</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 10,
                                backgroundColor: editableProject?.status === 'completed' ? '#F5F5F5' : '#fff',
                                borderWidth: editableProject?.status === 'completed' ? 2 : 1,
                                borderColor: editableProject?.status === 'completed' ? '#222' : '#E2E8F0',
                              }}
                              onPress={() => setEditableProject(p => ({ ...p, status: 'completed' }))}
                              activeOpacity={0.8}
                            >
                              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#222', marginRight: 8 }} />
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>Avslutat</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Skyddsronder</Text>
                          {(() => {
                            const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                            const isEnabled = editableProject?.skyddsrondEnabled !== false;
                            const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                            return (
                              <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                  <Text style={{ fontSize: 13, color: '#111' }}>Aktiva</Text>
                                  <Switch
                                    value={isEnabled}
                                    onValueChange={(v) => setEditableProject(p => ({ ...p, skyddsrondEnabled: !!v }))}
                                  />
                                </View>

                                <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Veckor mellan skyddsronder</Text>
                                <TouchableOpacity
                                  style={{
                                    ...inputStyleBase,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    opacity: isEnabled ? 1 : 0.5,
                                    marginBottom: 10,
                                  }}
                                  disabled={!isEnabled}
                                  onPress={() => setSkyddsrondWeeksPickerVisible(true)}
                                  activeOpacity={0.8}
                                >
                                  <Text style={{ fontSize: 13, color: '#111', fontWeight: '500' }}>{String(editableProject?.skyddsrondIntervalWeeks || 2)}</Text>
                                  <Ionicons name="chevron-down" size={16} color="#111" />
                                </TouchableOpacity>

                                <View style={{ marginBottom: 0 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Första skyddsrond senast *</Text>
                                    {isEnabled && isFirstDueValid ? (
                                      <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                                    ) : null}
                                  </View>
                                  <TextInput
                                    value={firstDueTrim}
                                    onChangeText={(v) => {
                                      const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                                      setEditableProject(p => ({ ...p, skyddsrondFirstDueDate: String(next) }));
                                    }}
                                    onFocus={() => setFocusedInput('skyddsrondDate')}
                                    onBlur={() => setFocusedInput(null)}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor="#94A3B8"
                                    editable={isEnabled}
                                    style={{
                                      ...inputStyleBase,
                                      ...requiredBorder(
                                        isFirstDueValid || !isEnabled,
                                        focusedInput === 'skyddsrondDate' && isEnabled
                                      ),
                                      ...((!isFirstDueValid && isEnabled) ? { borderColor: '#EF4444' } : {}),
                                      opacity: isEnabled ? 1 : 0.5,
                                    }}
                                  />

                                  {isEnabled && !isFirstDueValid ? (
                                    <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '500' }}>
                                      Ange datum (YYYY-MM-DD).
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })()}
                        </View>

                        <Modal
                          visible={skyddsrondWeeksPickerVisible}
                          transparent
                          animationType="fade"
                          onRequestClose={() => setSkyddsrondWeeksPickerVisible(false)}
                        >
                          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                            <Pressable
                              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                              onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                            />
                            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                              <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                                Veckor mellan skyddsronder
                              </Text>
                              {[1, 2, 3, 4].map((w) => (
                                <TouchableOpacity
                                  key={String(w)}
                                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                                  onPress={() => {
                                    setEditableProject(p => ({ ...p, skyddsrondIntervalWeeks: w }));
                                    setSkyddsrondWeeksPickerVisible(false);
                                  }}
                                >
                                  <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{w}</Text>
                                </TouchableOpacity>
                              ))}
                              <TouchableOpacity
                                style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                                onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                              >
                                <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </Modal>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
                          <TouchableOpacity
                            onPress={() => setEditingInfo(false)}
                            style={{ 
                              backgroundColor: '#E5E7EB', 
                              borderRadius: 10, 
                              paddingVertical: 12, 
                              paddingHorizontal: 18, 
                              minWidth: 110, 
                              alignItems: 'center',
                              ...(Platform.OS === 'web' ? {
                                transition: 'background-color 0.2s',
                                cursor: 'pointer',
                              } : {}),
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ color: '#111', fontWeight: '800', fontSize: 14 }}>Avbryt</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                              const isEnabled = editableProject?.skyddsrondEnabled !== false;
                              const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                              if (!isFirstDueValid) return;

                              const sanitizedProject = {
                                ...editableProject,
                                skyddsrondFirstDueDate: isEnabled ? (firstDueTrim || null) : null,
                                participants: (editProjectParticipants || []).map(p => ({ 
                                  uid: p.uid || p.id, 
                                  displayName: p.displayName || null, 
                                  email: p.email || null 
                                })),
                              };
                              if (typeof navigation?.setParams === 'function') {
                                navigation.setParams({ project: sanitizedProject });
                              }
                              emitProjectUpdated({ ...sanitizedProject, originalId: originalProjectId });
                              setEditingInfo(false);
                            }}
                            style={{
                              backgroundColor: '#1976D2',
                              borderRadius: 10,
                              paddingVertical: 12,
                              paddingHorizontal: 18,
                              minWidth: 110,
                              alignItems: 'center',
                              ...(Platform.OS === 'web' ? {
                                transition: 'background-color 0.2s, transform 0.1s',
                                cursor: 'pointer',
                              } : {}),
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Spara</Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          onPress={() => {
                            setEditingInfo(false);
                            if ((controls || []).length === 0) {
                              setShowDeleteModal(true);
                            } else {
                              setShowDeleteWarning(true);
                            }
                          }}
                          style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}
                          activeOpacity={0.85}
                          accessibilityLabel="Radera projekt"
                        >
                          <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: '600' }}>Radera projekt</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingVertical: 18, paddingHorizontal: 18, minWidth: 320, maxWidth: 420, maxHeight: '75%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 }}>
            {/* Header med ikon, titel och stäng-kryss i samma stil som Ny mall-modal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Ionicons name="briefcase-outline" size={16} color="#fff" />
              </View>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#222' }}>Projektinformation</Text>
              <TouchableOpacity
                onPress={() => setEditingInfo(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4, marginLeft: 8 }}
              >
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ alignSelf: 'stretch' }}
              contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
                            {/* Projektnummer */}
                            <View style={{ marginBottom: 14 }}>
                              <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Projektnummer</Text>
                              <TextInput
                                style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                                value={editableProject?.id || ''}
                                onChangeText={v => setEditableProject(p => ({ ...p, id: v }))}
                                placeholder="Ange projektnummer"
                                placeholderTextColor="#bbb"
                                autoCapitalize="none"
                              />
                            </View>
                            {/* Projektnamn */}
                            <View style={{ marginBottom: 14 }}>
                              <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Projektnamn</Text>
                              <TextInput
                                style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                                value={editableProject?.name || ''}
                                onChangeText={v => setEditableProject(p => ({ ...p, name: v }))}
                                placeholder="Ange projektnamn"
                                placeholderTextColor="#bbb"
                                autoCapitalize="words"
                              />
                            </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Skapad</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={() => setCanEditCreated(true)}
                  delayLongPress={2000}
                >
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: canEditCreated ? '#fff' : '#eee', color: canEditCreated ? '#222' : '#888', pointerEvents: 'none' }}
                    value={editableProject?.createdAt ? new Date(editableProject.createdAt).toLocaleDateString() : ''}
                    editable={false}
                  />
                  {!canEditCreated && (
                    <Text style={{ fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' }}>
                      Håll in 2 sekunder för att ändra datum
                    </Text>
                  )}
                </TouchableOpacity>
                {canEditCreated && (
                  <Modal visible={canEditCreated} transparent animationType="fade" onRequestClose={() => setCanEditCreated(false)}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj nytt skapad-datum</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fafafa', color: '#222', marginBottom: 12 }}
                          value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                          onChangeText={v => {
                            // Validera att datumet inte är i framtiden
                            const today = new Date();
                            const inputDate = new Date(v);
                            if (inputDate > today) return;
                            setEditableProject(p => ({ ...p, createdAt: v }));
                          }}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#bbb"
                          keyboardType="numeric"
                        />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginRight: 8 }}
                            onPress={() => setCanEditCreated(false)}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Spara</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
                            onPress={() => setCanEditCreated(false)}
                          >
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Ansvarig</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setAdminPickerVisible(true)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#e0e0e0',
                    borderRadius: 8,
                    padding: 10,
                    backgroundColor: '#fff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <Text
                    style={{ fontSize: 15, color: editableProject?.ansvarig ? '#222' : '#bbb', flex: 1 }}
                    numberOfLines={1}
                  >
                    {editableProject?.ansvarig ? formatPersonName(editableProject.ansvarig) : 'Välj ansvarig...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>

                <Modal
                  visible={adminPickerVisible}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setAdminPickerVisible(false)}
                >
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 280, maxWidth: 360 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 10, textAlign: 'center' }}>
                        Välj ansvarig
                      </Text>

                      {loadingCompanyAdmins ? (
                        <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                          Laddar...
                        </Text>
                      ) : (companyAdminsError ? (
                        <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                          {companyAdminsError}
                        </Text>
                      ) : (companyAdmins.length === 0 ? (
                        <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                          Inga admins hittades i företaget.
                        </Text>
                      ) : (
                        companyAdmins.length <= 5 ? (
                          <View>
                            {companyAdmins.map((m) => (
                              <TouchableOpacity
                                key={m.id || m.uid || m.email}
                                style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                onPress={() => {
                                  const uid = m.uid || m.id || null;
                                  const name = formatPersonName(m);
                                  setEditableProject(p => ({
                                    ...(p || {}),
                                    ansvarig: name,
                                    ansvarigId: uid,
                                  }));
                                  setAdminPickerVisible(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                  {formatPersonName(m)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <ScrollView style={{ maxHeight: 260 }}>
                            {companyAdmins.map((m) => (
                              <TouchableOpacity
                                key={m.id || m.uid || m.email}
                                style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                onPress={() => {
                                  const uid = m.uid || m.id || null;
                                  const name = formatPersonName(m);
                                  setEditableProject(p => ({
                                    ...(p || {}),
                                    ansvarig: name,
                                    ansvarigId: uid,
                                  }));
                                  setAdminPickerVisible(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                  {formatPersonName(m)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )
                      )))}

                      <TouchableOpacity
                        style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                        onPress={() => setAdminPickerVisible(false)}
                      >
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: editableProject?.status !== 'completed' ? '#e8f5e9' : '#fff', borderWidth: editableProject?.status !== 'completed' ? 2 : 1, borderColor: editableProject?.status !== 'completed' ? '#43A047' : '#e0e0e0', marginRight: 8 }}
                    onPress={() => setEditableProject(p => ({ ...p, status: 'ongoing' }))}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#43A047', marginRight: 8, borderWidth: 2, borderColor: '#bbb' }} />
                    <Text style={{ fontSize: 15, color: '#222' }}>Pågående</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: editableProject?.status === 'completed' ? '#f5f5f5' : '#fff', borderWidth: editableProject?.status === 'completed' ? 2 : 1, borderColor: editableProject?.status === 'completed' ? '#222' : '#e0e0e0' }}
                    onPress={() => setEditableProject(p => ({ ...p, status: 'completed' }))}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#222', marginRight: 8, borderWidth: 2, borderColor: '#bbb' }} />
                    <Text style={{ fontSize: 15, color: '#222' }}>Avslutat</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Kund</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.client || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, client: v }))}
                  placeholder="Ange kund"
                  placeholderTextColor="#bbb"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Adress</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.adress || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, adress: v }))}
                  placeholder="Ange adress"
                  placeholderTextColor="#bbb"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Fastighetsbeteckning</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.fastighetsbeteckning || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, fastighetsbeteckning: v }))}
                  placeholder="Ange fastighetsbeteckning"
                  placeholderTextColor="#bbb"
                />
              </View>

              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 6 }}>Skyddsronder</Text>
                {(() => {
                  const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                  const isEnabled = editableProject?.skyddsrondEnabled !== false;
                  const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                  return (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text style={{ fontSize: 15, color: '#222' }}>Aktiva</Text>
                        <Switch
                          value={editableProject?.skyddsrondEnabled !== false}
                          onValueChange={(v) => setEditableProject(p => ({ ...p, skyddsrondEnabled: !!v }))}
                        />
                      </View>

                      <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Veckor mellan skyddsronder</Text>
                      <TouchableOpacity
                        style={{
                          borderWidth: 1,
                          borderColor: '#e0e0e0',
                          borderRadius: 8,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                          backgroundColor: '#fff',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          opacity: (editableProject?.skyddsrondEnabled !== false) ? 1 : 0.5,
                        }}
                        disabled={editableProject?.skyddsrondEnabled === false}
                        onPress={() => setSkyddsrondWeeksPickerVisible(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={{ fontSize: 15, color: '#222' }}>
                          {String(editableProject?.skyddsrondIntervalWeeks || 2)}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color="#222" />
                      </TouchableOpacity>

                      <Text style={{ fontSize: 15, color: '#888', marginBottom: 4, marginTop: 10 }}>Första skyddsrond senast</Text>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: (isEnabled && !isFirstDueValid) ? '#D32F2F' : '#e0e0e0',
                          borderRadius: 8,
                          padding: 10,
                          fontSize: 15,
                          backgroundColor: '#fff',
                          opacity: (editableProject?.skyddsrondEnabled !== false) ? 1 : 0.5,
                        }}
                        value={String(editableProject?.skyddsrondFirstDueDate || '')}
                        editable={editableProject?.skyddsrondEnabled !== false}
                        onChangeText={v => setEditableProject(p => ({ ...p, skyddsrondFirstDueDate: v }))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#bbb"
                      />

                      {isEnabled && !isFirstDueValid && (
                        <Text style={{ color: '#D32F2F', fontSize: 13, marginTop: 6 }}>
                          Du måste fylla i datum (YYYY-MM-DD).
                        </Text>
                      )}
                    </View>
                  );
                })()}
              </View>
            </ScrollView>

            <Modal
              visible={skyddsrondWeeksPickerVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setSkyddsrondWeeksPickerVisible(false)}
            >
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                <Pressable
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                  onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                />
                <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                    Veckor mellan skyddsronder
                  </Text>
                  {[1, 2, 3, 4].map((w) => (
                    <TouchableOpacity
                      key={String(w)}
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                      onPress={() => {
                        setEditableProject(p => ({ ...p, skyddsrondIntervalWeeks: w }));
                        setSkyddsrondWeeksPickerVisible(false);
                      }}
                    >
                      <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                    onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                  >
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => setEditingInfo(false)}
                style={{ paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 }}
              >
                <Text style={{ fontSize: 14, color: '#555' }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                  const isEnabled = editableProject?.skyddsrondEnabled !== false;
                  const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                  if (!isFirstDueValid) return;

                  const sanitizedProject = {
                    ...editableProject,
                    skyddsrondFirstDueDate: isEnabled ? (firstDueTrim || null) : null,
                  };
                  if (typeof navigation?.setParams === 'function') {
                    navigation.setParams({ project: sanitizedProject });
                  }
                  emitProjectUpdated({ ...sanitizedProject, originalId: originalProjectId });
                  setEditingInfo(false);
                }}
                style={{ backgroundColor: '#1976D2', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Spara</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingInfo(false);
                if ((controls || []).length === 0) {
                  setShowDeleteModal(true);
                } else {
                  setShowDeleteWarning(true);
                }
              }}
              style={{ marginTop: 10, paddingVertical: 10, alignItems: 'center' }}
              activeOpacity={0.85}
              accessibilityLabel="Radera projekt"
            >
              <Text style={{ color: '#D32F2F', fontSize: 14, fontWeight: '600' }}>Radera projekt</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}
      </Modal>
      
      {/* Överblick för eftermarknad: visa projektinformation direkt i mittenpanelen */}
      {selectedAction?.kind === 'overblick' && Platform.OS === 'web' ? (
        (() => {
          // Återanvänd samma vy som redigeringsmodalen, men visa direkt i mittenpanelen
          const showOverblickView = true;
          if (!showOverblickView || !editableProject) return null;
          
          const sectionTitle = { fontSize: 13, fontWeight: '500', color: '#111', marginBottom: 10 };
          const labelStyle = { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 };
          const inputStyleBase = {
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderRadius: 10,
            paddingVertical: 9,
            paddingHorizontal: 10,
            fontSize: 13,
            backgroundColor: '#fff',
            color: '#111',
            ...(Platform.OS === 'web' ? {
              transition: 'border-color 0.2s, box-shadow 0.2s',
              outline: 'none',
            } : {}),
          };
          
          const getAddressStreet = () => {
            if (editableProject?.address?.street) return editableProject.address.street;
            if (editableProject?.adress) return editableProject.adress;
            return '';
          };
          const getAddressPostal = () => editableProject?.address?.postalCode || '';
          const getAddressCity = () => editableProject?.address?.city || '';
          const getClientContactName = () => editableProject?.clientContact?.name || '';
          const getClientContactPhone = () => editableProject?.clientContact?.phone || '';
          const getClientContactEmail = () => editableProject?.clientContact?.email || '';
          
          return (
            <View style={{ paddingBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 20 }}>Överblick</Text>
              
              <View style={{ 
                flexDirection: Platform.OS === 'web' ? 'row' : 'column',
                gap: 20,
              }}>
                {/* Left column */}
                <View style={{ flex: 1 }}>
                  <Text style={sectionTitle}>Projektinformation</Text>
                  
                  <View style={{ marginBottom: 12 }}>
                    <Text style={labelStyle}>Projektnummer</Text>
                    <TextInput
                      value={editableProject?.id || ''}
                      onChangeText={(v) => setEditableProject(p => ({ ...p, id: v }))}
                      placeholder="Projektnummer..."
                      placeholderTextColor="#94A3B8"
                      style={inputStyleBase}
                      editable={false}
                    />
                  </View>
                  
                  <View style={{ marginBottom: 12 }}>
                    <Text style={labelStyle}>Projektnamn</Text>
                    <TextInput
                      value={editableProject?.name || ''}
                      onChangeText={(v) => setEditableProject(p => ({ ...p, name: v }))}
                      placeholder="Projektnamn..."
                      placeholderTextColor="#94A3B8"
                      style={inputStyleBase}
                    />
                  </View>
                  
                  <View style={{ marginBottom: 12 }}>
                    <Text style={labelStyle}>Skapad</Text>
                    <TextInput
                      value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                      editable={false}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94A3B8"
                      style={{ ...inputStyleBase, backgroundColor: '#F1F5F9', color: '#64748B' }}
                    />
                  </View>
                  
                  <Text style={labelStyle}>Kund</Text>
                  <TextInput
                    value={editableProject?.customer || editableProject?.client || ''}
                    onChangeText={(v) => setEditableProject(p => ({ ...p, customer: v, client: v }))}
                    placeholder="Kundens företagsnamn..."
                    placeholderTextColor="#94A3B8"
                    style={{ ...inputStyleBase, marginBottom: 14 }}
                  />
                  
                  <Text style={{ ...labelStyle, marginBottom: 8 }}>Uppgifter till projektansvarig hos beställaren</Text>
                  <TextInput
                    value={getClientContactName()}
                    onChangeText={(v) => setEditableProject(p => ({
                      ...p,
                      clientContact: { ...(p?.clientContact || {}), name: v },
                    }))}
                    placeholder="Namn"
                    placeholderTextColor="#94A3B8"
                    style={{ ...inputStyleBase, marginBottom: 10 }}
                  />
                  <TextInput
                    value={getClientContactPhone()}
                    onChangeText={(v) => setEditableProject(p => ({
                      ...p,
                      clientContact: { ...(p?.clientContact || {}), phone: v },
                    }))}
                    placeholder="Telefonnummer"
                    placeholderTextColor="#94A3B8"
                    style={{ ...inputStyleBase, marginBottom: 10 }}
                  />
                  <TextInput
                    value={getClientContactEmail()}
                    onChangeText={(v) => setEditableProject(p => ({
                      ...p,
                      clientContact: { ...(p?.clientContact || {}), email: v },
                    }))}
                    placeholder="namn@foretag.se"
                    placeholderTextColor="#94A3B8"
                    style={{ ...inputStyleBase, marginBottom: 14 }}
                  />
                  
                  <Text style={labelStyle}>Adress</Text>
                  <TextInput
                    value={getAddressStreet()}
                    onChangeText={(v) => setEditableProject(p => ({
                      ...p,
                      address: { ...(p?.address || {}), street: v },
                      adress: v,
                    }))}
                    placeholder="Gata och nr..."
                    placeholderTextColor="#94A3B8"
                    style={{ ...inputStyleBase, marginBottom: 10 }}
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <TextInput
                      value={getAddressPostal()}
                      onChangeText={(v) => setEditableProject(p => ({
                        ...p,
                        address: { ...(p?.address || {}), postalCode: v },
                      }))}
                      placeholder="Postnummer"
                      placeholderTextColor="#94A3B8"
                      style={{ ...inputStyleBase, flex: 0.45 }}
                    />
                    <TextInput
                      value={getAddressCity()}
                      onChangeText={(v) => setEditableProject(p => ({
                        ...p,
                        address: { ...(p?.address || {}), city: v },
                      }))}
                      placeholder="Ort"
                      placeholderTextColor="#94A3B8"
                      style={{ ...inputStyleBase, flex: 0.55 }}
                    />
                  </View>
                  <TextInput
                    value={editableProject?.propertyDesignation || editableProject?.fastighetsbeteckning || ''}
                    onChangeText={(v) => setEditableProject(p => ({ ...p, propertyDesignation: v, fastighetsbeteckning: v }))}
                    placeholder="Fastighetsbeteckning"
                    placeholderTextColor="#94A3B8"
                    style={{ ...inputStyleBase, marginBottom: 14 }}
                  />
                </View>
                
                {/* Right column */}
                <View style={{ flex: 1 }}>
                  <Text style={sectionTitle}>Ansvariga och deltagare</Text>
                  
                  <View style={{ marginBottom: 12 }}>
                    <Text style={labelStyle}>Ansvarig</Text>
                    <TextInput
                      value={editableProject?.ansvarig || ''}
                      editable={false}
                      placeholder="Ansvarig..."
                      placeholderTextColor="#94A3B8"
                      style={{ ...inputStyleBase, backgroundColor: '#F1F5F9', color: '#64748B' }}
                    />
                  </View>
                  
                  <View style={{ marginBottom: 12 }}>
                    <Text style={labelStyle}>Deltagare</Text>
                    <TextInput
                      value={(editProjectParticipants || []).map(p => formatPersonName(p)).join(', ') || ''}
                      editable={false}
                      placeholder="Inga deltagare valda..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      style={{ ...inputStyleBase, backgroundColor: '#F1F5F9', color: '#64748B', minHeight: 60 }}
                    />
                  </View>
                  
                  <View style={{ marginTop: 20, flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => {
                        const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                        const isEnabled = editableProject?.skyddsrondEnabled !== false;
                        const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                        if (!isFirstDueValid) return;
                        
                        const sanitizedProject = {
                          ...editableProject,
                          skyddsrondFirstDueDate: isEnabled ? (firstDueTrim || null) : null,
                          participants: (editProjectParticipants || []).map(p => ({ 
                            uid: p.uid || p.id, 
                            displayName: p.displayName || null, 
                            email: p.email || null 
                          })),
                        };
                        if (typeof navigation?.setParams === 'function') {
                          navigation.setParams({ project: sanitizedProject });
                        }
                        emitProjectUpdated({ ...sanitizedProject, originalId: originalProjectId });
                      }}
                      style={{
                        backgroundColor: '#1976D2',
                        borderRadius: 10,
                        paddingVertical: 12,
                        paddingHorizontal: 18,
                        minWidth: 110,
                        alignItems: 'center',
                        ...(Platform.OS === 'web' ? {
                          transition: 'background-color 0.2s',
                          cursor: 'pointer',
                        } : {}),
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Spara ändringar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        })()
      ) : null}
      
      {/* Knapprad med horisontella linjer */}
      {selectedAction?.kind !== 'overblick' && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ height: 1, backgroundColor: '#e0e0e0', marginBottom: 16, marginTop: 8, width: '110%', marginLeft: '-5%' }} />
          {Platform.OS === 'web' ? (
          <>
            <View style={{ marginBottom: 8, alignItems: 'flex-start', paddingHorizontal: 0 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', textAlign: 'left', marginBottom: 12, color: '#263238', letterSpacing: 0.2 }}>Skapa kontroll:</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { type: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2' },
                { type: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C' },
                { type: 'Fuktmätning', icon: 'water-outline', color: '#0288D1' },
                { type: 'Mottagningskontroll', icon: 'checkbox-outline', color: '#7B1FA2' },
                { type: 'Riskbedömning', icon: 'warning-outline', color: '#FFD600' },
                { type: 'Skyddsrond', icon: 'shield-half-outline', color: '#388E3C' }
              ].map(({ type, icon, color }) => (
                <TouchableOpacity
                  key={type}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#e0e0e0',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    marginRight: 10,
                    marginBottom: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                    elevation: 2,
                    cursor: 'pointer'
                  }}
                  onPress={() => handleStartControl(type)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  shadowColor: '#222',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 1,
                  minHeight: 40,
                  width: '100%',
                  marginBottom: 8,
                  overflow: 'hidden',
                }}
                activeOpacity={0.85}
                onPress={() => setShowControlTypeModal(true)}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#1976D2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                </View>
                <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5, zIndex: 1 }}>Skapa ny kontroll</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ marginTop: 10, marginBottom: 4, color: '#555', fontSize: 13, textAlign: 'left' }}>
              Justerbara snabbval – håll in knappen 2 sek för att byta val.
            </Text>
            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {[0, 1, 2, 3].map((slotIndex) => {
                const slotType = quickControlSlots[slotIndex];
                const meta = (controlTypeOptions || []).find(o => o.key === slotType || o.type === slotType) || (controlTypeOptions || [])[slotIndex] || null;
                const hasType = !!(meta && meta.type);
                const iconName = hasType ? meta.icon : 'add-circle-outline';
                const iconColor = hasType ? meta.color : '#1976D2';
                const label = hasType ? meta.type : 'Välj';
                return (
                  <TouchableOpacity
                    key={String(slotIndex)}
                    style={{
                      flexBasis: '48%',
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.06,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (hasType) handleStartControl(meta.key || meta.type, meta.type);
                      else openQuickSlotConfig(slotIndex);
                    }}
                    onLongPress={() => openQuickSlotConfig(slotIndex)}
                    delayLongPress={1500}
                  >
                    <Ionicons name={iconName} size={18} color={iconColor} style={{ marginRight: 8 }} />
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginTop: 16, width: '110%', marginLeft: '-5%' }} />
      </View>
      )}

      {/* Controls rendering - moved to controls section */}
      {selectedAction?.kind !== 'overblick' && activeSection !== 'controls' && activeSection !== 'overview' && activeSection !== 'documents' && activeSection !== 'kalkyl' && activeSection !== 'ue-offerter' && (
        <>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, minHeight: 32 }}>

      {/* Modal för val av kontrolltyp */}
      <Modal
        visible={showControlTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowControlTypeModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, width: 340, maxWidth: '90%', maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8, color: '#222', textAlign: 'center', marginTop: 6 }}>
              Välj kontrolltyp
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <ScrollView
                style={{ maxHeight: 320, flex: 1 }}
                showsVerticalScrollIndicator
                onLayout={(e) => {
                  const h = e?.nativeEvent?.layout?.height || 0;
                  setControlTypeScrollMetrics(prev => ({ ...prev, containerHeight: h }));
                }}
                onContentSizeChange={(w, h) => {
                  setControlTypeScrollMetrics(prev => ({ ...prev, contentHeight: h || 0 }));
                }}
                onScroll={(e) => {
                  const y = e?.nativeEvent?.contentOffset?.y || 0;
                  setControlTypeScrollMetrics(prev => ({ ...prev, scrollY: y }));
                }}
                scrollEventThrottle={16}
              >
                {controlTypeOptions.map(({ type, icon, color, key }) => (
                  <TouchableOpacity
                    key={type}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                    onPress={() => {
                      setShowControlTypeModal(false);
                      handleStartControl(key || type, type);
                    }}
                  >
                    <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{type}</Text>
                  </TouchableOpacity>
                ))}
                {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                  <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                    Inga kontrolltyper är aktiverade för företaget.
                  </Text>
                ) : null}
              </ScrollView>
                {controlTypeCanScroll ? (
                <View
                  style={{
                    width: 3,
                    marginLeft: 6,
                    borderRadius: 999,
                    backgroundColor: '#E0E0E0',
                    height: controlTypeScrollMetrics.containerHeight || 0,
                    overflow: 'hidden',
                    alignSelf: 'flex-start',
                    marginTop: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      borderRadius: 999,
                      backgroundColor: '#B0B0B0',
                      height: controlTypeThumbHeight,
                      top: controlTypeThumbTop,
                    }}
                  />
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={{ marginTop: 8, alignSelf: 'center' }}
              onPress={() => setShowControlTypeModal(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: välj mall när en kontrolltyp har flera mallar */}
      <Modal
        visible={templatePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplatePickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, width: 340, maxWidth: '90%', maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#222', textAlign: 'center' }}>
              {templatePickerLabel ? `Välj mall för ${templatePickerLabel}` : 'Välj mall'}
            </Text>
            <TextInput
              placeholder="Sök mall..."
              placeholderTextColor="#999"
              value={templatePickerSearch}
              onChangeText={setTemplatePickerSearch}
              style={{
                marginTop: 8,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: '#e0e0e0',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 14,
                backgroundColor: '#f9f9f9',
              }}
            />
            <ScrollView style={{ maxHeight: 320, marginTop: 4 }}>
              {(() => {
                const all = Array.isArray(templatePickerItems) ? templatePickerItems : [];
                const qRaw = String(templatePickerSearch || '').trim();
                const q = qRaw.toLowerCase();
                const filtered = all.filter((tpl) => {
                  if (!q) return true;
                  const title = String(tpl?.title || '').toLowerCase();
                  return title.includes(q);
                });

                if (!filtered.length) {
                  const hasQuery = !!qRaw;
                  return (
                    <Text style={{ fontSize: 14, color: '#D32F2F', textAlign: 'center', marginTop: 8 }}>
                      {hasQuery
                        ? `Ingen mall hittades för "${qRaw}".`
                        : 'Inga mallar tillgängliga.'}
                    </Text>
                  );
                }

                return filtered.map((tpl) => {
                  const isHidden = !!tpl.hidden;
                  const title = String(tpl?.title || 'Namnlös mall');
                  const versionLabel = (typeof tpl?.version === 'number' || typeof tpl?.version === 'string')
                    ? `v${tpl.version}`
                    : '';
                  return (
                    <TouchableOpacity
                      key={tpl.id || title}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 4,
                        marginBottom: 2,
                      }}
                      onPress={() => {
                        setTemplatePickerVisible(false);
                        if (!tpl) return;
                        navigation.navigate('TemplateControlScreen', {
                          project,
                          controlType: templatePickerLabel || tpl.controlType || 'Kontroll',
                          templateId: tpl.id,
                          template: tpl,
                          companyId,
                        });
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: '#eee',
                        }}
                      >
                        <Text
                          style={{ fontSize: 15, fontWeight: '600', color: isHidden ? '#9E9E9E' : '#222', flexShrink: 1 }}
                          numberOfLines={1}
                        >
                          {title + (isHidden ? ' (inaktiv)' : '')}
                        </Text>
                        {versionLabel ? (
                          <Text style={{ fontSize: 13, color: '#555', marginLeft: 8 }} numberOfLines={1}>
                            {versionLabel}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 12, alignSelf: 'center' }}
              onPress={() => setTemplatePickerVisible(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: välj kontrolltyp för snabbknapp */}
      <Modal
        visible={showQuickSlotModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuickSlotModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>
              Välj snabbknapp
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {controlTypeOptions.map(({ type, icon, color, key }) => (
                <TouchableOpacity
                  key={type}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, marginBottom: 6, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                  onPress={() => {
                    if (quickSlotConfigIndex == null) return;
                    const next = [...quickControlSlots];
                    next[quickSlotConfigIndex] = key || type;
                    setQuickControlSlots(next);
                    persistQuickSlots(next);
                    setShowQuickSlotModal(false);
                  }}
                >
                  <Ionicons name={icon} size={20} color={color} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 15, color: '#222', fontWeight: '600' }}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 10, alignSelf: 'center' }}
              onPress={() => setShowQuickSlotModal(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

              {/* Modal: Bekräfta radering om inga kontroller */}
              <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
                <View style={styles.centerOverlay}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#222', textAlign: 'center' }}>Vill du ta bort projektet?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                      <TouchableOpacity style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center' }} onPress={() => {/* TODO: Lägg till raderingslogik här */ setShowDeleteModal(false); }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Ta bort</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }} onPress={() => setShowDeleteModal(false)}>
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
              {/* Modal: Extra varning om kontroller finns */}
              <Modal visible={showDeleteWarning} transparent animationType="fade" onRequestClose={() => setShowDeleteWarning(false)}>
                <View style={styles.centerOverlay}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#D32F2F', textAlign: 'center' }}>Projektet har kontroller kopplade.\nÄr du säker på att du vill ta bort projektet? Allt kommer att förloras.</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                      <TouchableOpacity style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center' }} onPress={() => {/* TODO: Lägg till raderingslogik här */ setShowDeleteWarning(false); }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Ta bort</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }} onPress={() => setShowDeleteWarning(false)}>
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
        </View>
        </>
      )}

      {/* Controls Section */}
      {activeSection === 'controls' && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' }}>
            Kontroller
          </Text>
          {/* Sökfält för kontroller */}
          <View style={{ marginBottom: 10 }}>
            <TextInput
              style={[styles.input, { marginBottom: 0 }]}
              placeholder="Sök kontroller (t.ex. gips, arbetsmoment, leverans...)"
              placeholderTextColor="#888"
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          {(() => {
        const baseControls = Array.isArray(controls) ? controls : [];
        // Filtrera kontroller baserat på söktext
        const lowerSearch = (searchText || '').toLowerCase();
        const filteredControls = !lowerSearch
          ? baseControls
          : baseControls.filter(c => {
              const fields = [c.deliveryDesc, c.materialDesc, c.generalNote, c.description, c.arbetsmoment];
              return fields.some(f => f && String(f).toLowerCase().includes(lowerSearch));
            });
        const grouped = controlTypes
          .map((t) => ({ type: t, items: filteredControls.filter(c => (c.type || '') === t) }))
          .filter(g => g.items.length > 0);

        if (grouped.length === 0) {
          const msg = lowerSearch
            ? 'Inga kontroller matchar sökningen.'
            : 'Inga kontroller utförda än';
          return (
            <Text style={[styles.noControls, { color: '#D32F2F' }]}>{msg}</Text>
          );
        }

        const toggleType = (t) => {
              try { Haptics.selectionAsync(); } catch {}
              setExpandedByType((prev) => ({ ...prev, [t]: !(prev[t] ?? false) }));
            };

            const pluralLabels = {
              Arbetsberedning: 'Arbetsberedningar',
              Egenkontroll: 'Egenkontroller',
              Fuktmätning: 'Fuktmätningar',
              Skyddsrond: 'Skyddsronder',
              Riskbedömning: 'Riskbedömningar',
            };

            // Helper: count open/total deviations in a Skyddsrond.
            // Supports both newer schema (checklist + remediation keyed by point text)
            // and legacy schema (checklistSections + remediation indexed by point index).
            function getSkyddsrondDeviationStats(ctrl) {
              try {
                const sections = Array.isArray(ctrl?.checklist)
                  ? ctrl.checklist
                  : (Array.isArray(ctrl?.checklistSections) ? ctrl.checklistSections : null);
                if (!Array.isArray(sections) || sections.length === 0) return { total: 0, open: 0 };

                let total = 0;
                let open = 0;
                for (const section of sections) {
                  if (!section || !Array.isArray(section.statuses)) continue;
                  const points = Array.isArray(section.points) ? section.points : [];
                  for (let i = 0; i < section.statuses.length; i++) {
                    if (section.statuses[i] !== 'avvikelse') continue;
                    total += 1;
                    const pt = points[i];
                    const rem = section.remediation
                      ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[i]
                      : null;
                    if (!rem) open += 1;
                  }
                }
                return { total, open };
              } catch(_e) {
                return { total: 0, open: 0 };
              }
            }

        // For group header: are ALL Skyddsrond controls handled?
        return (
          <View>
            {grouped.map(({ type, items }) => {
              const t = type;
              const typeMeta = (controlTypeOptions || []).find(o => o.type === t) || null;
              let anyOpenDeviation = false;
              if (t === 'Skyddsrond') {
                const stats = (items || []).map(ctrl => getSkyddsrondDeviationStats(ctrl));
                anyOpenDeviation = stats.some(s => s.open > 0);
              }
              const expanded = expandedByType[t] ?? false;
              return (
                <View key={t} style={styles.groupContainer}>
                  <TouchableOpacity style={styles.groupHeader} onPress={() => toggleType(t)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#263238" />
                      {typeMeta ? (
                        <Ionicons
                          name={typeMeta.icon}
                          size={18}
                          color={typeMeta.color}
                          style={{ marginLeft: 8 }}
                          accessibilityLabel={`${t} ikon`}
                        />
                      ) : null}
                      <Text style={styles.groupTitle} numberOfLines={1} ellipsizeMode="tail">{pluralLabels[t] || t}</Text>
                    </View>

                    {t === 'Skyddsrond' && anyOpenDeviation && (
                      <TouchableOpacity
                        onPress={(e) => {
                          try { e && e.stopPropagation && e.stopPropagation(); } catch(_e) {}
                          // Expand the group so the problematic rond becomes visible (and highlighted).
                          setExpandedByType((prev) => ({ ...prev, [t]: true }));
                        }}
                        style={{ marginRight: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600' }}
                        activeOpacity={0.85}
                        accessibilityLabel="Åtgärda"
                      >
                        <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{items.length}</Text></View>
                  </TouchableOpacity>
                  {expanded ? (
                    items
                      .slice()
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                      .map((item, idx) => {
                        // ...existerande rendering av kontrollkortet...
                        const isWeb = Platform.OS === 'web';
                        const leadingIconSize = isWeb ? 20 : 22;
                        const leadingIconMarginRight = isWeb ? 6 : 8;
                        const trailingIconPadding = isWeb ? 4 : 6;
                        const trailingIconMarginLeft = isWeb ? 6 : 8;
                        let subtitle = null;
                        let parsedDate = '';
                        let label = '';
                        if (item.type === 'Skyddsrond' || item.type === 'Riskbedömning') {
                          let dateStr = '';
                          if (item.date && item.date.length >= 10) {
                            const d = new Date(item.date);
                            if (!isNaN(d)) dateStr = d.toISOString().slice(0, 10);
                          }
                          if (!dateStr) dateStr = '(okänt datum)';
                          const wy = getWeekAndYear(item.date || item.savedAt || item.createdAt || dateStr);
                          const weekStr = wy && wy.week ? (wy.week < 10 ? '0' + wy.week : String(wy.week)) : '';
                          label = (weekStr ? `V.${weekStr} - ` : '') + dateStr;
                          subtitle = (item.deliveryDesc && String(item.deliveryDesc).trim())
                            ? String(item.deliveryDesc).trim()
                            : (item.materialDesc && String(item.materialDesc).trim()) ? String(item.materialDesc).trim()
                            : (item.generalNote && String(item.generalNote).trim()) ? String(item.generalNote).trim()
                            : (item.description && String(item.description).trim()) ? String(item.description).trim()
                            : null;
                        } else if (item.type === 'Mottagningskontroll') {
                          const tryParse = (v) => {
                            if (!v) return null;
                            try {
                              const d = new Date(v);
                              if (!isNaN(d)) return d.toLocaleDateString('sv-SE');
                            } catch(_e) {}
                            return null;
                          };
                          parsedDate = tryParse(item.date) || tryParse(item.dateValue) || tryParse(item.savedAt) || tryParse(item.createdAt) || tryParse(item.created) || '';
                          if (!parsedDate && item.date) parsedDate = item.date;
                          const dateLabel = parsedDate || '(okänt datum)';
                          const wy = getWeekAndYear(parsedDate || item.date || item.savedAt || item.createdAt);
                          const weekStr = wy && wy.week ? (wy.week < 10 ? '0' + wy.week : String(wy.week)) : '';
                          const header = weekStr ? `V.${weekStr} - ${dateLabel}` : dateLabel;
                          label = header;
                          subtitle = (item.deliveryDesc && String(item.deliveryDesc).trim())
                            ? String(item.deliveryDesc).trim()
                            : (item.materialDesc && String(item.materialDesc).trim()) ? String(item.materialDesc).trim()
                            : (item.generalNote && String(item.generalNote).trim()) ? String(item.generalNote).trim()
                            : (item.description && String(item.description).trim()) ? String(item.description).trim()
                            : null;
                        } else {
                          label = `${item.type}${item.date ? ' ' + item.date : ''}`;
                          if (item.deliveryDesc && String(item.deliveryDesc).trim()) {
                            label = `${label} — ${String(item.deliveryDesc).trim()}`;
                          }
                        }
                        // Skyddsrond deviation status (open deviations => highlight)
                        let hasDeviation = false;
                        let allHandled = false;
                        if (item.type === 'Skyddsrond') {
                          const stats = getSkyddsrondDeviationStats(item);
                          allHandled = stats.total > 0 && stats.open === 0;
                          hasDeviation = stats.open > 0;
                        }
                        return (
                          <View key={`${item.id || 'noid'}-${item.date || 'nodate'}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                            <TouchableOpacity
                              style={[
                                styles.controlCard,
                                (Platform.OS === 'web' ? styles.controlCardWeb : null),
                                (item.isDraft
                                  ? { backgroundColor: '#fff', borderColor: '#222' }
                                  : item.type === 'Skyddsrond' && hasDeviation
                                    ? { backgroundColor: '#FFD600', borderColor: '#D32F2F', borderWidth: 2 }
                                    : item.type === 'Skyddsrond' && allHandled
                                      ? { backgroundColor: '#fff', borderColor: '#43A047', borderWidth: 2 }
                                      : { backgroundColor: '#fff', borderColor: '#e0e0e0' }
                                )
                              ]}
                              onPress={() => {
                                if (item.isDraft) {
                                  switch (item.type) {
                                    case 'Arbetsberedning':
                                      if (Platform.OS === 'web') openInlineControl('Arbetsberedning', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'arbetsberedning' });
                                      break;
                                    case 'Riskbedömning':
                                      if (Platform.OS === 'web') openInlineControl('Riskbedömning', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'riskbedömning' });
                                      break;
                                    case 'Fuktmätning':
                                      if (Platform.OS === 'web') openInlineControl('Fuktmätning', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'fuktmätning' });
                                      break;
                                    case 'Egenkontroll':
                                      if (Platform.OS === 'web') openInlineControl('Egenkontroll', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'egenkontroll' });
                                      break;
                                    case 'Mottagningskontroll':
                                      if (Platform.OS === 'web') openInlineControl('Mottagningskontroll', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'mottagningskontroll' });
                                      break;
                                    case 'Skyddsrond':
                                      if (Platform.OS === 'web') openInlineControl('Skyddsrond', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'skyddsrond' });
                                      break;
                                    default:
                                      if (Platform.OS === 'web') openInlineControl(item.type, item);
                                      else navigation.navigate('ControlForm', { initialValues: item, project });
                                  }
                                } else {
                                  if (Platform.OS === 'web') {
                                    openInlineControl('ControlDetails', { control: item });
                                  } else {
                                    navigation.navigate('ControlDetails', { control: item, project, companyId });
                                  }
                                }
                              }}
                              onLongPress={item.isDraft ? undefined : () => handleControlLongPress(item)}
                              delayLongPress={item.isDraft ? undefined : 600}
                            >
                              {item.isDraft ? (
                                <Ionicons name="document-text-outline" size={leadingIconSize} color="#FFD600" style={{ marginRight: leadingIconMarginRight }} />
                              ) : item.type === 'Skyddsrond' ? (
                                hasDeviation
                                  ? <Ionicons name="alert-circle" size={leadingIconSize} color="#D32F2F" style={{ marginRight: leadingIconMarginRight }} />
                                  : (
                                    <Svg width={leadingIconSize} height={leadingIconSize} viewBox="0 0 24 24" style={{ marginRight: leadingIconMarginRight }}>
                                      <Circle cx={12} cy={12} r={10} fill="#43A047" stroke="#222" strokeWidth={1} />
                                      <SvgText
                                        x="12"
                                        y="13.5"
                                        fontSize="16"
                                        fontWeight="bold"
                                        fill="#fff"
                                        textAnchor="middle"
                                        alignmentBaseline="middle"
                                      >
                                        ✓
                                      </SvgText>
                                    </Svg>
                                  )
                              ) : (
                                <Svg width={leadingIconSize} height={leadingIconSize} viewBox="0 0 24 24" style={{ marginRight: leadingIconMarginRight }}>
                                  <Circle cx={12} cy={12} r={10} fill="#43A047" stroke="#222" strokeWidth={1} />
                                  <SvgText
                                    x="12"
                                    y="13.5"
                                    fontSize="16"
                                    fontWeight="bold"
                                    fill="#fff"
                                    textAnchor="middle"
                                    alignmentBaseline="middle"
                                  >
                                    ✓
                                  </SvgText>
                                </Svg>
                              )}
                              <View style={(Platform.OS === 'web') ? styles.controlTextContainerWeb : styles.controlTextContainer}>
                                {Platform.OS === 'web' ? (
                                  <Text style={styles.controlLine} numberOfLines={1} ellipsizeMode="tail">
                                    <Text style={styles.controlTitleInlineWeb}>{label}</Text>
                                    {subtitle ? <Text style={styles.controlSubtitleInline}> — {subtitle}</Text> : null}
                                  </Text>
                                ) : (
                                  <>
                                    <Text style={styles.controlTitle} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
                                    {subtitle ? (
                                      <Text style={styles.controlSubtitle} numberOfLines={1} ellipsizeMode="tail">{subtitle}</Text>
                                    ) : null}
                                  </>
                                )}
                              </View>

                              {Platform.OS === 'web' && !item.isDraft && item.type === 'Skyddsrond' && hasDeviation && (
                                <TouchableOpacity
                                  style={{ marginLeft: trailingIconMarginLeft, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600', alignSelf: 'center' }}
                                  activeOpacity={0.85}
                                  onPress={(e) => {
                                    try { e && e.stopPropagation && e.stopPropagation(); } catch(_e) {}
                                    navigation.navigate('ControlDetails', { control: item, project, companyId });
                                  }}
                                  accessibilityLabel="Åtgärda"
                                >
                                  <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                                </TouchableOpacity>
                              )}

                              {/* Skriv ut-ikon (endast för slutförda) */}
                              {!item.isDraft && (
                                <TouchableOpacity
                                  style={{ marginLeft: trailingIconMarginLeft, padding: trailingIconPadding }}
                                  onPress={async (e) => {
                                    e.stopPropagation && e.stopPropagation();
                                    try {
                                      setExportingPdf(true);
                                      // Bygg HTML för EN kontroll
                                      let companyNameForPdf = 'FÖRETAG AB';
                                      try {
                                        console.log('[PDF] using buildSummaryHtml?', typeof buildSummaryHtml);
                                        // Prepare logo (prefer company profile for PDF; try downloading + base64 embed)
                                        let profile = companyProfile;
                                        if (!profile && companyId) {
                                          try {
                                            profile = await fetchCompanyProfile(companyId);
                                            if (profile) setCompanyProfile(profile);
                                          } catch(_e) {}
                                        }
                                        companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
                                        const companyLogoFromProfile = profile?.logoUrl || null;
                                        let logoForPrint = companyLogoFromProfile || companyLogoUri || null;
                                        if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
                                          try {
                                            const fileName = 'company-logo.single.png';
                                            const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
                                            if (baseDir) {
                                              const dest = baseDir + fileName;
                                              const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                                              if (dl?.uri) logoForPrint = dl.uri;
                                            }
                                          } catch(e) { console.warn('[PDF] download logo failed', e); }
                                        }
                                        let logoBase64 = null;
                                        try {
                                          logoBase64 = await readUriAsBase64(logoForPrint);
                                          if (!logoBase64) {
                                            try {
                                              const a = Asset.fromModule(require('../assets/images/foretag_ab.png'));
                                              await Asset.loadAsync(a);
                                              const local = a.localUri || a.uri;
                                              if (local) {
                                                logoBase64 = await readUriAsBase64(local);
                                                if (logoBase64) logoForPrint = 'data:image/png;base64,' + logoBase64;
                                              }
                                            } catch(_e) { /* ignore */ }
                                          } else {
                                            logoForPrint = 'data:image/png;base64,' + logoBase64;
                                          }
                                        } catch(e) { console.warn('[PDF] logo base64 convert failed', e); }

                                        let html;
                                        // Embed images for this item before building HTML
                                        const embeddedItem = await embedImagesInControl(item);
                                        if (typeof buildSummaryHtml === 'function') {
                                          html = buildSummaryHtml('En', logoForPrint, [embeddedItem]);
                                          } else {
                                          console.warn('[PDF] buildSummaryHtml not found, falling back to type-aware builder');
                                          const companyObj = { name: companyNameForPdf, logoUrl: companyLogoFromProfile, logoBase64 };
                                          html = buildPdfHtmlForControl({ control: embeddedItem, project, company: companyObj });
                                        }
                                        // Generate PDF file and present share/save dialog instead of directly printing
                                        const fileResult = await Print.printToFileAsync({ html });
                                        const pdfUri = fileResult?.uri;
                                        if (pdfUri) {
                                          try {
                                            // On iOS/Android this opens native share/save UI (Save to Files, etc.)
                                            if (Sharing && Sharing.isAvailableAsync) {
                                              const avail = await Sharing.isAvailableAsync();
                                              if (avail) {
                                                await Sharing.shareAsync(pdfUri, { dialogTitle: 'Spara PDF' });
                                              } else {
                                                // Fallback: just log path and show notice
                                                console.log('[PDF] PDF generated at', pdfUri);
                                                setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
                                              }
                                            } else {
                                              console.log('[PDF] PDF generated at', pdfUri);
                                              setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
                                            }
                                          } catch (shareErr) {
                                            console.warn('[PDF] shareAsync failed, opening print dialog as fallback', shareErr);
                                            await Print.printAsync({ uri: pdfUri });
                                          }
                                        } else {
                                          throw new Error('printToFileAsync returned no uri');
                                        }
                                      } catch(e) {
                                        console.warn('[PDF] single-item PDF generation failed, retrying without logo', e);
                                        try {
                                          let html2;
                                          if (typeof buildSummaryHtml === 'function') {
                                            html2 = buildSummaryHtml('En', null, [item]);
                                          } else {
                                            html2 = buildPdfHtmlForControl({ control: item, project, company: { name: companyNameForPdf } });
                                          }
                                          // Try generating file again without logo
                                          const fileResult2 = await Print.printToFileAsync({ html: html2 });
                                          const pdfUri2 = fileResult2?.uri;
                                          if (pdfUri2) {
                                            try {
                                              const avail2 = await Sharing.isAvailableAsync();
                                              if (avail2) await Sharing.shareAsync(pdfUri2, { dialogTitle: 'Spara PDF' });
                                              else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri2 });
                                            } catch (shareErr2) {
                                              console.warn('[PDF] shareAsync failed (retry), falling back to print dialog', shareErr2);
                                              await Print.printAsync({ uri: pdfUri2 });
                                            }
                                          } else {
                                            throw new Error('printToFileAsync retry returned no uri');
                                          }
                                        } catch (err2) {
                                          console.error('[PDF] single-item print fallback failed', err2);
                                          setNotice({ visible: true, text: 'Kunde inte generera eller dela PDF — se konsolen för detaljer' });
                                        }
                                      }
                                    } finally {
                                      setExportingPdf(false);
                                    }
                                  }}
                                  accessibilityLabel="Exportera denna kontroll som PDF"
                                >
                                  <Ionicons name="document-outline" size={leadingIconSize} color="#1976D2" />
                                </TouchableOpacity>
                              )}
                              {/* Papperskorg-ikon med bekräftelsemodal (både för utkast och slutförda) */}
                              <TouchableOpacity
                                style={{ marginLeft: trailingIconMarginLeft, padding: trailingIconPadding }}
                                onPress={(e) => {
                                  e.stopPropagation && e.stopPropagation();
                                  setDeleteConfirm({ visible: true, control: item });
                                }}
                                accessibilityLabel={item.isDraft ? "Radera pågående kontroll" : "Radera denna kontroll"}
                              >
                                <Ionicons name="trash-outline" size={leadingIconSize} color="#D32F2F" />
                              </TouchableOpacity>

                              {/* Modal för raderingsbekräftelse (läggs i JSX utanför listan) */}
                              {/* Bekräftelsemodal för radering av kontroll */}
                              <Modal
                                visible={deleteConfirm.visible}
                                transparent
                                animationType="fade"
                                onRequestClose={() => setDeleteConfirm({ visible: false, control: null })}
                              >
                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#D32F2F', textAlign: 'center' }}>
                                      Vill du verkligen radera denna kontroll?
                                    </Text>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                                      <TouchableOpacity
                                        style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center' }}
                                        onPress={handleDeleteSelectedControl}
                                      >
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Radera</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }}
                                        onPress={() => setDeleteConfirm({ visible: false, control: null })}
                                      >
                                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                </View>
                              </Modal>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })()}
        </View>
      )}

      {/* Kalkyl Section - Placeholder for future implementation */}
      {activeSection === 'kalkyl' && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' }}>
            Kalkyl
          </Text>
          <Text style={{ color: '#666', fontSize: 14 }}>
            Kalkyl-funktionalitet kommer snart...
          </Text>
        </View>
      )}

      {/* UE & Offerter Section - Placeholder for future implementation */}
      {activeSection === 'ue-offerter' && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' }}>
            UE & Offerter
          </Text>
          <Text style={{ color: '#666', fontSize: 14 }}>
            UE & Offerter-funktionalitet kommer snart...
          </Text>
        </View>
      )}

      {/* Formulär */}
      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          style={styles.form}
        >
          <Text style={styles.selectedType}>Vald kontroll: {newControl.type}</Text>

          {/* Visa dagens datum och möjlighet att välja eget */}
          <Text style={styles.infoText}>Dagens datum: {newControl.date}</Text>
          <TouchableOpacity onPress={() => setNewControl({ ...newControl, date: '' })}>
            <Text style={styles.linkText}>Välj eget datum</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Datum (ÅÅÅÅ-MM-DD)"
            placeholderTextColor="#888"
            value={newControl.date}
            onChangeText={(text) => setNewControl({ ...newControl, date: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder={newControl.type === 'Skyddsrond' ? 'Skyddsrond omfattar' : 'Beskrivning'}
            placeholderTextColor="#888"
            value={newControl.description}
            onChangeText={(text) => setNewControl({ ...newControl, description: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAddControl}>
            <Text style={styles.saveButtonText}>Skapa kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowForm(false); }}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      {undoState.visible ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>Kontroll borttagen</Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Ångra</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {notice.visible ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      <Modal visible={showSummary} transparent animationType="fade" onRequestClose={() => setShowSummary(false)}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={() => setShowSummary(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.summaryCard}>
              {/* Stäng (X) knapp uppe till höger */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowSummary(false); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={styles.modalText}>Skriv ut</Text>
              {/* Export filter selector */}
              {(() => {
                const byType = controls.reduce((acc, c) => {
                  const t = c.type || 'Okänd';
                  (acc[t] = acc[t] || []).push(c);
                  return acc;
                }, {});
                const types = Object.keys(byType).sort((a, b) => a.localeCompare(b));
                if (types.length === 0) return null;
                const labels = {
                  Arbetsberedning: 'Arbetsberedningar',
                  Egenkontroll: 'Egenkontroller',
                  Fuktmätning: 'Fuktmätningar',
                  Skyddsrond: 'Skyddsronder',
                  Riskbedömning: 'Riskbedömningar',
                };
                return (
                  <View style={styles.filterRow}>
                    {['Alla', ...types].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { try { Haptics.selectionAsync(); } catch {}; setExportFilter(t); }}
                        style={[styles.filterChip, exportFilter === t && styles.filterChipSelected]}
                      >
                        <Text style={[styles.filterChipText, exportFilter === t && styles.filterChipTextSelected]}>
                          {t === 'Alla' ? 'Alla' : (labels[t] || t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}

              <ScrollView style={{ maxHeight: 380 }}>
                {/* Här kan du lägga till en preview av PDF-innehållet om du vill */}
              </ScrollView>
              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handlePreviewPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>Förhandsvisa PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleExportPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>{exportingPdf ? 'Genererar…' : 'Exportera PDF'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

    </ScrollView>
  );
}




