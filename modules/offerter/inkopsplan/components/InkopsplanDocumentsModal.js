import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import StandardModal from '../../../../components/common/StandardModal';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function isPdf(file) {
  const name = (file?.name || '').toLowerCase();
  const type = (file?.type || '').toLowerCase();
  return name.endsWith('.pdf') || type === 'application/pdf';
}

export default function InkopsplanDocumentsModal({ visible, onClose, row }) {
  const [files, setFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const rowName = safeText(row?.name) || 'inköpsrad';

  useEffect(() => {
    if (!visible) {
      setPreviewFile(null);
      setPreviewUrl(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!previewFile) {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (_) {}
        setPreviewUrl(null);
      }
      return;
    }
    if (!isWeb() || !previewFile) return;
    const url = URL.createObjectURL(previewFile);
    setPreviewUrl(url);
    return () => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    };
  }, [previewFile]);

  const addFiles = useCallback((newFiles) => {
    const list = Array.isArray(newFiles) ? Array.from(newFiles) : [];
    setFiles((prev) => [...prev, ...list]);
  }, []);

  const removeFile = useCallback((index) => {
    setFiles((prev) => {
      const next = prev.slice();
      const removed = next[index];
      next.splice(index, 1);
      if (previewFile === removed) setPreviewFile(null);
      return next;
    });
  }, [previewFile]);

  const handleDrop = useCallback((e) => {
    if (!isWeb()) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const items = e.dataTransfer?.files;
    if (items?.length) addFiles(items);
  }, [addFiles]);

  const handleDragOver = useCallback((e) => {
    if (!isWeb()) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!isWeb()) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileInputChange = useCallback((e) => {
    const input = e?.target;
    if (!input?.files?.length) return;
    addFiles(input.files);
    input.value = '';
  }, [addFiles]);

  const openFilePicker = useCallback(() => {
    if (inputRef.current) inputRef.current.click();
  }, []);

  return (
    <StandardModal
      visible={visible}
      onClose={onClose}
      title="Dokument / Offerter"
      subtitle={rowName}
      iconName="document-attach-outline"
      defaultWidth={640}
      defaultHeight={520}
      minWidth={400}
      minHeight={380}
    >
      <View style={styles.body}>
        {isWeb() && (
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            onChange={handleFileInputChange}
            style={styles.hiddenInput}
            aria-hidden
          />
        )}
        <View
          style={[
            styles.dropZone,
            dragOver && styles.dropZoneActive,
          ]}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Ionicons name="cloud-upload-outline" size={32} color={dragOver ? '#2563EB' : '#94A3B8'} />
          <Text style={styles.dropZoneText}>
            {dragOver ? 'Släpp filer här' : 'Dra och släpp offerter (PDF) här'}
          </Text>
          <Pressable
            onPress={openFilePicker}
            style={({ hovered, pressed }) => [
              styles.browseBtn,
              (hovered || pressed) && styles.browseBtnHover,
            ]}
          >
            <Text style={styles.browseBtnText}>Välj filer</Text>
          </Pressable>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Uppladdade filer ({files.length})</Text>
          <ScrollView style={styles.fileList} contentContainerStyle={styles.fileListContent}>
            {files.length === 0 ? (
              <Text style={styles.muted}>Inga filer tillagda ännu.</Text>
            ) : (
              files.map((file, index) => {
                const name = file?.name || `Fil ${index + 1}`;
                const pdf = isPdf(file);
                return (
                  <View key={`${index}-${name}`} style={styles.fileRow}>
                    <Pressable
                      onPress={() => pdf && setPreviewFile(file)}
                      style={({ hovered }) => [
                        styles.fileRowMain,
                        hovered && pdf && styles.fileRowMainHover,
                      ]}
                    >
                      <Ionicons
                        name={pdf ? 'document-text-outline' : 'document-outline'}
                        size={20}
                        color="#64748B"
                      />
                      <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
                      {pdf && (
                        <Text style={styles.previewHint}>Klicka för förhandsgranskning</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => removeFile(index)}
                      style={({ hovered, pressed }) => [
                        styles.removeBtn,
                        (hovered || pressed) && styles.removeBtnHover,
                      ]}
                    >
                      <Ionicons name="close-circle-outline" size={22} color="#94A3B8" />
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {previewUrl && previewFile && isPdf(previewFile) ? (
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Förhandsgranskning: {previewFile.name}</Text>
            {isWeb() ? (
              <View style={styles.previewFrameWrap}>
                <iframe
                  title="PDF förhandsgranskning"
                  src={previewUrl}
                  style={styles.previewIframe}
                />
              </View>
            ) : (
              <Text style={styles.muted}>PDF-förhandsgranskning tillgänglig på webb.</Text>
            )}
          </View>
        ) : null}
      </View>
    </StandardModal>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    padding: 16,
  },
  hiddenInput: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
  },
  dropZoneActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  dropZoneText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  browseBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  browseBtnHover: {
    backgroundColor: '#CBD5E1',
  },
  browseBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  listSection: {
    flex: 1,
    minHeight: 0,
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  fileList: {
    flex: 1,
    minHeight: 0,
  },
  fileListContent: {
    paddingBottom: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  fileRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  fileRowMainHover: {
    opacity: 0.85,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    minWidth: 0,
  },
  previewHint: {
    fontSize: 11,
    color: '#64748B',
  },
  removeBtn: {
    padding: 4,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  removeBtnHover: {
    opacity: 0.8,
  },
  previewSection: {
    flex: 1,
    minHeight: 180,
    maxHeight: 280,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  previewFrameWrap: {
    flex: 1,
    minHeight: 0,
  },
  previewIframe: {
    width: '100%',
    height: '100%',
    minHeight: 200,
    border: 0,
  },
  muted: {
    fontSize: 13,
    color: '#64748B',
    paddingVertical: 8,
  },
});
