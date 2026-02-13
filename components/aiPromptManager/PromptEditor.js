/**
 * Formulär för att redigera/skapa en prompt: namn, beskrivning, system/användar/extra, aktiv, standard.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const INPUT_STYLE = {
  borderWidth: 1,
  borderColor: '#E2E8F0',
  borderRadius: 8,
  padding: 12,
  fontSize: 14,
  color: '#1e293b',
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
};

const TEXTAREA_MONO = {
  ...INPUT_STYLE,
  minHeight: 100,
  fontFamily: Platform.OS === 'web' ? 'ui-monospace, monospace' : undefined,
  backgroundColor: '#f8fafc',
};

export default function PromptEditor({
  template,
  category,
  categoryKey,
  onSave,
  onCancel,
  getDefaultPrompt,
  saving,
  saveStatus,
}) {
  const isNew = !template?.id;
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(template?.systemPrompt ?? '');
  const [userTemplate, setUserTemplate] = useState(template?.userTemplate ?? '');
  const [extraInstruction, setExtraInstruction] = useState(template?.extraInstruction ?? '');
  const [active, setActive] = useState(template?.active !== false);
  const [isDefault, setIsDefault] = useState(template?.isDefault === true);
  const [defaultPromptLoaded, setDefaultPromptLoaded] = useState(false);

  useEffect(() => {
    if (!isNew || !categoryKey || defaultPromptLoaded) return;
    getDefaultPrompt(categoryKey)
      .then((data) => {
        if (data?.system) setSystemPrompt((prev) => prev || data.system);
        if (data?.userTemplate) setUserTemplate((prev) => prev || data.userTemplate);
        setDefaultPromptLoaded(true);
      })
      .catch(() => setDefaultPromptLoaded(true));
  }, [isNew, categoryKey, getDefaultPrompt, defaultPromptLoaded]);

  const handleSave = () => {
    onSave({
      id: template?.id,
      category: categoryKey,
      name: name.trim() || 'Namnlös',
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      userTemplate: userTemplate.trim(),
      extraInstruction: extraInstruction.trim(),
      active,
      isDefault,
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 }}>Promptnamn *</Text>
      <TextInput
        style={{ ...INPUT_STYLE, marginBottom: 16 }}
        value={name}
        onChangeText={setName}
        placeholder="T.ex. Standard FFU-analys"
      />

      <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 }}>Beskrivning</Text>
      <TextInput
        style={{ ...INPUT_STYLE, marginBottom: 16 }}
        value={description}
        onChangeText={setDescription}
        placeholder="Kort beskrivning"
      />

      <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 }}>Systemprompt</Text>
      <TextInput
        style={{ ...TEXTAREA_MONO, marginBottom: 16 }}
        value={systemPrompt}
        onChangeText={setSystemPrompt}
        placeholder="Systeminstruktion till AI…"
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />

      <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 }}>Användarprompt (mall)</Text>
      <TextInput
        style={{ ...TEXTAREA_MONO, marginBottom: 16 }}
        value={userTemplate}
        onChangeText={setUserTemplate}
        placeholder="Mall för användarprompt…"
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />

      <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 }}>Företagets extra instruktion</Text>
      <TextInput
        style={{ ...TEXTAREA_MONO, marginBottom: 16 }}
        value={extraInstruction}
        onChangeText={setExtraInstruction}
        placeholder="T.ex. Fokusera på miljö och arbetsmiljö."
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setActive((a) => !a)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: active ? '#2563eb' : '#e2e8f0',
              justifyContent: 'center',
              paddingHorizontal: 2,
            }}
            {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: active ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
          <Text style={{ fontSize: 14, color: '#334155' }}>Aktiv</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setIsDefault((d) => !d)}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: isDefault ? '#2563eb' : '#cbd5e1',
              backgroundColor: isDefault ? '#2563eb' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
          >
            {isDefault ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </TouchableOpacity>
          <Text style={{ fontSize: 14, color: '#334155' }}>Sätt som standard</Text>
        </View>
      </View>

      {saveStatus ? <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{saveStatus}</Text> : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' }}
          disabled={saving}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#334155' }}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 8,
            backgroundColor: '#1e293b',
            minWidth: 100,
            alignItems: 'center',
            opacity: saving ? 0.7 : 1,
          }}
          disabled={saving}
          {...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer' } : {})}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Spara</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
