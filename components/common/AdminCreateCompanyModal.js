/**
 * Modal för att skapa nytt företag – golden rules: MODAL_DESIGN_2026, mörk banner,
 * flyttbar på webb, Avbryt (dimmad röd) / Skapa företag (mörk).
 * Öppnas från Superadmin → Företag → Nytt företag.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import { provisionCompanyRemote, setCompanyUserLimitRemote } from '../firebase';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: D.overlayBg,
    ...(Platform.OS === 'web' ? { backdropFilter: `blur(${D.overlayBlur}px)` } : {}),
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: D.radius,
    overflow: 'hidden',
    flexDirection: 'column',
    ...(Platform.OS === 'web' ? { boxShadow: D.shadow } : { width: '90%', maxWidth: 560, ...D.shadowNative }),
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 12,
    minHeight: 28,
    maxHeight: 28,
    borderBottomWidth: D.headerNeutral.borderBottomWidth,
    borderBottomColor: D.headerNeutral.borderBottomColor,
    backgroundColor: D.headerNeutral.backgroundColor,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  titleIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: D.headerNeutralTextColor,
  },
  closeBtn: {
    padding: 4,
    borderRadius: D.closeBtn.borderRadius,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 20, paddingBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 10 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: D.inputRadius,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#1e293b',
    marginBottom: 12,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  inputDisabled: { backgroundColor: '#f8fafc', color: '#64748b' },
  hint: { fontSize: 10, color: '#94a3b8', marginTop: -8, marginBottom: 12 },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: D.footer.paddingHorizontal,
    borderTopWidth: D.footer.borderTopWidth,
    borderTopColor: D.footer.borderTopColor,
    backgroundColor: D.footer.backgroundColor,
  },
  footerBtnAvbryt: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnAvbrytText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#b91c1c',
  },
  footerBtnPrimary: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: D.buttonRadius,
    backgroundColor: '#2D3A4B',
    minWidth: 96,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnPrimaryDisabled: { opacity: 0.6 },
  footerBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  error: { fontSize: 12, color: '#dc2626', marginBottom: 10 },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 28,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  loadingSubtitle: { fontSize: 15, color: '#475569', textAlign: 'center', marginBottom: 4 },
  loadingHint: { fontSize: 13, color: '#64748b', textAlign: 'center' },
});

function slugFromName(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[åäö]/g, (m) => ({ å: 'a', ä: 'a', ö: 'o' }[m] || m))
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function AdminCreateCompanyModal({ visible, onClose, onSuccess }) {
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [userLimit, setUserLimit] = useState('10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 520,
    defaultHeight: 420,
    minWidth: 400,
    minHeight: 360,
  });

  useEffect(() => {
    if (visible) {
      setCompanyName('');
      setCompanyId('');
      setUserLimit('10');
      setError('');
    }
  }, [visible]);

  const handleNameChange = (text) => {
    setCompanyName(text);
    setCompanyId(slugFromName(text));
  };

  const handleCreate = async () => {
    const trimmedName = String(companyName || '').trim();
    const trimmedId = String(companyId || '').trim();
    if (!trimmedId || !trimmedName) {
      setError('Företagsnamn och Företags-ID krävs.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const result = await provisionCompanyRemote({ companyId: trimmedId, companyName: trimmedName });
      const limitNum = parseInt(userLimit, 10);
      if (Number.isFinite(limitNum) && limitNum !== 10) {
        try {
          await setCompanyUserLimitRemote({ companyId: trimmedId, userLimit: limitNum });
        } catch (_e) {}
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dkCompanyCreated', { detail: { companyId: trimmedId, companyName: trimmedName, baseSiteCreated: result?.baseSiteCreated !== false } }));
      }
      onSuccess?.(trimmedId);
      if (result && typeof Alert !== 'undefined') {
        if (result.sharePointError) {
          const detail = (result.sharePointMessage && String(result.sharePointMessage).trim()) ? `\n\nDetalj: ${String(result.sharePointMessage).trim()}` : '';
          Alert.alert('Företag skapat', 'SharePoint kunde inte etableras (Site + Bas). Öppna SharePoint Nav → Företagsöversikt, välj företaget och klicka "Etablera SharePoint" för att försöka igen.' + detail);
        } else if (result.baseSiteCreated === false) {
          Alert.alert('Företag skapat', 'Site är kopplad till företaget. Bas-siten kunde inte skapas – du kan synka eller försöka etablera SharePoint igen senare från SharePoint Nav.');
        } else {
          Alert.alert('Företag skapat', 'Site och Bas är skapade och kopplade till företaget. De syns i SharePoint Nav → Företagsöversikt (listan uppdateras automatiskt).');
        }
      }
      onClose?.();
    } catch (e) {
      const details = (e && typeof e.details === 'string' && e.details.trim()) ? e.details.trim() : null;
      const msg = (e && typeof e.message === 'string' && e.message.trim()) ? e.message.trim() : null;
      const code = (e && typeof e.code === 'string') ? e.code : '';
      const isDeadlineExceeded = code === 'deadline-exceeded' || /deadline-exceeded|deadline exceeded/i.test(String(msg || '') + String(details || ''));
      const isInternal = code === 'internal' || (msg && msg.toLowerCase() === 'internal');
      // Timeout eller "internal" = anropet avbröts men backend kan ha lyckats. Visa success, ingen röd text.
      if (isDeadlineExceeded || isInternal) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dkCompanyCreated', { detail: { companyId: trimmedId, companyName: trimmedName, baseSiteCreated: null } }));
        }
        onSuccess?.(trimmedId);
        onClose?.();
        if (typeof Alert !== 'undefined') {
          Alert.alert('Företaget skapades', 'Skapandet kan ha tagit några minuter. Kontrollera under Företag och i SharePoint Nav → Företagsöversikt att företaget och siter finns. Om något saknas kan du etablera SharePoint från SharePoint Nav.');
        }
        return;
      }
      // Verkliga fel: visa röd text (t.ex. företag skapades inte, SharePoint fel, koppling misslyckades).
      const isNetworkOrCors = !code || /failed|network|cors|access control|allowed by access-control/i.test(String(msg || '') + String(details || ''));
      const fallback = isNetworkOrCors
        ? 'Anropet till servern misslyckades (nätverk/CORS). Lägg till http://localhost i Firebase Console → Authorized domains om du kör lokalt.'
        : 'Kunde inte skapa företag. Kontrollera att SharePoint är konfigurerad (functions config) och att företagsnamnet inte innehåller ogiltiga tecken.';
      const toShow = details || (msg && msg.toLowerCase() !== 'internal' ? msg : null) || (code ? `${code}: ${msg || fallback}` : null) || fallback;
      setError(toShow);
    } finally {
      setSaving(false);
    }
  };

  const trimmedName = String(companyName || '').trim();
  const trimmedId = String(companyId || '').trim();
  const canSubmit = trimmedId.length > 0 && trimmedName.length > 0 && !saving;

  const handleCreateRef = useRef(handleCreate);
  const savingRef = useRef(saving);
  handleCreateRef.current = handleCreate;
  savingRef.current = saving;

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!savingRef.current) handleCreateRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <>
      {saving && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#2D3A4B" style={{ marginBottom: 16 }} />
              <Text style={styles.loadingTitle}>Skapar företag</Text>
              <Text style={styles.loadingSubtitle}>{trimmedName || trimmedId}</Text>
              <Text style={styles.loadingHint}>Det kan ta 2–3 minuter. Skapar Firebase-data och SharePoint (Site + Bas) – vänta, avbryt inte.</Text>
            </View>
          </View>
        </Modal>
      )}
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.overlay, overlayStyle]} onPress={onClose}>
        <Pressable style={[styles.box, boxStyle]} onPress={(e) => e?.stopPropagation?.()} data-modal="true">
          {/* Banner – golden rule: mörk, flyttbar på webb */}
          <View
            style={[styles.header, headerProps?.style]}
            {...(Platform.OS === 'web' && headerProps?.onMouseDown ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="business-outline" size={14} color={D.headerNeutralTextColor} />
              </View>
              <Text style={styles.title} numberOfLines={1}>Skapa nytt företag</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Stäng" {...(Platform.OS === 'web' ? { onMouseDown: (e) => e?.stopPropagation?.() } : {})}>
              <Ionicons name="close" size={18} color={D.headerNeutralCloseIconColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>Grunduppgifter</Text>
            <Text style={styles.label}>Företagsnamn *</Text>
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={handleNameChange}
              placeholder="t.ex. Test Företag AB"
              placeholderTextColor="#94a3b8"
              editable={!saving}
            />
            <Text style={styles.label}>Företags-ID *</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={companyId}
              onChangeText={setCompanyId}
              placeholder="Fylls i automatiskt från företagsnamn"
              placeholderTextColor="#94a3b8"
              editable={!saving}
            />
            <Text style={styles.hint}>Fylls i automatiskt, men kan redigeras manuellt. Används som unik identifierare.</Text>
            <Text style={styles.label}>Max antal användare</Text>
            <TextInput
              style={styles.input}
              value={userLimit}
              onChangeText={setUserLimit}
              placeholder="10"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              editable={!saving}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          {/* Footer – golden rule: Avbryt dimmad röd, Skapa företag mörk */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerBtnAvbryt} onPress={onClose} disabled={saving} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
              <Text style={styles.footerBtnAvbrytText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtnPrimary, !canSubmit && styles.footerBtnPrimaryDisabled]}
              onPress={handleCreate}
              disabled={!canSubmit}
              {...(Platform.OS === 'web' ? { cursor: canSubmit ? 'pointer' : 'not-allowed' } : {})}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.footerBtnPrimaryText}>Skapa företag</Text>
              )}
            </TouchableOpacity>
          </View>
          {resizeHandles}
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}
