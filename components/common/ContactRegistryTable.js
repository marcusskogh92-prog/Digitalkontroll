/**
 * Tabell för kontaktregister – referens-UI för alignment och vänsterlinjering.
 * Kolumner: Namn, Företag, Roll, Mobil, Arbete, E-post, Kebab.
 * Mobil: endast siffror, sparas som siffror, visas formaterat (xxx xxx xx xx).
 * Arbete: jobbtelefon, fritt format.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';

// Flexandelar för flexibla kolumner (Namn, Företag, Roll, E-post). Fasta bredder för Mobil, Arbete, Åtgärder.
const FLEX = { name: 1.2, company: 1.5, role: 1.1, email: 2 };
const FIXED = { mobile: 130, workPhone: 150, actions: 30 };

/** Formatera mobil (endast siffror) till xxx xxx xx xx t.ex. 072 595 75 25 */
function formatMobileDisplay(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  const parts = [p1, p2, p3, p4].filter(Boolean);
  return parts.join(' ').trim();
}

/** Behåll endast siffror (för lagring) */
function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 0,
  },
  columnContent: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  columnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'stretch',
  },
  headerText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  inlineInputCell: {
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#fff',
  },
  rowAlt: { backgroundColor: '#f8fafc' },
  rowHover: { backgroundColor: '#eef6ff' },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  actionsCol: {
    width: FIXED.actions,
    minWidth: FIXED.actions,
    maxWidth: FIXED.actions,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: 0,
    paddingRight: 0,
  },
  actionsColHeader: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
  },
  actionsColInline: { backgroundColor: '#eff6ff' },
  rowMenuBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineInput: {
    fontSize: 13,
    color: '#111',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    backgroundColor: '#fff',
    flexShrink: 0,
    minWidth: 0,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  editRowBtn: {
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRowBtnPrimary: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  editRowBtnCancel: { borderColor: '#cbd5e1', backgroundColor: 'transparent' },
  cellText: { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  cellMuted: { fontSize: 13, color: '#64748b', fontWeight: '400' },
});

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '—';
}

