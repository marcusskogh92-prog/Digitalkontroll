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
    View
} from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { formatPersonName } from '../components/formatPersonName';
import { buildPdfHtmlForControl } from '../components/pdfExport';
import { emitProjectUpdated } from '../components/projectBus';

import ArbetsberedningScreen from './ArbetsberedningScreen';
import ControlDetails from './ControlDetails';
import EgenkontrollScreen from './EgenkontrollScreen';
import FuktmätningScreen from './FuktmätningScreen';
import MottagningskontrollScreen from './MottagningskontrollScreen';
import RiskbedömningScreen from './RiskbedömningScreen';
import SkyddsrondScreen from './SkyddsrondScreen';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo, HomeHeaderSearch } from '../components/HeaderComponents';
import { DEFAULT_CONTROL_TYPES, deleteControlFromFirestore, deleteDraftControlFromFirestore, fetchCompanyControlTypes, fetchCompanyMallar, fetchCompanyMembers, fetchCompanyProfile, fetchControlsForProject, fetchDraftControlsForProject } from '../components/firebase';
// Note: `expo-file-system` is used only on native; avoid static top-level import
// so web builds don't attempt to resolve native-only exports. Load dynamically
// inside functions when needed.
let FileSystem = null;

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
  } catch (_e) {
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
          try { FileSystem = await import('expo-file-system'); } catch (_e) { FileSystem = null; }
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
      } catch (_e) {}
    }
  } catch (_e) {
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
          } catch (_e) { return p; }
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
        } catch (_e) { return s; }
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
                } catch (_e) { return it; }
              }));
            }
            try {
              const src = entry.uri || entry;
              const d = await toDataUri(src);
              return (typeof entry === 'string') ? (d || src) : Object.assign({}, entry, { uri: d || src });
            } catch (_e) { return entry; }
          }));
          c.checklist[si].photos = newPhotos;
        }
      }
    }
  } catch (_e) {
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
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  noControls: { fontSize: 16, fontStyle: 'italic', marginBottom: 12 },
  groupContainer: { marginBottom: 18, backgroundColor: '#f7f7f7', borderRadius: 10, padding: 8 },
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
          // Anpassa header så den beter sig som Home:
          // - Web: behåll sökrutan och företagsloggan.
          // - Native: visa bara DigitalKontroll-loggan centrerad, utan sökfält.
          React.useEffect(() => {
    const isWeb = Platform.OS === 'web';
    if (isWeb) {
      navigation.setOptions({
        headerTitle: () => <HomeHeaderSearch navigation={navigation} route={navigation.getState?.().routes?.find(r => r.name === 'ProjectDetails') || { params: route?.params }} />,
        headerLeft: () => (
          <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
            <DigitalKontrollHeaderLogo />
          </View>
        ),
        headerRight: () => (
          <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center' }}>
            <CompanyHeaderLogo companyId={route?.params?.companyId || ''} />
          </View>
        ),
        headerBackTitle: '',
      });
    } else {
      navigation.setOptions({
        headerTitle: () => (
          <View style={{ marginBottom: 4, marginLeft: -28 }}>
            <DigitalKontrollHeaderLogo />
          </View>
        ),
        headerLeft: () => null,
        headerRight: () => null,
        headerBackTitle: '',
      });
    }
  }, [navigation, route]);
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
              } catch (_e) {}
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
                } catch (_e) {
                  // ignore
                }
              } else {
                logoForPrint = 'data:image/png;base64,' + logoBase64;
              }
            } catch (_e) { console.warn('[PDF] logo base64 conversion failed', e); }

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
            } catch (_e) {
              console.warn('[PDF] printToFileAsync with logo/fallback failed, retrying without logo', err);
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
          } catch (_e) {
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
            } catch (_e) {}
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
              } catch (_e) {}
            } else {
              logoForPrint = 'data:image/png;base64,' + logoBase64;
            }
          } catch (_e) { console.warn('[PDF] logo base64 conversion failed', e); }

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
          } catch (_e) {
            console.warn('[PDF] printToFileAsync with logo failed or HTML invalid, retrying without logo', err);
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
        } catch (_e) {
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
  const { project, companyId, initialCreator, selectedAction } = route.params || {};
  const [inlineControl, setInlineControl] = useState(null);
  const openInlineControl = (type, initialValues) => {
    if (!type) return;
    // Freeze the project snapshot at time of opening so the form can't "jump"
    // if parent selection changes.
    setInlineControl({ type, initialValues: initialValues || undefined, projectSnapshot: project || null });
    try {
      if (scrollRef?.current && typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ y: 0, animated: false });
      }
    } catch (_e) {}
  };
  const closeInlineControl = () => setInlineControl(null);

  // Inform parent (HomeScreen) when an inline FORM is open on web.
  // This is used to lock the project tree so the user can't switch projects mid-control.
  useEffect(() => {
    try {
      const isWeb = Platform.OS === 'web';
      const isInlineFormOpen = isWeb && !!(inlineControl && inlineControl.type && inlineControl.type !== 'ControlDetails');
      const cb = route?.params?.onInlineLockChange;
      // Backwards-compatible: allow both prop injection patterns
      // 1) route.params.onInlineLockChange (if parent can't pass real props)
      if (typeof cb === 'function') cb(isInlineFormOpen);
    } catch (_e) {}
  }, [inlineControl?.type]);

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
      if (selectedAction.kind === 'openDraft' && selectedAction.type) {
        openInlineControl(selectedAction.type, selectedAction.initialValues || undefined);
      }
      if (selectedAction.kind === 'openControlDetails' && selectedAction.control) {
        try { openInlineControl('ControlDetails', { control: selectedAction.control }); } catch (_e) {}
      }
    } catch (_e) {}
  }, [selectedAction?.id]);
  const [adminPickerVisible, setAdminPickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [companyAdminsError, setCompanyAdminsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadAdmins = async () => {
      if (!adminPickerVisible) return;
      if (!companyId) {
        setCompanyAdmins([]);
        setCompanyAdminsError('Saknar företag (companyId).');
        return;
      }

      setLoadingCompanyAdmins(true);
      setCompanyAdminsError(null);
      try {
        const members = await fetchCompanyMembers(companyId);
        const admins = (Array.isArray(members) ? members : [])
          .filter(m => String(m?.role || '').toLowerCase() === 'admin')
          .slice()
          .sort((a, b) => formatPersonName(a).localeCompare(formatPersonName(b), 'sv'));

        if (!cancelled) setCompanyAdmins(admins);
      } catch (_e) {
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
  }, [adminPickerVisible, companyId]);
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
    } catch (_e) { /* ignore Firestore errors - we already have local fallback */ }

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
    } catch (_e) { /* ignore */ }
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
  const normalizeProject = (p) => {
    if (!p || typeof p !== 'object') return p;
    const formatted = formatPersonName(p.ansvarig || '');
    if (!formatted || formatted === p.ansvarig) return p;
    return { ...p, ansvarig: formatted };
  };

  const [editableProject, setEditableProject] = useState(() => normalizeProject(project));
    // Store original id for update (keep up to date when route.project changes)
    const [originalProjectId, setOriginalProjectId] = useState(project?.id || null);

  // Update editableProject when parent passes a new project (e.g., selecting another project inline)
  React.useEffect(() => {
    setEditableProject(normalizeProject(project));
    setOriginalProjectId(project?.id || null);
  }, [project?.id]);
  const [showControlPicker, setShowControlPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newControl, setNewControl] = useState({ type: '', date: '', description: '', byggdel: '' });
  const [expandedByType, setExpandedByType] = useState({});
  const [editingInfo, setEditingInfo] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedControls, setSelectedControls] = useState([]);
  const [expandedType, setExpandedType] = useState(null);
  const [undoState, setUndoState] = useState({ visible: false, item: null, index: -1 });
  const [companyLogoUri, setCompanyLogoUri] = useState(null);
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
      } catch (_e) {
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
    } catch (_e) {}

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
      } catch (_e) {
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
        if (Platform.OS === 'web') openInlineControl('Arbetsberedning');
        else navigation.navigate('ArbetsberedningScreen', { project });
        break;
      case 'riskbedömning':
      case 'riskbedomning':
        if (Platform.OS === 'web') openInlineControl('Riskbedömning');
        else navigation.navigate('RiskbedömningScreen', { project });
        break;
      case 'fuktmätning':
      case 'fuktmatning':
        if (Platform.OS === 'web') openInlineControl('Fuktmätning');
        else navigation.navigate('FuktmätningScreen', { project });
        break;
      case 'egenkontroll':
        if (Platform.OS === 'web') openInlineControl('Egenkontroll');
        else navigation.navigate('EgenkontrollScreen', { project });
        break;
      case 'mottagningskontroll':
        if (Platform.OS === 'web') openInlineControl('Mottagningskontroll');
        else navigation.navigate('MottagningskontrollScreen', { project });
        break;
      case 'skyddsrond':
        if (Platform.OS === 'web') openInlineControl('Skyddsrond');
        else navigation.navigate('SkyddsrondScreen', { project });
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
  const [selectedControl, setSelectedControl] = useState(null);
  const [showControlOptions, setShowControlOptions] = useState(false);
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
      try { await deleteDraftControlFromFirestore(control.id, companyId); } catch (_e) {}
    } else {
      // Remove from completed_controls
      const completedRaw = await AsyncStorage.getItem('completed_controls');
      let completed = completedRaw ? JSON.parse(completedRaw) : [];
      completed = completed.filter(
        c => c.id !== control.id
      );
      await AsyncStorage.setItem('completed_controls', JSON.stringify(completed));

      // Best-effort: delete remote control too
      try { await deleteControlFromFirestore(control.id, companyId); } catch (_e) {}
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
        } catch (_e) {}
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

    const wrapInlineControlWithBack = (child) => (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handleInlineBack}
            accessibilityLabel="Tillbaka"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 36, height: 32, justifyContent: 'center', alignItems: 'flex-start', marginRight: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color="#1976D2" />
          </TouchableOpacity>

          {(() => {
            const meta = getInlineHeaderMeta();
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, height: 32 }}>
                {meta?.icon ? (
                  <Ionicons name={meta.icon} size={18} color={meta.color} style={{ marginRight: 8 }} />
                ) : null}
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                  {meta?.label || ''}
                </Text>
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
        return wrapInlineControlWithBack(<ArbetsberedningScreen {...commonProps} />);
      case 'Riskbedömning':
        return wrapInlineControlWithBack(<RiskbedömningScreen {...commonProps} />);
      case 'Fuktmätning':
        return wrapInlineControlWithBack(<FuktmätningScreen {...commonProps} />);
      case 'Egenkontroll':
        return wrapInlineControlWithBack(<EgenkontrollScreen {...commonProps} />);
      case 'Mottagningskontroll':
        return wrapInlineControlWithBack(<MottagningskontrollScreen {...commonProps} />);
      case 'Skyddsrond':
        return wrapInlineControlWithBack(<SkyddsrondScreen {...commonProps} />);
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
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 240 }}
    >
      {/* Rubrik för projektinfo (med tillbaka-pil i appen och redigera-knapp till höger) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {(inlineClose || Platform.OS !== 'web') && (
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
          <Ionicons name="document-text-outline" size={20} color="#1976D2" style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">Projektinformation</Text>
        </View>
          {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' }}>
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
      {/* Projektinfo med logga, status, projektnummer, projektnamn (expanderbar) */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18, padding: 12, backgroundColor: '#f7f7f7', borderRadius: 10 }}>
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

      {/* Modal för ändra projektinfo - uppdaterad layout liknande nya modaler (t.ex. Ny mall) */}
      <Modal visible={editingInfo} transparent animationType="fade" onRequestClose={() => setEditingInfo(false)}>
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
      </Modal>
      {/* Knapprad med horisontella linjer */}
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
        <View style={{ marginTop: 0, marginBottom: 0, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: '600', textAlign: 'left', marginBottom: 12, color: '#263238', letterSpacing: 0.2 }}>
            Utförda kontroller:
          </Text>
        </View>
      </View>

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
              } catch (_e) {
                return { total: 0, open: 0 };
              }
            }

        // For group header: are ALL Skyddsrond controls handled?
        return (
          <View>
            {grouped.map(({ type, items }) => {
              const t = type;
              const typeMeta = (controlTypeOptions || []).find(o => o.type === t) || null;
              let allHandled = true;
              let anyDeviation = false;
              let anyOpenDeviation = false;
              if (t === 'Skyddsrond') {
                const stats = (items || []).map(ctrl => getSkyddsrondDeviationStats(ctrl));
                allHandled = stats.length > 0 && stats.every(s => s.total > 0 && s.open === 0);
                anyDeviation = stats.some(s => s.total > 0);
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
                          try { e && e.stopPropagation && e.stopPropagation(); } catch (_e) {}
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
                            } catch (_e) {}
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
                                      else navigation.navigate('ArbetsberedningScreen', { initialValues: item, project });
                                      break;
                                    case 'Riskbedömning':
                                      if (Platform.OS === 'web') openInlineControl('Riskbedömning', item);
                                      else navigation.navigate('RiskbedömningScreen', { initialValues: item, project });
                                      break;
                                    case 'Fuktmätning':
                                      if (Platform.OS === 'web') openInlineControl('Fuktmätning', item);
                                      else navigation.navigate('FuktmätningScreen', { initialValues: item, project });
                                      break;
                                    case 'Egenkontroll':
                                      if (Platform.OS === 'web') openInlineControl('Egenkontroll', item);
                                      else navigation.navigate('EgenkontrollScreen', { initialValues: item, project });
                                      break;
                                    case 'Mottagningskontroll':
                                      if (Platform.OS === 'web') openInlineControl('Mottagningskontroll', item);
                                      else navigation.navigate('MottagningskontrollScreen', { initialValues: item, project });
                                      break;
                                    case 'Skyddsrond':
                                      if (Platform.OS === 'web') openInlineControl('Skyddsrond', item);
                                      else navigation.navigate('SkyddsrondScreen', { initialValues: item, project });
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
                                    try { e && e.stopPropagation && e.stopPropagation(); } catch (_e) {}
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
                                      try {
                                        console.log('[PDF] using buildSummaryHtml?', typeof buildSummaryHtml);
                                        // Prepare logo (prefer company profile for PDF; try downloading + base64 embed)
                                        let profile = companyProfile;
                                        if (!profile && companyId) {
                                          try {
                                            profile = await fetchCompanyProfile(companyId);
                                            if (profile) setCompanyProfile(profile);
                                          } catch (_e) {}
                                        }
                                        const companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
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
                                          } catch (_e) { console.warn('[PDF] download logo failed', e); }
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
                                            } catch (_e) { /* ignore */ }
                                          } else {
                                            logoForPrint = 'data:image/png;base64,' + logoBase64;
                                          }
                                        } catch (_e) { console.warn('[PDF] logo base64 convert failed', e); }

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
                                      } catch (_e) {
                                        console.warn('[PDF] single-item PDF generation failed, retrying without logo', err);
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




