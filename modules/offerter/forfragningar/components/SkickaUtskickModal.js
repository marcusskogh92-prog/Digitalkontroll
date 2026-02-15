/**
 * SkickaUtskickModal – Premium 2026
 * Mörk banner, titel, texteditor, leverantörscheckboxes, generera .eml
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const DEFAULT_TEMPLATE = 'Hej {{KontaktNamn}},\n\nVi vill förfråga er om ett pris för följande byggdel.\n\nMed vänliga hälsningar';

function safeText(v) {
  return String(v ?? '').trim();
}

function buildEmlContent({ to, subject, body, contactName }) {
  const from = 'noreply@digitalkontroll.se';
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ].join('\r\n');
  const personalBody = body.replace(/\{\{KontaktNamn\}\}/g, contactName || '');
  return `${headers}\r\n\r\n${personalBody}`;
}

function downloadEml(content, filename) {
  if (Platform.OS !== 'web' || typeof Blob === 'undefined') return;
  const blob = new Blob([content], { type: 'message/rfc822; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'utskick.eml';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SkickaUtskickModal({
  visible,
  onClose,
  byggdel,
  project,
  packages = [],
  contacts = [],
  onGenerate,
}) {
  const contactMap = useMemo(() => {
    const m = new Map();
    (contacts || []).forEach((c) => {
      if (c?.id) m.set(c.id, c);
    });
    return m;
  }, [contacts]);
  const [message, setMessage] = useState(DEFAULT_TEMPLATE);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const byggdelLabel = safeText(byggdel?.code && byggdel?.label ? `${byggdel.code} – ${byggdel.label}` : byggdel?.label || 'Byggdel');
  const projectLabel = safeText(project?.projectNumber || project?.number || project?.name || project?.id || 'Projekt');

  const eligiblePackages = useMemo(() => {
    return (packages || []).filter((p) => !p?.deleted && safeText(p?.contactName));
  }, [packages]);

  const toggleId = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const ids = eligiblePackages.map((p) => p.id).filter(Boolean);
    setSelectedIds(new Set(ids));
  }, [eligiblePackages]);

  const handleGenerate = useCallback(() => {
    const selected = eligiblePackages.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;

    const subject = `Förfrågan – ${byggdelLabel} – ${projectLabel}`;

    selected.forEach((pkg, idx) => {
      const contactName = safeText(pkg?.contactName);
      const supplierName = safeText(pkg?.supplierName);
      const contact = pkg?.contactId ? contactMap.get(pkg.contactId) : null;
      const email = safeText(contact?.email || pkg?.contactEmail || '');
      const safeSupplier = safeText(supplierName) || 'leverantor';
      const to = email || `${safeSupplier} <${safeSupplier.toLowerCase().replace(/\s+/g, '.')}@example.com>`;
      const body = message.replace(/\{\{KontaktNamn\}\}/g, contactName);
      const content = buildEmlContent({ to, subject, body, contactName });
      const safeName = (supplierName || `leverantor-${idx + 1}`).replace(/[^a-z0-9_-]/gi, '_');
      downloadEml(content, `forfragan-${safeName}.eml`);
    });

    onGenerate?.(selected);
    onClose?.();
  }, [message, selectedIds, eligiblePackages, byggdelLabel, projectLabel, contactMap, onGenerate, onClose]);

  const canGenerate = selectedIds.size > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e?.stopPropagation?.()}>
          <View style={styles.banner}>
            <Ionicons name="send-outline" size={20} color="#fff" />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Skicka förfrågan – {byggdelLabel}</Text>
              <Text style={styles.bannerSubtitle}>Projekt {projectLabel}</Text>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.label}>Meddelande</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              placeholder="Hej {{KontaktNamn}},"
              style={styles.textArea}
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.hint}>{'Använd {{KontaktNamn}} för att personifiera meddelandet.'}</Text>

            <Text style={[styles.label, { marginTop: 16 }]}>Välj mottagare</Text>
            <Pressable onPress={selectAll} style={styles.link}>
              <Text style={styles.linkText}>Välj alla med kontakt</Text>
            </Pressable>
            <View style={styles.checkList}>
              {eligiblePackages.length === 0 ? (
                <Text style={styles.emptyText}>Inga leverantörer med tilldelad kontakt. Koppla kontakt först.</Text>
              ) : (
                eligiblePackages.map((p) => {
                  const id = p.id;
                  const checked = selectedIds.has(id);
                  const name = safeText(p?.supplierName) || '—';
                  const contact = safeText(p?.contactName) || '';
                  return (
                    <Pressable
                      key={id}
                      onPress={() => toggleId(id)}
                      style={({ pressed }) => [styles.checkRow, pressed && styles.checkRowPressed]}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                      </View>
                      <View style={styles.checkLabel}>
                        <Text style={styles.checkName} numberOfLines={1}>{name}</Text>
                        {contact ? <Text style={styles.checkMeta} numberOfLines={1}>{contact}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.ghostBtn, pressed && styles.btnPressed]}>
              <Text style={styles.ghostBtnText}>Avbryt</Text>
            </Pressable>
            <Pressable
              onPress={handleGenerate}
              disabled={!canGenerate}
              style={({ pressed }) => [
                styles.primaryBtn,
                !canGenerate && styles.btnDisabled,
                pressed && canGenerate && styles.btnPressed,
              ]}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Generera utskick</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 24px 48px rgba(15,23,42,0.15)' } : {}),
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: '#0f172a',
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  bannerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  body: {
    maxHeight: 360,
  },
  bodyContent: {
    padding: 18,
    paddingBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  link: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2563eb',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  checkList: {
    gap: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  checkRowPressed: {
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  checkLabel: {
    flex: 1,
    minWidth: 0,
  },
  checkName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
  },
  checkMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#f8fafc',
  },
  ghostBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.9,
  },
});
