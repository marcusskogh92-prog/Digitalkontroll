import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const STRUCTURES = [
  {
    key: 'kalkyl',
    title: 'Kalkylskede',
    description:
      'Innehåller färdig systemstruktur med system- och filmappar. AI-funktioner aktiveras.',
    enabled: true,
  },
  {
    key: 'produktion',
    title: 'Produktion',
    description: 'Kommer senare.',
    enabled: false,
  },
  {
    key: 'avslut',
    title: 'Avslut',
    description: 'Kommer senare.',
    enabled: false,
  },
  {
    key: 'eftermarknad',
    title: 'Eftermarknad',
    description: 'Kommer senare.',
    enabled: false,
  },
];

export default function CreateProjectModal({
  visible,
  onClose,
  availableSites = [],
  onCreateProject,
}) {
  const [projectNumber, setProjectNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedSite, setSelectedSite] = useState(availableSites[0] || null);
  const [structure, setStructure] = useState('kalkyl');
  const [structureDropdownOpen, setStructureDropdownOpen] = useState(false);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Håll vald site i synk om availableSites ändras
  useEffect(() => {
    if (!selectedSite && availableSites.length > 0) {
      setSelectedSite(availableSites[0]);
    }
  }, [availableSites, selectedSite]);

  // Ladda rot-mappar för vald site
  useEffect(() => {
    if (!selectedSite || !selectedSite.id) {
      setFolders([]);
      setSelectedFolder(null);
      return;
    }

    let cancelled = false;

    async function loadFolders() {
      setLoadingFolders(true);
      try {
        const { listFolders } = await import('../../services/azure/fileService');
        // Tom basePath => listar rot-mappar på siten (t.ex. "01 - Kalkylskede", "Anbud", "Projects")
        const items = await listFolders('', selectedSite.id);
        if (cancelled) return;
        setFolders(items || []);
        setSelectedFolder((items && items.length > 0) ? items[0] : null);
      } catch (_e) {
        if (!cancelled) {
          setFolders([]);
          setSelectedFolder(null);
        }
      } finally {
        if (!cancelled) setLoadingFolders(false);
      }
    }

    loadFolders();

    return () => {
      cancelled = true;
    };
  }, [selectedSite]);

  // Derived booleans for status + validering
  const hasProjectNumber = projectNumber.trim().length > 0;
  const hasProjectName = projectName.trim().length > 0;
  const isProjectSectionComplete = hasProjectNumber && hasProjectName;

  const isFreeStructure = structure === 'free';
  const hasSite = !!selectedSite;
  const hasFolderSelection = !!selectedFolder;

  const isStorageSectionComplete = hasSite && (hasFolderSelection || !isFreeStructure);

  const hasStructureSelection = structure !== null && structure !== undefined;
  const isStructureSectionComplete = hasStructureSelection || isFreeStructure;

  const canCreate = Boolean(
    isProjectSectionComplete &&
    isStorageSectionComplete &&
    isStructureSectionComplete,
  );

  // Aliasar för enklare läsning / debug (projektDone, storageDone, structureDone, canCreateProject)
  const projectDone = isProjectSectionComplete;
  const storageDone = isStorageSectionComplete;
  const structureDone = isStructureSectionComplete;
  const canCreateProject = canCreate;

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

  const handleCreate = () => {
    if (!canCreate || !onCreateProject) return;

    onCreateProject({
      projectNumber,
      projectName,
      siteId: selectedSite.id,
      structureType: structure === 'free' ? 'free' : 'system',
      systemPhase: structure === 'free' ? null : structure,
      parentFolderPath: selectedFolder ? selectedFolder.path : null,
    });
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
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
                    {hasSite ? '✓' : '•'} SharePoint-site
                  </Text>
                  <Text style={styles.statusItemText}>
                    {hasFolderSelection || !isFreeStructure ? '✓' : '•'} Mapp
                  </Text>
                </View>
              </View>

              {/* Systemstruktur */}
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
                  <Text style={styles.statusTitle}>Systemstruktur</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {isStructureSectionComplete ? '✓' : '•'} Vald struktur
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

              {/* 1) Välj site */}
              <View style={[styles.section, styles.sectionAfterTitle]}>
                <Text style={styles.label}>Välj lagringsyta (SharePoint-site)</Text>

                {(!availableSites || availableSites.length === 0) && (
                  <Text style={styles.helperText}>
                    Inga SharePoint-ytor är konfigurerade ännu.
                  </Text>
                )}
                {availableSites && availableSites.length > 0 && (
                  <View
                    style={styles.dropdownContainer}
                  >
                    <TouchableOpacity
                      onPress={() => setSiteDropdownOpen((open) => !open)}
                      style={styles.dropdownHeader}
                    >
                      <Text style={styles.dropdownText}>
                        {getSiteDisplayName(selectedSite) || 'Välj SharePoint-site'}
                      </Text>
                      <View style={styles.dropdownChevronWrapper}>
                        <Text style={styles.dropdownChevron}>
                          {siteDropdownOpen ? '▴' : '▾'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {siteDropdownOpen && availableSites && availableSites.length > 0 && (
                      <View style={styles.dropdownList}>
                        {availableSites.map((site) => {
                          const isSelected = selectedSite?.id === site.id;
                          return (
                            <TouchableOpacity
                              key={site.id}
                              onPress={() => {
                                setSelectedSite(site);
                                setSiteDropdownOpen(false);
                              }}
                              style={[
                                styles.siteRow,
                                isSelected && styles.siteRowSelected,
                              ]}
                            >
                              <Text style={styles.siteText}>{getSiteDisplayName(site)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* 2) Välj mapp på vald site */}
              <View style={styles.section}>
                <Text style={styles.label}>Välj mapp i site</Text>

                {loadingFolders && (
                  <Text style={styles.helperText}>
                    Laddar mappar på vald SharePoint-site…
                  </Text>
                )}

                {!loadingFolders && folders.length === 0 && (
                  <Text style={styles.helperText}>
                    Inga mappar hittades på denna site.
                  </Text>
                )}

                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.path}
                    style={[
                      styles.folderRow,
                      selectedFolder?.path === folder.path && styles.folderRowSelected,
                    ]}
                    onPress={() => setSelectedFolder(folder)}
                  >
                    <Text style={styles.folderName}>{folder.name}</Text>
                    <Text style={styles.folderPath}>{folder.path}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Systemstruktur */}
              <Text style={styles.sectionTitle}>DigitalKontroll – systemstruktur</Text>

              <View style={styles.section}>
                {(() => {
                  const selectedKey = structure === 'free' ? 'kalkyl' : structure;
                  const current =
                    STRUCTURES.find((s) => s.key === selectedKey) || STRUCTURES[0];

                  return (
                    <View
                      style={styles.dropdownContainer}
                    >
                      <TouchableOpacity
                        onPress={() => setStructureDropdownOpen(true)}
                        style={styles.dropdownHeader}
                      >
                        <Text style={styles.dropdownText}>{current?.title}</Text>
                        <View style={styles.dropdownChevronWrapper}>
                          <Text style={styles.dropdownChevron}>
                            {structureDropdownOpen ? '▴' : '▾'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>

              {/* Valfri mappstruktur */}
              <View style={styles.section}>
                <TouchableOpacity
                  onPress={() => setStructure('free')}
                  style={[
                    styles.freeRow,
                    structure === 'free' && styles.freeRowSelected,
                  ]}
                >
                  <Text style={styles.freeTitle}>Valfri mappstruktur (endast fillagring)</Text>
                  <Text style={styles.freeDescription}>
                    Ingen systemlogik eller AI-koppling. Fri filhantering i vald mapp.
                  </Text>
                </TouchableOpacity>
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
                    !canCreate && styles.createBtnDisabled,
                  ]}
                  disabled={!canCreate}
                >
                  <Text style={styles.createText}>Skapa projekt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        {structureDropdownOpen && (
          <View style={styles.dropdownOverlay}>
            {/* BACKDROP – blockerar ALLT bakom */}
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => setStructureDropdownOpen(false)}
            />

            {/* DROPDOWN – ligger ovanför backdrop */}
            <View style={styles.dropdownFloating}>
              {STRUCTURES.map((item) => {
                const isSelected = structure === item.key;
                const disabled = !item.enabled;

                return (
                  <TouchableOpacity
                    key={item.key}
                    disabled={disabled}
                    onPress={() => {
                      setStructure(item.key);
                      setStructureDropdownOpen(false);
                    }}
                    style={[
                      styles.structureRow,
                      isSelected && styles.structureRowSelected,
                      disabled && styles.structureRowDisabled,
                    ]}
                  >
                    <View style={styles.radio}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.structureTitle}>{item.title}</Text>
                      <Text style={styles.structureDescription}>
                        {item.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
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
  },
  modal: {
    width: '90%',
    maxWidth: 880,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    position: 'relative',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionAfterTitle: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
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
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 6,
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
    zIndex: 20,
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
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
    zIndex: 30,
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '600',
  },
  folderRow: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 6,
    backgroundColor: '#fafafa',
  },
  folderRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  folderName: {
    fontSize: 14,
    fontWeight: '600',
  },
  folderPath: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  structureRow: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 8,
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
    fontWeight: '600',
  },
  structureDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
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
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  freeDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  dropdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999, // högre än hela modalen
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  dropdownFloating: {
    position: 'absolute',
    top: 260, // justera vid behov (eller mät trigger senare)
    left: '50%',
    transform: [{ translateX: -200 }],
    width: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
  },
});
