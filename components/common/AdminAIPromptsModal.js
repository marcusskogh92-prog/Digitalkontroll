/**
 * Admin modal: AI-analys – Prompter. Samma storlek som Kontaktregister/Kundregister.
 * Lista analystyper (Förfrågningsunderlag, Ritningar) och redigera företagets sparade prompt.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
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
import { fetchCompanyProfile, getCompanyAIPrompt, getDefaultAIPrompt, setCompanyAIPrompt } from '../firebase';

/** Fallback om Cloud Function inte svarar – samma innehåll som getDefaultFFUPromptForDisplay i functions. */
const DEFAULT_FFU_PROMPT_FALLBACK = {
  system: [
    'Du är en noggrann assistent som analyserar svenska förfrågningsunderlag (FFU).',
    'Du får ENDAST använda texten som tillhandahålls i detta anrop. Om något inte framgår av texten ska du skriva tom sträng eller utelämna det genom att inte hitta något (t.ex. tomma listor).',
    'Du får INTE göra antaganden om AF/AB/TB, entreprenadform, juridik eller praxis om det inte uttryckligen står i texten.',
    'Om källhänvisning inte går att avgöra exakt: ange dokumentnamn och en kort beskrivning av var i texten (t.ex. "Bilaga 2 – Kravspec, avsnitt 3") eller lämna "source" som tom sträng.',
    'Returnera ENDAST giltig JSON som exakt matchar det efterfrågade formatet. Ingen Markdown. Inga extra nycklar.',
  ].join('\n'),
  userTemplate: [
    'Analysera följande FFU som ett sammanhängande underlag.',
    '',
    'companyId: [väljs vid körning]',
    'projectId: [väljs vid körning]',
    '',
    'Dokument (med extraherad text):',
    '[Dokumenten från förfrågningsunderlaget läggs in här vid analys]',
    '',
    'Krav på output:',
    '- summary.description: kort sammanfattning av vad upphandlingen avser.',
    '- summary.projectType: projekt-/uppdragstyp om den står i texten, annars "".',
    '- summary.procurementForm: entreprenad-/upphandlingsform endast om explicit angiven, annars "".',
    '- requirements.must: endast obligatoriska SKA-krav.',
    '- requirements.should: endast utvärderande/meriterande BÖR-krav.',
    '- risks: endast oklarheter, saknad info eller flertydighet baserat på texten (inga gissningar).',
    '- openQuestions: frågor som bör ställas baserat på brister/oklarheter i texten.',
    '',
    'Returnera JSON i exakt detta format:',
    '{',
    '  "summary": { "description": "", "projectType": "", "procurementForm": "" },',
    '  "requirements": { "must": [ { "text": "", "source": "" } ], "should": [ { "text": "", "source": "" } ] },',
    '  "risks": [ { "issue": "", "reason": "" } ],',
    '  "openQuestions": [ { "question": "", "reason": "" } ]',
    '}',
  ].join('\n'),
};

const AI_PROMPT_TYPES = [
  { key: 'ffu', label: 'Förfrågningsunderlag', description: 'Extra instruktion till AI när den analyserar dokument i förfrågningsunderlaget.' },
  { key: 'ritningar', label: 'Ritningar', description: 'Extra instruktion till AI för ritningsanalys (kommer att användas när funktionen är aktiverad).' },
];

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
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  intro: { fontSize: 14, color: '#64748b', marginBottom: 16, lineHeight: 20 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#64748b' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 24 },
  loadingText: { fontSize: 14, color: '#64748b' },
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
  footer: { flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  footerBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },

  innerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  innerModalBox: { width: '100%', maxWidth: 640, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  innerModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  innerModalTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a', flex: 1 },
  innerModalClose: { padding: 4 },
  defaultPromptSection: { marginBottom: 16 },
  defaultPromptLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8 },
  defaultPromptText: { fontSize: 12, color: '#334155', lineHeight: 18, padding: 12, backgroundColor: '#f1f5f9', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', maxHeight: 220 },
  innerModalInput: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#0f172a', minHeight: 120, marginBottom: 16 },
  extraInstructionLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8 },
  innerModalError: { fontSize: 13, color: '#dc2626', marginBottom: 12 },
  innerModalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  innerModalBtnSecondary: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#E2E8F0' },
  innerModalBtnPrimary: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#1976D2', minWidth: 100, alignItems: 'center' },
  innerModalBtnDisabled: { opacity: 0.7 },
});

