



import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchCompanyProfile } from '../components/firebase';

function getFullName(email) {
  if (!email) return '';
  const parts = email.split('@')[0].split('.');
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function ProjectDetails({ route }) {
  // State för modal för val av kontrolltyp
  // Viktig: controls måste alltid vara ett array!
  const [controls, setControls] = useState([]);
  const [showControlTypeModal, setShowControlTypeModal] = useState(false);
  // State för kontrolltypväljare
  const [showControlPicker, setShowControlPicker] = useState(false);
  // Säker destructure av params
  const { project, createdBy, selectedAction, companyId: passedCompanyId } = route.params || {};
  // Fallback: försök hämta companyId från projektet, annars defaulta till demo-company
  const companyId = passedCompanyId || (project && project.companyId) || 'demo-company';

  // State för redigera-projektinfo-modal
  const [editingInfo, setEditingInfo] = useState(false);
  // State for long-press popup for edit/delete control
  const [showControlOptions, setShowControlOptions] = useState(false);
  const [selectedControl, setSelectedControl] = useState(null);
  // Initiera editableProject med fallback om project saknas
  const [editableProject, setEditableProject] = useState(() => {
    if (project) {
      return {
        id: project.id,
        name: project.name,
        client: project.client || '',
        createdAt: project.createdAt,
        createdBy: project.createdBy || createdBy || '',
      };
    } else {
      return {
        id: '',
        name: '',
        client: '',
        createdAt: '',
        createdBy: createdBy || '',
      };
    }
  });
  // Övrig state
  const [showForm, setShowForm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportFilter, setExportFilter] = useState('Alla');
  const [companyLogoUri, setCompanyLogoUri] = useState(null);
  const [newControl, setNewControl] = useState({ type: '', date: '', description: '', byggdel: '' });
  const [undoState, setUndoState] = useState({ visible: false, item: null, index: -1 });
  const undoTimerRef = useRef(null);
  const [expandedByType, setExpandedByType] = useState({});
  // Flyttade hit från render: hanterar expand/collapse och valda kontroller i skriv ut-popup
  const [expandedType, setExpandedType] = useState(null);
  const [selectedControls, setSelectedControls] = useState([]);
  const controlTypes = [
    'Arbetsberedning',
    'Egenkontroll',
    'Fuktmätning',
    'Riskbedömning',
    'Skyddsrond'
  ].sort();

  // Handler for long-press on a control
  const handleControlLongPress = (control) => {
    setSelectedControl(control);
    setShowControlOptions(true);
  };

  // Handler for deleting selected control
  const handleDeleteSelectedControl = async () => {
    if (!selectedControl) return;
    await onDeletePress(selectedControl.id);
    setShowControlOptions(false);
    setSelectedControl(null);
  };

  // Handler for editing selected control (placeholder)
  const handleEditSelectedControl = () => {
    setShowControlOptions(false);
    // Exempel: navigation.navigate('ControlEdit', { control: selectedControl, project })
  };

  // Om selectedAction skickas med från HomeScreen, öppna direkt formuläret
  React.useEffect(() => {
    if (selectedAction) {
      const today = new Date().toISOString().split('T')[0];
      setNewControl({ type: selectedAction, date: today, description: '' });
      setShowForm(true);
    }
  }, [selectedAction]);

  // Helper to build scoped keys
  const getKeys = () => ({
    controls: `company:${companyId}:project:${project.id}:controls`,
    info: `company:${companyId}:project:${project.id}:info`,
    legacyControls: `project:${project.id}:controls`,
    legacyInfo: `project:${project.id}:info`,
  });

  const [notice, setNotice] = useState({ visible: false, text: '' });

  // Load persisted controls and editable info for this project
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const { controls, info, legacyControls, legacyInfo } = getKeys();
        let savedControls = await AsyncStorage.getItem(controls);
        let savedInfo = await AsyncStorage.getItem(info);

        // Migration from legacy keys if new scoped keys are empty
        if (!savedControls) {
          const legacy = await AsyncStorage.getItem(legacyControls);
          if (legacy) {
            await AsyncStorage.setItem(controls, legacy);
            savedControls = legacy;
            setNotice({ visible: true, text: 'Migrerade kontroller lokalt' });
            setTimeout(() => setNotice({ visible: false, text: '' }), 3000);
          }
        }
        if (!savedInfo) {
          const legacy = await AsyncStorage.getItem(legacyInfo);
          if (legacy) {
            await AsyncStorage.setItem(info, legacy);
            savedInfo = legacy;
            setNotice({ visible: true, text: 'Migrerade projektinfo lokalt' });
            setTimeout(() => setNotice({ visible: false, text: '' }), 3000);
          }
        }
        if (savedControls) {
          const parsed = JSON.parse(savedControls);
          if (Array.isArray(parsed)) setControls(parsed);
        }
        if (savedInfo) {
          const info = JSON.parse(savedInfo);
          setEditableProject((prev) => ({
            ...prev,
            id: info.id || prev.id,
            name: info.name || prev.name,
            client: info.client ?? prev.client,
            createdAt: info.createdAt || prev.createdAt,
            createdBy: info.createdBy || prev.createdBy,
          }));
        }
      } catch (e) {
        // ignore load errors
      }
    };
    loadData();
  }, [project.id, companyId]);

  // Load company logo for PDF header if available
  React.useEffect(() => {
    (async () => {
      try {
        const profile = await fetchCompanyProfile(companyId || 'demo-company');
        setCompanyLogoUri(profile && profile.logoUrl ? profile.logoUrl : null);
      } catch {}
    })();
  }, [companyId]);

  // Reload controls on screen focus (e.g., after returning from ControlForm)
  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      (async () => {
        try {
          // Always collapse creation UI when returning to this screen
          setShowControlPicker(false);
          setShowForm(false);
          setNewControl({ type: '', date: '', description: '', byggdel: '' });
          const { controls } = getKeys();
          const savedControls = await AsyncStorage.getItem(controls);
          if (isActive && savedControls) {
            const parsed = JSON.parse(savedControls);
            if (Array.isArray(parsed)) {
              setControls(parsed);
              // Explicitly collapse all present types on focus
              const types = Array.from(new Set(parsed.map((c) => c.type).filter(Boolean)));
              const collapsed = types.reduce((acc, t) => (acc[t] = false, acc), {});
              setExpandedByType(collapsed);
            }
          }
        } catch {}
      })();
      return () => { isActive = false; };
    }, [project.id, companyId])
  );

  const handleAddControl = () => {
    try { Haptics.selectionAsync(); } catch {}
    // Byggdel is optional: if provided, must be exactly two digits
    const b = (newControl.byggdel || '').trim();
    const byggdelOk = b === '' || (/^\d{2}$/).test(b);
    if (!byggdelOk) return;
    if (newControl.type && newControl.date && newControl.description) {
      navigation.navigate('ControlForm', {
        project,
        initial: newControl,
        performedBy: (getFullName(initialCreator) || initialCreator || '').trim(),
        companyId,
      });
    }
  };

  const handleDeleteControl = async (controlId) => {
    try {
      const updated = controls.filter(c => c.id !== controlId);
      setControls(updated);
      const { controls } = getKeys();
      await AsyncStorage.setItem(controls, JSON.stringify(updated));
    } catch {}
  };

  const onDeletePress = async (controlId) => {
    // Heavy haptics x4 for destructive action
    try {
      for (let i = 0; i < 4; i++) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await new Promise(r => setTimeout(r, 110));
      }
    } catch {}
    // Prepare undo snapshot
    const idx = controls.findIndex(c => c.id === controlId);
    const item = idx >= 0 ? controls[idx] : null;
    await handleDeleteControl(controlId);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoState({ visible: true, item, index: idx });
    undoTimerRef.current = setTimeout(() => {
      setUndoState({ visible: false, item: null, index: -1 });
      undoTimerRef.current = null;
    }, 5000);
  };

  const handleUndo = async () => {
    if (!undoState.visible || !undoState.item) return;
    try { Haptics.selectionAsync(); } catch {}
    const restored = controls.slice();
    const insertAt = Math.max(0, Math.min(undoState.index, restored.length));
    restored.splice(insertAt, 0, undoState.item);
    setControls(restored);
    try {
      await AsyncStorage.setItem(`project:${project.id}:controls`, JSON.stringify(restored));
    } catch {}
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoState({ visible: false, item: null, index: -1 });
  };

  const buildSummaryHtml = (filterType = 'Alla', logoUri = null) => {
    const grouped = controls.reduce((acc, c) => {
      const t = c.type || 'Okänd';
      (acc[t] = acc[t] || []).push(c);
      return acc;
    }, {});
    const typesOrdered = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    const pluralLabels = {
      Arbetsberedning: 'Arbetsberedningar',
      Egenkontroll: 'Egenkontroller',
      Fuktmätning: 'Fuktmätningar',
      Skyddsrond: 'Skyddsronder',
      Riskbedömning: 'Riskbedömningar',
    };
    const safe = (s) => (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const chosen = filterType === 'Alla' ? typesOrdered : typesOrdered.filter((t) => t === filterType);
    const sections = chosen.map((t) => {
      const rows = grouped[t]
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map((c) => `
          <tr>
            <td>${safe(c.description || '—')}</td>
            <td style="text-align:right;">${safe(c.date || '')}</td>
          </tr>`)
        .join('');
      return `
        <h2>${pluralLabels[t] || safe(t)}</h2>
        <table>
          <thead><tr><th>Beskrivning</th><th style="text-align:right;">Datum</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }).join('\n');
    const titleLine1 = `${safe(project.id)} - ${safe(project.name || '')}`;
    const titleLine2 = 'Utförda kontroller i projektet';
    const clientLine = `Kund/Beställare: ${safe(editableProject?.client || '')}`;
    const now = new Date().toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; padding: 24px; }
          .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
          .title { font-size: 22px; font-weight: 700; margin: 0; color: #111; }
          .subtitle { font-size: 15px; color: #263238; margin: 2px 0 4px; }
          .meta { font-size: 13px; color: #444; margin: 0 0 8px; }
          .sub { color: #555; margin: 0 0 16px; }
          h2 { font-size: 16px; margin: 18px 0 8px; color: #263238; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; font-size: 13px; }
          thead th { background: #f7fafc; color: #333; }
          .logo { height: 48px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${titleLine1}</h1>
            <div class="subtitle">${titleLine2}</div>
            <div class="meta">${clientLine}</div>
          </div>
          ${logoUri ? `<img class="logo" src="${safe(logoUri)}" />` : ''}
        </div>
        <div class="sub">Utskriftsdatum: ${safe(now)}</div>
        ${sections || '<div>Inga kontroller utförda ännu.</div>'}
      </body>
      </html>
    `;
  };

  const handleExportPdf = async () => {
    if (!controls || controls.length === 0) return;
    setExportingPdf(true);
    try {
      try { Haptics.selectionAsync(); } catch {}
      // On web: open the browser print dialog instead of generating a file
      if (Platform.OS === 'web') {
        await Print.printAsync({ html: buildSummaryHtml(exportFilter, companyLogoUri) });
        setNotice({ visible: true, text: 'Öppnade utskriftsdialog i webbläsaren' });
        setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
        return;
      }

      // Native: try to use a local file for remote logos to avoid HTML image issues
      let logoForPrint = companyLogoUri || null;
      if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
        try {
          const fileName = 'company-logo.pdfheader.png';
          const dest = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + fileName;
          const dl = await FileSystem.downloadAsync(logoForPrint, dest);
          if (dl?.uri) logoForPrint = dl.uri;
        } catch {}
      }

      const html = buildSummaryHtml(exportFilter, logoForPrint);
      const { uri } = await Print.printToFileAsync({ html });
      // Prepare pretty destination path
      const datePart = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
      const fileName = `utforda-kontroller-${(project.id || '').toString().replace(/[^a-z0-9-_]/gi,'_')}-${datePart}.pdf`;
      const destUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + fileName;
      let finalUri = uri;
      try {
        await FileSystem.copyAsync({ from: uri, to: destUri });
        finalUri = destUri;
      } catch (copyErr) {
        console.warn('[PDF] Copy failed, will try sharing tmp uri:', copyErr?.message);
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        try {
          await Sharing.shareAsync(finalUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Dela PDF' });
        } catch (shareErr) {
          console.warn('[PDF] shareAsync failed on file://, trying content:// if Android');
          if (Platform.OS === 'android') {
            try {
              const contentUri = await FileSystem.getContentUriAsync(finalUri);
              await Sharing.shareAsync(contentUri, { UTI: 'application/pdf', mimeType: 'application/pdf', dialogTitle: 'Dela PDF' });
            } catch (contentErr) {
              console.error('[PDF] shareAsync content:// failed:', contentErr);
              // As a last resort, just show where the file is saved
              setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
              setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
              return;
            }
          } else {
            // iOS: show saved path if share fails
            setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
            setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
            return;
          }
        }
      } else {
        // Sharing not available – tell the user where it was saved
        setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
        setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
        return;
      }
      // If sharing succeeded, optionally also inform about the saved copy
      setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
      setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
    } catch (e) {
      console.error('[PDF] Export error:', e);
      setNotice({ visible: true, text: 'Kunde inte skapa PDF' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePreviewPdf = async () => {
    if (!controls || controls.length === 0) return;
    setExportingPdf(true);
    try {
      try { Haptics.selectionAsync(); } catch {}
      // Try to use a local file path for the logo for better reliability
      let logoForPrint = companyLogoUri || null;
      if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
        try {
          const fileName = 'company-logo.preview.png';
          const dest = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + fileName;
          const dl = await FileSystem.downloadAsync(logoForPrint, dest);
          if (dl?.uri) logoForPrint = dl.uri;
        } catch {}
      }
      await Print.printAsync({ html: buildSummaryHtml(exportFilter, logoForPrint) });
    } catch (e) {
      console.error('[PDF] Preview error:', e);
      setNotice({ visible: true, text: 'Kunde inte förhandsvisa PDF' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
    } finally {
      setExportingPdf(false);
    }
  };

  const scrollRef = useRef(null);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 240 }}
    >
      {/* Titel */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <View style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: editableProject.status === 'done' ? 2 : 1,
          borderColor: '#222',
          backgroundColor: editableProject.status === 'done' ? '#222' : '#4CAF50',
          marginRight: 10,
          alignSelf: 'center',
          marginTop: -4,
        }} />
        <Text style={styles.title}>{project.id} - {project.name}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: '#263238', marginVertical: 8, marginLeft: 0 }} />

      {/* Info under titeln i lodrät linje */}
      <View style={{ marginBottom: 12, marginTop: 2 }}>
        {[ 
          { label: 'Skapad', value: editableProject.createdAt },
          { label: 'Av', value: editableProject.createdBy },
          { label: 'Status', value: editableProject.status === 'done' ? 'Avslutat' : 'Pågående', status: true },
          { label: 'Kund', value: editableProject.client || 'Ej angivet' },
          { label: 'Adress', value: editableProject.address || 'Ej angivet' },
          { label: 'Fastighetsbeteckning', value: editableProject.propertyId || 'Ej angivet' }
        ].map((row) => {
          const isEmpty = !row.value || row.value === 'Ej angivet';
          return (
            <React.Fragment key={row.label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 0 }}>
                <Text style={{ fontSize: 14, color: '#666', width: 170, textAlign: 'left', marginRight: 0 }}>{row.label}:</Text>
                {/* Status-rad: text lodrät med övriga, cirkel till höger */}
                {row.status ? (
                  <View style={{ flex: 1, marginLeft: 24, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: isEmpty ? '#D32F2F' : '#222', fontStyle: isEmpty ? 'italic' : 'normal', lineHeight: 20 }}>
                      {isEmpty ? 'Ej angivet' : row.value}
                    </Text>
                    <View style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      borderWidth: editableProject.status === 'done' ? 2 : 1,
                      borderColor: '#222',
                      backgroundColor: editableProject.status === 'done' ? '#222' : '#4CAF50',
                      marginLeft: 8,
                    }} />
                  </View>
                ) : (
                  <View style={{ flex: 1, marginLeft: 24 }}>
                    <Text style={{ fontSize: 14, color: isEmpty ? '#D32F2F' : '#222', fontStyle: isEmpty ? 'italic' : 'normal', lineHeight: 20 }}>
                      {isEmpty ? 'Ej angivet' : row.value}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6, marginLeft: 0 }} />
            </React.Fragment>
          );
        })}
      </View>

      {/* Redigera projektinfo */}
      <View style={{ marginTop: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 }}>
          <TouchableOpacity style={[styles.editButton, { marginTop: 0 }]} onPress={() => setEditingInfo(true)}>
            <Text style={styles.editButtonText}>Ändra</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 8, marginLeft: 0 }} />
        <Modal
          visible={editingInfo}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingInfo(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
            activeOpacity={1}
            onPress={() => setEditingInfo(false)}
          >
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, position: 'relative', alignItems: 'center' }}>
              {/* Stäng (X) knapp */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={() => setEditingInfo(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6, letterSpacing: 0.2 }}>
                Ändra projektinfo
              </Text>
              {/* Projektnummer */}
              <Text style={{
                fontWeight: '600',
                marginTop: 2,
                marginBottom: 2,
                textAlign: 'left',
                alignSelf: 'flex-start',
                color: !editableProject.id ? '#D32F2F' : '#222'
              }}>Projektnummer</Text>
              <TextInput
                style={[styles.input, { marginBottom: 8, width: '100%', alignSelf: 'stretch', color: !editableProject.id ? '#D32F2F' : '#222' }]}
                placeholder="Projektnummer"
                value={editableProject.id}
                onChangeText={(t) => setEditableProject({ ...editableProject, id: t })}
              />

              {/* Projektnamn */}
              <Text style={{
                fontWeight: '600',
                marginTop: 2,
                marginBottom: 2,
                textAlign: 'left',
                alignSelf: 'flex-start',
                color: !editableProject.name ? '#D32F2F' : '#222'
              }}>Projektnamn</Text>
              <TextInput
                style={[styles.input, { marginBottom: 8, width: '100%', alignSelf: 'stretch', color: !editableProject.name ? '#D32F2F' : '#222' }]}
                placeholder="Projektnamn"
                value={editableProject.name}
                onChangeText={(t) => setEditableProject({ ...editableProject, name: t })}
              />

              {/* Status */}
              <Text
                style={{
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 2,
                  textAlign: 'left',
                  alignSelf: 'flex-start'
                }}
              >Status</Text>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {/* Pågående först */}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#fff',
                    borderColor: '#222',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    paddingVertical: 8,
                    marginRight: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setEditableProject({ ...editableProject, status: 'ongoing' })}
                >
                  {/* Grön cirkel om aktiv */}
                  <View style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: '#222',
                    backgroundColor: editableProject.status !== 'done' ? '#4CAF50' : '#fff',
                    marginRight: 8,
                  }} />
                  <Text style={{ color: '#222', textAlign: 'center', fontWeight: '600' }}>Pågående</Text>
                </TouchableOpacity>
                {/* Avslutat */}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#fff',
                    borderColor: '#222',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setEditableProject({ ...editableProject, status: 'done' })}
                >
                  {/* Svart cirkel om aktiv */}
                  <View style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: '#222',
                    backgroundColor: editableProject.status === 'done' ? '#222' : '#fff',
                    marginRight: 8,
                  }} />
                  <Text style={{ color: '#222', textAlign: 'center', fontWeight: '600' }}>Avslutat</Text>
                </TouchableOpacity>
              </View>

              {/* Kund */}
              <Text style={{
                fontWeight: '600',
                marginTop: 2,
                marginBottom: 2,
                textAlign: 'left',
                alignSelf: 'flex-start',
                color: !editableProject.client ? '#D32F2F' : '#222'
              }}>Kund/Beställare</Text>
              <TextInput
                style={[styles.input, { marginBottom: 8, width: '100%', alignSelf: 'stretch', color: !editableProject.client ? '#D32F2F' : '#222' }]}
                placeholder="Kund/Beställare"
                value={editableProject.client}
                onChangeText={(t) => setEditableProject({ ...editableProject, client: t })}
              />

              {/* Adress */}
              <Text style={{
                fontWeight: '600',
                marginTop: 2,
                marginBottom: 2,
                textAlign: 'left',
                alignSelf: 'flex-start',
                color: !editableProject.address ? '#D32F2F' : '#222'
              }}>Adress</Text>
              <TextInput
                style={[styles.input, { marginBottom: 8, width: '100%', alignSelf: 'stretch', color: !editableProject.address ? '#D32F2F' : '#222' }]}
                placeholder="Adress"
                placeholderTextColor="#888"
                value={editableProject.address || ''}
                onChangeText={(t) => setEditableProject({ ...editableProject, address: t })}
              />

              {/* Fastighetsbeteckning */}
              <Text style={{ fontWeight: '600', marginTop: 2, marginBottom: 2, textAlign: 'left', alignSelf: 'flex-start' }}>Fastighetsbeteckning</Text>
              <Text style={{ fontStyle: 'italic', color: '#888', fontSize: 13, marginBottom: 2, alignSelf: 'flex-start' }}>(valfritt)</Text>
              <TextInput style={[styles.input, { marginBottom: 8, width: '100%', alignSelf: 'stretch' }]} placeholder="Fastighetsbeteckning" placeholderTextColor="#888" value={editableProject.propertyId || ''} onChangeText={(t) => setEditableProject({ ...editableProject, propertyId: t })} />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#1976D2',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 28,
                    alignItems: 'center',
                    marginRight: 8,
                    marginTop: 8,
                  }}
                  onPress={async () => {
                    // Persist editable project info for this project
                    try {
                      const { info } = getKeys();
                      await AsyncStorage.setItem(info, JSON.stringify(editableProject));
                    } catch (e) {}
                    setEditingInfo(false);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#e0e0e0',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 28,
                    alignItems: 'center',
                    marginTop: 8,
                  }}
                  onPress={() => {
                    // Revert to original from route
                    setEditableProject({
                      id: project.id,
                      name: project.name,
                      client: project.client || '',
                      createdAt: project.createdAt,
                      createdBy: initialCreator,
                    });
                    setEditingInfo(false);
                  }}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>


      {/* Kontroller */}
      {/* Knappar för skapa kontroll och PDF, med popup för kontrolltyp */}
      {!showForm && !showControlPicker && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, marginBottom: 0 }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 2,
              borderColor: '#222',
              paddingHorizontal: 10,
              paddingVertical: 6,
              marginRight: 12,
              shadowColor: '#1976D2',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.10,
              shadowRadius: 3,
              elevation: 1,
              minWidth: 0,
            }}
            activeOpacity={0.85}
            onPress={() => setShowControlTypeModal(true)}
          >
            <Ionicons name="add-circle-outline" size={26} color="#222" style={{ marginRight: 16 }} />
            <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>Ny kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 2,
              borderColor: '#222',
              paddingHorizontal: 14,
              paddingVertical: 10,
              minWidth: 0,
              shadowColor: '#1976D2',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.10,
              shadowRadius: 5,
              elevation: 1,
              marginBottom: 0,
            }}
            activeOpacity={0.85}
            onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowSummary(true); }}
          >
            <MaterialIcons name="picture-as-pdf" size={20} color="#222" style={{ marginRight: 10 }} />
            <Text style={{ color: '#222', fontWeight: '600', fontSize: 16, letterSpacing: 0.4, zIndex: 1 }}>Skriv ut</Text>
          </TouchableOpacity>
          {/* Modal för val av kontrolltyp */}
          <Modal
            visible={showControlTypeModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowControlTypeModal(false)}
          >
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
              activeOpacity={1}
              onPress={() => setShowControlTypeModal(false)}
            >
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6 }}>
                  Välj kontrolltyp
                </Text>
                {[
                  { type: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2' },
                  { type: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C' },
                  { type: 'Fuktmätning', icon: 'water-outline', color: '#0288D1' },
                  { type: 'Riskbedömning', icon: 'alert-circle-outline', color: '#F9A825' },
                  { type: 'Skyddsrond', icon: 'shield-checkmark-outline', color: '#D32F2F' }
                ].map(({ type, icon, color }) => (
                  <TouchableOpacity
                    key={type}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' }}
                    onPress={() => {
                      setShowControlTypeModal(false);
                      if (type === 'Skyddsrond') {
                        navigation.navigate('SkyddsrondScreen', { project });
                      } else {
                        setShowControlPicker(true);
                        setNewControl({ ...newControl, type });
                      }
                    }}
                  >
                    <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>{type}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={{ marginTop: 8, alignSelf: 'center' }}
                  onPress={() => setShowControlTypeModal(false)}
                >
                  <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, minHeight: 32 }}>
        <Text style={[styles.subtitle, { lineHeight: 32 }]}>Utförda kontroller:</Text>
      </View>

      {controls.length === 0 ? (
        <Text style={[styles.noControls, { color: '#D32F2F' }]}>Inga kontroller utförda än</Text>
      ) : (
        <View>
          {(() => {
            const grouped = controlTypes
              .map((t) => ({ type: t, items: controls.filter(c => (c.type || '') === t) }))
              .filter(g => g.items.length > 0);

            const toggleType = (t) => {
              try { Haptics.selectionAsync(); } catch {}
              setExpandedByType((prev) => ({ ...prev, [t]: !(prev[t] ?? false) }));
            };

            const pluralLabels = {
              Arbetsberedning: 'Arbetsberedningar',
              Egenkontroll: 'Egenkontroller',
              Fuktmätning: 'Fuktmätningar',
              Skyddsrond: 'Skyddsronder',
              Riskbedömning: 'Riskbedömningar',
            };

            return grouped.map(({ type: t, items }) => {
              const expanded = expandedByType[t] ?? false;
              return (
                <View key={t} style={styles.groupContainer}>
                  <TouchableOpacity style={styles.groupHeader} onPress={() => toggleType(t)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#263238" />
                      <Text style={styles.groupTitle}>{pluralLabels[t] || t}</Text>
                    </View>
                    <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{items.length}</Text></View>
                  </TouchableOpacity>
                  {expanded ? (
                    items
                      .slice()
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                      .map((item) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity
                            style={[styles.controlCard, { flex: 1 }]}
                            onPress={() => navigation.navigate('ControlDetails', { control: item, project })}
                            onLongPress={() => handleControlLongPress(item)}
                            delayLongPress={600}
                          >
                            <Text style={styles.controlType}>
                              {item.type === 'Skyddsrond'
                                ? `${item.description ? item.description + ' ' : ''}${item.date}`
                                : `${item.byggdel ? item.byggdel + ' ' : ''}${item.description} ${item.date}`}
                            </Text>
                          </TouchableOpacity>
                          {/* Ta bort-knapp borttagen, endast long-press popup gäller */}
                        </View>
                      ))
                  ) : null}
                </View>
              );
            });
                {/* Modal for edit/delete control (long-press) */}
          })()}
        </View>
      )}


      {/* Välj kontrolltyp */}
      {showControlPicker && (
        <View style={styles.picker}>
          <Text style={styles.pickerTitle}>Välj kontrolltyp</Text>
          {controlTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={styles.pickerItem}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                if (type === 'Skyddsrond') {
                  setShowControlPicker(false);
                  navigation.navigate('SkyddsrondScreen', { project });
                } else {
                  setNewControl({ ...newControl, type, date: today });
                  setShowControlPicker(false);
                  setShowForm(true);
                }
              }}
            >
              <Text style={styles.pickerText}>{type}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowControlPicker(false); }}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Formulär */}
      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          style={styles.form}
        >
          <Text style={styles.selectedType}>Vald kontroll: {newControl.type}</Text>

          {/* Visa dagens datum och möjlighet att välja eget */}
          <Text style={styles.infoText}>Dagens datum: {newControl.date}</Text>
          <TouchableOpacity onPress={() => setNewControl({ ...newControl, date: '' })}>
            <Text style={styles.linkText}>Välj eget datum</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Datum (ÅÅÅÅ-MM-DD)"
            placeholderTextColor="#888"
            value={newControl.date}
            onChangeText={(text) => setNewControl({ ...newControl, date: text })}
            onFocus={() => {
              setTimeout(() => {
                try { scrollRef.current?.scrollToEnd({ animated: true }); } catch {}
              }, 50);
            }}
          />
          {newControl.type !== 'Skyddsrond' && (
            <TextInput
              style={styles.input}
              placeholder="Byggdel (valfritt)"
              placeholderTextColor="#888"
              keyboardType="numeric"
              maxLength={2}
              value={newControl.byggdel}
              onChangeText={(text) => setNewControl({ ...newControl, byggdel: text })}
              onFocus={() => {
                setTimeout(() => {
                  try { scrollRef.current?.scrollToEnd({ animated: true }); } catch {}
                }, 50);
              }}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder={newControl.type === 'Skyddsrond' ? 'Skyddsrond omfattar' : 'Beskrivning'}
            placeholderTextColor="#888"
            value={newControl.description}
            onChangeText={(text) => setNewControl({ ...newControl, description: text })}
            onFocus={() => {
              // Scroll to bottom to reveal the input above the keyboard
              setTimeout(() => {
                try { scrollRef.current?.scrollToEnd({ animated: true }); } catch {}
              }, 50);
            }}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAddControl}>
            <Text style={styles.saveButtonText}>Skapa kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowForm(false); }}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      {undoState.visible ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>Kontroll borttagen</Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Ångra</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {notice.visible ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      <Modal visible={showSummary} transparent animationType="fade" onRequestClose={() => setShowSummary(false)}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={() => setShowSummary(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.summaryCard}>
              {/* Stäng (X) knapp uppe till höger */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowSummary(false); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={styles.modalText}>Skriv ut</Text>
              {/* Export filter selector */}
              {(() => {
                const byType = controls.reduce((acc, c) => {
                  const t = c.type || 'Okänd';
                  (acc[t] = acc[t] || []).push(c);
                  return acc;
                }, {});
                const types = Object.keys(byType).sort((a, b) => a.localeCompare(b));
                if (types.length === 0) return null;
                const labels = {
                  Arbetsberedning: 'Arbetsberedningar',
                  Egenkontroll: 'Egenkontroller',
                  Fuktmätning: 'Fuktmätningar',
                  Skyddsrond: 'Skyddsronder',
                  Riskbedömning: 'Riskbedömningar',
                };
                return (
                  <View style={styles.filterRow}>
                    {['Alla', ...types].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { try { Haptics.selectionAsync(); } catch {}; setExportFilter(t); }}
                        style={[styles.filterChip, exportFilter === t && styles.filterChipSelected]}
                      >
                        <Text style={[styles.filterChipText, exportFilter === t && styles.filterChipTextSelected]}>
                          {t === 'Alla' ? 'Alla' : (labels[t] || t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}

              <ScrollView style={{ maxHeight: 380 }}>
                {(() => {
                  // Ikoner för varje typ
                  const typeIcons = {
                    Arbetsberedning: { icon: 'construct-outline', color: '#1976D2' },
                    Egenkontroll: { icon: 'checkmark-done-outline', color: '#388E3C' },
                    Fuktmätning: { icon: 'water-outline', color: '#0288D1' },
                    Riskbedömning: { icon: 'alert-circle-outline', color: '#F9A825' },
                    Skyddsrond: { icon: 'shield-checkmark-outline', color: '#D32F2F' },
                  };
                  const pluralLabels = {
                    Arbetsberedning: 'Arbetsberedningar',
                    Egenkontroll: 'Egenkontroller',
                    Fuktmätning: 'Fuktmätningar',
                    Skyddsrond: 'Skyddsronder',
                    Riskbedömning: 'Riskbedömningar',
                  };
                  // Gruppindelning
                  const byType = controls.reduce((acc, c) => {
                    const t = c.type || 'Okänd';
                    acc[t] = acc[t] || [];
                    acc[t].push(c);
                    return acc;
                  }, {});
                  const typesOrdered = Object.keys(byType).sort((a, b) => a.localeCompare(b));
                  if (typesOrdered.length === 0) {
                    return <Text style={{ color: '#555' }}>Inga kontroller utförda ännu.</Text>;
                  }
                  const toggleControl = (id) => {
                    setSelectedControls((prev) =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    );
                  };
                  return typesOrdered.map((t) => (
                    <View key={t} style={{ marginBottom: 12 }}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                        onPress={() => setExpandedType(expandedType === t ? null : t)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={typeIcons[t]?.icon || 'document-outline'} size={22} color={typeIcons[t]?.color || '#222'} style={{ marginRight: 10 }} />
                        <Text style={{ fontWeight: '700', color: '#263238', fontSize: 16 }}>{pluralLabels[t] || t}</Text>
                        <MaterialIcons name={expandedType === t ? 'expand-less' : 'expand-more'} size={22} color="#263238" style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                      {expandedType === t && (
                        <View style={{ marginLeft: 32, marginTop: 4 }}>
                          {byType[t]
                            .slice()
                            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                            .map((c) => (
                              <TouchableOpacity
                                key={c.id}
                                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
                                activeOpacity={0.7}
                                onPress={() => toggleControl(c.id)}
                              >
                                <MaterialIcons
                                  name={selectedControls.includes(c.id) ? 'check-box' : 'check-box-outline-blank'}
                                  size={22}
                                  color={selectedControls.includes(c.id) ? '#1976D2' : '#888'}
                                  style={{ marginRight: 8 }}
                                />
                                <Text style={styles.summaryRowText}>{c.description || '—'}</Text>
                                <Text style={[styles.summaryRowText, { marginLeft: 8 }]}>{c.date || ''}</Text>
                              </TouchableOpacity>
                            ))}
                        </View>
                      )}
                    </View>
                  ));
                })()}
              </ScrollView>
              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handlePreviewPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>Förhandsvisa PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleExportPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>{exportingPdf ? 'Genererar…' : 'Exportera PDF'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#263238' },
  subInfo: { fontSize: 14, color: '#666', marginBottom: 4 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  sectionContent: { fontSize: 16, color: '#333' },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 16, marginBottom: 8, color: '#263238' },
  noControls: { fontSize: 14, color: '#999', marginBottom: 12 },
  groupContainer: { marginBottom: 8 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F3F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  groupTitle: { marginLeft: 6, fontSize: 16, fontWeight: '700', color: '#263238' },
  groupBadge: {
    backgroundColor: '#263238',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  controlCard: {
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    minWidth: 104,
  },
  deleteActionText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  controlType: { fontSize: 16, fontWeight: 'bold', color: '#263238' },
  controlDate: { fontSize: 14, color: '#555' },
  controlDesc: { fontSize: 14, color: '#555', marginTop: 4 },
  addButton: {
    backgroundColor: '#263238',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
    addButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 8 },
  editButton: { backgroundColor: '#CFD8DC', borderRadius: 8, padding: 10, alignItems: 'center', alignSelf: 'flex-start' },
  editButtonText: { color: '#263238', fontSize: 14, fontWeight: '700' },
  editForm: { backgroundColor: '#F7FAFC', borderRadius: 8, padding: 12, marginTop: 8 },
    inlineButton: { marginTop: 0, marginBottom: 0 },
  picker: {
    backgroundColor: 'transparent',
    padding: 16,
    marginTop: 16,
  },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#263238' },
  pickerItem: {
    backgroundColor: '#263238',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#263238',
    // Skugga för iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    // Skugga för Android
    elevation: 3,
  },
  pickerText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  cancelButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: 12,
  },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  undoBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: '#263238',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  undoText: { color: '#fff', fontSize: 14 },
  undoButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold', textDecorationLine: 'underline' },
  noticeBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: '#455A64',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: { color: '#fff', fontSize: 14 },
  form: {
    marginTop: 16,
    backgroundColor: '#F7FAFC',
    padding: 16,
    borderRadius: 8,
  },
  selectedType: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  infoText: { fontSize: 14, color: '#333', marginBottom: 4 },
  linkText: { fontSize: 14, color: '#263238', marginBottom: 8, textDecorationLine: 'underline' },
  input: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 16,
    marginBottom: 12,
    color: '#000',
  },
  helperLabel: { fontSize: 12, color: '#666', marginTop: -8, marginBottom: 8 },
  saveButton: {
    backgroundColor: '#263238',
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginBottom: 8,
  },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', lineHeight: 20 },
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: 320,
    maxWidth: 520,
  },
  modalText: { fontSize: 18, fontWeight: 'bold', color: '#263238', marginBottom: 10, textAlign: 'center' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  summaryRowText: { color: '#333' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263238',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  filterChipSelected: {
    backgroundColor: '#263238',
  },
	filterChipText: { color: '#263238', fontSize: 13, fontWeight: '700' },
	filterChipTextSelected: { color: '#FFFFFF' },
});