export default function ContactRegistryTable({
  contacts,
  sortColumn,
  sortDirection,
  onSort,
  editingId,
  inlineSavingContact,
  onSaveEdit,
  onCancelEdit,
  onRowMenu,
  inlineEnabled,
  inlineValues,
  inlineSaving,
  onInlineChange,
  onInlineSave,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [mobileDisplayFormatted, setMobileDisplayFormatted] = useState(false);
  const kebabRefs = useRef({});

  const editingContact = editingId ? (contacts.find((c) => c.id === editingId) || null) : null;
  React.useEffect(() => {
    if (editingContact) {
      setEditDraft({
        name: String(editingContact.name ?? ''),
        contactCompanyName: String(editingContact.contactCompanyName ?? editingContact.companyName ?? ''),
        role: String(editingContact.role ?? ''),
        phone: digitsOnly(editingContact.phone ?? ''),
        workPhone: String(editingContact.workPhone ?? ''),
        email: String(editingContact.email ?? ''),
      });
      setMobileDisplayFormatted(false);
    } else {
      setEditDraft(null);
    }
  }, [editingId, editingContact?.id]);

  const handleEditKeyDown = (e, contact) => {
    if (Platform.OS !== 'web') return;
    const key = e.nativeEvent?.key;
    if (key === 'Enter') {
      e.preventDefault();
      if (editDraft?.name?.trim() && onSaveEdit && !inlineSavingContact) {
        onSaveEdit(contact.id, editDraft);
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      const id = editingId;
      onCancelEdit?.();
      setTimeout(() => {
        const el = id ? kebabRefs.current[id] : null;
        if (el && typeof el.focus === 'function') el.focus();
      }, 0);
    }
  };

  const SortIcon = ({ col }) => {
    if (sortColumn !== col) return <Ionicons name="swap-vertical-outline" size={14} color="#cbd5e1" />;
    return <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />;
  };

  const stickyRight = Platform.OS === 'web' ? { position: 'sticky', right: 0 } : {};

  return (
    <View style={styles.tableWrap}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, { flex: FLEX.name }]} onPress={() => onSort('name')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Namn</Text>
            <SortIcon col="name" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, { flex: FLEX.company }]} onPress={() => onSort('contactCompanyName')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Företag</Text>
            <SortIcon col="contactCompanyName" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, { flex: FLEX.role }]} onPress={() => onSort('role')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Roll</Text>
            <SortIcon col="role" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerCell, styles.cellFixed, { width: FIXED.mobile }]} onPress={() => onSort('phone')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Mobil</Text>
            <SortIcon col="phone" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerCell, styles.cellFixed, { width: FIXED.workPhone }]} onPress={() => onSort('workPhone')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Arbete</Text>
            <SortIcon col="workPhone" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, { flex: FLEX.email }]} onPress={() => onSort('email')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>E-post</Text>
            <SortIcon col="email" />
          </View>
        </TouchableOpacity>
        <View style={[styles.actionsCol, styles.actionsColHeader, stickyRight]} />
      </View>

      {inlineEnabled && (
        <View style={styles.inlineRow}>
          <View style={[styles.cellFlex, { flex: FLEX.name }]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.name ?? ''} onChangeText={(v) => onInlineChange?.('name', v)} placeholder="Namn (ny)" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
            </View>
          </View>
          <View style={[styles.cellFlex, { flex: FLEX.company }]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.contactCompanyName ?? ''} onChangeText={(v) => onInlineChange?.('contactCompanyName', v)} placeholder="Företag (ny)" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
            </View>
          </View>
          <View style={[styles.cellFlex, { flex: FLEX.role }]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.role ?? ''} onChangeText={(v) => onInlineChange?.('role', v)} placeholder="Roll" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
            </View>
          </View>
          <View style={[styles.cellFixed, { width: FIXED.mobile }]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.phone ?? ''} onChangeText={(v) => onInlineChange?.('phone', digitsOnly(v))} placeholder="Mobil (siffror)" keyboardType="number-pad" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
            </View>
          </View>
          <View style={[styles.cellFixed, { width: FIXED.workPhone }]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.workPhone ?? ''} onChangeText={(v) => onInlineChange?.('workPhone', v)} placeholder="Arbete" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
            </View>
          </View>
          <View style={[styles.cellFlex, { flex: FLEX.email }]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.email ?? ''} onChangeText={(v) => onInlineChange?.('email', v)} placeholder="E-post" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" onSubmitEditing={() => !inlineSaving && onInlineSave?.()} {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
            </View>
          </View>
          <View style={[styles.actionsCol, styles.actionsColInline, stickyRight]} />
        </View>
      )}

      {contacts.map((contact, idx) =>
        editingId === contact.id && editDraft ? (
          <View key={contact.id} style={styles.editRow}>
            <View style={[styles.cellFlex, { flex: FLEX.name }]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.name} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, name: v } : d))} placeholder="Namn" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.company }]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.contactCompanyName} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, contactCompanyName: v } : d))} placeholder="Företag" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.role }]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.role} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, role: v } : d))} placeholder="Roll" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFixed, { width: FIXED.mobile }]}>
              <View style={styles.columnContent}>
                <TextInput
                  value={mobileDisplayFormatted ? formatMobileDisplay(editDraft.phone) : editDraft.phone}
                  onChangeText={(v) => {
                    const d = digitsOnly(v);
                    setEditDraft((prev) => (prev ? { ...prev, phone: d } : prev));
                    setMobileDisplayFormatted(false);
                  }}
                  onFocus={() => setMobileDisplayFormatted(false)}
                  onBlur={() => setMobileDisplayFormatted(true)}
                  placeholder="Mobil (siffror)"
                  keyboardType="number-pad"
                  style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                  placeholderTextColor="#94a3b8"
                  {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})}
                />
              </View>
            </View>
            <View style={[styles.cellFixed, { width: FIXED.workPhone }]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.workPhone} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, workPhone: v } : d))} placeholder="Arbete" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.email }]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.email} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, email: v } : d))} placeholder="E-post" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.actionsCol, styles.actionsColInline, stickyRight, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }]}>
              <TouchableOpacity style={[styles.editRowBtn, styles.editRowBtnPrimary]} onPress={() => { if (editDraft?.name?.trim() && onSaveEdit) onSaveEdit(contact.id, editDraft); }} disabled={inlineSavingContact} accessibilityLabel="Spara" {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editRowBtn, styles.editRowBtnCancel]} onPress={() => onCancelEdit?.()} disabled={inlineSavingContact} accessibilityLabel="Avbryt" {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Ionicons name="close" size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            key={contact.id}
            style={[styles.row, idx % 2 === 1 ? styles.rowAlt : null, hoveredId === contact.id ? styles.rowHover : null]}
            onPress={() => {}}
            onLongPress={(e) => onRowMenu?.(e, contact)}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' ? { cursor: 'pointer', onMouseEnter: () => setHoveredId(contact.id), onMouseLeave: () => setHoveredId(null) } : {})}
          >
            <View style={[styles.cellFlex, { flex: FLEX.name }]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellText, { flex: 1 }]} numberOfLines={1}>{contact.name || '—'}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.company }]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.contactCompanyName || contact.companyName)}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.role }]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.role)}</Text>
              </View>
            </View>
            <View style={[styles.cellFixed, { width: FIXED.mobile }]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{formatMobileDisplay(contact.phone) || '—'}</Text>
              </View>
            </View>
            <View style={[styles.cellFixed, { width: FIXED.workPhone }]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.workPhone)}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.email }]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.email)}</Text>
              </View>
            </View>
            <View style={[styles.actionsCol, stickyRight]}>
              <TouchableOpacity ref={(r) => { kebabRefs.current[contact.id] = r; }} style={styles.rowMenuBtn} onPress={(e) => onRowMenu?.(e, contact)} activeOpacity={0.8} {...(Platform.OS === 'web' ? { cursor: 'pointer', tabIndex: 0 } : {})}>
                <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
