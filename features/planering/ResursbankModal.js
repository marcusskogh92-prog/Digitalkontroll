/**
 * Resursbank – modal liknande Resursplanen.
 * Flikar (Personal, Utrustning, Byggmaskiner, Externa), sök, tabell med Namn, Typ, Grupp, Färgkod.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import ModalBase from '../../components/common/ModalBase';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';

function isWeb() {
  return Platform.OS === 'web';
}

const TABS = [
  { id: 'personal', label: 'Personal', icon: 'people-outline' },
  { id: 'externa', label: 'Externa', icon: 'business-outline' },
];

export default function ResursbankModal({
  visible,
  onClose,
  resources = [],
  onAddPerson,
  onEditPerson,
}) {
  const [activeTab, setActiveTab] = useState('personal');
  const [search, setSearch] = useState('');
  const [rowMenuId, setRowMenuId] = useState(null);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setRowMenuId(null);
    }
  }, [visible]);

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 720,
    defaultHeight: 520,
    minWidth: 520,
    minHeight: 400,
  });

  const filteredPersonal = useMemo(() => {
    if (!search.trim()) return resources;
    const q = search.trim().toLowerCase();
    return resources.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) || (r.role || '').toLowerCase().includes(q)
    );
  }, [resources, search]);

  const showPersonal = activeTab === 'personal';
  const showPlaceholder = !showPersonal;

  const footer = (
    <View style={styles.footerRow}>
      <TouchableOpacity
        style={styles.footerBtnSecondary}
        onPress={onClose}
        {...(isWeb() ? { cursor: 'pointer' } : {})}
      >
        <Text style={styles.footerBtnSecondaryText}>Stäng</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Resurser"
      headerVariant="neutralCompact"
      titleIcon={<Ionicons name="people-outline" size={D.headerNeutralCompactIconPx} color={D.headerNeutralTextColor} />}
      boxStyle={boxStyle}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={styles.contentWrap}
    >
      {/* Flikar */}
      <View style={styles.tabsRow}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            {...(isWeb() ? { cursor: 'pointer' } : {})}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.id ? '#2563eb' : '#64748b'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.tabAdd}
          onPress={() => {}}
          {...(isWeb() ? { cursor: 'pointer', title: 'Lägg till kategori' } : {})}
        >
          <Text style={styles.tabAddLabel}>+ Kategori</Text>
        </Pressable>
      </View>

      {/* Sök + Ny resurs */}
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Sök..."
            placeholderTextColor="#94a3b8"
          />
        </View>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => {}}
          {...(isWeb() ? { cursor: 'pointer', title: 'Exportera' } : {})}
        >
          <Ionicons name="download-outline" size={18} color="#64748b" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addResursBtn}
          onPress={() => {
            onAddPerson?.();
            onClose?.();
          }}
          {...(isWeb() ? { cursor: 'pointer' } : {})}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addResursBtnText}>Ny resurs</Text>
        </TouchableOpacity>
      </View>

      {showPlaceholder ? (
        <View style={styles.placeholderWrap}>
          <Text style={styles.placeholderText}>Externa resurser kommer att hanteras här.</Text>
        </View>
      ) : (
        <>
          {/* Tabellhuvud */}
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colNamn]}>Namn</Text>
            <Text style={[styles.th, styles.colTyp]}>Typ</Text>
            <Text style={[styles.th, styles.colGrupp]}>Grupp</Text>
            <Text style={[styles.th, styles.colFarg]}>Färgkod</Text>
            <View style={styles.colMenu} />
          </View>
          <View style={styles.tableWrap}>
            {rowMenuId !== null && (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setRowMenuId(null)}
              />
            )}
            <ScrollView style={styles.tableScroll} contentContainerStyle={styles.tableScrollContent}>
              {filteredPersonal.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>
                    {resources.length === 0
                      ? 'Inga resurser. Klicka på «Ny resurs» för att lägga till.'
                      : 'Ingen träff i sökningen.'}
                  </Text>
                </View>
              ) : (
                filteredPersonal.map((r) => (
                  <Pressable
                    key={r.id}
                    style={({ pressed }) => [styles.tr, pressed && styles.trPressed]}
                    onPress={() => onEditPerson?.(r.id)}
                    {...(isWeb() ? { cursor: 'pointer' } : {})}
                  >
                    <Text style={[styles.td, styles.colNamn]} numberOfLines={1}>
                      {r.name || '—'}
                    </Text>
                    <Text style={[styles.td, styles.colTyp]} numberOfLines={1}>
                      {r.role || '—'}
                    </Text>
                    <Text style={[styles.td, styles.colGrupp]} numberOfLines={1}>
                      —
                    </Text>
                    <Text style={[styles.td, styles.colFarg]} numberOfLines={1}>
                      —
                    </Text>
                    <View style={styles.colMenu}>
                      <Pressable
                        onPress={(e) => {
                          if (isWeb() && e) e.stopPropagation?.();
                          setRowMenuId(rowMenuId === r.id ? null : r.id);
                        }}
                        style={styles.menuBtn}
                        {...(isWeb() ? { cursor: 'pointer' } : {})}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="#64748b" />
                      </Pressable>
                      {rowMenuId === r.id && (
                        <View style={styles.menuDropdown}>
                          <Pressable
                            style={styles.menuItem}
                            onPress={() => {
                              onEditPerson?.(r.id);
                              setRowMenuId(null);
                            }}
                            {...(isWeb() ? { cursor: 'pointer' } : {})}
                          >
                            <Ionicons name="pencil-outline" size={16} color="#475569" />
                            <Text style={styles.menuItemText}>Redigera</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </>
      )}
    </ModalBase>
  );
}

const styles = StyleSheet.create({
  contentWrap: { flex: 1, minHeight: 0 },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  tabActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  tabLabelActive: {
    color: '#2563eb',
  },
  tabAdd: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginLeft: 4,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  tabAddLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  exportBtn: {
    padding: 8,
    borderRadius: 8,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  addResursBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  addResursBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  th: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  td: {
    fontSize: 13,
    color: '#0f172a',
  },
  colNamn: { flex: 2, minWidth: 0 },
  colTyp: { flex: 1.2, minWidth: 0 },
  colGrupp: { flex: 1.2, minWidth: 0 },
  colFarg: { flex: 0.8, minWidth: 0 },
  colMenu: { width: 40, alignItems: 'flex-end', position: 'relative' },
  tableWrap: { flex: 1, minHeight: 0, position: 'relative' },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  trPressed: { backgroundColor: '#f8fafc' },
  menuBtn: {
    padding: 4,
    borderRadius: 4,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  menuDropdown: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 140,
    zIndex: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.1)' } : { elevation: 4 }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  menuItemText: { fontSize: 13, color: '#334155' },
  tableScroll: { flex: 1, minHeight: 0 },
  tableScrollContent: { paddingBottom: 24 },
  emptyRow: {
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  placeholderWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  placeholderText: {
    fontSize: 14,
    color: '#64748b',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
  footerBtnSecondary: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 18,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnSecondaryText: { fontSize: 12, fontWeight: '500', color: '#475569' },
});
