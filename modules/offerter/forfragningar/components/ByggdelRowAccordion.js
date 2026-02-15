/**
 * ByggdelRowAccordion – Premium 2026 Layout
 * Ren accordion-rad, tight spacing, textlänkar, status 2/5
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import ContextMenu from '../../../../components/ContextMenu';
import SkickaUtskickModal from './SkickaUtskickModal';
import SupplierPickerInline from './SupplierPickerInline';
import SupplierTable from './SupplierTable';

function safeText(v) {
  return String(v ?? '').trim();
}

function formatByggdelTitle(byggdel) {
  const code = safeText(byggdel?.code);
  const label = safeText(byggdel?.label);
  if (code && label) return `${code} – ${label}`;
  if (label) return label;
  return 'Byggdel';
}

const ROW_HEIGHT = 46;

export default function ByggdelRowAccordion({
  byggdel,
  expanded,
  onToggle,
  packages,
  suppliers,
  contacts,
  onPickSupplier,
  onCreateSupplier,
  onPickContact,
  onCreateContact,
  onEditByggdel,
  onRemoveByggdel,
  onSetStatus,
  onUpdatePackage,
  onOpenFolder,
  onRemove,
  canOpenFolder,
  project,
}) {
  const title = useMemo(() => formatByggdelTitle(byggdel), [byggdel]);
  const count = Array.isArray(packages) ? packages.length : 0;
  const locked = Boolean(byggdel?.locked);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [skickaModalOpen, setSkickaModalOpen] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  const answeredCount = useMemo(() => {
    return (packages || []).filter((p) => {
      const s = safeText(p?.status);
      return ['Bekräftad', 'Avböjt'].includes(s) || safeText(p?.aterkoppling);
    }).length;
  }, [packages]);

  const openMenu = (e) => {
    e?.stopPropagation?.();
    const native = e?.nativeEvent || {};
    const x = Number(native?.pageX || native?.locationX || 0);
    const y = Number(native?.pageY || native?.locationY || 0);
    setMenuPos({ x, y });
    setMenuVisible(true);
  };

  const menuItems = [
    { key: 'edit', label: 'Redigera byggdel', disabled: locked, icon: <Ionicons name="create-outline" size={16} color="#334155" /> },
    { key: 'delete', label: 'Ta bort byggdel', disabled: locked, icon: <Ionicons name="trash-outline" size={16} color="#64748b" /> },
  ];

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
      >
        <View style={styles.rowMain}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color="#94a3b8"
            style={styles.chevron}
          />
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.count}>{count} leverantör{count === 1 ? '' : 'er'}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.progress}>Svar: {answeredCount}/{count}</Text>
          <View style={styles.links}>
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                setShowAddSupplier((v) => !v);
                setSkickaModalOpen(false);
                if (!expanded) onToggle?.();
              }}
              style={styles.linkWrap}
            >
              <Text style={styles.link}>Lägg till leverantör</Text>
            </Pressable>
            <Text style={styles.linkSep}>·</Text>
            <Pressable
              onPress={(e) => { e?.stopPropagation?.(); setSkickaModalOpen(true); setShowAddSupplier(false); }}
              style={styles.linkWrap}
            >
              <Text style={styles.link}>Skapa utskick</Text>
            </Pressable>
          </View>
        </View>
        <Pressable onPress={openMenu} style={styles.menuBtn} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={16} color="#94a3b8" />
        </Pressable>
      </Pressable>

      {showAddSupplier && expanded ? (
        <View style={styles.addSupplierWrap}>
          <SupplierPickerInline
            suppliers={suppliers}
            onPick={async (s) => {
              await onPickSupplier?.(s);
              setShowAddSupplier(false);
            }}
            onCreate={async (name) => {
              await onCreateSupplier?.(name);
              setShowAddSupplier(false);
            }}
          />
        </View>
      ) : null}

      {expanded && !showAddSupplier ? (
        <View style={styles.expandRow}>
          <View style={styles.expandInner}>
            <SupplierTable
              packages={packages}
              suppliers={suppliers}
              contacts={contacts}
              onPickContact={onPickContact}
              onCreateContact={onCreateContact}
              onSetStatus={onSetStatus}
              onUpdatePackage={onUpdatePackage}
              onOpenFolder={onOpenFolder}
              onRemove={onRemove}
              canOpenFolder={canOpenFolder}
            />
          </View>
        </View>
      ) : null}

      <SkickaUtskickModal
        visible={skickaModalOpen}
        onClose={() => setSkickaModalOpen(false)}
        byggdel={byggdel}
        project={project || {}}
        packages={packages || []}
        contacts={contacts || []}
        onGenerate={() => setSkickaModalOpen(false)}
      />

      <ContextMenu
        visible={menuVisible}
        x={menuPos.x}
        y={menuPos.y}
        items={menuItems}
        onClose={() => setMenuVisible(false)}
        onSelect={(item) => {
          setMenuVisible(false);
          if (item?.key === 'edit') onEditByggdel?.(byggdel);
          if (item?.key === 'delete') onRemoveByggdel?.(byggdel);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  rowPressed: {
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
  },
  chevron: {
    marginRight: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
    flex: 1,
    minWidth: 0,
  },
  count: {
    fontSize: 12,
    color: '#64748b',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progress: {
    fontSize: 11,
    color: '#64748b',
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkWrap: {
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  link: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2563eb',
  },
  linkSep: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  menuBtn: {
    padding: 4,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  addSupplierWrap: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  expandRow: {
    backgroundColor: '#fafbfc',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
  },
  expandInner: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
});
