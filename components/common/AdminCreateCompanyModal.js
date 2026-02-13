/**
 * Modal för att skapa nytt företag – samma design som Företagsinställningar (mörk header, vit innehållsarea).
 * Öppnas från Superadmin → Företag → Nytt företag.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { ICON_RAIL } from '../../constants/iconRailTheme';
import { provisionCompanyRemote, setCompanyUserLimitRemote } from '../firebase';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 560,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
    flexDirection: 'column',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: ICON_RAIL.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: ICON_RAIL.activeBgRadius,
    backgroundColor: ICON_RAIL.activeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '600', color: ICON_RAIL.iconColorActive },
  subtitle: { fontSize: 12, color: ICON_RAIL.iconColor, fontWeight: '400', marginLeft: 6 },
  closeBtn: { padding: 5 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 20, paddingBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  label: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    marginBottom: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: -10, marginBottom: 16 },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: ICON_RAIL.bg,
    minWidth: 140,
    alignItems: 'center',
  },
  error: { fontSize: 13, color: '#dc2626', marginBottom: 12 },
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
      await provisionCompanyRemote({ companyId: trimmedId, companyName: trimmedName });
      const limitNum = parseInt(userLimit, 10);
      if (Number.isFinite(limitNum) && limitNum !== 10) {
        try {
          await setCompanyUserLimitRemote({ companyId: trimmedId, userLimit: limitNum });
        } catch (_e) {}
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dkCompanyCreated', { detail: { companyId: trimmedId, companyName: trimmedName } }));
      }
      onSuccess?.(trimmedId);
      onClose?.();
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg || 'Kunde inte skapa företag.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const trimmedName = String(companyName || '').trim();
  const trimmedId = String(companyId || '').trim();
  const canSubmit = trimmedId.length > 0 && trimmedName.length > 0 && !saving;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e?.stopPropagation?.()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="business-outline" size={16} color={ICON_RAIL.iconColorActive} />
              </View>
              <Text style={styles.title} numberOfLines={1}>Skapa nytt företag</Text>
              <Text style={styles.subtitle} numberOfLines={1}>Nytt företag</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Stäng">
              <Ionicons name="close" size={20} color={ICON_RAIL.iconColorActive} />
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
              editable={!saving}
            />
            <Text style={styles.label}>Företags-ID *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: '#f8fafc', color: '#64748b' }]}
              value={companyId}
              onChangeText={setCompanyId}
              placeholder="Fylls i automatiskt från företagsnamn"
              editable={!saving}
            />
            <Text style={styles.hint}>Fylls i automatiskt, men kan redigeras manuellt. Används som unik identifierare.</Text>
            <Text style={styles.label}>Max antal användare</Text>
            <TextInput
              style={styles.input}
              value={userLimit}
              onChangeText={setUserLimit}
              placeholder="10"
              keyboardType="number-pad"
              editable={!saving}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onClose} disabled={saving} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Stäng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, !canSubmit && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={!canSubmit}
              {...(Platform.OS === 'web' ? { cursor: canSubmit ? 'pointer' : 'not-allowed' } : {})}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Skapa företag</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
