/**
 * Phase Left Panel - Navigation panel for kalkylskede
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ProjectSidebarHeader } from '../../../../../components/common/ProjectSidebarHeader';
import SidebarItem from '../../../../../components/common/SidebarItem';
import { AnimatedChevron, MicroPulse } from '../../../../../components/common/leftNavMicroAnimations';
import { auth } from '../../../../../components/firebase';
import { SIDEBAR_BG, SIDEBAR_BORDER_COLOR, SIDEBAR_PHASE_WIDTH } from '../../../../../components/common/layoutConstants';
import { LEFT_NAV } from '../../../../../constants/leftNavTheme';
import { useProjectOrganisation } from '../../../../../hooks/useProjectOrganisation';
import { useProjectTimelineDates } from '../../../../../hooks/useProjectTimelineDates';
import { ensureFolderPath } from '../../../../../services/azure/fileService';
import { loadFolderChildren } from '../../../../../services/azure/hierarchyService';
import { getAppVersion } from '../../../../../utils/appVersion';
import { stripNumberPrefixForDisplay } from '../../../../../utils/labelUtils';
import { listenFragaSvarItems } from '../services/fragaSvarService';
import { addItem, addSection, removeItem, removeSection } from '../services/navigationService';

const appVersion = getAppVersion();

export default function PhaseLeftPanel({
  navigation,
  activeSection,
  activeItem,
  onSelectSection,
  onSelectItem,
  projectName,
  companyId,
  project,
  loadNavigation,
  saveNavigation
}) {
  const isWeb = Platform.OS === 'web';
  // Samma utseende som startsidans vänsterpanel: rundade hörn, blå vänsterkant vid aktiv.
  const rowIndentMode = isWeb ? 'padding' : 'margin';
  const [canEdit, setCanEdit] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedNestedItems, setExpandedNestedItems] = useState({});
  const [hoveredKey, setHoveredKey] = useState(null);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [targetSectionIdForItem, setTargetSectionIdForItem] = useState(null);
  const [targetParentItemIdForItem, setTargetParentItemIdForItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const [sharePointTree, setSharePointTree] = useState([]);
  const [spToggleTickByPath, setSpToggleTickByPath] = useState({});

  const projectId = String(project?.id || project?.projectId || '').trim();

  // Content signals (common hasContent/isPopulated map)
  const [fragaSvarCount, setFragaSvarCount] = useState(0);
  const timeline = useProjectTimelineDates({ companyId, projectId });
  const organisation = useProjectOrganisation({ companyId, projectId });

  const projectBasePathRaw =
    project?.path ||
    project?.sharePointPath ||
    project?.projectPath ||
    project?.sharepointPath ||
    project?.sharePointProjectPath ||
    '';

  const hasSharePointContext = Boolean(companyId && String(projectBasePathRaw || '').trim());

  const hasOrganisationMembers = React.useMemo(() => {
    const groups = Array.isArray(organisation?.organisation?.groups)
      ? organisation.organisation.groups
      : Array.isArray(organisation?.groups)
        ? organisation.groups
        : [];
    return groups.some((g) => Array.isArray(g?.members) && g.members.length > 0);
  }, [organisation]);

  useEffect(() => {
    if (!companyId || !projectId) {
      setFragaSvarCount(0);
      return;
    }
    let unsub = null;
    try {
      unsub = listenFragaSvarItems(
        companyId,
        projectId,
        (items) => setFragaSvarCount(Array.isArray(items) ? items.length : 0),
        (_err) => setFragaSvarCount(0),
        { includeDeleted: false },
      );
    } catch (_e) {
      setFragaSvarCount(0);
      unsub = null;
    }

    return () => {
      try { unsub?.(); } catch (_e) {}
    };
  }, [companyId, projectId]);

  const hasProjectInfoContent = React.useMemo(() => {
    const p = project && typeof project === 'object' ? project : {};
    const nonEmpty = (v) => {
      if (v === null || v === undefined) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'boolean') return v === true;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return false;
    };

    // Heuristics: treat commonly edited project-info fields as content.
    const fields = [
      'ansvarig',
      'ansvarigId',
      'bestallare',
      'beställare',
      'entreprenadform',
      'adress',
      'projektadress',
      'projectAddress',
      'kommun',
      'ort',
      'projektTyp',
      'projekttyp',

      // Important dates synced from Projektinformation
      'lastQuestionDate',
      'tenderSubmissionDate',
      'plannedConstructionStart',
      'readyForInspectionDate',
      // Legacy Swedish mirrors
      'sistaDagForFragor',
      'anbudsinlamning',
      'planeradByggstart',
      'klartForBesiktning',
      'anbudstid',
      'byggstart',
      'fardigstallning',
    ];

    return fields.some((k) => nonEmpty(p?.[k]));
  }, [project]);

  const hasTimelineContent = React.useMemo(() => {
    const d = timeline?.data;
    const customDates = Array.isArray(d?.customDates) ? d.customDates : [];
    const siteVisits = Array.isArray(d?.siteVisits) ? d.siteVisits : [];
    return customDates.length > 0 || siteVisits.length > 0;
  }, [timeline?.data]);

  const nodeHasContent = React.useCallback(
    (sectionId, itemId = null) => {
      const sec = String(sectionId || '').trim();
      const it = itemId != null ? String(itemId).trim() : '';

      // Oversikt items (known saved-data sources)
      if (sec === 'oversikt' && it === 'projektinfo') return hasProjectInfoContent;
      if (sec === 'oversikt' && it === 'organisation-roller') return hasOrganisationMembers;
      if (sec === 'oversikt' && it === 'tidsplan-viktiga-datum') return hasTimelineContent;
      if (sec === 'oversikt' && it === 'status-beslut') return Number(fragaSvarCount || 0) > 0;

      if (sec === 'oversikt' && !it) {
        return Boolean(hasProjectInfoContent || hasOrganisationMembers || hasTimelineContent || Number(fragaSvarCount || 0) > 0);
      }

      return false;
    },
    [fragaSvarCount, hasOrganisationMembers, hasProjectInfoContent, hasTimelineContent],
  );

  const normalizePath = (path) => {
    if (!path || typeof path !== 'string') return '';
    return path
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/');
  };

  const updateTreeByPath = (nodes, targetPath, updater) => {
    return nodes.map((node) => {
      if (!node) return node;
      if (node.path === targetPath) {
        return updater(node);
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        return {
          ...node,
          children: updateTreeByPath(node.children, targetPath, updater),
        };
      }
      return node;
    });
  };

  const findNodeByPath = (nodes, targetPath) => {
    for (const node of nodes) {
      if (!node) continue;
      if (node.path === targetPath) return node;
      if (Array.isArray(node.children) && node.children.length > 0) {
        const found = findNodeByPath(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const handleToggleSharePointFolder = async (folderPath, sectionId = null) => {
    const normalizedPath = normalizePath(folderPath);
    if (!normalizedPath) return;

    // Micro-feedback: bump chevron/icon animation once per click.
    setSpToggleTickByPath((prev) => ({ ...(prev || {}), [normalizedPath]: (prev?.[normalizedPath] || 0) + 1 }));

    // NOTE: structure handling must never trigger navigation (separation of concerns).

    let willExpand = false;
    let shouldLoad = false;
    setSharePointTree((prev) => {
      const snapshot = findNodeByPath(prev, normalizedPath);
      if (!snapshot) return prev;

      willExpand = !snapshot.expanded;
      shouldLoad = Boolean(willExpand && !snapshot.childrenLoaded && !snapshot.loading);

      return updateTreeByPath(prev, normalizedPath, (node) => ({
        ...node,
        expanded: willExpand,
      }));
    });

    if (!willExpand || !shouldLoad) return;

    setSharePointTree((prev) =>
      updateTreeByPath(prev, normalizedPath, (node) => ({ ...node, loading: true, error: null }))
    );

    try {
      const loadAndSort = async (pathToLoad) => {
        const children = await loadFolderChildren(companyId, pathToLoad, 1);
        return Array.isArray(children)
          ? [...children].sort((a, b) =>
              (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' })
            )
          : [];
      };

      let sorted = await loadAndSort(normalizedPath);

      // If a section folder is empty, it can be because:
      // 1) Folder does not exist (Graph returns 404 -> []), or
      // 2) Structure was created without numeric prefixes, or
      // 3) Item subfolders were never created.
      // Try a fallback path without numeric prefix for the last segment.
      if (sorted.length === 0 && sectionId) {
        const segments = normalizedPath.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        const strippedLast = String(last).replace(/^\d+\s*-\s*/, '').trim();
        if (strippedLast && strippedLast !== last) {
          const altPath = [...segments.slice(0, -1), strippedLast].join('/');
          const altSorted = await loadAndSort(altPath);
          if (altSorted.length > 0) {
            // Swap to the existing folder path so future expands work.
            setSharePointTree((prev) =>
              updateTreeByPath(prev, normalizedPath, (node) => ({
                ...node,
                path: altPath,
              }))
            );
            sorted = altSorted;
          }
        }
      }

      // If still empty and we know this is a top-level section, auto-create missing item folders once.
      if (sorted.length === 0 && sectionId) {
        let snapshot = null;
        setSharePointTree((prev) => {
          snapshot = findNodeByPath(prev, normalizedPath);
          return prev;
        });

        const alreadyTried = Boolean(snapshot?.repairAttempted);
        const section = (navigation?.sections || []).find((s) => String(s?.id || '') === String(sectionId || ''));
        const sectionItems = Array.isArray(section?.items) ? section.items.filter((it) => it && it.enabled !== false) : [];

        if (!alreadyTried && sectionItems.length > 0) {
          setSharePointTree((prev) =>
            updateTreeByPath(prev, normalizedPath, (node) => ({ ...node, repairAttempted: true }))
          );

          const base = normalizedPath;
          await Promise.allSettled(
            sectionItems.map((it) => {
              const name = String(it?.name || '').trim();
              if (!name) return Promise.resolve();
              const p = normalizePath(`${base}/${name}`);
              return ensureFolderPath(p, companyId, null, { siteRole: 'projects' });
            })
          );

          // Reload after repair attempt
          sorted = await loadAndSort(normalizedPath);
        }
      }

      setSharePointTree((prev) =>
        updateTreeByPath(prev, normalizedPath, (node) => ({
          ...node,
          loading: false,
          error: null,
          childrenLoaded: true,
          children: sorted,
        }))
      );
    } catch (e) {
      setSharePointTree((prev) =>
        updateTreeByPath(prev, normalizedPath, (node) => ({
          ...node,
          loading: false,
          error: e?.message || 'Kunde inte ladda undermappar',
        }))
      );
    }
  };

  const collapseSharePointSubtreeByPath = React.useCallback((nodes, targetPath) => {
    const t = normalizePath(targetPath);
    const deepCollapse = (n) => {
      if (!n || typeof n !== 'object') return n;
      return {
        ...n,
        expanded: false,
        children: Array.isArray(n.children) ? n.children.map(deepCollapse) : [],
      };
    };

    const walk = (list) =>
      (Array.isArray(list) ? list : []).map((n) => {
        if (!n) return n;
        const p = normalizePath(n.path);
        if (p === t) return deepCollapse(n);
        if (Array.isArray(n.children) && n.children.length > 0) {
          return { ...n, children: walk(n.children) };
        }
        return n;
      });

    return walk(nodes);
  }, []);

  const handleSharePointStructureToggle = React.useCallback(async (folderPath) => {
    const normalizedPath = normalizePath(folderPath);
    if (!normalizedPath) return;

    let willExpand = false;
    let shouldLoad = false;

    // Micro-feedback: bump chevron/icon animation once per structure action.
    setSpToggleTickByPath((prev) => ({ ...(prev || {}), [normalizedPath]: (prev?.[normalizedPath] || 0) + 1 }));

    setSharePointTree((prev) => {
      const snapshot = findNodeByPath(prev, normalizedPath);
      if (!snapshot) return prev;

      willExpand = !snapshot.expanded;
      shouldLoad = Boolean(willExpand && !snapshot.childrenLoaded);

      if (!willExpand) {
        // Collapsing: close subtree recursively.
        return collapseSharePointSubtreeByPath(prev, normalizedPath);
      }

      return updateTreeByPath(prev, normalizedPath, (node) => ({
        ...node,
        expanded: true,
      }));
    });

    if (!willExpand) return;
    if (!shouldLoad) return;

    // Expand + lazy-load
    try {
      setSharePointTree((prev) =>
        updateTreeByPath(prev, normalizedPath, (node) => ({
          ...node,
          loading: true,
          error: null,
        }))
      );

      await ensureFolderPath(normalizedPath, companyId, null, { siteRole: 'projects', strict: false });
      const children = await loadFolderChildren(companyId, normalizedPath);
      const folders = (Array.isArray(children) ? children : [])
        .filter((c) => c && (c.type === 'folder' || !c.type))
        .map((c) => ({
          id: String(c.id || c.name || ''),
          name: String(c.name || 'Mapp'),
          type: 'folder',
          path: normalizePath(String(c.path || `${normalizedPath}/${c.name || ''}`)),
          sectionId: null,
          expanded: false,
          loading: false,
          error: null,
          childrenLoaded: false,
          children: [],
        }))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));

      setSharePointTree((prev) =>
        updateTreeByPath(prev, normalizedPath, (node) => ({
          ...node,
          loading: false,
          error: null,
          childrenLoaded: true,
          children: folders,
        }))
      );
    } catch (e) {
      setSharePointTree((prev) =>
        updateTreeByPath(prev, normalizedPath, (node) => ({
          ...node,
          loading: false,
          error: e?.message || 'Kunde inte ladda undermappar',
          childrenLoaded: true,
          children: Array.isArray(node.children) ? node.children : [],
        }))
      );
    }
  }, [collapseSharePointSubtreeByPath, companyId, findNodeByPath, loadFolderChildren, normalizePath, updateTreeByPath]);

  useEffect(() => {
    if (!hasSharePointContext || !navigation?.sections?.length) {
      setSharePointTree([]);
      return;
    }

    const basePath = normalizePath(String(projectBasePathRaw || ''));
    if (!basePath) {
      setSharePointTree([]);
      return;
    }

    const calcSortKey = (section) => {
      const numOrder = Number(section?.order);
      if (Number.isFinite(numOrder) && numOrder > 0) return numOrder;
      return 10_000;
    };

    const sortedSections = [...navigation.sections].sort((a, b) => {
      const ak = calcSortKey(a);
      const bk = calcSortKey(b);
      if (ak !== bk) return ak - bk;
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
    });

    const rootNodes = sortedSections.map((section) => {
      const sectionName = String(section?.name || '').trim();
      const sectionPath = normalizePath(`${basePath}/${sectionName}`);
      return {
        id: `section:${section.id}`,
        name: sectionName,
        type: 'folder',
        path: sectionPath,
        sectionId: section.id,
        expanded: false,
        loading: false,
        error: null,
        childrenLoaded: false,
        children: [],
      };
    });

    setSharePointTree(rootNodes);
  }, [hasSharePointContext, project?.path, navigation]);

  const renderSharePointNode = (node, level = 0) => {
    const treeIndent = LEFT_NAV.indentPerLevel + level * LEFT_NAV.indentPerLevel;
    const isExpanded = Boolean(node?.expanded);
    const hasChildren = Array.isArray(node?.children) && node.children.length > 0;
    const rowKey = `sp:${node?.path || node?.id || String(level)}`;
    const isHovered = isWeb && hoveredKey === rowKey;
    const iconColor = isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted;
    const textColor = isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault;
    const pulseTrigger = spToggleTickByPath?.[node?.path] || 0;

    return (
      <View key={node.path || node.id} style={{ marginTop: 2 }}>
        <SidebarItem
          indentMode={rowIndentMode}
          fullWidth
          style={{
            minHeight: LEFT_NAV.rowMinHeight,
            paddingVertical: LEFT_NAV.rowPaddingVertical,
          }}
          indent={isWeb ? treeIndent : 0}
          onPress={() => {
            // Single click: navigation ONLY
            if (node?.sectionId && onSelectSection) {
              onSelectSection(node.sectionId);
              if (onSelectItem) onSelectItem(node.sectionId, null);
            }
          }}
          onDoubleClick={
            () => {
              // Structure handling (no navigation)
              handleSharePointStructureToggle(node.path);
            }
          }
          onHoverIn={isWeb ? () => setHoveredKey(rowKey) : undefined}
          onHoverOut={isWeb ? () => setHoveredKey(null) : undefined}
          hovered={isHovered}
          left={() => (
            <>
              <TouchableOpacity
                onPress={(e) => {
                  try { e?.stopPropagation?.(); } catch (_e) {}
                  handleSharePointStructureToggle(node.path);
                }}
                style={{ marginRight: 6, padding: 2 }}
              >
                <AnimatedChevron expanded={isExpanded} outline size={LEFT_NAV.chevronSize} color={iconColor} />
              </TouchableOpacity>
              <MicroPulse trigger={pulseTrigger}>
                <Ionicons
                  name="folder-outline"
                  size={16}
                  color={iconColor}
                  style={{ marginRight: 8 }}
                />
              </MicroPulse>
            </>
          )}
          label={node.name}
          labelWeight={nodeHasContent(node.sectionId || '', null) ? '700' : undefined}
          labelStyle={{ fontSize: LEFT_NAV.rowFontSize, ...(isHovered ? { color: textColor } : {}) }}
          right={() => (Boolean(node.loading) ? <Text style={styles.spMeta}>Laddar…</Text> : null)}
        />

        {isExpanded && Boolean(node.error) && (
          <View style={{ marginLeft: 28, marginTop: 2 }}>
            <Text style={styles.spError}>{node.error}</Text>
          </View>
        )}

        {isExpanded && !node.loading && node.childrenLoaded && !hasChildren && (
          <View style={{ marginLeft: 28, marginTop: 2 }}>
            <Text style={styles.spEmpty}>Mappen är tom</Text>
          </View>
        )}

        {isExpanded && hasChildren && (
          <View style={{ marginTop: 2 }}>
            {node.children.map((child) => renderSharePointNode(child, level + 1))}
          </View>
        )}
      </View>
    );
  };

  // Check permissions - allow all company members to edit navigation
  useEffect(() => {
    if (!isWeb || !companyId) {
      setCanEdit(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        
        if (isEmailSuperadmin) {
          if (mounted) setCanEdit(true);
          return;
        }

        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const currentCompanyId = companyFromClaims || stored || '';
        
        // Any company member can edit navigation
        console.log('[PhaseLeftPanel] Permission check - currentCompanyId:', currentCompanyId, 'companyId:', companyId, 'match:', currentCompanyId === companyId);
        if (mounted && currentCompanyId && companyId && currentCompanyId === companyId) {
          setCanEdit(true);
        } else if (mounted) {
          setCanEdit(false);
        }
      } catch(_e) {
        console.error('[PhaseLeftPanel] Error checking permissions:', _e);
        if (mounted) setCanEdit(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [companyId]);

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const toggleSectionStructure = React.useCallback((sectionId) => {
    const sid = String(sectionId || '').trim();
    if (!sid) return;

    const wasExpanded = Boolean(expandedSections?.[sid]);

    setExpandedSections((prev) => {
      const cur = Boolean(prev?.[sid]);
      const next = { ...(prev || {}), [sid]: !cur };
      return next;
    });

    // If collapsing: recursively close nested items under this section.
    if (wasExpanded) {
      setExpandedNestedItems((prev) => {
        const next = { ...(prev || {}) };
        Object.keys(next).forEach((k) => {
          if (String(k).startsWith(`${sid}.`)) next[k] = false;
        });
        return next;
      });
    }
  }, [expandedSections]);

  const toggleNestedStructure = React.useCallback((sectionId, itemId) => {
    const sid = String(sectionId || '').trim();
    const iid = String(itemId || '').trim();
    if (!sid || !iid) return;
    const key = `${sid}.${iid}`;

    setExpandedNestedItems((prev) => ({
      ...(prev || {}),
      [key]: !prev?.[key],
    }));
  }, []);

  // When navigating from dashboard (e.g. calendar click), expand the target section so the sidebar shows as if user opened it
  useEffect(() => {
    if (!activeSection || !activeItem) return;
    setExpandedSections((prev) => {
      if (prev?.[activeSection]) return prev;
      return { ...(prev || {}), [activeSection]: true };
    });
  }, [activeSection, activeItem]);

  const handleAddSection = async () => {
    if (!newSectionName.trim() || !companyId || !loadNavigation) return;
    
    setSaving(true);
    try {
      const success = await addSection(companyId, null, 'kalkylskede', {
        name: newSectionName.trim(),
        icon: 'folder-outline'
      });
      
      if (success) {
        setNewSectionName('');
        setShowAddSectionModal(false);
        if (loadNavigation) {
          await loadNavigation();
        }
      } else {
        Alert.alert('Fel', 'Kunde inte lägga till sektion');
      }
    } catch (error) {
      console.error('[PhaseLeftPanel] Error adding section:', error);
      Alert.alert('Fel', `Kunde inte lägga till sektion: ${error.message || 'Okänt fel'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSection = async (sectionId) => {
    if (!companyId || !loadNavigation) return;
    
    Alert.alert(
      'Ta bort sektion',
      'Är du säker på att du vill ta bort denna sektion?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const success = await removeSection(companyId, null, 'kalkylskede', sectionId);
              if (success) {
                if (loadNavigation) {
                  await loadNavigation();
                }
              } else {
                Alert.alert('Fel', 'Kunde inte ta bort sektion');
              }
            } catch (error) {
              console.error('[PhaseLeftPanel] Error removing section:', error);
              Alert.alert('Fel', `Kunde inte ta bort sektion: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !companyId || !targetSectionIdForItem || !loadNavigation) return;
    
    setSaving(true);
    try {
      const success = await addItem(
        companyId,
        null,
        'kalkylskede',
        targetSectionIdForItem,
        { name: newItemName.trim() },
        targetParentItemIdForItem
      );
      
      if (success) {
        setNewItemName('');
        setTargetSectionIdForItem(null);
        setTargetParentItemIdForItem(null);
        setShowAddItemModal(false);
        if (loadNavigation) {
          await loadNavigation();
        }
      } else {
        Alert.alert('Fel', 'Kunde inte lägga till item');
      }
    } catch (error) {
      console.error('[PhaseLeftPanel] Error adding item:', error);
      Alert.alert('Fel', `Kunde inte lägga till item: ${error.message || 'Okänt fel'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (sectionId, itemId, parentItemId = null) => {
    if (!companyId || !loadNavigation) return;
    
    Alert.alert(
      'Ta bort item',
      'Är du säker på att du vill ta bort detta item?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const success = await removeItem(companyId, null, 'kalkylskede', sectionId, itemId, parentItemId);
              if (success) {
                if (loadNavigation) {
                  await loadNavigation();
                }
              } else {
                Alert.alert('Fel', 'Kunde inte ta bort item');
              }
            } catch (error) {
              console.error('[PhaseLeftPanel] Error removing item:', error);
              Alert.alert('Fel', `Kunde inte ta bort item: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  // Debug logging
  React.useEffect(() => {
    console.log('[PhaseLeftPanel] Render - navigation:', !!navigation, 'sections:', navigation?.sections?.length || 0, 'projectName:', projectName);
  }, [navigation, projectName]);

  if (!navigation || !navigation.sections) {
    console.log('[PhaseLeftPanel] No navigation or sections available');
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Ingen navigation tillgänglig</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.panelCard}>
        {/* Projekt-header: nummer + namn, skede (ingen divider) */}
        {(project || projectName) && (
          <ProjectSidebarHeader
            project={project}
            projectName={projectName}
            phaseKey={project?.phase}
          />
        )}

        {/* Content wrapper - takes flex: 1 */}
        <View style={styles.contentWrapper}>
        {isWeb ? (
          <View style={styles.scrollViewContainer}>
            <View style={styles.scrollViewContent}>
        {hasSharePointContext && sharePointTree.length > 0 ? (
          <View style={{ paddingTop: 6 }}>
            {sharePointTree
              .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' }))
              .map((node) => renderSharePointNode(node, 0))}
          </View>
        ) : (
          <>
            {[...(navigation.sections || [])]
              .sort((a, b) => {
                const ak = Number.isFinite(Number(a?.order)) && Number(a?.order) > 0 ? Number(a.order) : 10_000;
                const bk = Number.isFinite(Number(b?.order)) && Number(b?.order) > 0 ? Number(b.order) : 10_000;
                if (ak !== bk) return ak - bk;
                const an = String(a?.name || '');
                const bn = String(b?.name || '');
                return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
              })
              .map(section => {
          const isExpanded = expandedSections[section.id] ?? false;
          const isActive = activeSection === section.id;
          const hasItems = section.items && section.items.length > 0;
          const sectionHasContent = nodeHasContent(section.id, null);
          const sectionHoverKey = `sec:${section.id}`;
          const isHovered = isWeb && hoveredKey === sectionHoverKey;
          const sectionIconColor = isActive
            ? LEFT_NAV.accent
            : (isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted);
          const sectionTextColor = isActive
            ? LEFT_NAV.accent
            : (isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault);

          return (
            <View key={section.id} style={styles.sectionContainer}>
              {/* Section header: hela raden klickbar – expand/collapse + välj sektion */}
              <SidebarItem
                indentMode={rowIndentMode}
                fullWidth
                style={{
                  minHeight: LEFT_NAV.rowMinHeightCompact,
                  paddingVertical: LEFT_NAV.rowPaddingVertical,
                  paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
                }}
                hovered={isHovered}
                active={isActive}
                onPress={() => {
                  toggleSectionStructure(section.id);
                  if (onSelectSection) {
                    onSelectSection(section.id);
                    if (onSelectItem) onSelectItem(section.id, null);
                  }
                }}
                onDoubleClick={isExpanded ? () => toggleSectionStructure(section.id) : undefined}
                onHoverIn={isWeb ? () => setHoveredKey(sectionHoverKey) : undefined}
                onHoverOut={isWeb ? () => setHoveredKey(null) : undefined}
                left={() => (
                  <>
                    <AnimatedChevron
                      expanded={isExpanded}
                      size={LEFT_NAV.chevronSize}
                      color={sectionIconColor}
                      style={{ marginRight: 6 }}
                    />
                    <Ionicons
                      name={section.icon || 'folder-outline'}
                      size={16}
                      color={sectionIconColor}
                      style={{ marginRight: 8 }}
                    />
                  </>
                )}
                label={stripNumberPrefixForDisplay(section.name)}
                labelWeight={sectionHasContent ? '700' : undefined}
                labelStyle={{
                  fontSize: LEFT_NAV.rowFontSize,
                  ...(isActive ? { color: LEFT_NAV.accent } : isHovered ? { color: sectionTextColor } : {}),
                }}
                right={() =>
                  canEdit ? (
                    <View style={{ flexDirection: 'row', marginLeft: 8, gap: 4 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          try { e?.stopPropagation?.(); } catch (_e) {}
                          setTargetSectionIdForItem(section.id);
                          setTargetParentItemIdForItem(null);
                          setNewItemName('');
                          setShowAddItemModal(true);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="add-circle-outline" size={18} color={LEFT_NAV.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => {
                          try { e?.stopPropagation?.(); } catch (_e) {}
                          handleRemoveSection(section.id);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="close-circle-outline" size={18} color="#D32F2F" />
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
              />

              {/* Section items */}
              {isExpanded && hasItems && (
                <View style={styles.itemsContainer}>
                  {section.items.map(item => {
                    const hasNestedItems = item.type === 'nested' && item.items && item.items.length > 0;
                    const nestedKey = hasNestedItems ? `${section.id}.${item.id}` : null;
                    const isNestedExpanded = nestedKey ? expandedNestedItems[nestedKey] : false;
                    // Only show as active if nested items are expanded AND item matches activeItem
                    const isItemActive = hasNestedItems 
                      ? (isNestedExpanded && activeSection === section.id && activeItem === item.id)
                      : (activeSection === section.id && activeItem === item.id);
                    const itemHoverKey = `item:${section.id}:${item.id}`;
                    const isItemHovered = isWeb && hoveredKey === itemHoverKey;
                    const itemTextColor = isItemActive
                      ? LEFT_NAV.accent
                      : (isItemHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault);

                    return (
                      <View key={item.id}>
                        {/* Item: hela raden klickbar – vid undermeny: växla expand + välj; annars bara välj */}
                        <SidebarItem
                          indentMode={rowIndentMode}
                          fullWidth
                          style={{
                            minHeight: LEFT_NAV.rowMinHeight,
                            paddingVertical: LEFT_NAV.rowPaddingVertical,
                          }}
                          hovered={isItemHovered}
                          active={isItemActive}
                          indent={LEFT_NAV.indentPerLevel}
                          onPress={() => {
                            if (hasNestedItems) {
                              toggleNestedStructure(section.id, item.id);
                            }
                            if (onSelectItem) onSelectItem(section.id, item.id);
                          }}
                          onDoubleClick={hasNestedItems && isNestedExpanded ? () => toggleNestedStructure(section.id, item.id) : undefined}
                          onHoverIn={isWeb ? () => setHoveredKey(itemHoverKey) : undefined}
                          onHoverOut={isWeb ? () => setHoveredKey(null) : undefined}
                          label={`• ${stripNumberPrefixForDisplay(item.name)}`}
                          labelWeight={nodeHasContent(section.id, item.id) ? '700' : undefined}
                          labelStyle={{
                            fontSize: LEFT_NAV.rowFontSize,
                            ...(isItemActive ? { color: LEFT_NAV.accent } : isItemHovered ? { color: itemTextColor } : {}),
                          }}
                          right={() => (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {hasNestedItems ? (
                                <Ionicons
                                  name={expandedNestedItems[`${section.id}.${item.id}`] ? 'chevron-down-outline' : 'chevron-forward-outline'}
                                  size={LEFT_NAV.chevronSize}
                                  color={isItemActive ? LEFT_NAV.accent : (isItemHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted)}
                                />
                              ) : null}
                              {canEdit && (
                                <>
                                  {hasNestedItems && (
                                    <TouchableOpacity
                                      onPress={(e) => {
                                        try { e?.stopPropagation?.(); } catch (_e) {}
                                        setTargetSectionIdForItem(section.id);
                                        setTargetParentItemIdForItem(item.id);
                                        setNewItemName('');
                                        setShowAddItemModal(true);
                                      }}
                                      style={{ padding: 2 }}
                                    >
                                      <Ionicons name="add-circle-outline" size={16} color={LEFT_NAV.accent} />
                                    </TouchableOpacity>
                                  )}
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      try { e?.stopPropagation?.(); } catch (_e) {}
                                      handleRemoveItem(section.id, item.id);
                                    }}
                                    style={{ padding: 2 }}
                                  >
                                    <Ionicons name="close-circle-outline" size={16} color="#D32F2F" />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          )}
                        />

                        {/* Nested items (e.g., under Ritningar) */}
                        {hasNestedItems && expandedNestedItems[`${section.id}.${item.id}`] && (
                          <View style={styles.nestedItemsContainer}>
                            {item.items.map(subItem => {
                              const isSubItemActive =
                                activeSection === section.id &&
                                activeItem === `${item.id}.${subItem.id}`;
                              const subHoverKey = `sub:${section.id}:${item.id}:${subItem.id}`;
                              const isSubHovered = isWeb && hoveredKey === subHoverKey;
                              const subTextColor = isSubItemActive
                                ? LEFT_NAV.accent
                                : (isSubHovered ? LEFT_NAV.hoverText : LEFT_NAV.textMuted);

                              return (
                                <SidebarItem
                                  indentMode={rowIndentMode}
                                  fullWidth
                                  key={subItem.id}
                                  style={{
                                    minHeight: LEFT_NAV.rowMinHeight,
                                    paddingVertical: LEFT_NAV.rowPaddingVertical,
                                  }}
                                  hovered={isSubHovered}
                                  active={isSubItemActive}
                                  indent={LEFT_NAV.indentPerLevel * 2}
                                  onPress={() => {
                                    if (onSelectItem) {
                                      onSelectItem(section.id, `${item.id}.${subItem.id}`);
                                    }
                                  }}
                                  onHoverIn={isWeb ? () => setHoveredKey(subHoverKey) : undefined}
                                  onHoverOut={isWeb ? () => setHoveredKey(null) : undefined}
                                  label={`– ${stripNumberPrefixForDisplay(subItem.name)}`}
                                  muted
                                  labelWeight={isSubItemActive ? '700' : '500'}
                                  labelStyle={{
                                    fontSize: LEFT_NAV.rowFontSize,
                                    ...(isSubItemActive ? { color: LEFT_NAV.accent } : isSubHovered ? { color: subTextColor } : {}),
                                  }}
                                  right={() =>
                                    canEdit ? (
                                      <TouchableOpacity
                                        onPress={(e) => {
                                          try { e?.stopPropagation?.(); } catch (_e) {}
                                          handleRemoveItem(section.id, subItem.id, item.id);
                                        }}
                                        style={{ padding: 2, marginLeft: 4 }}
                                      >
                                        <Ionicons name="close-circle-outline" size={14} color="#D32F2F" />
                                      </TouchableOpacity>
                                    ) : null
                                  }
                                />
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Section without items (like Möten) - show empty state when expanded */}
              {!hasItems && isExpanded && (
                <View style={styles.itemsContainer}>
                  <View style={styles.emptySectionContainer}>
                    <Text style={styles.emptySectionText}>
                      Inga items i denna sektion ännu
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
            })}
          </>
        )}
        
        {/* Add section button */}
        {canEdit && (
          <TouchableOpacity
            style={styles.addSectionButton}
            onPress={() => {
              setNewSectionName('');
              setShowAddSectionModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
            <Text style={styles.addSectionButtonText}>Lägg till sektion</Text>
          </TouchableOpacity>
        )}
            </View>
          </View>
        ) : (
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={true}
          >
          {hasSharePointContext && sharePointTree.length > 0 ? (
            <View style={{ paddingTop: 6 }}>
              {sharePointTree
                .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' }))
                .map((node) => renderSharePointNode(node, 0))}
            </View>
          ) : (
            <>
              {[...(navigation.sections || [])]
                .sort((a, b) => {
                  const ak = Number.isFinite(Number(a?.order)) && Number(a?.order) > 0 ? Number(a.order) : 10_000;
                  const bk = Number.isFinite(Number(b?.order)) && Number(b?.order) > 0 ? Number(b.order) : 10_000;
                  if (ak !== bk) return ak - bk;
                  const an = String(a?.name || '');
                  const bn = String(b?.name || '');
                  return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
                })
                .map(section => {
            const isExpanded = expandedSections[section.id] ?? false;
            const isActive = isExpanded && activeSection === section.id;
            const hasItems = section.items && section.items.length > 0;

            return (
              <View key={section.id} style={styles.sectionContainer}>
                <TouchableOpacity
                  style={[styles.sectionHeader, isActive && styles.sectionHeaderActive]}
                  onPress={() => {
                    const willBeExpanded = !expandedSections[section.id];
                    toggleSection(section.id);
                    if (willBeExpanded) {
                      if (onSelectSection) {
                        onSelectSection(section.id);
                        if (onSelectItem) onSelectItem(section.id, null);
                      }
                    } else {
                      if (activeSection === section.id && onSelectSection) {
                        onSelectSection(null);
                        if (onSelectItem) onSelectItem(null, null);
                      }
                    }
                  }}
                >
                  <Ionicons
                    name={isExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'}
                    size={16}
                    color="#666"
                    style={styles.chevron}
                  />
                  <Ionicons
                    name={section.icon || 'folder-outline'}
                    size={18}
                    color={isActive ? '#1976D2' : '#666'}
                    style={styles.sectionIcon}
                  />
                  <Text style={[styles.sectionName, isActive && styles.sectionNameActive]}>
                    {stripNumberPrefixForDisplay(section.name)}
                  </Text>
                  {canEdit && (
                    <View style={{ flexDirection: 'row', marginLeft: 8, gap: 4 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setTargetSectionIdForItem(section.id);
                          setTargetParentItemIdForItem(null);
                          setNewItemName('');
                          setShowAddItemModal(true);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleRemoveSection(section.id);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="close-circle-outline" size={18} color="#D32F2F" />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>

                {isExpanded && hasItems && (
                  <View style={styles.itemsContainer}>
                    {section.items.map(item => {
                      const hasNestedItems = item.type === 'nested' && item.items && item.items.length > 0;
                      const nestedKey = hasNestedItems ? `${section.id}.${item.id}` : null;
                      const isNestedExpanded = nestedKey ? expandedNestedItems[nestedKey] : false;
                      const isItemActive = hasNestedItems 
                        ? (isNestedExpanded && activeSection === section.id && activeItem === item.id)
                        : (activeSection === section.id && activeItem === item.id);

                      return (
                        <View key={item.id}>
                          <TouchableOpacity
                            style={[styles.item, isItemActive && styles.itemActive]}
                            onPress={() => {
                              if (hasNestedItems) {
                                const willBeExpanded = !expandedNestedItems[nestedKey];
                                setExpandedNestedItems(prev => ({
                                  ...prev,
                                  [nestedKey]: !prev[nestedKey]
                                }));
                                if (willBeExpanded) {
                                  if (onSelectItem) onSelectItem(section.id, item.id);
                                } else {
                                  if (activeSection === section.id && activeItem === item.id && onSelectItem) {
                                    onSelectItem(section.id, null);
                                  }
                                }
                              } else {
                                if (!expandedSections[section.id]) toggleSection(section.id);
                                if (onSelectItem) onSelectItem(section.id, item.id);
                              }
                            }}
                          >
                            <Text style={[styles.itemText, isItemActive && styles.itemTextActive]}>
                              • {stripNumberPrefixForDisplay(item.name)}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {canEdit && (
                                <>
                                  {hasNestedItems && (
                                    <TouchableOpacity
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        setTargetSectionIdForItem(section.id);
                                        setTargetParentItemIdForItem(item.id);
                                        setNewItemName('');
                                        setShowAddItemModal(true);
                                      }}
                                      style={{ padding: 2 }}
                                    >
                                      <Ionicons name="add-circle-outline" size={16} color="#1976D2" />
                                    </TouchableOpacity>
                                  )}
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleRemoveItem(section.id, item.id);
                                    }}
                                    style={{ padding: 2 }}
                                  >
                                    <Ionicons name="close-circle-outline" size={14} color="#D32F2F" />
                                  </TouchableOpacity>
                                </>
                              )}
                              {hasNestedItems && (
                                <Ionicons
                                  name={expandedNestedItems[`${section.id}.${item.id}`] ? 'chevron-down-outline' : 'chevron-forward-outline'}
                                  size={LEFT_NAV.chevronSize}
                                  color="#999"
                                />
                              )}
                            </View>
                          </TouchableOpacity>

                          {hasNestedItems && expandedNestedItems[`${section.id}.${item.id}`] && (
                            <View style={styles.nestedItemsContainer}>
                              {item.items.map(subItem => {
                                const isSubItemActive = activeSection === section.id && activeItem === `${item.id}.${subItem.id}`;
                                return (
                                  <TouchableOpacity
                                    key={subItem.id}
                                    style={[styles.nestedItem, isSubItemActive && styles.nestedItemActive]}
                                    onPress={() => {
                                      if (onSelectItem) onSelectItem(section.id, `${item.id}.${subItem.id}`);
                                    }}
                                  >
                                    <Text style={[styles.nestedItemText, isSubItemActive && styles.nestedItemTextActive]}>
                                      – {stripNumberPrefixForDisplay(subItem.name)}
                                    </Text>
                                    {canEdit && (
                                      <TouchableOpacity
                                        onPress={(e) => {
                                          e.stopPropagation();
                                          handleRemoveItem(section.id, subItem.id, item.id);
                                        }}
                                        style={{ padding: 2, marginLeft: 4 }}
                                      >
                                        <Ionicons name="close-circle-outline" size={14} color="#D32F2F" />
                                      </TouchableOpacity>
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {!hasItems && isExpanded && (
                  <View style={styles.itemsContainer}>
                    <View style={styles.emptySectionContainer}>
                      <Text style={styles.emptySectionText}>Inga items i denna sektion ännu</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
            </>
          )}
        
          {canEdit && (
            <TouchableOpacity
              style={styles.addSectionButton}
              onPress={() => {
                setNewSectionName('');
                setShowAddSectionModal(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={LEFT_NAV.accent} />
              <Text style={styles.addSectionButtonText}>Lägg till sektion</Text>
            </TouchableOpacity>
          )}
          </ScrollView>
        )}

        {/* Status Box at bottom - fixed position */}
        <View style={styles.statusBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 12, color: '#2E7D32', fontWeight: '600' }}>
              Synk: synced
            </Text>
            <Text style={{ fontSize: 12, color: LEFT_NAV.textMuted }}>
              Version: {appVersion}
            </Text>
          </View>
        </View>
      </View>

      {/* Add Section Modal */}
      <Modal
        visible={showAddSectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !saving && setShowAddSectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lägg till sektion</Text>
            <TextInput
              value={newSectionName}
              onChangeText={setNewSectionName}
              placeholder="Sektionsnamn"
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowAddSectionModal(false)}
                disabled={saving}
              >
                <Text style={styles.modalButtonTextCancel}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleAddSection}
                disabled={saving || !newSectionName.trim()}
              >
                <Text style={styles.modalButtonTextSave}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Item Modal */}
      <Modal
        visible={showAddItemModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !saving && setShowAddItemModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {targetParentItemIdForItem ? 'Lägg till undermapp' : 'Lägg till item'}
            </Text>
            <TextInput
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder={targetParentItemIdForItem ? 'Undermappsnamn' : 'Itemnamn'}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowAddItemModal(false)}
                disabled={saving}
              >
                <Text style={styles.modalButtonTextCancel}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleAddItem}
                disabled={saving || !newItemName.trim()}
              >
                <Text style={styles.modalButtonTextSave}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowHover: {
    backgroundColor: LEFT_NAV.hoverBg,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: Platform.OS === 'web' ? SIDEBAR_BG : 'transparent',
    padding: Platform.OS === 'web' ? 0 : 12,
    height: '100%',
    ...(Platform.OS === 'web'
      ? {
          maxHeight: '100%',
          overflow: 'hidden',
          display: 'flex',
          width: SIDEBAR_PHASE_WIDTH,
          minWidth: SIDEBAR_PHASE_WIDTH,
          flexShrink: 0,
        }
      : {}),
  },
  panelCard: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? SIDEBAR_BG : '#fff',
    borderRadius: Platform.OS === 'web' ? 0 : 12,
    borderWidth: Platform.OS === 'web' ? 0 : 1,
    borderColor: Platform.OS === 'web' ? 'transparent' : '#e6e6e6',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: 'none',
          borderRightWidth: 1,
          borderRightColor: SIDEBAR_BORDER_COLOR,
        }
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }),
  },
  contentWrapper: {
    flex: 1, // Take remaining space (after header)
    minHeight: 0, // Allow shrinking
    flexDirection: 'column', // Column layout for scroll area + status box
    ...(Platform.OS === 'web' ? {
      overflow: 'hidden', // Prevent wrapper from growing
      display: 'flex', // Ensure flex layout
    } : {})
  },
  scrollViewContainer: {
    flex: 1, // Take remaining space (everything except header and status box)
    minHeight: 0, // Critical: Allow shrinking below content size
    maxHeight: '100%', // Prevent growing beyond wrapper
    overflow: 'auto', // Scroll when content exceeds available space
    WebkitOverflowScrolling: 'touch',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    // Content container for both web and native
    paddingBottom: 8, // Small padding at bottom
  },
  spRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  spName: {
    fontSize: 14,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
    flex: 1,
  },
  spMeta: {
    fontSize: 12,
    color: LEFT_NAV.textMuted,
    marginLeft: 8,
  },
  spEmpty: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  spError: {
    fontSize: 12,
    color: '#D32F2F',
  },
  statusBox: {
    marginTop: 'auto', // Push to bottom - this is the key!
    width: '100%',
    alignSelf: 'stretch', // Ensure full width
    backgroundColor: '#f4f6f8', // Light gray background like ChatGPT example
    borderTopWidth: 1,
    borderTopColor: '#e3e6ea', // Slightly lighter border
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    flexShrink: 0, // Prevent shrinking - keep it fixed size
    flexGrow: 0, // Don't grow - keep it fixed size
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 -2px 8px rgba(0,0,0,0.05)', // Subtle shadow for separation
    } : {
      elevation: 3, // For Android
    })
  },
  sectionContainer: {
    marginBottom: 2
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  sectionHeaderActive: {
    backgroundColor: LEFT_NAV.activeBg,
    borderLeftWidth: 4,
    borderLeftColor: LEFT_NAV.activeBorder,
  },
  chevron: {
    marginRight: 8
  },
  sectionIcon: {
    marginRight: 8
  },
  sectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
    flex: 1
  },
  sectionNameActive: {
    color: LEFT_NAV.accent,
  },
  itemsContainer: {
    backgroundColor: Platform.OS === 'web' ? 'transparent' : '#fafafa',
    paddingLeft: Platform.OS === 'web' ? 0 : 16
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 16,
    paddingLeft: 24,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  itemActive: {
    backgroundColor: LEFT_NAV.activeBg,
    borderLeftWidth: 3,
    borderLeftColor: LEFT_NAV.activeBorder,
  },
  itemText: {
    fontSize: 14,
    color: LEFT_NAV.textDefault,
    flex: 1
  },
  itemTextActive: {
    color: LEFT_NAV.accent,
    fontWeight: '600'
  },
  nestedItemsContainer: {
    paddingLeft: Platform.OS === 'web' ? 0 : 16,
    backgroundColor: Platform.OS === 'web' ? 'transparent' : '#f5f5f5'
  },
  nestedItem: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    paddingLeft: 32,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  nestedItemActive: {
    backgroundColor: LEFT_NAV.activeBg,
    borderLeftWidth: 3,
    borderLeftColor: LEFT_NAV.activeBorder,
  },
  nestedItemText: {
    fontSize: 14,
    color: LEFT_NAV.textMuted,
  },
  nestedItemTextActive: {
    color: LEFT_NAV.accent,
    fontWeight: '600'
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    color: '#999'
  },
  emptySectionContainer: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptySectionText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic'
  },
  addSectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginHorizontal: 16,
    gap: 8
  },
  addSectionButtonText: {
    fontSize: 14,
    color: LEFT_NAV.accent,
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 12
    })
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#fff'
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center'
  },
  modalButtonCancel: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  modalButtonSave: {
    backgroundColor: '#1976D2'
  },
  modalButtonTextCancel: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14
  },
  modalButtonTextSave: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14
  }
});
