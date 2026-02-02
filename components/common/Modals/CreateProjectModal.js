import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { PROJECT_PHASES } from '../../../features/projects/constants';
import { getSharePointNavigationConfig } from '../../firebase';

// STRUCTURES removed - projects are no longer phase-based

export default function CreateProjectModal({
  visible,
  onClose,
  availableSites = [],
  onCreateProject,
  isCreating = false,
  companyId = null,
}) {
  const [projectNumber, setProjectNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedProjectRoot, setSelectedProjectRoot] = useState(null); // { siteId, siteName, folderPath, folderName }

  // Project structure/phase selection
  const [selectedStructureKey, setSelectedStructureKey] = useState('');
  
  // State for location picker
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationPickerStep, setLocationPickerStep] = useState('sites'); // 'sites' or 'folders'
  const [activeSite, setActiveSite] = useState(null); // Site selected in step 1
  const [currentPath, setCurrentPath] = useState(''); // Current folder path being viewed
  const [locationFolders, setLocationFolders] = useState([]);
  const [loadingLocationFolders, setLoadingLocationFolders] = useState(false);
  const [locationPathHistory, setLocationPathHistory] = useState([]); // For breadcrumb navigation
  const [navConfig, setNavConfig] = useState(null);

  // State for structure picker (web dropdown)
  const [structurePickerOpen, setStructurePickerOpen] = useState(false);
  const structurePickerRef = useRef(null);
  const [structurePickerPosition, setStructurePickerPosition] = useState({ top: 0, left: 0, width: 0 });
  
  // Refs för att mäta dropdown-trigger positioner
  const locationPickerRef = useRef(null);
  const [locationPickerPosition, setLocationPickerPosition] = useState({ top: 0, left: 0, width: 0 });

  // Load folders when in folders step and path changes
  useEffect(() => {
    if (!locationPickerOpen || locationPickerStep !== 'folders' || !activeSite) {
      return;
    }

    let cancelled = false;

    async function loadFolders() {
      setLoadingLocationFolders(true);
      try {
        // Root-nivå: använd samma källa som SharePointLeftPanel (filterHierarchyByConfig)
        // så att vi får EXAKT samma mapplista som i vänsterpanelen för den aktiva siten.
        if (!currentPath) {
          try {
            const { filterHierarchyByConfig } = await import('../../../utils/filterSharePointHierarchy');
            const filtered = await filterHierarchyByConfig([], companyId, navConfig || undefined);
            if (cancelled) return;

            // Hitta den aktiva siten i det filtrerade trädet
            const siteNode = (filtered || []).find((site) => {
              if (!site) return false;
              const siteId = String(site.siteId || '').trim();
              const activeId = String(activeSite?.id || '').trim();
              return siteId && activeId && siteId === activeId;
            });

            const siteFolders = Array.isArray(siteNode?.children) ? siteNode.children : [];

            const folders = siteFolders
              .filter((item) => item && (item.type === 'folder' || item.folder))
              .map((item) => {
                const name = String(item.name || '').trim();
                let path = String(item.path || '').trim();
                if (!path) {
                  const base = String(currentPath || '').replace(/\/+$/, '');
                  path = base ? `${base}/${name}` : name;
                }
                return { name, path };
              });

            setLocationFolders(folders);

            // If site root is empty, still allow creating projects by selecting root.
            if ((folders || []).length === 0 && activeSite) {
              setSelectedProjectRoot((prev) => {
                if (prev && String(prev.siteId) === String(activeSite.id)) return prev;
                return {
                  siteId: activeSite.id,
                  siteName: getSiteDisplayName(activeSite),
                  folderPath: '',
                  folderName: 'Root',
                };
              });
            }
            return;
          } catch (e) {
            console.error('[CreateProjectModal] Error filtering hierarchy by config, falling back to raw root folders:', e);
            const { getSharePointHierarchy } = await import('../../../services/azure/hierarchyService');
            const rootFolders = await getSharePointHierarchy(companyId, null, 1);
            if (cancelled) return;

            const folders = (rootFolders || [])
              .filter((item) => item && (item.folder || item.type === 'folder'))
              .map((item) => {
                const name = String(item.name || '').trim();
                let path = String(item.path || '').trim();
                if (!path) {
                  const base = String(currentPath || '').replace(/\/+$/, '');
                  path = base ? `${base}/${name}` : name;
                }
                return { name, path };
              });

            setLocationFolders(folders);

            // If site root is empty, still allow creating projects by selecting root.
            if ((folders || []).length === 0 && activeSite) {
              setSelectedProjectRoot((prev) => {
                if (prev && String(prev.siteId) === String(activeSite.id)) return prev;
                return {
                  siteId: activeSite.id,
                  siteName: getSiteDisplayName(activeSite),
                  folderPath: '',
                  folderName: 'Root',
                };
              });
            }
            return;
          }
        }

        // Undermappar: använd loadFolderChildren (samma som lazy load i ProjectSidebar)
        const { loadFolderChildren } = await import('../../../services/azure/hierarchyService');
        const items = await loadFolderChildren(companyId, currentPath || '', 1);
        if (cancelled) return;

        const folders = (items || [])
          .filter((item) => item && (item.folder || item.type === 'folder'))
          .map((item) => {
            const name = String(item.name || '').trim();

            if (item.path) {
              const path = String(item.path || '').trim();
              return { name, path };
            }

            const base = String(currentPath || '').replace(/\/+$/, '');
            const path = base ? `${base}/${name}` : name;
            return { name, path };
          });

        setLocationFolders(folders);
      } catch (error) {
        console.error('[CreateProjectModal] Error loading location folders:', error);
        if (!cancelled) {
          setLocationFolders([]);
        }
      } finally {
        if (!cancelled) setLoadingLocationFolders(false);
      }
    }

    loadFolders();

    return () => {
      cancelled = true;
    };
  }, [locationPickerOpen, locationPickerStep, activeSite, currentPath, companyId, navConfig]);
  
  // Load navigation config when modal opens
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (visible && companyId) {
        try {
          const config = await getSharePointNavigationConfig(companyId);
          if (mounted) setNavConfig(config);
        } catch (error) {
          console.error('[CreateProjectModal] Error loading nav config:', error);
        }
      }
    })();
    return () => { mounted = false; };
  }, [visible, companyId]);

  // Reset all form fields when modal opens
  useEffect(() => {
    if (visible) {
      // Reset all form fields
      setProjectNumber('');
      setProjectName('');
      setSelectedProjectRoot(null);

      // Default structure when opening modal
      setSelectedStructureKey('');
      
      // Reset location picker state
      setLocationPickerOpen(false);
      setLocationPickerStep('sites');
      setActiveSite(null);
      setCurrentPath('');
      setLocationFolders([]);
      setLoadingLocationFolders(false);
      setLocationPathHistory([]);
      
      // Reset dropdown positions
      setLocationPickerPosition({ top: 0, left: 0, width: 0 });

      // Reset structure picker state
      setStructurePickerOpen(false);
      setStructurePickerPosition({ top: 0, left: 0, width: 0 });
    }
  }, [visible]);

  // Location picker state initieras via openLocationPicker

  // Derived booleans for status + validering
  const hasProjectNumber = projectNumber.trim().length > 0;
  const hasProjectName = projectName.trim().length > 0;
  const isProjectSectionComplete = hasProjectNumber && hasProjectName;

  const hasProjectRoot = !!selectedProjectRoot;
  const isStorageSectionComplete = hasProjectRoot;

  const hasStructure = !!selectedStructureKey;
  const isStructureSectionComplete = hasStructure;

  const selectedStructureLabel = (() => {
    try {
      const key = String(selectedStructureKey || '').trim();
      const hit = (PROJECT_PHASES || []).find((p) => String(p?.key || '').trim() === key);
      return String(hit?.name || '').trim();
    } catch (_e) {
      return '';
    }
  })();

  const canCreate = Boolean(
    isProjectSectionComplete &&
    isStorageSectionComplete &&
    isStructureSectionComplete
  );

  const getSiteDisplayName = (site) => {
    if (!site) return '';
    const raw = String(site.name || site.webUrl || '').trim();
    if (!raw) return '';
    if (!raw.startsWith('http')) return raw;
    try {
      const url = new URL(raw);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const last = pathParts[pathParts.length - 1] || url.hostname.replace('.sharepoint.com', '');
      return last
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch (_e) {
      return raw;
    }
  };

  const handleSelectLocation = (site, folderPath, folderName) => {
    setSelectedProjectRoot({
      siteId: site.id,
      siteName: getSiteDisplayName(site),
      folderPath: folderPath || '',
      folderName: folderName || 'Root',
    });
    setLocationPickerOpen(false);
    // Reset picker state
    setLocationPickerStep('sites');
    setActiveSite(null);
    setCurrentPath('');
    setLocationPathHistory([]);
  };

  const handleSelectSite = (site) => {
    // Step 1: Site selected, move to folders step
    setActiveSite(site);
    setLocationPickerStep('folders');
    setCurrentPath('');
    setLocationPathHistory([]);
  };

  const handleNavigateToFolder = (folder) => {
    const newPath = folder.path;
    setLocationPathHistory([...locationPathHistory, { path: currentPath, name: currentPath ? currentPath.split('/').pop() : 'Root' }]);
    setCurrentPath(newPath);
    // När användaren klickar på en mapp, betrakta den direkt som vald lagringsplats
    // så att valet "sparas" utan extra klick på separat Välj-knapp.
    if (activeSite) {
      setSelectedProjectRoot({
        siteId: activeSite.id,
        siteName: getSiteDisplayName(activeSite),
        folderPath: newPath || '',
        folderName: newPath ? newPath.split('/').pop() : 'Root',
      });
    }
  };

  const handleNavigateBack = () => {
    if (locationPathHistory.length > 0) {
      const previous = locationPathHistory[locationPathHistory.length - 1];
      setLocationPathHistory(locationPathHistory.slice(0, -1));
      setCurrentPath(previous.path);
    } else {
      // If at root level, go back to sites step
      setLocationPickerStep('sites');
      setActiveSite(null);
      setCurrentPath('');
      setLocationPathHistory([]);
    }
  };

  const openLocationPicker = (startStep = 'sites') => {
    // Avoid overlapping dropdowns
    try { setStructurePickerOpen(false); } catch (_e) {}

    if (startStep === 'folders' && selectedProjectRoot?.siteId) {
      const site = availableSites.find((s) => String(s.id) === String(selectedProjectRoot.siteId));
      setActiveSite(site || null);
      setLocationPickerStep('folders');
      setCurrentPath(selectedProjectRoot.folderPath || '');
      setLocationPathHistory([]);
    } else {
      setLocationPickerStep('sites');
      setActiveSite(null);
      setCurrentPath('');
      setLocationPathHistory([]);
    }
    setLocationPickerOpen(true);
  };

  const handleCreate = () => {
    if (!canCreate || !onCreateProject || !selectedProjectRoot) return;

    const structureKey = String(selectedStructureKey || '').trim();
    const isFree = structureKey === 'free';

    console.log('[CreateProjectModal] Creating project with:', {
      projectNumber,
      projectName,
      siteId: selectedProjectRoot.siteId,
      parentFolderPath: selectedProjectRoot.folderPath,
      selectedStructureKey: structureKey,
    });

    onCreateProject({
      projectNumber,
      projectName,
      siteId: selectedProjectRoot.siteId,
      parentFolderPath: selectedProjectRoot.folderPath,
      parentFolderName: selectedProjectRoot.folderName,
      structureType: isFree ? 'free' : 'system',
      systemPhase: isFree ? null : structureKey,
    });
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal} data-modal="true">
          {/* Loading overlay */}
          {isCreating && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingContent}>
                <ActivityIndicator size="large" color="#1976D2" />
                <Text style={styles.loadingText}>Skapar projekt...</Text>
                <Text style={styles.loadingSubtext}>
                  Skapar projektmapp och struktur i SharePoint
                </Text>
              </View>
            </View>
          )}
          <Text style={styles.title}>Skapa nytt projekt</Text>

          <View style={styles.layoutRow}>
            {/* SIDEBAR – STATUS */}
            <View style={styles.sidebar}>
              {/* Projekt */}
              <View
                style={[
                  styles.statusSection,
                  isProjectSectionComplete && styles.statusSectionDone,
                  !isProjectSectionComplete && styles.statusSectionActive,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <View
                    style={[
                      styles.circle,
                      isProjectSectionComplete && styles.circleDone,
                    ]}
                  >
                    {isProjectSectionComplete ? <Text style={styles.circleText}>✓</Text> : null}
                  </View>
                  <Text style={styles.statusTitle}>Projekt</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {hasProjectNumber ? '✓' : '•'} Projektnummer
                  </Text>
                  <Text style={styles.statusItemText}>
                    {hasProjectName ? '✓' : '•'} Projektnamn
                  </Text>
                </View>
              </View>

              {/* Lagring */}
              <View
                style={[
                  styles.statusSection,
                  isStorageSectionComplete && styles.statusSectionDone,
                  !isStorageSectionComplete && isProjectSectionComplete && styles.statusSectionActive,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <View
                    style={[
                      styles.circle,
                      isStorageSectionComplete && styles.circleDone,
                    ]}
                  >
                    {isStorageSectionComplete ? <Text style={styles.circleText}>✓</Text> : null}
                  </View>
                  <Text style={styles.statusTitle}>Lagring</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {hasProjectRoot ? '✓' : '•'} Projektplats
                  </Text>
                </View>
              </View>

              {/* Mappstruktur */}
              <View
                style={[
                  styles.statusSection,
                  isStructureSectionComplete && styles.statusSectionDone,
                  !isStructureSectionComplete && isStorageSectionComplete && styles.statusSectionActive,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <View
                    style={[
                      styles.circle,
                      isStructureSectionComplete && styles.circleDone,
                    ]}
                  >
                    {isStructureSectionComplete ? <Text style={styles.circleText}>✓</Text> : null}
                  </View>
                  <Text style={styles.statusTitle}>Mappstruktur</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {hasStructure ? '✓' : '•'} {selectedStructureLabel || 'Välj struktur'}
                  </Text>
                </View>
              </View>

            </View>

            {/* HÖGER – FORMULÄR */}
            <View style={styles.content}>
              {/* Projektinformation */}
              <Text style={styles.sectionTitle}>Projektinformation</Text>

              <View style={[styles.section, styles.sectionAfterTitle]}>
                <Text style={styles.label}>Projektnummer *</Text>
                <TextInput
                  value={projectNumber}
                  onChangeText={setProjectNumber}
                  placeholder="Projektnummer"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Projektnamn *</Text>
                <TextInput
                  value={projectName}
                  onChangeText={setProjectName}
                  placeholder="Projektnamn"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
              </View>

              {/* Lagring */}
              <View style={[styles.sectionHeaderRow, { marginTop: 4 }]}> 
                <Ionicons name="cloud" size={18} color="#1976D2" style={styles.sectionHeaderIcon} />
                <Text style={styles.sectionHeaderTitle}>SharePoint</Text>
              </View>

              {/* Platsval (site + mapp) */}
              <View style={[styles.section, styles.sectionAfterTitle]}>
                <Text style={styles.label}>Välj lagringsplats</Text>

                {(!availableSites || availableSites.length === 0) && (
                  <Text style={styles.helperText}>
                    Inga SharePoint-ytor är konfigurerade ännu.
                  </Text>
                )}
                {availableSites && availableSites.length > 0 && (
                  <View
                    ref={locationPickerRef}
                    style={styles.dropdownContainer}
                    onLayout={(event) => {
                      if (Platform.OS === 'web') {
                        const element = event.target;
                        if (element && element.getBoundingClientRect) {
                          const rect = element.getBoundingClientRect();
                          setLocationPickerPosition({ 
                            top: rect.bottom + 4,
                            left: rect.left, 
                            width: rect.width 
                          });
                        }
                      } else if (locationPickerRef.current) {
                        locationPickerRef.current.measure((_x, _y, _width, _height, pageX, pageY) => {
                          setLocationPickerPosition({ top: pageY + _height + 4, left: pageX, width: _width });
                        });
                      }
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web' && locationPickerRef.current) {
                          try {
                            const node = locationPickerRef.current;
                            if (node && typeof node.getBoundingClientRect === 'function') {
                              const rect = node.getBoundingClientRect();
                              setLocationPickerPosition({ 
                                top: rect.bottom + 4,
                                left: rect.left, 
                                width: rect.width 
                              });
                            }
                          } catch (_e) {
                            // Fallback
                          }
                        } else if (locationPickerRef.current) {
                          locationPickerRef.current.measure((x, y, width, height, pageX, pageY) => {
                            setLocationPickerPosition({ top: pageY + height + 4, left: pageX, width });
                          });
                        }
                        const startStep = selectedProjectRoot?.siteId ? 'folders' : 'sites';
                        openLocationPicker(startStep);
                      }}
                      style={styles.dropdownHeader}
                    >
                      <Text style={styles.dropdownText}>
                        {selectedProjectRoot 
                          ? selectedProjectRoot.folderPath
                            ? `${selectedProjectRoot.siteName} / ${selectedProjectRoot.folderPath}`
                            : `${selectedProjectRoot.siteName} (root)`
                          : 'Välj lagringsplats'}
                      </Text>
                      <View style={styles.dropdownChevronWrapper}>
                        <Ionicons
                          name={locationPickerOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color="#374151"
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Mappstruktur */}
              <View style={[styles.sectionHeaderRow, { marginTop: 6 }]}> 
                <Ionicons name="albums-outline" size={18} color="#1976D2" style={styles.sectionHeaderIcon} />
                <Text style={styles.sectionHeaderTitle}>Mappstruktur</Text>
              </View>

              <View style={[styles.section, styles.sectionAfterTitle]}>
                <Text style={styles.label}>Välj struktur *</Text>
                <Text style={styles.helperText}>
                  Styr vilka systemmappar som skapas i projektmappen.
                </Text>

                {(() => {
                  const options = (PROJECT_PHASES || [])
                    .slice()
                    .sort((a, b) => (a.order || 999) - (b.order || 999));

                  const getDescription = (key) => {
                    const k = String(key || '').trim();
                    if (k === 'kalkylskede') return 'Digitalkontrolls kalkylskede skapar en färdig mappstruktur anpassad för tidiga projektfaser.\nInnehåller fördefinierade mappar, sektioner och stöd för AI-assisterad kalkyl, dokumentation och beslut';
                    if (k === 'produktion') return 'Struktur för produktion (kan byggas ut).';
                    if (k === 'avslut') return 'Struktur för avslut/överlämning (kan byggas ut).';
                    if (k === 'eftermarknad') return 'Struktur för eftermarknad (kan byggas ut).';
                    if (k === 'free') return 'Skapar bara projektmappen utan systemmappar.';
                    return '';
                  };

                  if (Platform.OS === 'web') {
                    const selectedDesc = getDescription(selectedStructureKey);
                    const selectedName = options.find((o) => String(o?.key || '') === String(selectedStructureKey || ''))?.name;
                    return (
                      <View style={{ marginTop: 8 }}>
                        <View
                          ref={structurePickerRef}
                          style={styles.dropdownContainer}
                          onLayout={(event) => {
                            if (Platform.OS === 'web') {
                              const element = event.target;
                              if (element && element.getBoundingClientRect) {
                                const rect = element.getBoundingClientRect();
                                setStructurePickerPosition({
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                  width: rect.width,
                                });
                              }
                            } else if (structurePickerRef.current) {
                              structurePickerRef.current.measure((_x, _y, _width, _height, pageX, pageY) => {
                                setStructurePickerPosition({ top: pageY + _height + 4, left: pageX, width: _width });
                              });
                            }
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              try { setLocationPickerOpen(false); } catch (_e) {}
                              if (Platform.OS === 'web' && structurePickerRef.current) {
                                try {
                                  const node = structurePickerRef.current;
                                  if (node && typeof node.getBoundingClientRect === 'function') {
                                    const rect = node.getBoundingClientRect();
                                    setStructurePickerPosition({
                                      top: rect.bottom + 4,
                                      left: rect.left,
                                      width: rect.width,
                                    });
                                  }
                                } catch (_e) {}
                              } else if (structurePickerRef.current) {
                                structurePickerRef.current.measure((x, y, width, height, pageX, pageY) => {
                                  setStructurePickerPosition({ top: pageY + height + 4, left: pageX, width });
                                });
                              }
                              setStructurePickerOpen((v) => !v);
                            }}
                            style={styles.dropdownHeader}
                          >
                            <Text style={styles.dropdownText}>
                              {selectedName ? String(selectedName) : 'Välj struktur'}
                            </Text>
                            <View style={styles.dropdownChevronWrapper}>
                              <Ionicons
                                name={structurePickerOpen ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color="#374151"
                              />
                            </View>
                          </TouchableOpacity>
                        </View>

                        {!!selectedDesc && (
                          <Text style={[styles.structureDescription, { marginTop: 6 }]}>
                            {selectedDesc}
                          </Text>
                        )}

                        <Text style={[styles.helperText, { marginTop: 6, marginBottom: 0 }]}>
                          Just nu kan du välja Kalkylskede eller Valfri mappstruktur. Produktion, Avslut och Eftermarknad kommer snart.
                        </Text>
                      </View>
                    );
                  }

                  return options.map((opt) => {
                    const selected = String(selectedStructureKey) === String(opt.key);
                    const disabled = ['produktion', 'avslut', 'eftermarknad'].includes(String(opt.key || '').trim());
                    const description = getDescription(opt.key);

                    return (
                      <TouchableOpacity
                        key={opt.id || opt.key}
                        onPress={() => {
                          if (disabled) return;
                          setSelectedStructureKey(opt.key);
                        }}
                        style={[
                          styles.structureRow,
                          selected && styles.structureRowSelected,
                          disabled && styles.structureRowDisabled,
                        ]}
                        activeOpacity={0.8}
                      >
                        <View style={styles.radio}>
                          {selected && <View style={styles.radioDot} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.structureTitle}>{opt.name}</Text>
                          {!!description && (
                            <Text style={styles.structureDescription}>{description}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>


              {/* Footer */}
              <View style={styles.footerRow}>
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Avbryt</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreate}
                  style={[
                    styles.createBtn,
                    (!canCreate || isCreating) && styles.createBtnDisabled,
                  ]}
                  disabled={!canCreate || isCreating}
                >
                  {isCreating ? (
                    <View style={styles.createBtnLoading}>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.createText}>Skapar...</Text>
                    </View>
                  ) : (
                    <Text style={styles.createText}>Skapa projekt</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
          
          {/* Dropdown overlays - renderas ovanför allt innehåll */}
          {locationPickerOpen && (
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => {
                setLocationPickerOpen(false);
                // Reset location picker state when closed
                setLocationPickerStep('sites');
                setActiveSite(null);
                setCurrentPath('');
                setLocationPathHistory([]);
              }}
            />
          )}

          {structurePickerOpen && (
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => setStructurePickerOpen(false)}
            />
          )}
          
          {/* Location picker - renderas direkt i modal-root */}
          {locationPickerOpen && (
            <View style={[
              styles.dropdownListAbsolute,
              {
                top: locationPickerPosition.top,
                left: locationPickerPosition.left,
                width: locationPickerPosition.width || 400,
                maxHeight: 400,
              }
            ]}>
              {locationPickerStep === 'sites' ? (
                /* Step 1: Site selection */
                <View>
                  <View style={styles.locationPickerHeader}>
                    <Text style={styles.locationPickerTitle}>Välj SharePoint-site</Text>
                  </View>
                  <ScrollView style={styles.locationPickerSites} nestedScrollEnabled>
                    {availableSites.map((site) => {
                      const isSelected = selectedProjectRoot?.siteId === site.id && !selectedProjectRoot?.folderPath;
                      return (
                        <TouchableOpacity
                          key={site.id}
                          onPress={() => {
                            // Välj site och gå vidare till mappväljaren
                            handleSelectSite(site);
                          }}
                          style={[
                            styles.siteRow,
                            isSelected && styles.siteRowSelected,
                          ]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="cloud-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                            <Text style={styles.siteText}>{getSiteDisplayName(site)}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                /* Step 2: Folder selection */
                activeSite && (
                  <View>
                    <View style={styles.locationPickerHeader}>
                      <TouchableOpacity onPress={handleNavigateBack} style={styles.breadcrumbBack}>
                        <Text style={styles.breadcrumbText}>← Tillbaka till sites</Text>
                      </TouchableOpacity>
                      <Text style={styles.locationPickerTitle}>
                        {getSiteDisplayName(activeSite)}
                      </Text>
                    </View>

                    {/* Breadcrumb navigation for nested folders */}
                    {locationPathHistory.length > 0 && (
                      <View style={styles.locationBreadcrumb}>
                        <TouchableOpacity onPress={handleNavigateBack} style={styles.breadcrumbBack}>
                          <Text style={styles.breadcrumbText}>← Tillbaka</Text>
                        </TouchableOpacity>
                        <Text style={styles.breadcrumbPath}>
                          {locationPathHistory.map(h => h.name).join(' / ')}
                          {currentPath ? ` / ${currentPath.split('/').pop()}` : ''}
                        </Text>
                      </View>
                    )}

                    {/* Folder list */}
                    <ScrollView style={styles.locationFolders} nestedScrollEnabled>
                      {loadingLocationFolders ? (
                        <Text style={styles.helperText}>Laddar mappar...</Text>
                      ) : locationFolders.length === 0 ? (
                        <>
                          {!currentPath && (
                            <TouchableOpacity
                              onPress={() => handleSelectLocation(activeSite, '', 'Root')}
                              style={styles.folderRow}
                            >
                              <Ionicons name="folder-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                              <Text style={styles.folderName}>Rot (skapa projekt direkt i siten)</Text>
                            </TouchableOpacity>
                          )}
                          <Text style={styles.helperText}>Inga mappar hittades</Text>
                        </>
                      ) : (
                        <>
                          {!currentPath && (
                            <TouchableOpacity
                              onPress={() => handleSelectLocation(activeSite, '', 'Root')}
                              style={styles.folderRow}
                            >
                              <Ionicons name="folder-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                              <Text style={styles.folderName}>Rot (skapa projekt direkt i siten)</Text>
                            </TouchableOpacity>
                          )}
                          {locationFolders.map((folder) => (
                            <TouchableOpacity
                              key={folder.path}
                              onPress={() => handleNavigateToFolder(folder)}
                              style={styles.folderRow}
                            >
                              <Ionicons name="folder-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                              <Text style={styles.folderName}>{folder.name}</Text>
                            </TouchableOpacity>
                          ))}
                          {/* Select current folder button */}
                          {currentPath && (
                            <TouchableOpacity
                              onPress={() => handleSelectLocation(activeSite, currentPath, currentPath.split('/').pop())}
                              style={[
                                styles.selectLocationButton,
                                selectedProjectRoot?.folderPath === currentPath && selectedProjectRoot?.siteId === activeSite.id && styles.selectLocationButtonSelected,
                                { marginTop: 8 }
                              ]}
                            >
                              <Text style={styles.selectLocationButtonText}>
                                Välj “{currentPath.split('/').pop()}”
                              </Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </ScrollView>
                  </View>
                )
              )}
            </View>
          )}

          {/* Structure picker - renderas direkt i modal-root */}
          {structurePickerOpen && Platform.OS === 'web' && (
            <View style={[
              styles.dropdownListAbsolute,
              {
                top: structurePickerPosition.top,
                left: structurePickerPosition.left,
                width: structurePickerPosition.width || 400,
                maxHeight: 320,
              }
            ]}>
              <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
                {(PROJECT_PHASES || [])
                  .slice()
                  .sort((a, b) => (a.order || 999) - (b.order || 999))
                  .map((opt) => {
                    const selected = String(selectedStructureKey) === String(opt.key);
                    const disabled = ['produktion', 'avslut', 'eftermarknad'].includes(String(opt.key || '').trim());

                    return (
                      <TouchableOpacity
                        key={opt.id || opt.key}
                        onPress={() => {
                          if (disabled) return;
                          setSelectedStructureKey(opt.key);
                          setStructurePickerOpen(false);
                        }}
                        style={[
                          styles.structureOptionRow,
                          selected && styles.structureOptionRowSelected,
                          disabled && styles.structureRowDisabled,
                        ]}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.structureOptionTitle}>{opt.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          )}
          
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  modal: {
    width: '90%',
    maxWidth: 880,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    position: 'relative',
    zIndex: 1, // Base z-index for modal - dropdowns will be higher
    ...(Platform.OS === 'web' ? {
      // Web: ensure modal doesn't clip dropdowns and allows high z-index
      overflow: 'visible',
      // Create new stacking context but allow children to escape
      isolation: 'isolate',
    } : {}),
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
    ...(Platform.OS === 'web' ? {
      // Web: ensure sections don't clip dropdowns
      overflow: 'visible',
      position: 'relative',
    } : {}),
  },
  sectionAfterTitle: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  siteRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  siteRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  siteText: {
    fontSize: 14,
  },
  siteUrl: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  dropdownContainer: {
    marginTop: 4,
    position: 'relative',
    backgroundColor: '#ffffff',
    zIndex: 1000, // Very high z-index to ensure dropdowns are above all modal content
    ...(Platform.OS === 'web' ? {
      // Web: ensure container doesn't clip dropdown
      overflow: 'visible',
    } : {}),
  },
  dropdownDisabled: {
    opacity: 0.6,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  dropdownText: {
    fontSize: 14,
  },
  dropdownChevron: {
    fontSize: 12,
    color: '#374151',
  },
  dropdownChevronWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  // Legacy style - behålls för kompatibilitet men används inte längre
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9999,
    zIndex: 10000,
  },
  // Ny style för dropdown som renderas direkt i modal-root
  dropdownListAbsolute: {
    position: 'absolute',
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10000,
    zIndex: 99999, // Mycket hög z-index för att ligga ovanför allt
    maxHeight: 300,
    minWidth: 200,
    ...(Platform.OS === 'web' ? {
      opacity: 1,
      backdropFilter: 'none',
      isolation: 'isolate',
      willChange: 'transform',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
      // Säkerställ att dropdown är ovanför allt på web
      position: 'fixed', // Använd fixed på web för att undvika parent stacking contexts
    } : {}),
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 99998, // Under dropdown men ovanför modal-innehåll
  },
  layoutRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  sidebar: {
    width: 220,
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  content: {
    flex: 1,
    paddingLeft: 16,
    position: 'relative',
    zIndex: 1, // Lower z-index than dropdowns
    ...(Platform.OS === 'web' ? {
      // Web: ensure content doesn't clip dropdowns
      overflow: 'visible',
    } : {}),
  },
  statusSection: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    marginBottom: 10,
  },
  statusSectionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  statusSectionDone: {
    borderColor: '#22c55e',
    backgroundColor: '#ecfdf3',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusItems: {
    marginLeft: 28,
  },
  statusItemText: {
    fontSize: 12,
    color: '#374151',
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  circleDone: {
    borderColor: '#22c55e',
    backgroundColor: '#22c55e',
  },
  circleText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderIcon: {
    marginRight: 6,
    marginTop: 1,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 2,
    backgroundColor: '#fff',
  },
  folderRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  folderName: {
    fontSize: 14,
    fontWeight: '500',
  },
  folderPath: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  structureOptionRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  structureOptionRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  structureOptionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  structureOptionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    lineHeight: 16,
    whiteSpace: Platform.OS === 'web' ? 'pre-line' : 'normal',
  },
  structureRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  structureRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  structureRowDisabled: {
    opacity: 0.45,
  },
  structureTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  structureDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
    lineHeight: 16,
    whiteSpace: Platform.OS === 'web' ? 'pre-line' : 'normal',
  },
  disabledText: {
    color: '#999',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#1976D2',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2, // Liten justering för vertikal centrering med text
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1976D2',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    position: 'relative',
    zIndex: 1, // Lower z-index than dropdowns
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
  },
  cancelText: {
    color: '#374151',
  },
  createBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  createBtnDisabled: {
    backgroundColor: '#d1d5db',
  },
  createText: {
    color: '#fff',
    fontWeight: '500',
  },
  freeRow: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  freeRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  freeTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  freeDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Additional styles for dropdown lists to ensure they're above all content
  siteDropdownList: {
    // Site dropdown specific - already has high z-index from dropdownList
  },
  structureDropdownList: {
    // Structure dropdown specific - already has high z-index from dropdownList
    // Ensure it's above footer buttons and other content
    zIndex: 10001, // Even higher than site dropdown
    elevation: 10000,
  },
  // Location picker styles
  locationPickerHeader: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  locationPickerTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: '#374151',
  },
  locationPickerSites: {
    maxHeight: 200,
  },
  locationBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    marginBottom: 8,
  },
  breadcrumbBack: {
    marginRight: 8,
  },
  breadcrumbText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
  breadcrumbPath: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  locationFolders: {
    maxHeight: 250,
  },
  selectLocationButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1976D2',
    borderRadius: 8,
    alignItems: 'center',
  },
  selectLocationButtonSelected: {
    backgroundColor: '#22c55e',
  },
  selectLocationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // Loading overlay styles
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    zIndex: 100000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1976D2',
    marginTop: 16,
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    maxWidth: 300,
  },
  createBtnLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
