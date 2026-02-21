/**
 * ProjectSubTopbar – Sub-navigation (2026 SaaS).
 * Section items from config; visually secondary to primary topbar. Sticky under primary.
 * Supports: Skapa flik, context menu (Byt namn, Ta bort), drag-and-drop reorder when editable.
 * Top-notch 2026 UX: lift on drag, vertical drop indicator, push animation, toast feedback.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRIMARY_TOPBAR_HEIGHT, SUB_TOPBAR, TOPBAR_ACCENT } from '../../constants/topbarTheme';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';
import ContextMenu from '../ContextMenu';

const DND_TYPE = 'application/x-digitalkontroll-subtopbar-item';

/** Compute preview order for push effect while dragging */
function computePreviewOrder(items, draggingId, dragOverIndex) {
  if (!items?.length || !draggingId || dragOverIndex == null) return items;
  const dragIdx = items.findIndex((it) => it?.id === draggingId);
  if (dragIdx < 0) return items;
  const next = [...items];
  const [removed] = next.splice(dragIdx, 1);
  const insertIdx = dragIdx < dragOverIndex ? dragOverIndex - 1 : dragOverIndex;
  next.splice(insertIdx, 0, removed);
  return next;
}

function DropIndicator({ visible }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    }
  }, [visible, opacity]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.dropIndicator, { opacity }]} pointerEvents="none" />
  );
}

function DropZone({ onDragOver, onDrop, showIndicator, styles: st, style, ariaLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || Platform.OS !== 'web') return;
    const el = ref.current;
    const onOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver?.();
    };
    const onDropEvt = (e) => {
      e.preventDefault();
      onDrop?.(e);
    };
    el.addEventListener('dragover', onOver);
    el.addEventListener('drop', onDropEvt);
    return () => {
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('drop', onDropEvt);
    };
  }, [onDragOver, onDrop]);
  return (
    <View
      ref={ref}
      style={[st.dropZone, style]}
      {...(Platform.OS === 'web' && ariaLabel
        ? { accessibilityLabel: ariaLabel, accessibilityRole: 'button' }
        : {})}
    >
      <DropIndicator visible={showIndicator} />
    </View>
  );
}

function DraggableNavItem({
  item, idx, itemId, isActive, isHovered, isDragging, canDrag,
  subMenuItems, onReorder, onSelectItem, setHoveredId, setDraggingId, setDragOverIndex,
  handleContextMenu, styles, stripNumberPrefixForDisplay,
  isLoading = false,
}) {
  const elRef = useRef(null);

  useEffect(() => {
    if (!canDrag || !elRef.current || !onReorder) return;
    const el = elRef.current;
    if (typeof el.setAttribute !== 'function' || typeof el.addEventListener !== 'function') return;
    el.setAttribute('draggable', 'true');
    el.setAttribute('aria-grabbed', isDragging ? 'true' : 'false');

    const onDragStart = (e) => {
      setDraggingId(item?.id);
      try {
        const payload = JSON.stringify({ id: item?.id });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DND_TYPE, payload);
        e.dataTransfer.setData('text/plain', payload);
      } catch (_e) {}
    };
    const onDragEnd = () => {
      setDraggingId(null);
      setDragOverIndex(null);
    };
    const onDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(idx);
    };
    const onDrop = (e) => {
      e.preventDefault();
      setDragOverIndex(null);
      setDraggingId(null);
      try {
        const raw = e.dataTransfer.getData(DND_TYPE) || e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const { id } = JSON.parse(raw);
        const dragIdx = subMenuItems.findIndex((it) => it?.id === id);
        if (dragIdx < 0 || dragIdx === idx) return;
        const next = [...(subMenuItems || [])];
        const [removed] = next.splice(dragIdx, 1);
        next.splice(idx, 0, removed);
        onReorder(next);
      } catch (_e) {}
    };

    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragend', onDragEnd);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('dragend', onDragEnd);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [canDrag, item, idx, subMenuItems, onReorder, setDraggingId, setDragOverIndex, isDragging]);

  const style = [
    styles.navItem,
    isDragging && styles.navItemDragging,
    canDrag && styles.navItemDraggable,
  ];

  const displayLabel = stripNumberPrefixForDisplay(item?.name ?? item?.displayName ?? '');
  const isAiTab = (() => {
    const id = String(item?.id || '').toLowerCase();
    const label = String(displayLabel || '').toLowerCase();
    if (id.startsWith('ai-')) return true;
    // Common Swedish labels
    return label.includes('ai-analys') || label.includes('ai riskanalys') || label.includes('ai-riskanalys');
  })();

  const aiIconName = isAiTab ? 'sparkles-outline' : null;

  const labelEl = (
    <>
      {aiIconName ? (
        <Ionicons
          name={aiIconName}
          size={16}
          color={isActive ? (TOPBAR_ACCENT ?? '#2563eb') : '#64748b'}
          style={{ marginRight: 6 }}
          accessibilityLabel="AI-analys"
        />
      ) : null}
      <Text
        style={[
          styles.label,
          isActive && styles.labelActive,
          isHovered && !isActive && styles.labelHover,
        ]}
        numberOfLines={1}
      >
        {displayLabel}
      </Text>
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={isActive ? (TOPBAR_ACCENT ?? '#2563eb') : '#94a3b8'}
          style={{ marginLeft: 6 }}
        />
      ) : null}
      {isActive && <View style={styles.underline} />}
    </>
  );

  if (canDrag) {
    return (
      <Pressable
        ref={elRef}
        style={[style, isLoading && styles.navItemLoading]}
        onMouseEnter={() => setHoveredId(itemId)}
        onMouseLeave={() => setHoveredId(null)}
        onContextMenu={handleContextMenu}
        onPress={() => onSelectItem?.(itemId)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        {labelEl}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[style, isLoading && styles.navItemLoading]}
      onPress={() => onSelectItem?.(itemId)}
      onHoverIn={() => setHoveredId(itemId)}
      onHoverOut={() => setHoveredId(null)}
      onContextMenu={handleContextMenu}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      {labelEl}
    </Pressable>
  );
}

