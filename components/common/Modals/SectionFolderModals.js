/**
 * Section Folder Modals – Skapa, byt namn, radera mapp i lower topbar.
 * Stil enligt FileActionModal.
 */

import { useEffect, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import FileActionModal from './FileActionModal';
import { FILE_ACTION_MODAL_STYLES } from './FileActionModal';

const inputStyle = {
  borderWidth: 1,
  borderColor: '#e2e8f0',
  borderRadius: 12,
  paddingVertical: 10,
  paddingHorizontal: 14,
  fontSize: 14,
  color: '#1e293b',
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
};

export function CreateFolderModal({ visible, sectionDisplayName, initialValue = '', onClose, onConfirm, loading = false }) {
  const [value, setValue] = useState(initialValue || '');
  useEffect(() => {
    if (visible) setValue(initialValue || '');
  }, [visible, initialValue]);

  const handleConfirm = () => {
    const trimmed = String(value || '').trim();
    if (trimmed && typeof onConfirm === 'function') {
      onConfirm(trimmed);
    }
  };

  const sectionLabel = (sectionDisplayName || 'sektionen').toLowerCase();
  return (
    <FileActionModal
      visible={visible}
      bannerTitle="Ny flik -"
      bannerSubtitle={`skapa ny flik i ${sectionLabel}`}
      onClose={onClose}
      primaryLabel="Skapa"
      onPrimary={handleConfirm}
      primaryDisabled={!String(value || '').trim() || loading}
      primaryVariant="dark"
      secondaryLabel="Avbryt"
    >
      <View style={{ marginTop: 0 }}>
        <Text style={[FILE_ACTION_MODAL_STYLES.description, { marginBottom: 10 }]}>
          Fliken får ett nummer i SharePoint (t.ex. 01, 02).
        </Text>
        <Text style={[FILE_ACTION_MODAL_STYLES.label, { marginBottom: 4 }]}>Fliknamn</Text>
        <TextInput
          style={inputStyle}
          value={value}
          onChangeText={setValue}
          placeholder="T.ex. Min nya flik"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          accessibilityLabel="Fliknamn"
        />
      </View>
    </FileActionModal>
  );
}

export function RenameFolderModal({ visible, currentDisplayName, onClose, onConfirm, loading = false }) {
  const [value, setValue] = useState(currentDisplayName || '');
  useEffect(() => {
    if (visible) setValue(currentDisplayName || '');
  }, [visible, currentDisplayName]);

  const handleConfirm = () => {
    const trimmed = String(value || '').trim();
    if (trimmed && typeof onConfirm === 'function') {
      onConfirm(trimmed);
    }
  };

  return (
    <FileActionModal
      visible={visible}
      title="Byt namn på mapp"
      description="Namnet uppdateras både i Digitalkontroll och i SharePoint."
      onClose={onClose}
      primaryLabel="Byt namn"
      onPrimary={handleConfirm}
      primaryDisabled={!String(value || '').trim() || loading}
      primaryVariant="dark"
      secondaryLabel="Avbryt"
    >
      <View style={{ marginTop: 8 }}>
        <Text style={[FILE_ACTION_MODAL_STYLES.label, { marginBottom: 4 }]}>Nytt namn</Text>
        <TextInput
          style={inputStyle}
          value={value}
          onChangeText={setValue}
          placeholder="Mappens nya namn"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          accessibilityLabel="Nytt mappnamn"
        />
      </View>
    </FileActionModal>
  );
}

export function DeleteFolderConfirmModal({ visible, folderDisplayName, hasFiles, onClose, onConfirm, loading = false }) {
  const message = hasFiles
    ? `Det finns filer i mappen "${folderDisplayName}". Vill du ändå radera mappen och dess innehåll?`
    : `Är du säker på att du vill radera mappen "${folderDisplayName}"?`;

  return (
    <FileActionModal
      visible={visible}
      title="Ta bort mapp"
      description={message}
      onClose={onClose}
      primaryLabel="Ja, radera"
      onPrimary={onConfirm}
      primaryDisabled={loading}
      primaryVariant="danger"
      secondaryLabel="Avbryt"
    />
  );
}
