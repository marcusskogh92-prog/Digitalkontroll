/**
 * Modal: Mallar. Öppnas från Register → Mallar.
 * Samma storlek och scroll som AdminContactRegistryModal, utan kolumner.
 * Innehåll under utveckling – placeholder tills vidare.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchCompanyProfile } from '../firebase';

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 1400,
    height: Platform.OS === 'web' ? '85vh' : '85%',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
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
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  closeBtn: { padding: 8 },
  toolbarSection: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff' },
  toolbarDivider: { height: 1, backgroundColor: '#e2e8f0', marginTop: 12, marginHorizontal: -20 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  placeholder: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 200,
  },
  placeholderTitle: { fontSize: 15, fontWeight: '600', color: '#475569', marginBottom: 8, textAlign: 'center' },
  placeholderText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  footer: { flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  footerBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
});

export default function MallarModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');

  const loadCompanyName = useCallback(async () => {
    if (!cid) return;
    let cancelled = false;
    try {
      const profile = await fetchCompanyProfile(cid);
      if (!cancelled && profile) {
        setCompanyName(String(profile?.companyName ?? profile?.name ?? '').trim() || cid);
      }
    } catch (_e) {
      if (!cancelled) setCompanyName(cid);
    }
    return () => { cancelled = true; };
  }, [cid]);

  useEffect(() => {
    if (!visible || !cid) return;
    loadCompanyName();
  }, [visible, cid, loadCompanyName]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="document-text-outline" size={22} color="#0284c7" />
              </View>
              <View>
                <Text style={styles.title}>Mallar</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {hasCompany ? (companyName || cid) : 'Välj företag i sidomenyn eller i headern'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Stäng">
              <Ionicons name="close" size={24} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarSection}>
            {!hasCompany ? (
              <Text style={{ fontSize: 13, color: '#64748b' }}>Välj företag i sidomenyn eller i headern.</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, color: '#64748b' }}>Mallar för detta företag – innehåll under utveckling.</Text>
              </View>
            )}
            <View style={styles.toolbarDivider} />
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.placeholder}>
              <Ionicons name="document-text-outline" size={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
              <Text style={styles.placeholderTitle}>Utveckling pågår</Text>
              <Text style={styles.placeholderText}>
                Denna del är under utveckling. Här kommer du att kunna hantera mallar för valt företag.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerBtn} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
