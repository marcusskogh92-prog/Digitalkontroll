import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import StandardModal from '../../../../components/common/StandardModal';
import {
    ensureDefaultInkopsplanEmailTemplate,
    INKOPSPLAN_EMAIL_TEMPLATE_VARIABLES,
    listenInkopsplanEmailTemplate,
    saveInkopsplanEmailTemplate,
} from '../inkopsplanService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

export default function EmailTemplateEditorModal({
  visible,
  onClose,
  companyId,
  projectId,
  templateId,
}) {
  const tid = safeText(templateId) || 'default';

  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = Boolean(companyId && projectId && tid && !saving);

  const variableText = useMemo(() => {
    return (INKOPSPLAN_EMAIL_TEMPLATE_VARIABLES || [])
      .map((v) => `${v.token} — ${v.label}`)
      .join('\n');
  }, []);

  useEffect(() => {
    if (!visible) return;
    setError('');
    setSaving(false);
    setLoading(true);

    let unsub = null;
    let alive = true;

    const run = async () => {
      try {
        // Ensure default exists so the editor always has something to load.
        await ensureDefaultInkopsplanEmailTemplate(companyId, projectId);

        if (!alive) return;
        unsub = listenInkopsplanEmailTemplate(
          companyId,
          projectId,
          tid,
          (doc) => {
            if (!alive) return;
            setSubject(safeText(doc?.subject));
            setBody(safeText(doc?.body));
            setLoading(false);
          },
          (e) => {
            if (!alive) return;
            setError(String(e?.message || e || 'Kunde inte läsa mall.'));
            setLoading(false);
          },
        );
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e || 'Kunde inte läsa mall.'));
        setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
      try { unsub?.(); } catch (_e) {}
    };
  }, [visible, companyId, projectId, tid]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await saveInkopsplanEmailTemplate({
        companyId,
        projectId,
        templateId: tid,
        subject,
        body,
      });
      onClose?.();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara mall.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StandardModal
      visible={visible}
      onClose={onClose}
      title="Redigera mailmall"
      subtitle="Variabler ersätts först vid generering/skick"
      iconName="mail-outline"
      saveLabel="Spara"
      onSave={handleSave}
      saving={saving}
      saveDisabled={!canSave}
      defaultWidth={920}
      defaultHeight={680}
      minWidth={520}
      minHeight={420}
    >
      <View style={styles.content}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Text style={styles.infoTitle}>Tillgängliga variabler</Text>
            {isWeb() ? (
              <Pressable
                onPress={() => {
                  try {
                    const nav = globalThis?.navigator;
                    nav?.clipboard?.writeText?.(variableText);
                  } catch (_e) {}
                }}
                style={({ hovered, pressed }) => [styles.copyBtn, (hovered || pressed) && styles.copyBtnHover]}
              >
                <Text style={styles.copyBtnText}>Kopiera</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.infoText}>{variableText}</Text>
        </View>

        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 10 }}>
          <Text style={styles.label}>Ämnesrad</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="t.ex. Förfrågan {{bd_name}} – {{project_number}}"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Meddelandetext</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Skriv meddelandet här…"
            multiline
            numberOfLines={10}
            style={[styles.input, styles.textarea]}
            textAlignVertical="top"
          />

          {loading ? <Text style={styles.muted}>Laddar mall…</Text> : null}
        </ScrollView>
      </View>
    </StandardModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  textarea: {
    minHeight: 220,
  },
  muted: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
  },
  infoBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  copyBtnHover: {
    backgroundColor: '#F1F5F9',
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
});
