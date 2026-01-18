/**
 * Översikt Summary - Overview summary for kalkylskede
 * Combined layout: Projektstatus at top + simplified card structure
 * Shows when no specific item is selected in Översikt section
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput } from 'react-native';
import PersonSelector from '../../components/PersonSelector';
import { fetchHierarchy, saveHierarchy } from '../../../../../../components/firebase';
import { emitProjectUpdated } from '../../../../../../components/projectBus';

export default function OversiktSummary({ projectId, companyId, project }) {
  // Track if there are unsaved changes per card
  const [hasChangesInfo, setHasChangesInfo] = useState(false);
  const [hasChangesKund, setHasChangesKund] = useState(false);
  const [hasChangesAdress, setHasChangesAdress] = useState(false);
  const [hasChangesTider, setHasChangesTider] = useState(false);
  const [hasChangesAnteckningar, setHasChangesAnteckningar] = useState(false);

  // Store original values to detect changes
  const [originalValues, setOriginalValues] = useState({});

  // Project info state
  const [projectNumber, setProjectNumber] = useState(project?.id || '');
  const [projectName, setProjectName] = useState(project?.name || '');

  // Use ref to track previous project values to avoid unnecessary state updates
  const prevProjectRef = React.useRef(null);
  
  // Update state when project values actually change (not just object reference)
  useEffect(() => {
    // Extract project values as a string for comparison
    const projectKey = project ? JSON.stringify({
      id: project.id,
      name: project.name,
      projectType: project.projectType,
      upphandlingsform: project.upphandlingsform,
      status: project.status,
      kund: project.kund || project.client,
      organisationsnummer: project.organisationsnummer,
      kontaktperson: project.kontaktperson,
      telefon: project.telefon,
      epost: project.epost || project.email,
      adress: project.adress,
      kommun: project.kommun,
      region: project.region,
      fastighetsbeteckning: project.fastighetsbeteckning,
      anbudstid: project.anbudstid,
      byggstart: project.byggstart,
      fardigstallning: project.fardigstallning,
      bindningstid: project.bindningstid,
      anteckningar: project.anteckningar || project.beskrivning
    }) : '';

    // Only update if project values actually changed, not just the object reference
    if (prevProjectRef.current === projectKey) {
      return;
    }
    
    prevProjectRef.current = projectKey;

    const newValues = {
      projectNumber: project?.id || '',
      projectName: project?.name || '',
      projectType: project?.projectType || '',
      upphandlingsform: project?.upphandlingsform || '',
      status: project?.status || 'ongoing',
      kund: project?.kund || project?.client || '',
      organisationsnummer: project?.organisationsnummer || '',
      kontaktperson: project?.kontaktperson || null,
      telefon: project?.telefon || '',
      epost: project?.epost || project?.email || '',
      adress: project?.adress || '',
      kommun: project?.kommun || '',
      region: project?.region || '',
      fastighetsbeteckning: project?.fastighetsbeteckning || '',
      anbudstid: project?.anbudstid || '',
      byggstart: project?.byggstart || '',
      fardigstallning: project?.fardigstallning || '',
      bindningstid: project?.bindningstid || '',
      anteckningar: project?.anteckningar || project?.beskrivning || ''
    };

    setOriginalValues(newValues);
    setProjectNumber(newValues.projectNumber);
    setProjectName(newValues.projectName);
    setProjectType(newValues.projectType);
    setUpphandlingsform(newValues.upphandlingsform);
    setStatus(newValues.status);
    setKund(newValues.kund);
    setOrganisationsnummer(newValues.organisationsnummer);
    setKontaktperson(newValues.kontaktperson);
    setTelefon(newValues.telefon);
    setEpost(newValues.epost);
    setAdress(newValues.adress);
    setKommun(newValues.kommun);
    setRegion(newValues.region);
    setFastighetsbeteckning(newValues.fastighetsbeteckning);
    setAnbudstid(newValues.anbudstid);
    setByggstart(newValues.byggstart);
    setFardigstallning(newValues.fardigstallning);
    setBindningstid(newValues.bindningstid);
    setAnteckningar(newValues.anteckningar);
    
    // Reset all change flags
    setHasChangesInfo(false);
    setHasChangesKund(false);
    setHasChangesAdress(false);
    setHasChangesTider(false);
    setHasChangesAnteckningar(false);
  }, [project]);
  const [projectType, setProjectType] = useState(project?.projectType || '');
  const [upphandlingsform, setUpphandlingsform] = useState(project?.upphandlingsform || '');
  const [status, setStatus] = useState(project?.status || 'ongoing');

  // Kund & Beställare state
  const [kund, setKund] = useState(project?.kund || project?.client || '');
  const [organisationsnummer, setOrganisationsnummer] = useState(project?.organisationsnummer || '');
  const [kontaktperson, setKontaktperson] = useState(project?.kontaktperson || null); // { type, id, name, email, phone }
  const [telefon, setTelefon] = useState(project?.telefon || '');
  const [epost, setEpost] = useState(project?.epost || project?.email || '');

  // Projektadress & plats state
  const [adress, setAdress] = useState(project?.adress || '');
  const [kommun, setKommun] = useState(project?.kommun || '');
  const [region, setRegion] = useState(project?.region || '');
  const [fastighetsbeteckning, setFastighetsbeteckning] = useState(project?.fastighetsbeteckning || '');

  // Tider & viktiga datum state
  const [anbudstid, setAnbudstid] = useState(project?.anbudstid || '');
  const [byggstart, setByggstart] = useState(project?.byggstart || '');
  const [fardigstallning, setFardigstallning] = useState(project?.fardigstallning || '');
  const [bindningstid, setBindningstid] = useState(project?.bindningstid || '');

  // Kalkylanteckningar state (simplified from "Kalkylkritisk sammanfattning")
  const [anteckningar, setAnteckningar] = useState(project?.anteckningar || project?.beskrivning || '');

  // Person selector modals
  const [kontaktpersonSelectorVisible, setKontaktpersonSelectorVisible] = useState(false);
  
  // Upphandlingsform dropdown state
  const [upphandlingsformDropdownVisible, setUpphandlingsformDropdownVisible] = useState(false);
  
  // Entreprenadform dropdown state
  const [entreprenadformDropdownVisible, setEntreprenadformDropdownVisible] = useState(false);
  
  // Info descriptions for upphandlingsform and entreprenadform
  const upphandlingsformInfo = {
    'Fastpris': 'Ett fast totalpris för hela uppdraget.',
    'Löpande räkning': 'Debitering sker per timme och material.',
    'Budgetpris': 'Ett riktpris som kan justeras under projektets gång.',
    'Partnering': 'Gemensamma mål och öppen ekonomi mellan parter.',
    'Ramavtal': 'Förutbestämda villkor för återkommande uppdrag.',
    'LOU': 'Upphandling enligt lagen om offentlig upphandling.'
  };

  const entreprenadformInfo = {
    'Utförandeentreprenad AB 04': 'Beställaren projekterar, entreprenören utför arbetet.',
    'Totalentreprenad ABT 06': 'Entreprenören ansvarar för både projektering och byggnation.',
    'Generalentreprenad': 'En huvudentreprenör samordnar underentreprenörer.',
    'Delad entreprenad': 'Beställaren har avtal med flera entreprenörer.',
    'Samverkansentreprenad': 'Tätt samarbete under hela projektet.',
    'Partneringsentreprenad': 'Samverkan med gemensam ekonomi och mål.'
  };

  // Upphandlingsform options
  const upphandlingsformOptions = [
    'Fastpris',
    'Löpande räkning',
    'Budgetpris',
    'Partnering',
    'Ramavtal',
    'LOU'
  ];
  
  // Entreprenadform options
  const entreprenadformOptions = [
    'Utförandeentreprenad AB 04',
    'Totalentreprenad ABT 06',
    'Generalentreprenad',
    'Delad entreprenad',
    'Samverkansentreprenad',
    'Partneringsentreprenad'
  ];

  // Info tooltip modal state
  const [infoTooltipVisible, setInfoTooltipVisible] = useState(false);
  const [infoTooltipText, setInfoTooltipText] = useState('');

  // Loading state for save operations
  const [saving, setSaving] = useState(false);

  // Helper function to update project in hierarchy
  const updateProjectInHierarchy = async (updates) => {
    if (!companyId || !projectId) {
      throw new Error('Company ID and Project ID are required');
    }

    try {
      // Fetch current hierarchy
      const hierarchy = await fetchHierarchy(companyId);
      if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
        throw new Error('Could not fetch hierarchy');
      }

      // Log full hierarchy structure for debugging
      console.log('[OversiktSummary] Full hierarchy structure:', JSON.stringify(hierarchy, null, 2));
      console.log('[OversiktSummary] Hierarchy length:', hierarchy.length);

      // Helper function to recursively find and update project
      const findAndUpdateProject = (items, oldId, newId, updates, projectIdChanged) => {
        let found = false;
        const normalizedOldId = String(oldId || '').trim();
        const updated = items.map(item => {
          // Check if this item is the project we're looking for
          // Normalize both IDs for comparison (trim whitespace, case-insensitive)
          const itemId = String(item?.id || '').trim();
          const isMatch = item && item.type === 'project' && itemId === normalizedOldId;
          
          if (isMatch) {
            console.log('[OversiktSummary] ✅ Found project to update:', { 
              oldId: itemId, 
              newId: String(newId).trim(),
              itemName: item.name 
            });
            found = true;
            const updatedProject = {
              ...item,
              ...updates,
              updatedAt: new Date().toISOString()
            };
            
            // If project number changed, update the ID
            if (projectIdChanged) {
              updatedProject.id = String(newId).trim();
              console.log('[OversiktSummary] Project ID changed from', itemId, 'to', updatedProject.id);
            }
            
            return updatedProject;
          }
          
          // If this item has children, recursively search them
          if (item && item.children && Array.isArray(item.children)) {
            const { found: childFound, updated: updatedChildren } = findAndUpdateProject(
              item.children,
              oldId,
              newId,
              updates,
              projectIdChanged
            );
            if (childFound) {
              found = true;
              return { ...item, children: updatedChildren };
            }
          }
          
          return item;
        });
        
        return { found, updated };
      };

      // Find and update the project in hierarchy
      const oldProjectId = projectId;
      const newProjectId = updates.id ? String(updates.id).trim() : projectId;
      const projectIdChanged = newProjectId !== oldProjectId;
      
      console.log('[OversiktSummary] Updating project in hierarchy:', { 
        oldProjectId, 
        newProjectId, 
        projectIdChanged, 
        updates: Object.keys(updates),
        companyId,
        hierarchyLength: hierarchy.length
      });
      
      const { found: projectFound, updated: updatedHierarchy } = findAndUpdateProject(
        hierarchy,
        oldProjectId,
        newProjectId,
        updates,
        projectIdChanged
      );

      if (!projectFound) {
        // Log the hierarchy structure to help debug
        console.error('[OversiktSummary] ❌ Project not found in hierarchy. Searching for:', oldProjectId);
        console.error('[OversiktSummary] Current projectId prop:', projectId);
        console.error('[OversiktSummary] Company ID:', companyId);
        
        // Try to find all projects to help debug
        const allProjects = [];
        const findAllProjects = (items, path = '') => {
          items.forEach((item, index) => {
            const currentPath = path ? `${path}[${index}]` : `[${index}]`;
            if (item && item.type === 'project') {
              allProjects.push({ 
                id: item.id, 
                name: item.name, 
                type: item.type,
                path: currentPath,
                fullItem: item
              });
            }
            if (item && item.children && Array.isArray(item.children)) {
              findAllProjects(item.children, `${currentPath}.children`);
            }
          });
        };
        findAllProjects(hierarchy);
        console.error('[OversiktSummary] All projects in hierarchy:', allProjects);
        console.error('[OversiktSummary] Full hierarchy structure:', JSON.stringify(hierarchy, null, 2));
        
        // Check if project ID matches any project (case-insensitive, trimmed)
        const matchingProject = allProjects.find(p => 
          String(p.id).trim() === String(oldProjectId).trim() ||
          String(p.id).trim() === String(projectId).trim()
        );
        if (matchingProject) {
          console.error('[OversiktSummary] ⚠️ Found project with similar ID:', matchingProject);
        }
        
        throw new Error(`Project not found in hierarchy. Looking for ID: "${oldProjectId}". Found ${allProjects.length} projects: ${allProjects.map(p => `${p.id} (${p.path})`).join(', ')}`);
      }

      // Helper function to recursively find project (define it here so we can use it)
      const findProjectInHierarchy = (items, searchId) => {
        for (const item of items) {
          if (item && item.type === 'project' && String(item.id).trim() === String(searchId).trim()) {
            return item;
          }
          if (item && item.children && Array.isArray(item.children)) {
            const found = findProjectInHierarchy(item.children, searchId);
            if (found) return found;
          }
        }
        return null;
      };
      
      // Verify that the project is actually in the updated hierarchy before saving
      const verifyBeforeSave = findProjectInHierarchy(updatedHierarchy, newProjectId);
      if (!verifyBeforeSave) {
        console.error('[OversiktSummary] ❌ ERROR: Updated project not found in updatedHierarchy before save!');
        console.error('[OversiktSummary] Searching for old ID in updatedHierarchy:', oldProjectId);
        const oldInUpdated = findProjectInHierarchy(updatedHierarchy, oldProjectId);
        if (oldInUpdated) {
          console.error('[OversiktSummary] ❌ Old project ID still exists in updatedHierarchy! Update failed.');
          console.error('[OversiktSummary] Old project data:', { id: oldInUpdated.id, name: oldInUpdated.name });
        }
        throw new Error('Updated project not found in hierarchy before save');
      }
      console.log('[OversiktSummary] ✅ Verified: Updated project exists in hierarchy before save:', {
        id: verifyBeforeSave.id,
        name: verifyBeforeSave.name
      });
      
      // Save updated hierarchy to Firestore
      console.log('[OversiktSummary] Saving hierarchy to Firestore...', {
        companyId,
        hierarchyLength: updatedHierarchy.length,
        projectIdChanged,
        oldId: oldProjectId,
        newId: newProjectId,
        projectInHierarchy: { id: verifyBeforeSave.id, name: verifyBeforeSave.name }
      });
      
      const saveSuccess = await saveHierarchy(companyId, updatedHierarchy);
      if (!saveSuccess) {
        console.error('[OversiktSummary] saveHierarchy returned false - save failed');
        throw new Error('Failed to save hierarchy to Firestore');
      }
      
      console.log('[OversiktSummary] ✅ Hierarchy saved successfully to Firestore!');
      
      // Verify the save by fetching the hierarchy again (wait a bit for Firestore to update)
      console.log('[OversiktSummary] Verifying save by fetching hierarchy from Firestore...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for Firestore to update
      
      const verifyHierarchy = await fetchHierarchy(companyId);
      
      // Use the same helper function defined above
      const verifyProject = findProjectInHierarchy(verifyHierarchy, newProjectId);
      
      if (verifyProject) {
        console.log('[OversiktSummary] ✅ Verification: Project found in Firestore:', {
          id: verifyProject.id,
          name: verifyProject.name,
          path: `foretag/${companyId}/hierarki/state/items[...]`
        });
      } else {
        console.warn('[OversiktSummary] ⚠️ Verification: Project not found after save.');
        console.warn('[OversiktSummary] Searching for old ID instead:', oldProjectId);
        const oldProject = findProjectInHierarchy(verifyHierarchy, oldProjectId);
        if (oldProject) {
          console.error('[OversiktSummary] ❌ ERROR: Old project ID still exists in Firestore! Save may have failed.');
        } else {
          console.warn('[OversiktSummary] ⚠️ Neither old nor new project ID found. This might be a timing issue.');
        }
      }

      // Helper function to recursively find project
      const findProject = (items, searchId) => {
        for (const item of items) {
          if (item && item.type === 'project' && item.id === searchId) {
            return item;
          }
          if (item && item.children && Array.isArray(item.children)) {
            const found = findProject(item.children, searchId);
            if (found) return found;
          }
        }
        return null;
      };

      // Return the updated project (use new ID if it changed)
      const searchId = newProjectId;
      const updatedProject = findProject(updatedHierarchy, searchId);
      
      if (updatedProject) {
        console.log('[OversiktSummary] ✅ Found updated project:', { id: updatedProject.id, name: updatedProject.name });
        return updatedProject;
      }

      console.error('[OversiktSummary] ❌ Could not find updated project with ID:', searchId);
      throw new Error('Could not find updated project after save');
    } catch (error) {
      console.error('[OversiktSummary] Error updating project in hierarchy:', error);
      throw error;
    }
  };

  const statusOptions = [
    { key: 'ongoing', label: 'Pågående', color: '#1976D2', icon: 'play-circle-outline' },
    { key: 'on-hold', label: 'Pausad', color: '#FF9800', icon: 'pause-circle-outline' },
    { key: 'completed', label: 'Avslutad', color: '#4CAF50', icon: 'checkmark-circle-outline' },
    { key: 'cancelled', label: 'Inställd', color: '#F44336', icon: 'close-circle-outline' }
  ];

  // Helper function to check if project info has changes
  const checkInfoChanges = () => {
    return (
      projectNumber.trim() !== (originalValues.projectNumber || '') ||
      projectName.trim() !== (originalValues.projectName || '') ||
      projectType.trim() !== (originalValues.projectType || '') ||
      upphandlingsform.trim() !== (originalValues.upphandlingsform || '') ||
      status !== (originalValues.status || 'ongoing')
    );
  };

  // Helper function to check if kund info has changes
  const checkKundChanges = () => {
    return (
      kund.trim() !== (originalValues.kund || '') ||
      organisationsnummer.trim() !== (originalValues.organisationsnummer || '') ||
      JSON.stringify(kontaktperson) !== JSON.stringify(originalValues.kontaktperson) ||
      telefon.trim() !== (originalValues.telefon || '') ||
      epost.trim() !== (originalValues.epost || '')
    );
  };

  // Helper function to check if adress info has changes
  const checkAdressChanges = () => {
    return (
      adress.trim() !== (originalValues.adress || '') ||
      kommun.trim() !== (originalValues.kommun || '') ||
      region.trim() !== (originalValues.region || '') ||
      fastighetsbeteckning.trim() !== (originalValues.fastighetsbeteckning || '')
    );
  };

  // Helper function to check if tider info has changes
  const checkTiderChanges = () => {
    return (
      anbudstid.trim() !== (originalValues.anbudstid || '') ||
      byggstart.trim() !== (originalValues.byggstart || '') ||
      fardigstallning.trim() !== (originalValues.fardigstallning || '') ||
      bindningstid.trim() !== (originalValues.bindningstid || '')
    );
  };

  // Helper function to check if anteckningar has changes
  const checkAnteckningarChanges = () => {
    return anteckningar.trim() !== (originalValues.anteckningar || '');
  };

  // Memoize originalValues string to prevent unnecessary recalculations
  const originalValuesKey = React.useMemo(() => {
    return JSON.stringify(originalValues);
  }, [originalValues.projectNumber, originalValues.projectName, originalValues.projectType, originalValues.upphandlingsform, originalValues.status, originalValues.kund, originalValues.organisationsnummer, JSON.stringify(originalValues.kontaktperson), originalValues.telefon, originalValues.epost, originalValues.adress, originalValues.kommun, originalValues.region, originalValues.fastighetsbeteckning, originalValues.anbudstid, originalValues.byggstart, originalValues.fardigstallning, originalValues.bindningstid, originalValues.anteckningar]);

  // Calculate changes directly in render instead of useEffect to avoid re-renders during typing
  // These are computed values, not state, to prevent blocking input
  // Use string comparison for originalValues to avoid object reference issues
  const hasChangesInfoComputed = React.useMemo(() => checkInfoChanges(), [projectNumber, projectName, projectType, upphandlingsform, status, originalValuesKey]);
  const hasChangesKundComputed = React.useMemo(() => checkKundChanges(), [kund, organisationsnummer, JSON.stringify(kontaktperson), telefon, epost, originalValuesKey]);
  const hasChangesAdressComputed = React.useMemo(() => checkAdressChanges(), [adress, kommun, region, fastighetsbeteckning, originalValuesKey]);
  const hasChangesTiderComputed = React.useMemo(() => checkTiderChanges(), [anbudstid, byggstart, fardigstallning, bindningstid, originalValuesKey]);
  const hasChangesAnteckningarComputed = React.useMemo(() => checkAnteckningarChanges(), [anteckningar, originalValuesKey]);

  // Sync computed values to state (only when they actually change)
  useEffect(() => {
    if (hasChangesInfoComputed !== hasChangesInfo) {
      setHasChangesInfo(hasChangesInfoComputed);
    }
    if (hasChangesKundComputed !== hasChangesKund) {
      setHasChangesKund(hasChangesKundComputed);
    }
    if (hasChangesAdressComputed !== hasChangesAdress) {
      setHasChangesAdress(hasChangesAdressComputed);
    }
    if (hasChangesTiderComputed !== hasChangesTider) {
      setHasChangesTider(hasChangesTiderComputed);
    }
    if (hasChangesAnteckningarComputed !== hasChangesAnteckningar) {
      setHasChangesAnteckningar(hasChangesAnteckningarComputed);
    }
  }, [hasChangesInfoComputed, hasChangesKundComputed, hasChangesAdressComputed, hasChangesTiderComputed, hasChangesAnteckningarComputed]);

  // Memoized onChange handlers to prevent InfoRow re-renders
  const handleProjectNumberChange = useCallback((val) => {
    setProjectNumber(val);
  }, []);

  const handleProjectNameChange = useCallback((val) => {
    setProjectName(val);
  }, []);

  const handleProjectTypeChange = useCallback((val) => {
    setProjectType(val);
  }, []);

  const handleUpphandlingsformChange = useCallback((val) => {
    setUpphandlingsform(val);
  }, []);

  const handleKundChange = useCallback((val) => {
    setKund(val);
  }, []);

  const handleOrganisationsnummerChange = useCallback((val) => {
    setOrganisationsnummer(val);
  }, []);

  const handleTelefonChange = useCallback((val) => {
    setTelefon(val);
  }, []);

  const handleEpostChange = useCallback((val) => {
    setEpost(val);
  }, []);

  const handleAdressChange = useCallback((val) => {
    setAdress(val);
  }, []);

  const handleKommunChange = useCallback((val) => {
    setKommun(val);
  }, []);

  const handleRegionChange = useCallback((val) => {
    setRegion(val);
  }, []);

  const handleFastighetsbeteckningChange = useCallback((val) => {
    setFastighetsbeteckning(val);
  }, []);

  const handleAnbudstidChange = useCallback((val) => {
    setAnbudstid(val);
  }, []);

  const handleByggstartChange = useCallback((val) => {
    setByggstart(val);
  }, []);

  const handleFardigstallningChange = useCallback((val) => {
    setFardigstallning(val);
  }, []);

  const handleBindningstidChange = useCallback((val) => {
    setBindningstid(val);
  }, []);

  const handleAnteckningarChange = useCallback((val) => {
    setAnteckningar(val);
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* 1. Projektstatus - At the top with large status buttons (like ChatGPT's layout) */}
        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>Projektstatus</Text>
          <Text style={styles.statusSubtitle}>Hantera projektets status och översikt</Text>
          <View style={styles.statusButtons}>
            {statusOptions.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.statusButton,
                  status === option.key && styles.statusButtonActive,
                  { borderColor: option.color }
                ]}
                onPress={async () => {
                  const newStatus = option.key;
                  setStatus(newStatus);
                  
                  // Auto-save status change
                  if (!saving && companyId && projectId) {
                    setSaving(true);
                    try {
                      const updates = { status: newStatus };
                      const updatedProject = await updateProjectInHierarchy(updates);
                      emitProjectUpdated(updatedProject);
                      // Update originalValues to reflect the saved status
                      setOriginalValues(prev => ({
                        ...prev,
                        status: newStatus
                      }));
                      // Check if there are still other changes in project info
                      setHasChangesInfo(checkInfoChanges());
                    } catch (error) {
                      console.error('[OversiktSummary] Error saving status:', error);
                      // Revert status on error
                      setStatus(project?.status || 'ongoing');
                      Alert.alert('Fel', `Kunde inte spara status: ${error.message || 'Okänt fel'}`);
                    } finally {
                      setSaving(false);
                    }
                  }
                }}
              >
                <Ionicons 
                  name={option.icon} 
                  size={24} 
                  color={status === option.key ? option.color : '#666'} 
                />
                <Text style={[
                  styles.statusButtonText,
                  status === option.key && { color: option.color, fontWeight: '600' }
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 2. Projektinfo and Kund & Beställare - Row 1 */}
        <View style={styles.twoColumnRow}>
          <View style={styles.columnCard}>
        <InfoCard
          title="Projektinfo"
          icon="information-circle-outline"
          hasChanges={hasChangesInfo}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            
            // Validate required fields
            if (!projectNumber.trim()) {
              Alert.alert('Fel', 'Projektnummer är obligatoriskt');
              return;
            }
            if (!projectName.trim()) {
              Alert.alert('Fel', 'Projektnamn är obligatoriskt');
              return;
            }

            setSaving(true);
            try {
              const updates = {
                id: projectNumber.trim(),
                name: projectName.trim(),
                projectType: projectType.trim(),
                upphandlingsform: upphandlingsform.trim(),
                status
              };

              console.log('[OversiktSummary] Starting save of project info:', updates);
              const updatedProject = await updateProjectInHierarchy(updates);
              console.log('[OversiktSummary] Project updated successfully:', { id: updatedProject.id, name: updatedProject.name });
              
              // Check if project ID changed
              const projectIdChanged = updates.id && String(updates.id).trim() !== String(projectId).trim();
              
              // Emit project update event with old ID info if ID changed
              if (projectIdChanged) {
                console.log('[OversiktSummary] Project ID changed, emitting with oldId:', projectId, 'newId:', updatedProject.id);
                emitProjectUpdated({
                  ...updatedProject,
                  _oldId: projectId, // Include old ID for reference
                  _idChanged: true
                });
              } else {
                emitProjectUpdated(updatedProject);
              }
              
              // Update original values and reset change flag
              setOriginalValues(prev => ({
                ...prev,
                projectNumber: projectNumber.trim(),
                projectName: projectName.trim(),
                projectType: projectType.trim(),
                upphandlingsform: upphandlingsform.trim(),
                status
              }));
              setHasChangesInfo(false);
              Alert.alert('Sparat', 'Projektinfo har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving project info:', error);
              Alert.alert('Fel', `Kunde inte spara projektinfo: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => {
            // Reset to original values
            setProjectNumber(originalValues.projectNumber || '');
            setProjectName(originalValues.projectName || '');
            setProjectType(originalValues.projectType || '');
            setUpphandlingsform(originalValues.upphandlingsform || '');
            setStatus(originalValues.status || 'ongoing');
            setHasChangesInfo(false);
          }}
        >
          <InfoRow
            key="projektnummer"
            label="Projektnummer"
            value={projectNumber}
            onChange={handleProjectNumberChange}
            placeholder="T.ex. 2026-001"
            originalValue={originalValues.projectNumber || ''}
          />
          <InfoRow
            key="projektnamn"
            label="Projektnamn"
            value={projectName}
            onChange={handleProjectNameChange}
            placeholder="T.ex. Opus Bilprovning"
            originalValue={originalValues.projectName || ''}
          />
          <SelectRow
            label="Upphandlingsform"
            value={projectType}
            options={upphandlingsformOptions}
            onSelect={handleProjectTypeChange}
            placeholder="Välj upphandlingsform..."
            originalValue={originalValues.projectType || ''}
            visible={upphandlingsformDropdownVisible}
            onToggleVisible={() => setUpphandlingsformDropdownVisible(!upphandlingsformDropdownVisible)}
            optionInfo={upphandlingsformInfo}
            onInfoPress={(infoText, optionText) => {
              // Close dropdown when opening info modal
              setUpphandlingsformDropdownVisible(false);
              setInfoTooltipText(`${optionText}: ${infoText}`);
              setInfoTooltipVisible(true);
            }}
          />
          <SelectRow
            label="Entreprenadform"
            value={upphandlingsform}
            options={entreprenadformOptions}
            onSelect={handleUpphandlingsformChange}
            placeholder="Välj entreprenadform..."
            originalValue={originalValues.upphandlingsform || ''}
            visible={entreprenadformDropdownVisible}
            onToggleVisible={() => setEntreprenadformDropdownVisible(!entreprenadformDropdownVisible)}
            optionInfo={entreprenadformInfo}
            onInfoPress={(infoText, optionText) => {
              // Close dropdown when opening info modal
              setEntreprenadformDropdownVisible(false);
              setInfoTooltipText(`${optionText}: ${infoText}`);
              setInfoTooltipVisible(true);
            }}
          />
        </InfoCard>
          </View>

          <View style={styles.columnCard}>
        <InfoCard
          title="Kund & Beställare"
          icon="person-outline"
          hasChanges={hasChangesKund}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            setSaving(true);
            try {
              const updates = {
                kund: kund.trim(),
                organisationsnummer: organisationsnummer.trim(),
                kontaktperson,
                telefon: telefon.trim(),
                epost: epost.trim()
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);
              
              setOriginalValues(prev => ({
                ...prev,
                kund: kund.trim(),
                organisationsnummer: organisationsnummer.trim(),
                kontaktperson,
                telefon: telefon.trim(),
                epost: epost.trim()
              }));
              setHasChangesKund(false);
              Alert.alert('Sparat', 'Kundinformation har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving kund info:', error);
              Alert.alert('Fel', `Kunde inte spara kundinformation: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => {
            setKund(originalValues.kund || '');
            setOrganisationsnummer(originalValues.organisationsnummer || '');
            setKontaktperson(originalValues.kontaktperson || null);
            setTelefon(originalValues.telefon || '');
            setEpost(originalValues.epost || '');
            setHasChangesKund(false);
          }}
        >
          <InfoRow
            key="kund"
            label="Företag"
            value={kund}
            onChange={handleKundChange}
            placeholder="Kundens företagsnamn"
            originalValue={originalValues.kund || ''}
          />
          <InfoRow
            key="organisationsnummer"
            label="Organisationsnummer"
            value={organisationsnummer}
            onChange={handleOrganisationsnummerChange}
            placeholder="Org.nr"
            originalValue={originalValues.organisationsnummer || ''}
          />
          <PersonRow
            label="Kontaktperson"
            person={kontaktperson}
            onSelect={() => setKontaktpersonSelectorVisible(true)}
            placeholder="Välj kontaktperson..."
            hasChanged={JSON.stringify(kontaktperson) !== JSON.stringify(originalValues.kontaktperson)}
          />
          <InfoRow
            key="telefon"
            label="Telefon"
            value={telefon}
            onChange={handleTelefonChange}
            placeholder="Telefonnummer"
            originalValue={originalValues.telefon || ''}
          />
          <InfoRow
            key="epost"
            label="E-post"
            value={epost}
            onChange={handleEpostChange}
            placeholder="E-postadress"
            originalValue={originalValues.epost || ''}
          />
        </InfoCard>
          </View>
        </View>

        {/* 3. Projektadress and Viktiga datum - Row 2 */}
        <View style={styles.twoColumnRow}>
          <View style={styles.columnCard}>
        <InfoCard
          title="Projektadress"
          icon="location-outline"
          hasChanges={hasChangesAdress}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            setSaving(true);
            try {
              const updates = {
                adress: adress.trim(),
                kommun: kommun.trim(),
                region: region.trim(),
                fastighetsbeteckning: fastighetsbeteckning.trim()
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);
              
              setOriginalValues(prev => ({
                ...prev,
                adress: adress.trim(),
                kommun: kommun.trim(),
                region: region.trim(),
                fastighetsbeteckning: fastighetsbeteckning.trim()
              }));
              setHasChangesAdress(false);
              Alert.alert('Sparat', 'Adressinformation har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving adress info:', error);
              Alert.alert('Fel', `Kunde inte spara adressinformation: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => {
            setAdress(originalValues.adress || '');
            setKommun(originalValues.kommun || '');
            setRegion(originalValues.region || '');
            setFastighetsbeteckning(originalValues.fastighetsbeteckning || '');
            setHasChangesAdress(false);
          }}
        >
          <InfoRow
            key="adress"
            label="Adress"
            value={adress}
            onChange={handleAdressChange}
            placeholder="Gatuadress"
            originalValue={originalValues.adress || ''}
          />
          <InfoRow
            key="kommun"
            label="Ort"
            value={kommun}
            onChange={handleKommunChange}
            placeholder="Ort"
            originalValue={originalValues.kommun || ''}
          />
          <InfoRow
            key="region"
            label="Kommun"
            value={region}
            onChange={handleRegionChange}
            placeholder="Kommun"
            originalValue={originalValues.region || ''}
          />
          <InfoRow
            key="fastighetsbeteckning"
            label="Fastighet"
            value={fastighetsbeteckning}
            onChange={handleFastighetsbeteckningChange}
            placeholder="Fastighetsbeteckning"
            originalValue={originalValues.fastighetsbeteckning || ''}
          />
        </InfoCard>
          </View>

          <View style={styles.columnCard}>
        <InfoCard
          title="Viktiga datum"
          icon="calendar-outline"
          hasChanges={hasChangesTider}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            setSaving(true);
            try {
              const updates = {
                anbudstid: anbudstid.trim(),
                byggstart: byggstart.trim(),
                fardigstallning: fardigstallning.trim(),
                bindningstid: bindningstid.trim()
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);
              
              setOriginalValues(prev => ({
                ...prev,
                anbudstid: anbudstid.trim(),
                byggstart: byggstart.trim(),
                fardigstallning: fardigstallning.trim(),
                bindningstid: bindningstid.trim()
              }));
              setHasChangesTider(false);
              Alert.alert('Sparat', 'Datuminformation har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving tider info:', error);
              Alert.alert('Fel', `Kunde inte spara datuminformation: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => {
            setAnbudstid(originalValues.anbudstid || '');
            setByggstart(originalValues.byggstart || '');
            setFardigstallning(originalValues.fardigstallning || '');
            setBindningstid(originalValues.bindningstid || '');
            setHasChangesTider(false);
          }}
        >
          <InfoRow
            key="anbudstid"
            label="Anbudstid"
            value={anbudstid}
            onChange={handleAnbudstidChange}
            originalValue={originalValues.anbudstid || ''}
            placeholder="YYYY-MM-DD"
          />
          <InfoRow
            key="byggstart"
            label="Planerad byggstart"
            value={byggstart}
            onChange={handleByggstartChange}
            originalValue={originalValues.byggstart || ''}
            placeholder="YYYY-MM-DD"
          />
          <InfoRow
            key="fardigstallning"
            label="Planerad färdigställning"
            value={fardigstallning}
            onChange={handleFardigstallningChange}
            originalValue={originalValues.fardigstallning || ''}
            placeholder="YYYY-MM-DD"
          />
          <InfoRow
            key="bindningstid"
            label="Bindningstid"
            value={bindningstid}
            onChange={handleBindningstidChange}
            originalValue={originalValues.bindningstid || ''}
            placeholder="T.ex. 3 månader"
          />
        </InfoCard>
          </View>
        </View>

        {/* 4. Anteckningar - Full width at bottom */}
        <InfoCard
          title="Anteckningar"
          icon="document-text-outline"
          hasChanges={hasChangesAnteckningar}
          saving={saving}
          onSave={async () => {
            if (saving) return;
            setSaving(true);
            try {
              const updates = {
                anteckningar: anteckningar.trim()
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);
              
              setOriginalValues(prev => ({
                ...prev,
                anteckningar: anteckningar.trim()
              }));
              setHasChangesAnteckningar(false);
              Alert.alert('Sparat', 'Anteckningar har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving anteckningar:', error);
              Alert.alert('Fel', `Kunde inte spara anteckningar: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => {
            setAnteckningar(originalValues.anteckningar || '');
            setHasChangesAnteckningar(false);
          }}
        >
          <AnteckningarInput
            value={anteckningar}
            onChange={handleAnteckningarChange}
            placeholder="Lägg till anteckningar om projektet..."
            originalValue={originalValues.anteckningar || ''}
          />
        </InfoCard>
      </View>

      {/* Person Selector Modals */}
      <PersonSelector
        visible={kontaktpersonSelectorVisible}
        onClose={() => setKontaktpersonSelectorVisible(false)}
        onSelect={(person) => {
          setKontaktperson(person);
          // Auto-fill email and phone if available
          if (person && person.email) {
            setEpost(person.email);
          }
          if (person && person.phone) {
            setTelefon(person.phone);
          }
          setHasChangesKund(checkKundChanges());
        }}
        companyId={companyId}
        value={kontaktperson}
        label="Välj kontaktperson"
      />

      {/* Info Tooltip Modal - Rendered after dropdown modals to appear on top */}
      <Modal
        visible={infoTooltipVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInfoTooltipVisible(false)}
        presentationStyle="overFullScreen"
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            zIndex: 9999999, // Higher than dropdown to appear on top
            ...(Platform.OS === 'web' ? {
              zIndex: 9999999,
            } : {}),
          }}
          activeOpacity={1}
          onPress={() => setInfoTooltipVisible(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 20,
              maxWidth: 400,
              width: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 30, // Higher than dropdown elevation
              zIndex: 9999999,
              ...(Platform.OS === 'web' ? {
                zIndex: 9999999,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              } : {}),
            }}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
              <Ionicons name="information-circle" size={24} color="#1976D2" style={{ marginRight: 12, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 8 }}>
                  Information
                </Text>
                <Text style={{ fontSize: 14, color: '#475569', lineHeight: 20 }}>
                  {infoTooltipText}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setInfoTooltipVisible(false)}
                style={{
                  padding: 4,
                  marginLeft: 8,
                  ...(Platform.OS === 'web' ? {
                    cursor: 'pointer',
                  } : {}),
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setInfoTooltipVisible(false)}
              style={{
                backgroundColor: '#1976D2',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 8,
                ...(Platform.OS === 'web' ? {
                  cursor: 'pointer',
                } : {}),
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Stäng</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  content: {
    padding: 24,
    paddingBottom: 80 // Increased bottom padding for spacing after Anteckningar
  },
  // Two column layout
  twoColumnRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    position: 'relative',
    zIndex: 1, // Lower zIndex so dropdown can go above
  },
  columnCard: {
    flex: 1,
    minWidth: 0, // Allow flex items to shrink below their content size
    alignSelf: 'stretch', // Make cards equal height
    position: 'relative',
    zIndex: 1, // Lower zIndex so dropdown can go above
  },
  // Status section (at top)
  statusSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  statusButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    gap: 8
  },
  statusButtonActive: {
    backgroundColor: '#fff',
    borderWidth: 2
  },
  statusButtonText: {
    fontSize: 14,
    color: '#666'
  },
  // Card styles
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    flex: 1, // Make cards equal height within their row
    flexDirection: 'column', // Ensure column layout for flex to work
    overflow: 'visible', // Allow dropdown to extend outside card
    position: 'relative',
    zIndex: 1 // Lower zIndex to allow dropdown to go above
  },
  cardHasChanges: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  cardIcon: {
    marginRight: 8
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222'
  },
  changesIndicator: {
    marginLeft: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFA726'
  },
  changesIndicatorText: {
    fontSize: 12,
    color: '#FFA726',
    fontWeight: 'bold'
  },
  editButton: {
    padding: 6
  },
  editActions: {
    flexDirection: 'row',
    gap: 8
  },
  saveButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  saveButtonDisabled: {
    opacity: 0.6
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14
  },
  cardContent: {
    padding: 16,
    flex: 1, // Allow content to expand and fill available space
    overflow: 'visible', // Allow dropdown to extend outside card content
    position: 'relative',
    zIndex: 1 // Lower zIndex to allow dropdown to go above
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start'
  },
  infoRowChanged: {
    backgroundColor: '#FFF8E1',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 160,
    fontWeight: '600'
  },
  infoValue: {
    fontSize: 14,
    color: '#222',
    flex: 1
  },
  infoInput: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#fff'
  },
  infoInputChanged: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  },
  infoInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  // Person selector styles
  personSelectorButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#fff'
  },
  personSelectorButtonChanged: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  },
  personInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  personIcon: {
    marginTop: 2
  },
  personDetails: {
    flex: 1,
    flexDirection: 'column',
    gap: 2
  },
  personName: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500'
  },
  personPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  personEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  personPlaceholder: {
    fontSize: 14,
    color: '#999',
    flex: 1
  },
  // Dropdown styles
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderTopWidth: 0, // Remove top border to connect with input
    borderRadius: 6,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 25,
    maxHeight: 280, // Increased height for better visibility
    overflow: 'scroll', // Make it scrollable
    zIndex: 999999,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      zIndex: 999999,
      overflowY: 'auto', // Enable vertical scrolling on web
      maxHeight: '280px',
    } : {}),
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  dropdownItemSelected: {
    backgroundColor: '#f5f5f5'
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#222'
  },
  dropdownItemTextSelected: {
    color: '#1976D2',
    fontWeight: '600'
  },
  // Anteckningar styles
  anteckningarContainer: {
    width: '100%'
  },
  anteckningarInput: {
    width: '100%',
    minHeight: 150,
    fontSize: 14,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
    maxHeight: 600 // Maximum height before scrolling
  },
  anteckningarInputChanged: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  }
});

// InfoCard component - defined at module level to prevent re-creation on every render
const InfoCard = React.memo(({ title, icon, children, hasChanges, onSave, onCancel, saving }) => (
  <View style={[styles.card, hasChanges && styles.cardHasChanges]}>
    <View style={styles.cardHeader}>
      <View style={styles.cardTitleRow}>
        <Ionicons name={icon} size={20} color="#1976D2" style={styles.cardIcon} />
        <Text style={styles.cardTitle}>{title}</Text>
        {hasChanges && (
          <View style={styles.changesIndicator}>
            <Text style={styles.changesIndicatorText}>•</Text>
          </View>
        )}
      </View>
      {hasChanges && (
        <View style={styles.editActions}>
          <TouchableOpacity 
            onPress={onSave} 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Sparar...' : 'Spara'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={onCancel} 
            style={styles.cancelButton}
            disabled={saving}
          >
            <Text style={styles.cancelButtonText}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
    <View style={styles.cardContent}>
      {children}
    </View>
  </View>
));

// InfoRow component - defined at module level to prevent re-creation on every render
// Completely uncontrolled - maintains its own state to prevent focus loss
const InfoRow = ({ label, value, onChange, placeholder, multiline = false, originalValue = '' }) => {
  // Initialize local state from prop, but don't update from prop while typing
  const [localValue, setLocalValue] = React.useState(() => String(value || ''));
  const isFocusedRef = React.useRef(false);
  const prevValueRef = React.useRef(value);
  
  // Only update local value if prop value changed externally (not from our onChange)
  React.useEffect(() => {
    // If not focused and value prop changed, update local value
    if (!isFocusedRef.current && prevValueRef.current !== value) {
      setLocalValue(String(value || ''));
      prevValueRef.current = value;
    }
  }, [value]);
  
  const handleChangeText = React.useCallback((text) => {
    setLocalValue(text);
    // Call parent onChange immediately
    onChange(text);
  }, [onChange]);
  
  const handleFocus = React.useCallback(() => {
    isFocusedRef.current = true;
  }, []);
  
  const handleBlur = React.useCallback(() => {
    isFocusedRef.current = false;
    // Update prevValueRef to current prop value on blur
    prevValueRef.current = value;
  }, [value]);
  
  const originalString = String(originalValue || '');
  const hasChanged = localValue.trim() !== originalString.trim();
  
  return (
    <View style={[styles.infoRow, hasChanged && styles.infoRowChanged]}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <TextInput
        value={localValue}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        style={[styles.infoInput, multiline && styles.infoInputMultiline, hasChanged && styles.infoInputChanged]}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
      />
    </View>
  );
};

// AnteckningarInput component - large text area for notes
const AnteckningarInput = ({ value, onChange, placeholder, originalValue = '' }) => {
  // Use local state to maintain value while user is typing
  const [localValue, setLocalValue] = React.useState(() => String(value || ''));
  const [height, setHeight] = React.useState(150); // Start with minHeight
  const isFocusedRef = React.useRef(false);
  const prevValueRef = React.useRef(value);
  
  // Only update local value if prop value changed externally (not from our onChange)
  React.useEffect(() => {
    if (!isFocusedRef.current && prevValueRef.current !== value) {
      setLocalValue(String(value || ''));
      prevValueRef.current = value;
    }
  }, [value]);
  
  const handleChangeText = React.useCallback((text) => {
    setLocalValue(text);
    onChange(text);
  }, [onChange]);
  
  const handleFocus = React.useCallback(() => {
    isFocusedRef.current = true;
  }, []);
  
  const handleBlur = React.useCallback(() => {
    isFocusedRef.current = false;
    prevValueRef.current = value;
  }, [value]);
  
  const handleContentSizeChange = React.useCallback((event) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const calculatedHeight = Math.max(150, contentHeight + 24); // minHeight 150, add padding
    const maxAllowedHeight = 600; // Maximum height before scrolling
    
    // Only update height if content actually exceeds current visible area
    // Don't shrink below minimum, but allow growth when content exceeds current height
    if (calculatedHeight > height) {
      // Content exceeds current height - grow to fit (but max at 600)
      setHeight(Math.min(calculatedHeight, maxAllowedHeight));
    }
    // If content shrinks, keep current height (don't shrink dynamically)
  }, [height]);
  
  const hasChanged = localValue.trim() !== String(originalValue || '').trim();
  
  return (
    <View style={styles.anteckningarContainer}>
      <TextInput
        value={localValue}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onContentSizeChange={handleContentSizeChange}
        placeholder={placeholder}
        style={[
          styles.anteckningarInput,
          { height },
          hasChanged && styles.anteckningarInputChanged
        ]}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
};

// PersonRow component - defined at module level to prevent re-creation on every render
const PersonRow = React.memo(({ label, person, onSelect, placeholder, hasChanged = false }) => {
  return (
    <View style={[styles.infoRow, hasChanged && styles.infoRowChanged]}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <TouchableOpacity
        style={[styles.personSelectorButton, hasChanged && styles.personSelectorButtonChanged]}
        onPress={onSelect}
      >
        {person ? (
          <View style={styles.personInfo}>
            <Ionicons 
              name={person.type === 'user' ? 'person-circle-outline' : 'person-outline'} 
              size={20} 
              color={person.type === 'user' ? '#1976D2' : '#FF9800'} 
              style={styles.personIcon}
            />
            <View style={styles.personDetails}>
              <Text style={styles.personName}>{person.name}</Text>
              {person.phone && (
                <Text style={styles.personPhone}>{person.phone}</Text>
              )}
              {person.email && (
                <Text style={styles.personEmail}>{person.email}</Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.personPlaceholder}>{placeholder}</Text>
        )}
        <Ionicons name="chevron-forward" size={18} color="#999" />
      </TouchableOpacity>
    </View>
  );
});

// InfoTooltip component - shows info icon with description
const InfoTooltip = ({ info, onPress }) => {
  if (!info) return null;
  
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        marginLeft: 6,
        padding: 4,
        ...(Platform.OS === 'web' ? {
          cursor: 'pointer',
        } : {}),
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
    </TouchableOpacity>
  );
};

// SelectRow component - dropdown with options like the design from image 1
const SelectRow = ({ label, value, options, onSelect, placeholder, originalValue = '', visible, onToggleVisible, optionInfo = {}, onInfoPress }) => {
  const hasChanged = String(value || '').trim() !== String(originalValue || '').trim();
  const inputRef = React.useRef(null);
  const rowRef = React.useRef(null);
  const [dropdownPosition, setDropdownPosition] = React.useState({ x: 0, y: 0, width: 0 });
  
  const measurePosition = React.useCallback(() => {
    if (!rowRef.current) return;
    
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      try {
        if (!rowRef.current || !rowRef.current.measure) return;
        
        rowRef.current.measure((fx, fy, width, height, px, py) => {
          if (Platform.OS === 'web') {
            // On web with position: fixed, convert page coordinates to viewport coordinates
            const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
            const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;
            setDropdownPosition({ 
              x: (px + 160) - scrollX,  // Convert to viewport coords for position: fixed
              y: (py + height - 4) - scrollY,
              width: Math.max(200, width - 160) 
            });
          } else {
            // Native: use page coordinates directly (position: absolute)
            setDropdownPosition({ 
              x: px + 160, 
              y: py + height - 1,
              width: Math.max(200, width - 160) 
            });
          }
        });
      } catch (e) {
        console.warn('[SelectRow] Error measuring position:', e);
      }
    });
  }, []);
  
  React.useEffect(() => {
    if (visible) {
      measurePosition();
      
      // On web, prevent body scroll lock when dropdown is open
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'auto'; // Allow scrolling
        
        return () => {
          document.body.style.overflow = originalOverflow;
        };
      }
    }
  }, [visible, measurePosition]);
  
  return (
    <>
      <View 
        ref={rowRef}
        style={{ 
          position: 'relative',
        }}
        onLayout={(e) => {
          // Only measure position when dropdown becomes visible (not on every layout change)
          // Position is already set by measurePosition() when dropdown opens
        }}
      >
        <View style={[styles.infoRow, hasChanged && styles.infoRowChanged]}>
          <Text style={styles.infoLabel}>{label}:</Text>
          <View style={{ flex: 1, position: 'relative' }}>
            <TextInput
              ref={inputRef}
              value={value || ''}
              placeholder={placeholder}
              editable={false}
              style={[styles.infoInput, hasChanged && styles.infoInputChanged, { paddingRight: 35 }]}
              autoCapitalize="none"
              autoCorrect={false}
              pointerEvents="none"
            />
            <TouchableOpacity
              style={{
                position: 'absolute',
                right: 8,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 8
              }}
              onPress={onToggleVisible}
            >
              <Ionicons 
                name={visible ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      
      {visible && (
        Platform.OS === 'web' ? (
          // On web: Render without Modal, use fixed positioning for scroll-proof dropdown
          <>
            <Pressable
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                zIndex: 999998,
                pointerEvents: 'auto',
                backgroundColor: 'transparent',
              }}
              onPress={onToggleVisible}
            />
            <Pressable
              style={[
                styles.dropdownList,
                {
                  position: 'fixed',
                  left: dropdownPosition.x || 160,
                  top: (dropdownPosition.y || 0) - 4,
                  width: dropdownPosition.width || 300,
                  marginTop: 0,
                  zIndex: 999999,
                }
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              {options.map((option, index) => (
                <TouchableOpacity
                  key={option.value || option || index}
                  style={[
                    styles.dropdownItem,
                    (value === option || value === option.value) && styles.dropdownItemSelected
                  ]}
                  onPress={() => {
                    onSelect(option.value || option);
                    onToggleVisible();
                  }}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[
                      styles.dropdownItemText,
                      (value === option || value === option.value) && styles.dropdownItemTextSelected,
                      { flex: 1 }
                    ]}>
                      {option.label || option}
                    </Text>
                    {optionInfo[option.label || option] && onInfoPress && (
                      <InfoTooltip
                        info={optionInfo[option.label || option]}
                        onPress={(e) => {
                          if (e && typeof e.stopPropagation === 'function') {
                            e.stopPropagation();
                          }
                          const optionText = option.label || option;
                          const infoText = optionInfo[optionText];
                          if (infoText && onInfoPress) {
                            onInfoPress(infoText, optionText);
                          }
                        }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </Pressable>
          </>
        ) : (
          // Native: Use Modal as before
          <Modal
            visible={visible}
            transparent={true}
            animationType="none"
            onRequestClose={onToggleVisible}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={onToggleVisible}
            >
              <Pressable
                style={[
                  styles.dropdownList,
                  {
                    position: 'absolute',
                    left: dropdownPosition.x || 160,
                    top: (dropdownPosition.y || 0) - 4,
                    width: dropdownPosition.width || 300,
                    marginTop: 0,
                  }
                ]}
                onPress={(e) => e.stopPropagation()}
              >
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={option.value || option || index}
                    style={[
                      styles.dropdownItem,
                      (value === option || value === option.value) && styles.dropdownItemSelected
                    ]}
                    onPress={() => {
                      onSelect(option.value || option);
                      onToggleVisible();
                    }}
                  >
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[
                        styles.dropdownItemText,
                        (value === option || value === option.value) && styles.dropdownItemTextSelected,
                        { flex: 1 }
                      ]}>
                        {option.label || option}
                      </Text>
                      {optionInfo[option.label || option] && onInfoPress && (
                        <InfoTooltip
                          info={optionInfo[option.label || option]}
                          onPress={(e) => {
                            if (e && typeof e.stopPropagation === 'function') {
                              e.stopPropagation();
                            }
                            const optionText = option.label || option;
                            const infoText = optionInfo[optionText];
                            if (infoText && onInfoPress) {
                              onInfoPress(infoText, optionText);
                            }
                          }}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </Pressable>
            </Pressable>
          </Modal>
        )
      )}
    </>
  );
};
