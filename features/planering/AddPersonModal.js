/**
 * Lägg till personal – samma look som Redigera personal (banner, flikar, footer)
 * men endast flikar: Uppgifter och Provanställning (ingen Frånvaro).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
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
import IsoDatePickerModal from '../../components/common/Modals/IsoDatePickerModal';
import { MODAL_THEME } from '../../constants/modalTheme';

const BANNER = MODAL_THEME?.banner || {};
const FOOTER = MODAL_THEME?.footer || {};
const BANNER_BG = BANNER.backgroundColor || '#1e293b';
const BANNER_TITLE_COLOR = BANNER.titleColor || '#fff';

function dateToKey(d) {
  if (!d || !(d instanceof Date)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  if (!key || typeof key !== 'string') return null;
  const n = Date.parse(key);
  return Number.isNaN(n) ? null : new Date(n);
}

function getProvanställningStatus(employmentStartDate) {
  if (!employmentStartDate) return { monthsIn: 0, passedMonths: [] };
  const start = parseDateKey(employmentStartDate);
  if (!start) return { monthsIn: 0, passedMonths: [] };
  const now = new Date();
  const monthsIn = Math.floor((now - start) / (30.44 * 24 * 60 * 60 * 1000));
  const passedMonths = [];
  for (let m = 1; m <= 6; m++) if (monthsIn >= m) passedMonths.push(m);
  return { monthsIn, passedMonths };
}

const PROVAN_MÅNADER = [
  { month: 1, label: '1 mån' },
  { month: 2, label: '2 mån' },
  { month: 3, label: '3 mån' },
  { month: 4, label: '4 mån' },
  { month: 5, label: '5 mån' },
  { month: 6, label: '6 mån – Fast anställning' },
];

export default function AddPersonModal({ visible, onClose, onAdd }) {
  const [activeTab, setActiveTab] = useState('uppgifter');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [employmentStartDate, setEmploymentStartDate] = useState('');
  const [provanUppföljningMånader, setProvanUppföljningMånader] = useState([3, 5, 6]);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setRole('');
    setEmploymentStartDate('');
    setProvanUppföljningMånader([3, 5, 6]);
    setActiveTab('uppgifter');
    const t = setTimeout(() => nameInputRef.current?.focus?.(), 100);
    return () => clearTimeout(t);
  }, [visible]);

  const toggleProvanMånad = (month) => {
    setProvanUppföljningMånader((prev) => {
      const set = new Set(prev);
      if (set.has(month)) set.delete(month);
      else set.add(month);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAdd?.({
      name: trimmedName,
      role: role.trim() || undefined,
      employmentStartDate: employmentStartDate.trim() || undefined,
      provanUppföljningMånader: provanUppföljningMånader.length > 0 ? provanUppföljningMånader : undefined,
    });
    onClose?.();
  };

  const status = getProvanställningStatus(employmentStartDate);
  const canAdd = name.trim().length > 0;

  if (!visible) return null;

  return (
    <>
      <Modal transparent visible animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.card} onPress={(e) => e?.stopPropagation?.()}>
            <View style={[styles.banner, { backgroundColor: BANNER_BG }]}>
              <View style={styles.bannerLeft}>
                <View style={styles.bannerIcon}>
                  <Ionicons name="person-add-outline" size={18} color={BANNER_TITLE_COLOR} />
                </View>
                <Text style={styles.bannerTitle} numberOfLines={1}>
                  Lägg till personal
                  <Text style={styles.bannerSubtitle}> – namn, roll och provanställning</Text>
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.bannerClose} accessibilityLabel="Stäng">
                <Ionicons name="close" size={18} color={BANNER_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            <View style={styles.tabRow}>
              <Pressable style={[styles.tab, activeTab === 'uppgifter' && styles.tabActive]} onPress={() => setActiveTab('uppgifter')}>
                <Text style={[styles.tabText, activeTab === 'uppgifter' && styles.tabTextActive]}>Uppgifter</Text>
              </Pressable>
              <Pressable style={[styles.tab, activeTab === 'provanställning' && styles.tabActive]} onPress={() => setActiveTab('provanställning')}>
                <Text style={[styles.tabText, activeTab === 'provanställning' && styles.tabTextActive]}>Provanställning</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
              {activeTab === 'uppgifter' && (
                <>
                  <Text style={styles.label}>Namn</Text>
                  <TextInput
                    ref={nameInputRef}
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="T.ex. Anna Andersson"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="words"
                    onSubmitEditing={handleAdd}
                  />
                  <Text style={styles.label}>Roll / titel (valfritt)</Text>
                  <TextInput
                    style={styles.input}
                    value={role}
                    onChangeText={setRole}
                    placeholder="T.ex. Snickare, Byggledare"
                    placeholderTextColor="#94a3b8"
                    onSubmitEditing={handleAdd}
                  />
                </>
              )}

              {activeTab === 'provanställning' && (
                <>
                  <Text style={styles.sectionTitle}>Provanställning</Text>
                  <View style={styles.checkRow}>
                    <TouchableOpacity
                      style={styles.checkbox}
                      onPress={() => setEmploymentStartDate(employmentStartDate ? '' : dateToKey(new Date()))}
                      activeOpacity={0.8}
                    >
                      {employmentStartDate ? <Ionicons name="checkbox" size={22} color="#2563eb" /> : <View style={styles.checkboxEmpty} />}
                    </TouchableOpacity>
                    <Text style={styles.checkLabel}>Provanställd</Text>
                  </View>
                  {employmentStartDate ? (
                    <>
                      <Text style={styles.label}>Anställningsdag</Text>
                      <Pressable style={styles.datePickerTrigger} onPress={() => setDatePickerVisible(true)}>
                        <Ionicons name="calendar-outline" size={20} color="#64748b" />
                        <Text style={styles.datePickerTriggerText}>{employmentStartDate}</Text>
                        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                      </Pressable>
                      <Text style={styles.provanHint}>Bocka i vid vilka månader (1–6) uppföljning ska ske. Efter 6 månader övergår anställningen till fast.</Text>
                      {PROVAN_MÅNADER.map(({ month, label }) => {
                        const isChecked = provanUppföljningMånader.includes(month);
                        const hasPassed = status.passedMonths.includes(month);
                        return (
                          <View key={month} style={styles.reminderRow}>
                            <TouchableOpacity style={styles.checkbox} onPress={() => toggleProvanMånad(month)} activeOpacity={0.8}>
                              {isChecked ? (
                                <Ionicons name="checkbox" size={22} color={hasPassed ? '#16a34a' : '#2563eb'} />
                              ) : (
                                <View style={[styles.checkboxEmpty, hasPassed && styles.checkboxEmptyDone]} />
                              )}
                            </TouchableOpacity>
                            <Text style={[styles.badgeLabel, hasPassed && isChecked && styles.badgeLabelDone]}>{hasPassed && isChecked ? '✓ ' : ''}{label}</Text>
                          </View>
                        );
                      })}
                    </>
                  ) : (
                    <Text style={styles.hint}>Kryssa i om personen är provanställd och välj anställningsdag för att ange uppföljningsmånader.</Text>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.footerBtnAvbryt} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Text style={styles.footerBtnAvbrytText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerBtnDark, !canAdd && styles.footerBtnDisabled]}
                onPress={handleAdd}
                disabled={!canAdd}
                {...(Platform.OS === 'web' ? { cursor: canAdd ? 'pointer' : 'not-allowed' } : {})}
              >
                <Text style={styles.footerBtnDarkText}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <IsoDatePickerModal
        visible={datePickerVisible}
        title="Anställningsdag"
        value={employmentStartDate || undefined}
        onSelect={(iso) => { setEmploymentStartDate(iso); setDatePickerVisible(false); }}
        onClose={() => setDatePickerVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.2)' } : { elevation: 8 }),
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BANNER.borderBottomColor ?? 'rgba(255,255,255,0.1)',
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  bannerIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: BANNER.iconBg ?? 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 14, fontWeight: '600', color: BANNER_TITLE_COLOR },
  bannerSubtitle: { fontSize: 11, fontWeight: '400', color: 'rgba(255,255,255,0.8)', marginLeft: 4 },
  bannerClose: { padding: 4, borderRadius: 6 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16 },
  tab: { paddingVertical: 12, paddingHorizontal: 8, marginRight: 8 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1e293b', marginBottom: -1 },
  tabText: { fontSize: 14, fontWeight: '500', color: '#64748b' },
  tabTextActive: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { padding: 20, paddingBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 10 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 14,
  },
  provanHint: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  datePickerTriggerText: { fontSize: 14, color: '#0f172a', flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkbox: { marginRight: 10 },
  checkboxEmpty: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#94a3b8' },
  checkboxEmptyDone: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  checkLabel: { fontSize: 14, fontWeight: '500', color: '#334155' },
  reminderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badgeLabel: { fontSize: 13, color: '#64748b' },
  badgeLabelDone: { color: '#16a34a', fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: FOOTER.borderTopColor ?? '#e2e8f0',
    backgroundColor: FOOTER.backgroundColor ?? '#f8fafc',
  },
  footerBtnAvbryt: {
    paddingVertical: FOOTER.btnPaddingVertical ?? 8,
    paddingHorizontal: FOOTER.btnPaddingHorizontal ?? 18,
    borderRadius: FOOTER.btnBorderRadius ?? 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  footerBtnAvbrytText: { fontSize: FOOTER.btnFontSize ?? 14, fontWeight: '600', color: '#b91c1c' },
  footerBtnDark: {
    paddingVertical: FOOTER.btnPaddingVertical ?? 8,
    paddingHorizontal: FOOTER.btnPaddingHorizontal ?? 18,
    borderRadius: FOOTER.btnBorderRadius ?? 8,
    backgroundColor: FOOTER.btnBackground ?? '#1e293b',
  },
  footerBtnDisabled: { opacity: 0.6 },
  footerBtnDarkText: { fontSize: FOOTER.btnFontSize ?? 14, fontWeight: '600', color: FOOTER.btnTextColor ?? '#fff' },
});