export default function AdminAIPromptsModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');
  const [prompts, setPrompts] = useState({});
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState({ visible: false, key: '', label: '', instruction: '', saving: false, error: '' });
  const [defaultPrompt, setDefaultPrompt] = useState(null);
  const [defaultPromptLoading, setDefaultPromptLoading] = useState(false);
  const [defaultPromptError, setDefaultPromptError] = useState('');

  const loadPrompts = useCallback(async () => {
    if (!cid) {
      setPrompts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = {};
    for (const { key } of AI_PROMPT_TYPES) {
      try {
        const doc = await getCompanyAIPrompt(cid, key);
        next[key] = doc ? (doc.instruction || '') : '';
      } catch (_e) {
        next[key] = '';
      }
    }
    setPrompts(next);
    setLoading(false);
  }, [cid]);

  useEffect(() => {
    if (!visible) return;
    if (!cid) {
      setLoading(false);
      setCompanyName('');
      return;
    }
    let cancelled = false;
    fetchCompanyProfile(cid).then((profile) => {
      if (!cancelled && profile) setCompanyName(String(profile?.companyName ?? profile?.name ?? '').trim() || cid);
    }).catch(() => {
      if (!cancelled) setCompanyName(cid);
    });
    loadPrompts();
    return () => { cancelled = true; };
  }, [visible, cid, loadPrompts]);

  const openEdit = (key, label) => {
    setEditModal({ visible: true, key, label, instruction: prompts[key] || '', saving: false, error: '' });
  };

  const closeEdit = () => {
    setEditModal({ visible: false, key: '', label: '', instruction: '', saving: false, error: '' });
    setDefaultPrompt(null);
    setDefaultPromptLoading(false);
    setDefaultPromptError('');
  };

  useEffect(() => {
    if (!editModal.visible || editModal.key !== 'ffu') return;
    setDefaultPromptLoading(true);
    setDefaultPrompt(null);
    setDefaultPromptError('');
    let cancelled = false;
    getDefaultAIPrompt('ffu')
      .then((data) => {
        if (!cancelled) {
          setDefaultPrompt(data);
          setDefaultPromptLoading(false);
          setDefaultPromptError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err?.message || (typeof err === 'string' ? err : '');
          setDefaultPromptError(String(msg).trim() || 'Servern svarade inte. Visar lokal kopia.');
          setDefaultPrompt(DEFAULT_FFU_PROMPT_FALLBACK);
          setDefaultPromptLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [editModal.visible, editModal.key]);

  const savePrompt = async () => {
    const { key, instruction } = editModal;
    if (!cid || !key) return;
    setEditModal((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      await setCompanyAIPrompt(cid, key, { instruction: instruction || '' });
      setPrompts((prev) => ({ ...prev, [key]: instruction || '' }));
      closeEdit();
    } catch (e) {
      const msg = String(e?.message || e || '').trim();
      setEditModal((prev) => ({ ...prev, saving: false, error: msg || 'Kunde inte spara.' }));
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.titleIcon}>
                  <Ionicons name="sparkles-outline" size={22} color="#0284c7" />
                </View>
                <View>
                  <Text style={styles.title}>AI-analys – Prompter</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {hasCompany ? (companyName || cid) : 'Välj företag'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Stäng">
                <Ionicons name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.intro}>
                Företagets extra instruktioner till AI per analystyp. Sparas företagsbaserat och används vid nästa körning.
              </Text>

              {!hasCompany ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>Välj företag i sidomenyn eller i headern.</Text>
                </View>
              ) : loading ? (
                <View style={styles.loading}>
                  <ActivityIndicator size="small" color="#1976D2" />
                  <Text style={styles.loadingText}>Laddar prompter…</Text>
                </View>
              ) : (
                AI_PROMPT_TYPES.map(({ key, label, description }) => (
                  <View key={key} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="document-text-outline" size={20} color="#1976D2" style={{ marginRight: 10 }} />
                      <Text style={styles.cardTitle}>{label}</Text>
                    </View>
                    <Text style={styles.cardDescription}>{description}</Text>
                    {(prompts[key] || '').trim() ? (
                      <Text style={styles.preview} numberOfLines={3}>{(prompts[key] || '').trim()}</Text>
                    ) : (
                      <Text style={styles.previewMuted}>Ingen extra instruktion sparad.</Text>
                    )}
                    <TouchableOpacity onPress={() => openEdit(key, label)} style={styles.editBtn} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                      <Ionicons name="create-outline" size={16} color="#1976D2" />
                      <Text style={styles.editBtnText}>Justera prompt</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.footerBtn} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>Stäng</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={editModal.visible} transparent animationType="fade">
        <Pressable style={styles.innerModalOverlay} onPress={closeEdit}>
          <Pressable style={styles.innerModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.innerModalHeader}>
              <Text style={styles.innerModalTitle}>Justera prompt – {editModal.label}</Text>
              <TouchableOpacity onPress={closeEdit} style={styles.innerModalClose} accessibilityLabel="Stäng">
                <Ionicons name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator contentContainerStyle={{ paddingRight: 8 }}>
              {editModal.key === 'ffu' ? (
                <>
                  <View style={styles.defaultPromptSection}>
                    <Text style={styles.defaultPromptLabel}>Standardprompt (används alltid)</Text>
                    {defaultPromptLoading ? (
                      <View style={{ padding: 16, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#64748b" />
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Laddar…</Text>
                      </View>
                    ) : defaultPromptError && !defaultPrompt ? (
                      <View style={[styles.defaultPromptText, { padding: 12 }]}>
                        <Text style={{ fontSize: 12, color: '#b91c1c' }}>{defaultPromptError}</Text>
                      </View>
                    ) : defaultPrompt && (defaultPrompt.system || defaultPrompt.userTemplate) ? (
                      <>
                        {defaultPromptError ? (
                          <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{defaultPromptError}</Text>
                        ) : null}
                        <ScrollView style={styles.defaultPromptText} nestedScrollEnabled>
                          {defaultPrompt.system ? (
                            <>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 }}>System:</Text>
                              <Text style={{ fontSize: 12, color: '#334155', lineHeight: 18, marginBottom: 12 }}>{defaultPrompt.system}</Text>
                            </>
                          ) : null}
                          {defaultPrompt.userTemplate ? (
                            <>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 }}>Användarprompt (mall):</Text>
                              <Text style={{ fontSize: 12, color: '#334155', lineHeight: 18 }}>{defaultPrompt.userTemplate}</Text>
                            </>
                          ) : null}
                        </ScrollView>
                      </>
                    ) : defaultPrompt && !defaultPromptLoading ? (
                      <View style={[styles.defaultPromptText, { padding: 12 }]}>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>Ingen standardprompt returnerades.</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.extraInstructionLabel}>Företagets extra instruktion (valfritt)</Text>
                </>
              ) : null}
              <TextInput
                style={styles.innerModalInput}
                value={editModal.instruction}
                onChangeText={(t) => setEditModal((prev) => ({ ...prev, instruction: t }))}
                placeholder={editModal.key === 'ffu' ? 'T.ex. Fokusera särskilt på krav kopplade till miljö och arbetsmiljö.' : 'Extra instruktion…'}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
            </ScrollView>
            {editModal.error ? <Text style={styles.innerModalError}>{editModal.error}</Text> : null}
            <View style={styles.innerModalFooter}>
              <TouchableOpacity onPress={closeEdit} style={styles.innerModalBtnSecondary} disabled={editModal.saving}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#334155' }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={savePrompt}
                style={[styles.innerModalBtnPrimary, editModal.saving ? styles.innerModalBtnDisabled : null]}
                disabled={editModal.saving}
              >
                {editModal.saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
