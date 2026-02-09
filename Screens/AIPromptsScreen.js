/**
 * Administration – AI-analys: lista över analystyper (Förfrågningsunderlag, Ritningar)
 * och redigera företagets sparade prompt per typ.
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
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
import { HomeHeader } from '../components/common/HomeHeader';
import { getCompanyAIPrompt, setCompanyAIPrompt } from '../components/firebase';
import MainLayout from '../components/MainLayout';

const AI_PROMPT_TYPES = [
  { key: 'ffu', label: 'Förfrågningsunderlag', description: 'Extra instruktion till AI när den analyserar dokument i förfrågningsunderlaget.' },
  { key: 'ritningar', label: 'Ritningar', description: 'Extra instruktion till AI för ritningsanalys (kommer att användas när funktionen är aktiverad).' },
];

export default function AIPromptsScreen({ route, navigation }) {
  const companyId = String(route?.params?.companyId || '').trim();

  const [prompts, setPrompts] = useState({});
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState({ visible: false, key: '', label: '', instruction: '', saving: false, error: '' });

  const loadPrompts = useCallback(async () => {
    if (!companyId) {
      setPrompts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = {};
    for (const { key } of AI_PROMPT_TYPES) {
      try {
        const doc = await getCompanyAIPrompt(companyId, key);
        next[key] = doc ? (doc.instruction || '') : '';
      } catch (_e) {
        next[key] = '';
      }
    }
    setPrompts(next);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  useEffect(() => {
    if (!companyId) return;
    try {
      AsyncStorage.setItem('dk_companyId', companyId);
      if (Platform.OS === 'web') window?.localStorage?.setItem?.('dk_companyId', companyId);
    } catch (_e) {}
  }, [companyId]);

  const openEdit = (key, label) => {
    setEditModal({
      visible: true,
      key,
      label,
      instruction: prompts[key] || '',
      saving: false,
      error: '',
    });
  };

  const closeEdit = () => {
    setEditModal({ visible: false, key: '', label: '', instruction: '', saving: false, error: '' });
  };

  const savePrompt = async () => {
    const { key, instruction } = editModal;
    if (!companyId || !key) return;
    setEditModal((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      await setCompanyAIPrompt(companyId, key, { instruction: instruction || '' });
      setPrompts((prev) => ({ ...prev, [key]: instruction || '' }));
      closeEdit();
    } catch (e) {
      const msg = String(e?.message || e || '').trim();
      setEditModal((prev) => ({ ...prev, saving: false, error: msg || 'Kunde inte spara.' }));
    }
  };

  return (
    <MainLayout
      adminMode
      adminCurrentScreen="ai_prompts"
      sidebarTitle="Administration"
      sidebarSelectedCompanyId={companyId}
      topBar={<HomeHeader navigation={navigation} route={route} />}
      contentPadding={24}
    >
      <View style={styles.wrap}>
        <Text style={styles.title}>AI-analys – Prompter</Text>
        <Text style={styles.subtitle}>
          Företagets extra instruktioner till AI per analystyp. Sparas företagsbaserat och används vid nästa körning.
        </Text>

        {!companyId ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Välj företag i sidomenyn.</Text>
          </View>
        ) : loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#1976D2" />
            <Text style={styles.loadingText}>Laddar prompter…</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {AI_PROMPT_TYPES.map(({ key, label, description }) => (
              <View key={key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="document-text-outline" size={20} color="#1976D2" style={{ marginRight: 10 }} />
                  <Text style={styles.cardTitle}>{label}</Text>
                </View>
                <Text style={styles.cardDescription}>{description}</Text>
                {(prompts[key] || '').trim() ? (
                  <Text style={styles.preview} numberOfLines={3}>
                    {(prompts[key] || '').trim()}
                  </Text>
                ) : (
                  <Text style={styles.previewMuted}>Ingen extra instruktion sparad.</Text>
                )}
                <TouchableOpacity
                  onPress={() => openEdit(key, label)}
                  style={styles.editBtn}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Ionicons name="create-outline" size={16} color="#1976D2" />
                  <Text style={styles.editBtnText}>Justera prompt</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal visible={editModal.visible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeEdit}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Justera prompt – {editModal.label}</Text>
              <TouchableOpacity onPress={closeEdit} style={styles.modalClose} accessibilityLabel="Stäng">
                <Ionicons name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              value={editModal.instruction}
              onChangeText={(t) => setEditModal((prev) => ({ ...prev, instruction: t }))}
              placeholder="T.ex. Fokusera särskilt på krav kopplade till miljö och arbetsmiljö."
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
            />
            {editModal.error ? (
              <Text style={styles.modalError}>{editModal.error}</Text>
            ) : null}
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={closeEdit} style={styles.modalBtnSecondary} disabled={editModal.saving}>
                <Text style={styles.modalBtnSecondaryText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={savePrompt}
                style={[styles.modalBtnPrimary, editModal.saving ? styles.modalBtnDisabled : null]}
                disabled={editModal.saving}
              >
                {editModal.saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Spara</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  title: { fontSize: 22, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 20 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#64748b' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 24 },
  loadingText: { fontSize: 14, color: '#64748b' },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  cardDescription: { fontSize: 13, color: '#64748b', marginBottom: 10, lineHeight: 18 },
  preview: { fontSize: 13, color: '#334155', lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  previewMuted: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 12 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: 14, fontWeight: '500', color: '#1976D2' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a', flex: 1 },
  modalClose: { padding: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 120,
    marginBottom: 16,
  },
  modalError: { fontSize: 13, color: '#dc2626', marginBottom: 12 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  modalBtnSecondaryText: { fontSize: 14, fontWeight: '500', color: '#334155' },
  modalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    minWidth: 100,
    alignItems: 'center',
  },
  modalBtnDisabled: { opacity: 0.7 },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '500', color: '#fff' },
});
