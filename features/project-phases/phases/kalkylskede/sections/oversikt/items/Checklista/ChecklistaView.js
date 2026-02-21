/**
 * ChecklistaView – dynamisk checklista för anbudsprocessen (Kalkylskede).
 * Accordion-kategorier, status-badges, datumväljare, ansvarig med sök.
 * 2026-tema: kompakt rad, ljus grå bakgrund, navy-accent.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import IsoDatePickerModal from '../../../../../../../../components/common/Modals/IsoDatePickerModal';
import { fetchCompanyMembers } from '../../../../../../../../components/firebase';
import { ICON_RAIL } from '../../../../../../../../constants/iconRailTheme';
import { useChecklistEdit } from '../../../../../../../../contexts/ChecklistEditContext';
import { useProjectChecklist } from '../../../../../../../../hooks/useProjectChecklist';
import { DEFAULT_CHECKLIST_STATUS } from '../../../../../../../../lib/defaultChecklistTemplate';

const STATUS_LABELS = {
  pending: 'Ej utfört',
  in_progress: 'Pågår',
  done: 'Klar',
  not_applicable: 'Ej aktuell',
};
function normalizeStatus(s) {
  if (s === 'done' || s === 'Done') return 'done';
  if (s === 'not_applicable' || s === 'NotRelevant') return 'not_applicable';
  if (s === 'in_progress' || s === 'InProgress') return 'in_progress';
  return 'pending';
}

const RADIUS = 12;
const CARD_RADIUS = 12;

// Premium table columns (web grid): Titel | Obl | Datum | Ansvariga | Kommentar | Status
const GRID_COLUMNS = '1.35fr 48px 130px 180px 1fr 140px';
const ROW_HEIGHT = 46;
const SHADOW = Platform.select({
  web: { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)' },
  default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
});
const NAVY = ICON_RAIL.bg || '#0f1b2d';

function progressColor(pct) {
  if (pct >= 80) return { bg: '#DCFCE7', fill: '#16A34A' }; // green
  if (pct >= 40) return { bg: '#FEF9C3', fill: '#CA8A04' };  // yellow
  return { bg: '#FEE2E2', fill: '#DC2626' };                 // red
}

function statusDotColor(status) {
  const s = normalizeStatus(status);
  if (s === 'done') return '#16A34A';
  if (s === 'in_progress') return '#2563EB';
  if (s === 'not_applicable') return '#94a3b8';
  return '#e2e8f0';
}

function ChecklistProgressBar({ progress, height = 4, showLabel = false }) {
  const pct = Math.min(100, Math.max(0, Number(progress) || 0));
  const colors = progressColor(pct);
  return (
    <View style={[styles.progressWrap, { height }]}>
      <View style={[styles.progressTrack, { backgroundColor: colors.bg, borderRadius: height / 2 }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${pct}%`,
              backgroundColor: colors.fill,
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
      {showLabel ? <Text style={styles.progressLabel}>{pct}%</Text> : null}
    </View>
  );
}

function StatusDot({ status }) {
  return (
    <View style={[styles.statusDot, { backgroundColor: statusDotColor(status) }]} />
  );
}

function GridColumnHeader() {
  return (
    <View style={[styles.gridRow, styles.gridHeaderRow]}>
      <View style={styles.gridHeaderCellTitle}>
        <Text style={styles.gridHeaderText}>TITEL</Text>
      </View>
      <View style={styles.gridHeaderCellObl}>
        <Text style={styles.gridHeaderText}>OBL</Text>
      </View>
      <View style={styles.gridHeaderCellDate}>
        <Text style={styles.gridHeaderText}>DATUM</Text>
      </View>
      <View style={styles.gridHeaderCellResponsible}>
        <Text style={styles.gridHeaderText}>ANSVARIGA</Text>
      </View>
      <View style={styles.gridHeaderCellComment}>
        <Text style={styles.gridHeaderText}>KOMMENTAR</Text>
      </View>
      <View style={styles.gridHeaderCellStatus}>
        <Text style={[styles.gridHeaderText, styles.gridHeaderStatus]}>STATUS</Text>
      </View>
    </View>
  );
}

function StatusBadges({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const current = normalizeStatus(value);
  const statuses = [
    DEFAULT_CHECKLIST_STATUS.PENDING,
    DEFAULT_CHECKLIST_STATUS.IN_PROGRESS,
    DEFAULT_CHECKLIST_STATUS.DONE,
    DEFAULT_CHECKLIST_STATUS.NOT_APPLICABLE,
  ];
  const isDone = current === 'done';
  const isNA = current === 'not_applicable';
  const isInProgress = current === 'in_progress';

  const handleSelect = (s) => {
    onChange(s);
    setOpen(false);
  };

  const openDropdown = () => {
    const node = triggerRef.current;
    const setPositionAndOpen = (left, top, height) => {
      setDropdownPosition({
        left: left ?? 0,
        top: (top ?? 0) + (height ?? 0) + 4,
      });
      setOpen(true);
    };
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, w, h) => setPositionAndOpen(x, y, h));
    } else if (Platform.OS === 'web' && node && typeof node.getBoundingClientRect === 'function') {
      try {
        const rect = node.getBoundingClientRect();
        setPositionAndOpen(rect.left, rect.top, rect.height);
      } catch (_e) {
        setOpen(true);
      }
    } else {
      setOpen(true);
    }
  };

  const dropdownContent = (
    <Pressable
      style={[styles.statusDropdownModalCard, styles.statusDropdownInline, {
        position: 'absolute',
        left: dropdownPosition.left,
        top: dropdownPosition.top,
      }]}
      onPress={(e) => e?.stopPropagation?.()}
    >
      {statuses.map((s) => (
        <Pressable
          key={s}
          onPress={() => handleSelect(s)}
          style={styles.statusDropdownOption}
          {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
        >
          <View style={[styles.statusDropdownDot, { backgroundColor: statusDotColor(s) }]} />
          <Text style={styles.statusDropdownOptionText}>{STATUS_LABELS[s] || s}</Text>
        </Pressable>
      ))}
    </Pressable>
  );

  return (
    <View style={styles.statusBadgeWrap}>
      <Pressable
        ref={triggerRef}
        onPress={openDropdown}
        style={[
          styles.statusBadge,
          isDone && styles.statusBadgeDone,
          isNA && styles.statusBadgeNA,
          isInProgress && styles.statusBadgeInProgress,
          !isDone && !isNA && !isInProgress && styles.statusBadgePending,
        ]}
      >
        <View style={[styles.statusDot, { backgroundColor: statusDotColor(value) }]} />
        <Text style={[styles.statusBadgeText, isDone && styles.statusBadgeTextDone]} numberOfLines={1}>
          {STATUS_LABELS[value] || STATUS_LABELS[current] || 'Ej utfört'}
        </Text>
        <Ionicons name="chevron-down" size={10} color={isDone ? '#166534' : '#64748b'} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setOpen(false)}>
          {dropdownContent}
        </Pressable>
      </Modal>
    </View>
  );
}

function getInitials(name) {
  if (!name || !String(name).trim()) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0][0] || '?').toUpperCase();
}

function ResponsiblePicker({ companyId, value, onChange }) {
  const selectedIds = Array.isArray(value) ? value : (value ? [value] : []);
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    Promise.all([
      fetchCompanyMembers(companyId, { role: 'admin' }),
      fetchCompanyMembers(companyId, { role: 'superadmin' }).catch(() => ({ out: [] })),
    ])
      .then(([adminRes, superRes]) => {
        if (cancelled) return;
        const adminList = Array.isArray(adminRes?.out) ? adminRes.out : (Array.isArray(adminRes) ? adminRes : []);
        const superList = Array.isArray(superRes?.out) ? superRes.out : [];
        const byId = new Map();
        [...superList, ...adminList].forEach((m) => byId.set(m.uid || m.id, m));
        setMembers(Array.from(byId.values()));
      })
      .catch(() => setMembers([]));
    return () => { cancelled = true; };
  }, [companyId]);

  const searchLower = String(search || '').trim().toLowerCase();
  const filtered = searchLower
    ? members.filter((m) => {
        const name = String(m.displayName || m.name || m.email || '').toLowerCase();
        const email = String(m.email || '').toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower);
      })
    : members;

  const toggleId = (id) => {
    if (!id) {
      onChange([]);
      return;
    }
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange(next);
  };

  const selectedMembers = selectedIds
    .map((id) => members.find((m) => (m.uid || m.id) === id))
    .filter(Boolean);

  return (
    <View style={styles.responsibleWrap}>
      <Pressable onPress={() => { setOpen(true); setSearch(''); }} style={styles.responsibleTrigger}>
        <View style={styles.responsibleAvatars}>
          {selectedMembers.length > 0 ? (
            selectedMembers.slice(0, 4).map((m) => {
              const id = m.uid || m.id;
              const name = m.displayName || m.name || m.email || id;
              return (
                <View key={id} style={styles.avatarCircleCompact}>
                  <Text style={styles.avatarTextCompact} numberOfLines={1}>{getInitials(name)}</Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.responsibleTriggerPlaceholder} numberOfLines={1}>Välj ansvariga</Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={12} color="#64748b" />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={styles.responsibleDropdownModalCard}
            onPress={(e) => e?.stopPropagation?.()}
            {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
          >
            <TextInput
              style={styles.responsibleSearch}
              value={search}
              onChangeText={setSearch}
              placeholder="Sök..."
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            />
            <ScrollView style={styles.responsibleDropdownScroll} keyboardShouldPersistTaps="handled">
              {filtered.map((m) => {
                const id = m.uid || m.id;
                const name = m.displayName || m.name || m.email || id;
                const isSelected = selectedIds.includes(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleId(id)}
                    style={[styles.responsibleOption, isSelected && styles.responsibleOptionSelected]}
                    {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
                  >
                    <View style={styles.avatarCircleSmall}>
                      <Text style={styles.avatarTextSmall}>{getInitials(name)}</Text>
                    </View>
                    <Text style={styles.responsibleOptionText} numberOfLines={1}>{name}</Text>
                    {isSelected ? <Ionicons name="checkmark-circle" size={18} color={NAVY} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CommentBlock({ companyId, value, onChange, onBlur, onSubmit, singleLine = false }) {
  const [members, setMembers] = useState([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const atPositionRef = useRef(0);
  const inputRef = useRef(null);
  const [mentionAnchor, setMentionAnchor] = useState(null);
  const MENTION_MAX_HEIGHT = 220;

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchCompanyMembers(companyId)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.out) ? res.out : (Array.isArray(res) ? res : []);
        setMembers(list);
      })
      .catch(() => setMembers([]));
    return () => { cancelled = true; };
  }, [companyId]);

  const handleChange = (text) => {
    onChange(text);
    const lastAt = text.lastIndexOf('@');
    if (lastAt !== -1) {
      atPositionRef.current = lastAt;
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (displayName) => {
    const pos = atPositionRef.current;
    const next = (value || '').slice(0, pos) + '@' + displayName + ' ';
    onChange(next);
    setMentionOpen(false);
  };

  const closeMentions = () => setMentionOpen(false);

  useEffect(() => {
    if (!mentionOpen) return;
    const node = inputRef.current;
    if (!node?.measureInWindow) return;

    const raf = requestAnimationFrame(() => {
      try {
        node.measureInWindow((x, y, width, height) => {
          const win = Dimensions.get('window');
          const safePad = 12;

          const dropdownWidth = Math.min(Math.max(240, width || 320), 520);
          let left = Number(x) || safePad;
          if (left + dropdownWidth > win.width - safePad) left = Math.max(safePad, win.width - safePad - dropdownWidth);

          const belowTop = (Number(y) || 0) + (Number(height) || 32) + 6;
          const aboveTop = (Number(y) || 0) - MENTION_MAX_HEIGHT - 6;
          const openUp = belowTop + MENTION_MAX_HEIGHT > win.height - safePad && aboveTop >= safePad;
          const top = openUp ? aboveTop : belowTop;

          setMentionAnchor({ left, top, width: dropdownWidth });
        });
      } catch (_) {
        // ignore
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [mentionOpen, value, singleLine]);

  const mentionMatches = useMemo(() => {
    if (!mentionOpen || !value) return members;
    const afterAt = (value.slice(atPositionRef.current + 1) || '').trim().toLowerCase();
    if (!afterAt) return members;
    return members.filter((m) => {
      const name = String(m.displayName || m.name || m.email || '').toLowerCase();
      return name.includes(afterAt);
    });
  }, [mentionOpen, value, members]);

  const parsedMentions = useMemo(() => {
    const text = value || '';
    const re = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
    const list = [];
    let m;
    while ((m = re.exec(text)) !== null) list.push(m[1].trim());
    return [...new Set(list)];
  }, [value]);

  const mentionVisible = mentionOpen && mentionMatches.length > 0;

  return (
    <View style={styles.itemRowCommentBlock}>
      <TextInput
        ref={inputRef}
        style={[styles.itemRowCommentInput, singleLine && styles.itemRowCommentInputSingle]}
        value={value == null ? '' : String(value)}
        onChangeText={handleChange}
        onBlur={() => {
          closeMentions();
          onBlur?.();
        }}
        placeholder="Kommentar... Skriv @ för att nämna någon"
        placeholderTextColor="#94a3b8"
        multiline={!singleLine}
        numberOfLines={singleLine ? 1 : undefined}
        blurOnSubmit={!!singleLine}
        onSubmitEditing={() => {
          if (!singleLine) return;
          closeMentions();
          onSubmit?.();
        }}
        {...(Platform.OS === 'web'
          ? {
              onKeyPress: (e) => {
                const key = e?.nativeEvent?.key;
                if (!singleLine) return;
                if (key === 'Enter') {
                  try { e?.preventDefault?.(); } catch (_e) {}
                  closeMentions();
                  onSubmit?.();
                  try { inputRef.current?.blur?.(); } catch (_e2) {}
                }
              },
            }
          : {})}
      />
      {mentionVisible ? (
        <Modal
          transparent
          visible={mentionVisible}
          animationType="fade"
          onRequestClose={closeMentions}
        >
          <Pressable style={styles.mentionModalBackdrop} onPress={closeMentions}>
            <Pressable
              style={[
                styles.mentionModalCard,
                mentionAnchor
                  ? {
                      left: mentionAnchor.left,
                      top: mentionAnchor.top,
                      width: mentionAnchor.width,
                    }
                  : null,
              ]}
              onPress={(e) => e?.stopPropagation?.()}
              {...(Platform.OS === 'web'
                ? {
                    onMouseDown: (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    },
                  }
                : {})}
            >
              <ScrollView style={styles.mentionDropdownScroll} keyboardShouldPersistTaps="handled">
                {mentionMatches.slice(0, 40).map((mem) => {
                  const name = mem.displayName || mem.name || mem.email || mem.uid || mem.id;
                  return (
                    <Pressable
                      key={mem.uid || mem.id}
                      onPress={() => {
                        insertMention(name);
                        setTimeout(() => inputRef.current?.focus?.(), 0);
                      }}
                      style={styles.mentionOption}
                      {...(Platform.OS === 'web'
                        ? {
                            onMouseDown: (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            },
                          }
                        : {})}
                    >
                      <Text style={styles.mentionOptionText} numberOfLines={1}>{name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      {!singleLine && parsedMentions.length > 0 ? (
        <View style={styles.mentionBadgesWrap}>
          {parsedMentions.map((name) => (
            <View key={name} style={styles.mentionBadge}>
              <Text style={styles.mentionBadgeText}>@{name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChecklistItemRow({
  item,
  updateItem,
  setItemHidden,
  companyId,
  newItemIdForFocus,
  onClearNewItemFocus,
  onOpenDatePicker,
}) {
  const { persistedData, draftData, markDirty, commitItemPatch } = useChecklistEdit();
  const draft = draftData?.[item.id] || {};
  const persisted = persistedData?.[item.id] || {};

  const localComment = draft.comment ?? (item.comment ?? '');
  const localTitle = (draft.title ?? draft.customTitle) ?? (item.title || item.customTitle || '');
  const isNewItemFocus = item.isCustomItem && item.id === newItemIdForFocus;
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (isNewItemFocus && titleInputRef.current?.focus) {
      try { titleInputRef.current.focus(); } catch (_) {}
    }
  }, [isNewItemFocus]);

  const handleCommentChange = useCallback((text) => {
    markDirty((prev) => ({
      ...(prev || {}),
      [item.id]: {
        ...((prev && prev[item.id]) || {}),
        comment: text,
      },
    }));
  }, [item.id, markDirty]);

  const commitComment = useCallback(async () => {
    const nextText = String(localComment ?? '');
    const trimmed = nextText.trim();
    const next = trimmed ? trimmed : null;
    const persistedText = String(persisted.comment ?? (item.comment ?? '')).trim();
    const nextComparable = String(next ?? '').trim();
    if (persistedText === nextComparable) return;
    await commitItemPatch(item.id, { comment: next });
  }, [commitItemPatch, item.comment, item.id, localComment, persisted.comment]);

  const handleStatusChange = async (status) => {
    const payload = { status };
    if (status === 'done' || status === 'Done') {
      const candidateDate = draft.dueDate ?? item.dueDate;
      const hasDate = candidateDate && /^\d{4}-\d{2}-\d{2}$/.test(String(candidateDate));
      if (!hasDate) payload.dueDate = new Date().toISOString().slice(0, 10);
    }
    await commitItemPatch(item.id, payload);
  };

  const handleTitleChange = useCallback((text) => {
    markDirty((prev) => ({
      ...(prev || {}),
      [item.id]: {
        ...((prev && prev[item.id]) || {}),
        title: text,
      },
    }));
  }, [item.id, markDirty]);

  const commitTitle = useCallback(async () => {
    const t = String(localTitle || '').trim();
    const next = t || 'Ny punkt';
    const persistedTitle = String((persisted.title ?? persisted.customTitle) ?? (item.title || item.customTitle || '')).trim();
    if (persistedTitle === next) {
      if (isNewItemFocus && onClearNewItemFocus) onClearNewItemFocus();
      return;
    }
    await commitItemPatch(item.id, { title: next, customTitle: next });
    if (isNewItemFocus && onClearNewItemFocus) onClearNewItemFocus();
  }, [commitItemPatch, isNewItemFocus, item.customTitle, item.id, item.title, localTitle, onClearNewItemFocus, persisted.customTitle, persisted.title]);

  const assignedToArray = useMemo(() => {
    const a = draft.assignedTo ?? item.assignedTo;
    if (Array.isArray(a)) return a.filter(Boolean);
    if (a) return [a];
    if (item.responsibleUserId) return [item.responsibleUserId];
    return [];
  }, [draft.assignedTo, item.assignedTo, item.responsibleUserId]);

  const handleResponsibleChange = async (ids) => {
    const next = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    await commitItemPatch(item.id, { assignedTo: next });
  };

  const handleHide = () => {
    Alert.alert(
      'Dölj punkt',
      'Vill du dölja denna systempunkt i projektet? Den kan visas igen senare.',
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Dölj', onPress: () => setItemHidden(item.id, true) },
      ]
    );
  };

  const isDone = normalizeStatus(item.status) === 'done';
  const rawDueDate = draft.dueDate ?? item.dueDate;
  const dueDateDisplay = rawDueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawDueDate))
    ? String(rawDueDate)
    : null;
  const [hovered, setHovered] = useState(false);

  return (
    <View
      style={[styles.itemRow, isDone && styles.itemRowDone]}
      {...(Platform.OS === 'web' ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } : {})}
    >
      <View style={[styles.gridRow, styles.gridDataRow, Platform.OS === 'web' && hovered && styles.gridRowHover]}>
        <View style={styles.gridCellTitle}>
          {item.isCustomItem && !isNewItemFocus ? (
            <Ionicons name="add-circle-outline" size={11} color="#94a3b8" style={styles.itemRowCustomIcon} />
          ) : null}
          {isNewItemFocus ? (
            <TextInput
              ref={titleInputRef}
              style={styles.itemRowTitleInput}
              value={localTitle}
              onChangeText={handleTitleChange}
              onBlur={commitTitle}
              placeholder="Titel på punkt"
              placeholderTextColor="#94a3b8"
              selectTextOnFocus={!!newItemIdForFocus}
              blurOnSubmit
              onSubmitEditing={commitTitle}
            />
          ) : (
            <Text
              style={[styles.itemRowTitleText, isDone && styles.itemRowTitleTextDone]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.title || item.customTitle || '—'}
            </Text>
          )}
        </View>
          <View style={styles.gridCellObl}>
            {(item.isMandatory || item.required) ? (
              <View style={styles.oblPill}>
                <Text style={styles.oblPillText}>Obl</Text>
              </View>
            ) : (
              <Text style={styles.oblDash}>—</Text>
            )}
          </View>
        <Pressable onPress={() => onOpenDatePicker(item.id)} style={styles.gridCellDate}>
          <Ionicons name="calendar-outline" size={12} color="#64748b" />
          <Text style={styles.gridCellDateText} numberOfLines={1}>
            {dueDateDisplay || '—'}
          </Text>
        </Pressable>
        <View style={styles.gridCellResponsible}>
          <ResponsiblePicker
            companyId={companyId}
            value={assignedToArray}
            onChange={handleResponsibleChange}
          />
        </View>
        <View style={styles.gridCellComment}>
            <CommentBlock
              companyId={companyId}
              value={localComment}
              onChange={handleCommentChange}
              onBlur={commitComment}
              onSubmit={commitComment}
              singleLine
            />
        </View>
        <View style={styles.gridCellStatus}>
          <StatusBadges value={draft.status ?? item.status} onChange={handleStatusChange} />
        </View>
      </View>
    </View>
  );
}

function isChecklistCompletedStatus(status) {
  const s = normalizeStatus(status);
  return s === 'done' || s === 'not_applicable';
}

function computeSectionMetrics(items) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const done = list.filter((i) => isChecklistCompletedStatus(i?.status)).length;
  const required = list.filter((i) => i?.required === true || i?.isMandatory === true);
  const missingRequired = required.filter((i) => !isChecklistCompletedStatus(i?.status)).length;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, requiredTotal: required.length, missingRequired, progressPct };
}

function deriveSectionStatusPresentation(metrics) {
  const { total, done, missingRequired, progressPct } = metrics;

  if (total === 0) {
    return { text: 'Inga punkter', color: '#94a3b8', bar: '#cbd5e1', track: 'rgba(148, 163, 184, 0.25)', progressPct: 0 };
  }

  if (missingRequired > 0) {
    return {
      text: `${missingRequired} obligatoriska saknas`,
      color: '#dc2626',
      bar: '#dc2626',
      track: 'rgba(220, 38, 38, 0.14)',
      progressPct,
    };
  }

  if (done >= total) {
    return { text: '✓ Klar', color: '#16a34a', bar: '#16a34a', track: 'rgba(22, 163, 74, 0.16)', progressPct: 100 };
  }

  if (done === 0) {
    return { text: `${done} / ${total} klara`, color: '#94a3b8', bar: '#94a3b8', track: 'rgba(148, 163, 184, 0.22)', progressPct };
  }

  const ratio = total === 0 ? 0 : done / total;
  const isOrange = ratio >= 0.5;
  const activeColor = isOrange ? '#f59e0b' : '#2563eb';

  return {
    text: `${done} / ${total} klara – ${Math.max(0, total - done)} kvar`,
    color: activeColor,
    bar: activeColor,
    track: isOrange ? 'rgba(245, 158, 11, 0.16)' : 'rgba(37, 99, 235, 0.14)',
    progressPct,
  };
}

function CategorySection({
  category,
  expanded,
  onToggle,
  updateItem,
  setItemHidden,
  addCustomItem,
  onAddItemCreated,
  companyId,
  newItemIdForFocus,
  onClearNewItemFocus,
  onOpenDatePicker,
}) {
  const { categoryId, categoryName, items } = category;
  const metrics = computeSectionMetrics(items);
  const statusPresentation = deriveSectionStatusPresentation(metrics);
  const nextSortOrder = Math.max(0, ...items.map((i) => i.sortOrder ?? 0)) + 1;

  const handleAddItem = async () => {
    const id = await addCustomItem({
      categoryId,
      categoryName,
      categorySortOrder: category.categorySortOrder ?? 999,
      title: 'Ny punkt',
      sortOrder: nextSortOrder,
    });
    if (id && onAddItemCreated) onAddItemCreated(id);
  };

  return (
    <View style={[styles.categorySection, SHADOW]}>
      <View style={styles.categorySectionHeader}>
        <Pressable onPress={onToggle} style={styles.categorySectionHeaderLeft}>
          <View style={[styles.categoryChevronWrap, expanded && styles.categoryChevronExpanded]}>
            <Ionicons name="chevron-down" size={16} color="#475569" />
          </View>
          <Text style={styles.categorySectionTitle} numberOfLines={1}>{categoryName}</Text>
        </Pressable>

        <View style={styles.categorySectionHeaderCenter}>
          <View style={[styles.categoryHeaderProgressTrack, { backgroundColor: statusPresentation.track }]}>
            <View
              style={[
                styles.categoryHeaderProgressFill,
                {
                  width: `${Math.max(0, Math.min(100, statusPresentation.progressPct || 0))}%`,
                  backgroundColor: statusPresentation.bar,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.categorySectionHeaderRight}>
          <Text
            style={[styles.categoryHeaderStatusText, { color: statusPresentation.color }]}
            numberOfLines={1}
          >
            {statusPresentation.text}
          </Text>
        </View>
      </View>
      {expanded ? (
        <View style={styles.categorySectionBody}>
          <View style={styles.categorySectionBodyTopRow}>
            <Pressable onPress={handleAddItem} style={styles.addPointBtn}>
              <Ionicons name="add" size={14} color={NAVY} />
              <Text style={styles.addPointBtnText}>Lägg till punkt</Text>
            </Pressable>
          </View>
          <GridColumnHeader />
          {items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              updateItem={updateItem}
              setItemHidden={setItemHidden}
              companyId={companyId}
              newItemIdForFocus={newItemIdForFocus}
              onClearNewItemFocus={onClearNewItemFocus}
              onOpenDatePicker={onOpenDatePicker}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ChecklistaView({ projectId, companyId, project, hidePageHeader }) {
  const effectiveProjectId = projectId || project?.id;
  const effectiveCompanyId = companyId || project?.companyId;
  const {
    persistedData,
    draftData,
    isDirty,
    setPersistedFromBackend,
    registerCommitAdapter,
    commitItemPatch,
  } = useChecklistEdit();
  const {
    items,
    byCategory,
    totalProgress,
    categoryProgress,
    mandatoryIncomplete,
    mandatoryTotal,
    totalRequired,
    completedRequired,
    progressPercent,
    isReadyForAnbud,
    loading,
    loadError,
    ensureSeeded,
    updateItem,
    setItemHidden,
    addCustomItem,
    addCategoryAndItem,
  } = useProjectChecklist(effectiveCompanyId, effectiveProjectId, 'kalkylskede');

  // Adapter so the context can commit patches (used by Save & leave and per-field commits).
  useEffect(() => {
    registerCommitAdapter(async (itemId, patch) => {
      await updateItem(itemId, patch);
    });
    return () => registerCommitAdapter(null);
  }, [registerCommitAdapter, updateItem]);

  // Sync persisted baseline from backend snapshot.
  const backendPersistedSnapshot = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const map = {};
    for (const it of list) {
      if (!it?.id) continue;
      if (it?.isHidden) continue;
      const assignedTo = Array.isArray(it.assignedTo)
        ? it.assignedTo.filter(Boolean)
        : (it.assignedTo ? [it.assignedTo].filter(Boolean) : (it.responsibleUserId ? [it.responsibleUserId] : []));
      map[String(it.id)] = {
        status: it.status ?? 'pending',
        dueDate: it.dueDate ?? null,
        assignedTo,
        comment: it.comment ?? null,
        title: it.title ?? null,
        customTitle: it.customTitle ?? null,
      };
    }
    return map;
  }, [items]);

  useEffect(() => {
    setPersistedFromBackend(backendPersistedSnapshot);
  }, [backendPersistedSnapshot, setPersistedFromBackend]);

  const [openCategoryId, setOpenCategoryId] = useState(null);
  const [addCategoryModal, setAddCategoryModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState(null);
  const [datePickerForItemId, setDatePickerForItemId] = useState(null);
  const [newItemIdForFocus, setNewItemIdForFocus] = useState(null);
  const hasAutoSeededRef = useRef(false);

  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);
  const prevCategoryCompletionRef = useRef({});
  const hasInitializedCategoryCompletionRef = useRef(false);
  const prevReadyRef = useRef(false);
  const hasInitializedReadyRef = useRef(false);

  const showToast = (message) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  };

  const hasSetInitialOpenRef = useRef(false);
  useEffect(() => {
    if (byCategory.length === 0) {
      hasSetInitialOpenRef.current = false;
      return;
    }
    if (!hasSetInitialOpenRef.current) {
      hasSetInitialOpenRef.current = true;
      setOpenCategoryId(byCategory[0].categoryId);
    }
  }, [byCategory]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryFirstItem, setNewCategoryFirstItem] = useState('');

  // Återställ auto-seed när projekt/company byts
  useEffect(() => {
    hasAutoSeededRef.current = false;
  }, [effectiveCompanyId, effectiveProjectId]);

  // Auto-skapa standardchecklista vid första öppning när listan är tom
  useEffect(() => {
    const cid = String(effectiveCompanyId || '').trim();
    const pid = String(effectiveProjectId || '').trim();
    if (!cid || !pid || loading || loadError || byCategory.length > 0) return;
    if (hasAutoSeededRef.current) return;
    hasAutoSeededRef.current = true;
    setSeedError(null);
    setSeeding(true);
    ensureSeeded()
      .then(() => { setSeeding(false); })
      .catch((err) => {
        console.warn('[ChecklistaView] auto ensureSeeded:', err);
        setSeedError(err?.message || 'Kunde inte skapa checklista');
        setSeeding(false);
        hasAutoSeededRef.current = false;
      });
  }, [effectiveCompanyId, effectiveProjectId, loading, loadError, byCategory.length, ensureSeeded]);

  const handleLoadSystemChecklist = async () => {
    hasAutoSeededRef.current = false;
    setSeedError(null);
    setSeeding(true);
    try {
      await ensureSeeded();
    } catch (err) {
      console.warn('[ChecklistaView] handleLoadSystemChecklist:', err);
      setSeedError(err?.message || 'Kunde inte skapa checklista');
    } finally {
      setSeeding(false);
    }
  };

  const toggleCategory = (categoryId) => {
    setOpenCategoryId(categoryId);
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const allVisibleItems = useMemo(() => byCategory.flatMap((c) => c.items || []), [byCategory]);
  const globalMetrics = useMemo(() => computeSectionMetrics(allVisibleItems), [allVisibleItems]);

  const categoryCompletionSnapshot = useMemo(() => {
    const snapshot = {};
    for (const cat of byCategory) {
      const m = computeSectionMetrics(cat.items || []);
      snapshot[cat.categoryId] = {
        categoryName: cat.categoryName,
        isComplete: m.total > 0 && m.done >= m.total,
      };
    }
    return snapshot;
  }, [byCategory]);

  useEffect(() => {
    if (!hasInitializedCategoryCompletionRef.current) {
      hasInitializedCategoryCompletionRef.current = true;
      prevCategoryCompletionRef.current = Object.fromEntries(
        Object.entries(categoryCompletionSnapshot).map(([id, v]) => [id, Boolean(v?.isComplete)])
      );
      return;
    }

    const prev = prevCategoryCompletionRef.current || {};
    for (const [id, v] of Object.entries(categoryCompletionSnapshot)) {
      if (v?.isComplete && !prev[id]) {
        showToast(`${v.categoryName || 'Sektion'} är nu komplett`);
      }
    }
    prevCategoryCompletionRef.current = Object.fromEntries(
      Object.entries(categoryCompletionSnapshot).map(([id, v]) => [id, Boolean(v?.isComplete)])
    );
  }, [categoryCompletionSnapshot]);

  useEffect(() => {
    if (!hasInitializedReadyRef.current) {
      hasInitializedReadyRef.current = true;
      prevReadyRef.current = Boolean(isReadyForAnbud);
      return;
    }
    if (Boolean(isReadyForAnbud) && !prevReadyRef.current) {
      showToast('🟢 Redo för anbud');
    }
    prevReadyRef.current = Boolean(isReadyForAnbud);
  }, [isReadyForAnbud]);

  const datePickerItem = useMemo(() => {
    if (!datePickerForItemId) return null;
    for (const cat of byCategory) {
      const it = cat.items.find((i) => i.id === datePickerForItemId);
      if (it) return it;
    }
    return null;
  }, [byCategory, datePickerForItemId]);

  const datePickerValue = useMemo(() => {
    if (!datePickerForItemId) return '';
    const d = draftData?.[datePickerForItemId]?.dueDate;
    if (typeof d === 'string') return d;
    return String(datePickerItem?.dueDate || '');
  }, [datePickerForItemId, draftData, datePickerItem]);

  const handleAddCategory = async () => {
    const name = String(newCategoryName || '').trim();
    const first = String(newCategoryFirstItem || '').trim();
    if (!name) return;
    await addCategoryAndItem(name, first || 'Ny punkt');
    setNewCategoryName('');
    setNewCategoryFirstItem('');
    setAddCategoryModal(false);
  };

  if (loading && byCategory.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Laddar checklista...</Text>
      </View>
    );
  }

  if (seeding && byCategory.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Skapar standardchecklista...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(loadError || seedError) ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#B45309" />
          <Text style={styles.errorBannerText}>{loadError || seedError}</Text>
          <Pressable
            onPress={() => {
              setSeedError(null);
              handleLoadSystemChecklist();
            }}
            style={styles.errorBannerBtn}
          >
            <Text style={styles.errorBannerBtnText}>Skapa checklista</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.stickyHeader}>
        <View style={[styles.globalStatusCard, SHADOW]}>
          <View style={styles.globalStatusRow}>
            <Text style={styles.globalStatusLeftText}>
              {globalMetrics.done} / {globalMetrics.total} klara
            </Text>
            <View style={styles.globalStatusRight}>
              {globalMetrics.missingRequired > 0 ? (
                <Text style={styles.globalStatusMissingText}>
                  🔴 {globalMetrics.missingRequired} obligatoriska saknas
                </Text>
              ) : byCategory.length > 0 ? (
                <Text style={styles.globalStatusReadyText}>🟢 Redo för anbud</Text>
              ) : null}
              <View style={styles.saveIndicator}>
                <View style={[styles.saveDot, isDirty ? styles.saveDotDirty : styles.saveDotSaved]} />
                <Text style={[styles.saveIndicatorText, isDirty ? styles.saveIndicatorTextDirty : styles.saveIndicatorTextSaved]}>
                  {isDirty ? 'Ospard ändring' : 'Sparad'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.globalStatusBarWrap}>
            <ChecklistProgressBar progress={globalMetrics.progressPct} height={4} />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {byCategory.length === 0 ? (
          <View style={[styles.emptyStateCard, SHADOW]}>
            <Ionicons name="list-outline" size={48} color="#94a3b8" style={styles.emptyStateIcon} />
            <Text style={styles.emptyStateTitle}>Ingen checklista än</Text>
            <Text style={styles.emptyStateText}>
              Ladda systemets standardchecklista för anbudsprocessen med fördefinierade kategorier och punkter (Förfrågningsunderlag, Företagsbeslut, Tider & Möten, Inför anbudslämning, Uppföljning). Du kan sedan lägga till egna punkter och kategorier.
            </Text>
            <Pressable
              onPress={handleLoadSystemChecklist}
              disabled={seeding}
              style={[styles.loadSystemChecklistBtn, SHADOW]}
            >
              {seeding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={22} color="#fff" />
                  <Text style={styles.loadSystemChecklistBtnText}>Ladda systemets standardchecklista</Text>
                </>
              )}
            </Pressable>
            <View style={styles.emptyStateDivider} />
            <Text style={styles.emptyStateOr}>eller</Text>
            <Pressable onPress={() => setAddCategoryModal(true)} style={styles.addCategoryLink}>
              <Text style={styles.addCategoryLinkText}>Lägg till egen kategori från början</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {byCategory.map((cat) => (
              <CategorySection
                key={cat.categoryId}
                category={cat}
                expanded={openCategoryId === cat.categoryId}
                onToggle={() => toggleCategory(cat.categoryId)}
                updateItem={updateItem}
                setItemHidden={setItemHidden}
                addCustomItem={addCustomItem}
                onAddItemCreated={setNewItemIdForFocus}
                companyId={effectiveCompanyId}
                newItemIdForFocus={newItemIdForFocus}
                onClearNewItemFocus={() => setNewItemIdForFocus(null)}
                onOpenDatePicker={setDatePickerForItemId}
              />
            ))}
            <Pressable onPress={() => setAddCategoryModal(true)} style={styles.addCategoryBtn}>
              <Ionicons name="folder-open-outline" size={20} color="#1976D2" />
              <Text style={styles.addCategoryBtnText}>Lägg till kategori</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {toastMessage ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={[styles.toastCard, SHADOW]}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}

      {addCategoryModal ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, SHADOW]}>
            <Text style={styles.modalTitle}>Ny kategori</Text>
            <TextInput
              style={styles.modalInput}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="Kategorinamn"
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={styles.modalInput}
              value={newCategoryFirstItem}
              onChangeText={setNewCategoryFirstItem}
              placeholder="Första punkten (valfritt)"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddCategoryModal(false)} style={styles.modalBtnSecondary}>
                <Text style={styles.modalBtnSecondaryText}>Avbryt</Text>
              </Pressable>
              <Pressable onPress={handleAddCategory} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryText}>Lägg till</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <IsoDatePickerModal
        visible={!!datePickerForItemId}
        title="Välj datum"
        value={datePickerValue}
        onSelect={async (iso) => {
          const id = datePickerForItemId;
          setDatePickerForItemId(null);
          if (!id) return;
          const next = String(iso || '').trim() || null;
          await commitItemPatch(id, { dueDate: next });
        }}
        onClose={() => setDatePickerForItemId(null)}
        onDelete={
          datePickerForItemId
            ? () => {
                const id = datePickerForItemId;
                setDatePickerForItemId(null);
                if (id) commitItemPatch(id, { dueDate: null });
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#f1f5f9',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  stickyHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 0,
  },
  totalProgressRow: {},
  totalProgressTitle: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  totalProgressReady: {
    color: '#16A34A',
    fontWeight: '500',
  },
  totalProgressWarning: {
    color: '#B45309',
    fontWeight: '500',
  },
  totalProgressBarWrap: {
    height: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#991B1B',
  },
  errorBannerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  errorBannerBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    minWidth: 0,
  },
  progressLabel: {
    fontSize: 12,
    color: '#64748b',
    minWidth: 32,
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  categorySection: {
    backgroundColor: '#fff',
    borderRadius: CARD_RADIUS,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    ...(Platform.OS === 'web' ? { overflow: 'visible' } : { overflow: 'hidden' }),
  },
  categorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  categorySectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  categorySectionHeaderCenter: {
    flex: 1,
    minWidth: 80,
    justifyContent: 'center',
  },
  categorySectionHeaderRight: {
    minWidth: 160,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  categoryChevronWrap: {
    transform: [{ rotate: '-90deg' }],
  },
  categoryChevronExpanded: {
    transform: [{ rotate: '0deg' }],
  },
  categorySectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  categoryHeaderProgressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  categoryHeaderProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  categoryHeaderStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addPointBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 27, 45, 0.06)',
  },
  addPointBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
  },
  categorySectionBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 12,
  },
  categorySectionBodyTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 10,
    paddingBottom: 6,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    ...(Platform.OS === 'web'
      ? {
          display: 'grid',
          gridTemplateColumns: GRID_COLUMNS,
          gap: '0 10px',
        }
      : {
          paddingVertical: 6,
          gap: 10,
        }),
  },
  gridHeaderRow: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
    minHeight: 32,
  },
  gridHeaderCellTitle: {
    flex: 1.35,
    minWidth: 0,
    ...(Platform.OS === 'web' ? { gridColumn: 1 } : {}),
  },
  gridHeaderCellObl: {
    width: 48,
    minWidth: 48,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { gridColumn: 2, justifySelf: 'center' } : {}),
  },
  gridHeaderCellDate: {
    width: 130,
    minWidth: 130,
    ...(Platform.OS === 'web' ? { gridColumn: 3 } : {}),
  },
  gridHeaderCellResponsible: {
    width: 180,
    minWidth: 180,
    ...(Platform.OS === 'web' ? { gridColumn: 4 } : {}),
  },
  gridHeaderCellComment: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? { gridColumn: 5 } : {}),
  },
  gridHeaderCellStatus: {
    width: 140,
    minWidth: 140,
    alignItems: 'flex-end',
    ...(Platform.OS === 'web' ? { gridColumn: 6, justifySelf: 'end' } : {}),
  },
  gridHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' ? { textTransform: 'uppercase' } : {}),
  },
  gridHeaderStatus: {
    textAlign: 'right',
  },
  gridDataRow: {
    ...(Platform.OS === 'web'
      ? { transition: 'background-color 0.12s ease' }
      : {}),
  },
  gridRowHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.025)',
  },
  gridCellTitle: {
    flex: 1.35,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    ...(Platform.OS === 'web' ? { gridColumn: 1, minWidth: 0 } : {}),
  },
  gridCellObl: {
    width: 48,
    minWidth: 48,
    maxWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { gridColumn: 2, justifySelf: 'center' } : {}),
  },
  oblPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.20)',
  },
  oblPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
    letterSpacing: 0.3,
  },
  oblDash: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  gridCellDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 130,
    minWidth: 130,
    maxWidth: 130,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { gridColumn: 3 } : {}),
  },
  gridCellDateText: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  gridCellResponsible: {
    width: 180,
    minWidth: 180,
    maxWidth: 180,
    ...(Platform.OS === 'web' ? { gridColumn: 4 } : {}),
  },
  gridCellComment: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? { gridColumn: 5, minWidth: 0 } : {}),
  },
  gridCellCommentBtn: {
    padding: 2,
  },
  gridCellStatus: {
    width: 140,
    minWidth: 140,
    maxWidth: 140,
    alignItems: 'flex-end',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { gridColumn: 6, justifySelf: 'end' } : {}),
  },
  itemRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.04)',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : {}),
  },
  itemRowDone: {},
  itemRowStatus: {
    minWidth: 110,
    flexShrink: 0,
    position: 'relative',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeWrap: {
    position: 'relative',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 27, 45, 0.08)',
    minWidth: 100,
  },
  statusBadgePending: {
    backgroundColor: 'rgba(15, 27, 45, 0.06)',
  },
  statusBadgeDone: {
    backgroundColor: 'rgba(22, 163, 74, 0.14)',
  },
  statusBadgeNA: {
    backgroundColor: '#f1f5f9',
  },
  statusBadgeInProgress: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  statusBadgeTextDone: {
    color: '#166534',
  },
  dropdownModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
    padding: 0,
  },
  statusDropdownModalCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    minWidth: 180,
    ...SHADOW,
  },
  statusDropdownInline: {
    zIndex: 10001,
  },
  statusDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  statusDropdownDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDropdownOptionText: {
    fontSize: 13,
    color: '#334155',
  },
  itemRowTitleInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    minWidth: 60,
  },
  itemRowCustomIcon: {
    marginRight: 2,
  },
  itemRowTitleText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    flex: 1,
    minWidth: 0,
  },
  itemRowTitleTextDone: {
    color: '#64748b',
    textDecorationLine: 'line-through',
  },
  itemRowMandatory: {
    fontSize: 8,
    color: '#94a3b8',
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  itemRowHideBtn: {
    padding: 2,
    marginLeft: 4,
  },
  itemRowCommentBlock: {
    position: 'relative',
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  mentionDropdownScroll: {
    maxHeight: 220,
  },
  mentionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(248, 250, 252, 0.94)',
  },
  mentionModalCard: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    overflow: 'hidden',
    ...SHADOW,
    zIndex: 100000,
  },
  mentionOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  mentionOptionText: {
    fontSize: 13,
    color: '#334155',
  },
  mentionBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  mentionBadge: {
    backgroundColor: 'rgba(15, 27, 45, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mentionBadgeText: {
    fontSize: 12,
    color: NAVY,
    fontWeight: '500',
  },
  itemRowCommentInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: RADIUS,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#334155',
    backgroundColor: '#fff',
    minHeight: 56,
    textAlignVertical: 'top',
  },
  itemRowCommentInputSingle: {
    minHeight: 32,
    paddingVertical: 4,
    fontSize: 12,
  },

  globalStatusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  globalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  globalStatusLeftText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  globalStatusRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  globalStatusMissingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  globalStatusReadyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },
  saveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  saveDotSaved: {
    backgroundColor: '#16a34a',
  },
  saveDotDirty: {
    backgroundColor: '#f59e0b',
  },
  saveIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  saveIndicatorTextSaved: {
    color: '#16a34a',
  },
  saveIndicatorTextDirty: {
    color: '#b45309',
  },
  globalStatusBarWrap: {
    marginTop: 8,
  },

  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  toastCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    maxWidth: 520,
    width: '100%',
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  responsibleWrap: {
    position: 'relative',
    minWidth: 0,
    flex: 1,
  },
  responsibleTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minHeight: 28,
  },
  responsibleAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  avatarTextCompact: {
    fontSize: 9,
    fontWeight: '600',
    color: '#fff',
  },
  avatarCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 27, 45, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
  },
  responsibleTriggerPlaceholder: {
    fontSize: 11,
    color: '#94a3b8',
  },
  responsibleOptionSelected: {
    backgroundColor: 'rgba(15, 27, 45, 0.06)',
  },
  responsibleSearch: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: RADIUS,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#334155',
    margin: 10,
    marginBottom: 4,
  },
  responsibleDropdownModalCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    width: 280,
    maxHeight: 320,
    ...SHADOW,
  },
  responsibleDropdownScroll: {
    maxHeight: 240,
  },
  responsibleOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  responsibleOptionText: {
    fontSize: 13,
    color: '#334155',
  },
  emptyStateCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS,
    padding: 28,
    marginBottom: 16,
  },
  emptyStateIcon: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  loadSystemChecklistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  loadSystemChecklistBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  emptyStateDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 20,
  },
  emptyStateOr: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 12,
  },
  addCategoryLink: {
    alignSelf: 'center',
  },
  addCategoryLinkText: {
    fontSize: 14,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: RADIUS,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  addCategoryBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1e293b',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    color: '#64748b',
  },
  modalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
