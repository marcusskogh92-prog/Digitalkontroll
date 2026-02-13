/**
 * Slide-panel från höger: AI-inställningar per kategori (Förfrågningsunderlag, Ritningar).
 * Multi-prompt manager: lista, redigera, aktiv/inaktiv, standard, statistik.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  deleteCompanyAIPromptTemplate,
  fetchCompanyAIPromptTemplates,
  getCompanyAIPrompt,
  saveCompanyAIPromptTemplate,
} from '../firebase';
import { getDefaultAIPrompt } from '../firebase';
import PromptEditor from './PromptEditor';
import PromptHeader from './PromptHeader';
import PromptList from './PromptList';

const DRAWER_WIDTH = Math.min(900, Platform.OS === 'web' ? 820 : 360);
const CATEGORY_LABELS = { ffu: 'Förfrågningsunderlag', ritningar: 'Ritningar' };

export default function AiPromptManagerDrawer({ visible, companyId, categoryKey, onClose }) {
  const cid = String(companyId || '').trim();
  const cat = String(categoryKey || 'ffu').trim() || 'ffu';
  const categoryLabel = CATEGORY_LABELS[cat] || cat;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'editor'
  const [editingTemplate, setEditingTemplate] = useState(null); // null = list, {} = new, { id, ... } = edit
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  const loadTemplates = useCallback(async () => {
    if (!cid || !cat) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let list = await fetchCompanyAIPromptTemplates(cid, cat);
      if (list.length === 0 && cat === 'ffu') {
        const legacy = await getCompanyAIPrompt(cid, 'ffu').catch(() => null);
        if (legacy?.instruction) {
          await saveCompanyAIPromptTemplate(cid, {
            category: cat,
            name: 'Standard FFU-analys',
            description: 'Migrerad från tidigare inställning',
            systemPrompt: '',
            userTemplate: '',
            extraInstruction: String(legacy.instruction || '').trim(),
            active: true,
            isDefault: true,
            tags: ['JSON'],
          });
          list = await fetchCompanyAIPromptTemplates(cid, cat);
        }
      }
      setTemplates(list);
    } catch (_e) {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [cid, cat]);

  useEffect(() => {
    if (!visible) return;
    loadTemplates();
    setView('list');
    setEditingTemplate(null);
    slideAnim.setValue(0);
    Animated.timing(slideAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, cid, cat, loadTemplates, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onClose?.());
  };

  const handleNewPrompt = () => {
    setEditingTemplate({});
    setView('editor');
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setView('editor');
  };

  const handleDuplicate = (template) => {
    setEditingTemplate({
      ...template,
      id: undefined,
      name: (template.name || 'Kopia') + ' (kopia)',
      isDefault: false,
    });
    setView('editor');
  };

  const handleDelete = (template) => {
    Alert.alert(
      'Ta bort prompt',
      `Vill du ta bort "${template.name || 'Namnlös'}"?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCompanyAIPromptTemplate(cid, template.id);
              await loadTemplates();
            } catch (e) {
              if (Platform.OS === 'web' && window?.alert) window.alert('Kunde inte ta bort: ' + (e?.message || e));
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (template) => {
    const newActive = !(template.active !== false);
    if (template.isDefault && !newActive) {
      Alert.alert(
        'Inaktivera standard',
        'Standardprompten kan inte vara inaktiv. Sätt en annan prompt som standard först, eller avbryt.',
        [{ text: 'OK' }]
      );
      return;
    }
    try {
      await saveCompanyAIPromptTemplate(cid, { ...template, active: newActive });
      await loadTemplates();
    } catch (_e) {}
  };

  const handleSaveEditor = async (payload) => {
    setSaving(true);
    setSaveStatus('Sparar…');
    try {
      await saveCompanyAIPromptTemplate(cid, payload);
      setSaveStatus('Sparad');
      await loadTemplates();
      setEditingTemplate(null);
      setView('list');
    } catch (e) {
      setSaveStatus('Fel: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditor = () => {
    setEditingTemplate(null);
    setView('list');
    setSaveStatus('');
  };

  if (!visible) return null;

  const translateX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_WIDTH, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={handleClose}>
        <Animated.View
          style={{
            width: DRAWER_WIDTH,
            maxWidth: '100%',
            flex: 1,
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOffset: { width: -4, height: 0 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 16,
            transform: [{ translateX }],
          }}
          onStartShouldSetResponder={() => true}
        >
          <PromptHeader
            categoryLabel={categoryLabel}
            onNewPrompt={view === 'list' ? handleNewPrompt : undefined}
            onClose={handleClose}
          />
          {view === 'editor' ? (
            <PromptEditor
              template={editingTemplate}
              category={categoryLabel}
              categoryKey={cat}
              onSave={handleSaveEditor}
              onCancel={handleCancelEditor}
              getDefaultPrompt={getDefaultAIPrompt}
              saving={saving}
              saveStatus={saveStatus}
            />
          ) : loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Text style={{ fontSize: 14, color: '#64748b' }}>Laddar prompter…</Text>
            </View>
          ) : (
            <PromptList
              templates={templates}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