export default function ProjectSubTopbar({
  subMenuItems,
  activeItem,
  onSelectItem,
  primaryTopbarHeight = PRIMARY_TOPBAR_HEIGHT,
  isEditable = false,
  sectionDisplayName = '',
  onRequestCreate,
  onRequestRename,
  onRequestDelete,
  onReorder,
  itemLoadingIds = [],
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const isWeb = Platform.OS === 'web';
  const topPx = typeof primaryTopbarHeight === 'number' && primaryTopbarHeight >= 0 ? primaryTopbarHeight : PRIMARY_TOPBAR_HEIGHT;
  const isDragging = !!draggingId;
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isWeb || !wrapperRef.current || !(isEditable && onReorder)) return;
    const el = wrapperRef.current;
    const onLeave = (e) => {
      if (!e.relatedTarget || !el.contains(e.relatedTarget)) {
        setDragOverIndex(null);
      }
    };
    el.addEventListener('dragleave', onLeave);
    return () => el.removeEventListener('dragleave', onLeave);
  }, [isWeb, isEditable, onReorder]);

  /** Position-based dragover: trigger drop zone earlier (70% of tab = insert before) */
  useEffect(() => {
    if (!isWeb || !wrapperRef.current || !(isEditable && onReorder)) return;
    const el = wrapperRef.current;
    const onOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!isDragging) return;
      const tabs = el.querySelectorAll('[data-tab-index]');
      if (!tabs.length) return;
      const x = e.clientX;
      const rects = Array.from(tabs)
        .map((t) => ({ el: t, idx: parseInt(t.dataset.tabIndex ?? '-1', 10), rect: t.getBoundingClientRect() }))
        .filter((r) => r.idx >= 0)
        .sort((a, b) => a.idx - b.idx);
      if (!rects.length) return;
      const n = rects.length;
      const first = rects[0];
      const last = rects[n - 1];
      if (x < first.rect.left) {
        setDragOverIndex(0);
        return;
      }
      if (x > last.rect.right) {
        setDragOverIndex(n);
        return;
      }
      for (let i = 0; i < n; i++) {
        const r = rects[i].rect;
        const w = r.right - r.left;
        const split = r.left + 0.7 * w;
        if (x < split) {
          setDragOverIndex(i);
          return;
        }
        if (x <= r.right) {
          setDragOverIndex(i + 1);
          return;
        }
      }
      setDragOverIndex(n);
    };
    el.addEventListener('dragover', onOver);
    return () => el.removeEventListener('dragover', onOver);
  }, [isWeb, isEditable, onReorder, isDragging]);

  const displayItems = useMemo(
    () => computePreviewOrder(subMenuItems || [], draggingId, dragOverIndex),
    [subMenuItems, draggingId, dragOverIndex],
  );

  useEffect(() => {
    if (isDragging && dragOverIndex != null && Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isDragging, dragOverIndex]);

  const handleContextMenu = useCallback((e, item, idx) => {
    if (!isEditable || !item) return;
    e?.preventDefault?.();
    const x = e?.nativeEvent?.pageX ?? e?.clientX ?? 0;
    const y = e?.nativeEvent?.pageY ?? e?.clientY ?? 0;
    setContextMenu({ x, y, item, idx });
  }, [isEditable]);

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContextSelect = useCallback((selected) => {
    const { item } = contextMenu || {};
    if (selected?.key === 'rename' && item && onRequestRename) onRequestRename(item);
    if (selected?.key === 'delete' && item && onRequestDelete) onRequestDelete(item);
    setContextMenu(null);
  }, [contextMenu, onRequestRename, onRequestDelete]);

  const handleDropAt = useCallback((e, dropIdx) => {
    if (!isEditable || !onReorder || !isWeb) return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setDragOverIndex(null);
    setDraggingId(null);
    try {
      const raw = e.dataTransfer.getData(DND_TYPE) || e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const { id } = JSON.parse(raw);
      const dragIdx = subMenuItems.findIndex((it) => it?.id === id);
      if (dragIdx < 0 || dragIdx === dropIdx) return;
      const next = [...(subMenuItems || [])];
      const [removed] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, removed);
      onReorder(next);
    } catch (_e) {}
  }, [isEditable, onReorder, isWeb, subMenuItems]);

  if (!Array.isArray(subMenuItems) || subMenuItems.length === 0) {
    if (!isEditable || !onRequestCreate) return null;
    return (
      <View style={[styles.wrapper, isWeb && styles.wrapperSticky, isWeb && { top: topPx }]}>
        <View style={styles.wrapperInner}>
          <View style={styles.container}>
            <View style={styles.scrollContent}>
              <Pressable
                style={styles.addButton}
                onPress={onRequestCreate}
                accessibilityLabel="Skapa flik"
                {...(Platform.OS === 'web' ? { 'data-testid': 'subtopbar-create-folder' } : {})}
              >
                <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
                <Text style={styles.addButtonText}>Skapa flik</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const contextItems = [
    { key: 'rename', label: 'Byt namn' },
    { key: 'delete', label: 'Ta bort', danger: true },
  ];

  const canDrag = isWeb && isEditable && !!onReorder;

  return (
    <>
      <View
        ref={wrapperRef}
        style={[
          styles.wrapper,
          isWeb && styles.wrapperSticky,
          isWeb && { top: topPx },
          isDragging && styles.wrapperDragActive,
        ]}
      >
        <View style={styles.wrapperInner}>
          <View style={styles.container}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              onDragOver={isWeb && canDrag ? (e) => e?.preventDefault?.() : undefined}
            >
              {canDrag && isDragging ? (
                <DropZone
                  onDragOver={() => setDragOverIndex(0)}
                  onDrop={(e) => handleDropAt(e, 0)}
                  showIndicator={dragOverIndex === 0}
                  styles={styles}
                  style={styles.dropZoneStart}
                  ariaLabel="Släpp här för att flytta flik till första platsen"
                />
              ) : null}
              {displayItems.map((item, displayIdx) => {
                const originalIdx = (subMenuItems || []).findIndex((i) => i?.id === item?.id);
                const itemId = item?.id ?? `item-${originalIdx}`;
                const isLoading = Array.isArray(itemLoadingIds) && itemLoadingIds.includes(itemId);
                return (
                  <View
                  key={itemId}
                  style={styles.tabWithIndicator}
                  {...(Platform.OS === 'web' ? { dataSet: { tabIndex: String(originalIdx) } } : {})}
                >
                    <DropIndicator
                      visible={dragOverIndex === originalIdx && originalIdx !== 0}
                    />
                    <DraggableNavItem
                      item={item}
                      idx={originalIdx}
                      itemId={itemId}
                      isActive={activeItem === itemId}
                      isHovered={hoveredId === itemId}
                      isDragging={draggingId === item?.id}
                      canDrag={canDrag && !item?.isSystemItem}
                      subMenuItems={subMenuItems}
                      onReorder={onReorder}
                      onSelectItem={onSelectItem}
                      setHoveredId={setHoveredId}
                      setDraggingId={setDraggingId}
                      setDragOverIndex={setDragOverIndex}
                      handleContextMenu={(e) => isEditable && !item?.isSystemItem && handleContextMenu(e, item, originalIdx)}
                      styles={styles}
                      stripNumberPrefixForDisplay={stripNumberPrefixForDisplay}
                      isLoading={isLoading}
                    />
                  </View>
                );
              })}
              {canDrag && isDragging ? (
                <DropZone
                  onDragOver={() => setDragOverIndex((subMenuItems || []).length)}
                  onDrop={(e) => handleDropAt(e, (subMenuItems || []).length)}
                  showIndicator={dragOverIndex === (subMenuItems || []).length}
                  styles={styles}
                  style={styles.dropZoneEnd}
                  ariaLabel="Släpp här för att flytta flik till sista platsen"
                />
              ) : null}
              {isEditable && onRequestCreate && (
                <Pressable
                  style={styles.addButton}
                  onPress={onRequestCreate}
                  onHoverIn={isWeb ? () => setHoveredId('__add__') : undefined}
                  onHoverOut={isWeb ? () => setHoveredId(null) : undefined}
                  accessibilityLabel="Skapa flik"
                  {...(Platform.OS === 'web' ? { 'data-testid': 'subtopbar-create-folder' } : {})}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
                  <Text style={styles.addButtonText}>Skapa flik</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </View>

      {contextMenu && (
        <ContextMenu
          visible
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onSelect={handleContextSelect}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fafbfc',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    ...(Platform.OS === 'web' ? { transition: 'background-color 0.15s ease' } : {}),
  },
  wrapperSticky: {
    position: 'sticky',
    zIndex: SUB_TOPBAR.stickyZIndex,
  },
  wrapperDragActive: {
    backgroundColor: 'rgba(0,0,0,0.025)',
  },
  wrapperInner: {},
  container: {
    minHeight: 40,
  },
  scrollContent: {
    paddingVertical: SUB_TOPBAR.paddingVertical,
    paddingHorizontal: SUB_TOPBAR.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SUB_TOPBAR.itemGap,
    ...(Platform.OS === 'web' ? { transition: 'gap 0.15s ease' } : {}),
  },
  tabWithIndicator: {
    flexDirection: 'row',
    alignItems: 'stretch',
    ...(Platform.OS === 'web' ? { transition: 'transform 0.15s ease' } : {}),
  },
  dropIndicator: {
    width: 4,
    minWidth: 4,
    height: 24,
    alignSelf: 'center',
    backgroundColor: TOPBAR_ACCENT ?? '#2563eb',
    borderRadius: 2,
    marginHorizontal: 0,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)' } : {}),
  },
  dropZone: {
    flex: 0,
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : {}),
  },
  dropZoneStart: {
    minWidth: 24,
  },
  dropZoneEnd: {
    minWidth: 24,
  },
  navItem: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 32,
    justifyContent: 'center',
    flexWrap: 'nowrap',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease' } : {}),
  },
  navItemDraggable: {
    ...(Platform.OS === 'web' ? { cursor: 'grab' } : {}),
  },
  navItemLoading: {
    minWidth: 0,
  },
  navItemDragging: {
    opacity: 0.9,
    ...(Platform.OS === 'web'
      ? {
          cursor: 'grabbing',
          transform: [{ scale: 1.03 }],
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }
      : { transform: [{ scale: 1.03 }] }),
  },
  label: {
    fontSize: SUB_TOPBAR.fontSize,
    fontWeight: SUB_TOPBAR.fontWeight,
    color: SUB_TOPBAR.textInactive,
    ...(Platform.OS === 'web' ? { transition: 'color 0.2s ease, opacity 0.2s ease' } : {}),
  },
  labelActive: {
    color: SUB_TOPBAR.textActive,
  },
  labelHover: {
    color: SUB_TOPBAR.textActive,
  },
  underline: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: SUB_TOPBAR.underlineHeight,
    backgroundColor: SUB_TOPBAR.underlineColor,
    borderRadius: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 32,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  addButtonText: {
    fontSize: SUB_TOPBAR.fontSize,
    fontWeight: SUB_TOPBAR.fontWeight,
    color: '#2563eb',
  },
});
