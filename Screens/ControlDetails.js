

import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, TextInput } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import SignatureModal from '../components/SignatureModal';
import { resolveCompanyLogoUrl } from '../components/firebase';
// Load ImagePicker dynamically inside handlers to avoid bundling native-only exports on web
let ImagePicker = null;

const CONTROL_TYPE_ICONS = {
  'Arbetsberedning': { icon: 'construct-outline', color: '#1976D2', label: 'Arbetsberedning' },
  'Egenkontroll': { icon: 'checkmark-done-outline', color: '#388E3C', label: 'Egenkontroll' },
  'Fuktmätning': { icon: 'water-outline', color: '#0288D1', label: 'Fuktmätning' },
  'Mottagningskontroll': { icon: 'checkbox-outline', color: '#7B1FA2', label: 'Mottagningskontroll' },
  'Riskbedömning': { icon: 'warning-outline', color: '#FFD600', label: 'Riskbedömning' },
  'Skyddsrond': { icon: 'shield-half-outline', color: '#388E3C', label: 'Skyddsrond' },
};

const PRIMARY = '#263238';
const A4_WEB_MAX_WIDTH = 794; // ~210mm at 96dpi
const META_ICON_COLOR = '#1976D2';

export default function ControlDetails({ route }) {
  const { height: windowHeight } = useWindowDimensions();
  // Modal state for åtgärd
  const [actionModal, setActionModal] = useState({ visible: false, section: '', point: '', img: null, comment: '', signature: '', name: '', date: '' });
  const navigation = useNavigation();
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const { control, project, companyId: routeCompanyId } = route.params || {};
  // Note: do not return early here — Hooks must be called unconditionally.

  const [controlState, setControlState] = useState(control);
  useEffect(() => {
    setControlState(control);
  }, [control?.id]);

  const hasAnyChecklistPoints = (c) => {
    try {
      const sections = Array.isArray(c?.checklist)
        ? c.checklist
        : (Array.isArray(c?.checklistSections) ? c.checklistSections : []);
      if (!Array.isArray(sections) || sections.length === 0) return false;
      for (const sec of sections) {
        const pts = Array.isArray(sec?.points)
          ? sec.points
          : (Array.isArray(sec?.items) ? sec.items : []);
        if (Array.isArray(pts) && pts.length > 0) return true;
      }
      return false;
    } catch(_e) {
      return false;
    }
  };

  // If we navigated here with a thin control object (common on web lists), hydrate from AsyncStorage.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const current = (controlState && typeof controlState === 'object') ? controlState : (control || {});
        if (hasAnyChecklistPoints(current)) return;

        const id = current?.id || control?.id;
        const projectId = current?.project?.id || project?.id;
        const type = current?.type;
        const savedAt = current?.savedAt;
        const date = current?.date;

        const tryHydrateFromKey = async (key) => {
          const raw = await AsyncStorage.getItem(key);
          if (!raw) return null;
          const arr = JSON.parse(raw);
          const list = Array.isArray(arr) ? arr : [];

          if (id) {
            const byId = list.find(x => x && x.id && String(x.id) === String(id));
            if (byId) return byId;
          }

          // Best-effort fallback for legacy items without stable id
          if (projectId && type) {
            const byMeta = list.find(x => (
              x
              && String(x?.project?.id || '') === String(projectId)
              && String(x?.type || '') === String(type)
              && (savedAt ? String(x?.savedAt || '') === String(savedAt) : true)
              && (date ? String(x?.date || '') === String(date) : true)
            ));
            if (byMeta) return byMeta;
          }
          return null;
        };

        const found = (await tryHydrateFromKey('completed_controls'))
          || (await tryHydrateFromKey('draft_controls'))
          || null;

        if (!found) return;
        // Only replace if it actually brings more data (especially checklist)
        if (!hasAnyChecklistPoints(found) && !hasAnyChecklistPoints(current)) return;
        if (active) setControlState(found);
      } catch(_e) {
        // ignore hydration errors
      }
    })();
    return () => { active = false; };
  }, [control?.id, project?.id]);

  const safeControl = (controlState && typeof controlState === 'object') ? controlState : {};
  const type = safeControl.type;
  const date = safeControl.date;
  const deliveryDesc = safeControl.deliveryDesc;
  const description = safeControl.description;
  const generalNote = safeControl.generalNote;
  const materialDesc = safeControl.materialDesc || safeControl.material;
  const qualityDesc = safeControl.qualityDesc;
  const coverageDesc = safeControl.coverageDesc;
  const participants = Array.isArray(safeControl.participants) ? safeControl.participants : [];
  const checklistRaw = Array.isArray(safeControl.checklist)
    ? safeControl.checklist
    : (Array.isArray(safeControl.checklistSections) ? safeControl.checklistSections : []);
  const status = safeControl.status;
  const weather = safeControl.weather;
  const mottagningsPhotos = Array.isArray(safeControl.mottagningsPhotos) ? safeControl.mottagningsPhotos : [];
  const mottagningsSignatures = Array.isArray(safeControl.mottagningsSignatures) ? safeControl.mottagningsSignatures : [];
  const attachments = Array.isArray(safeControl.attachments) ? safeControl.attachments : [];

  const [companyLogoUrl, setCompanyLogoUrl] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('dk_companyId');
        const cid = (
          routeCompanyId
          || project?.companyId
          || safeControl?.companyId
          || safeControl?.company
          || stored
          || ''
        ).trim();
        if (!cid) return;
        const url = await resolveCompanyLogoUrl(cid);
        if (active) setCompanyLogoUrl(url || null);
      } catch(_e) {}
    })();
    return () => { active = false; };
  }, [routeCompanyId, project?.companyId, project?.id]);

  const formatYmd = (value) => {
    if (!value) return '-';
    let v = value;
    try {
      // Firestore Timestamp support
      if (v && typeof v === 'object') {
        if (typeof v.toDate === 'function') v = v.toDate();
        else if (typeof v.toMillis === 'function') v = new Date(v.toMillis());
        else if (typeof v.seconds === 'number') v = new Date(v.seconds * 1000);
        else if (typeof v._seconds === 'number') v = new Date(v._seconds * 1000);
        else if (typeof v.nanoseconds === 'number' && typeof v.seconds === 'number') v = new Date(v.seconds * 1000);
        else if (typeof v._nanoseconds === 'number' && typeof v._seconds === 'number') v = new Date(v._seconds * 1000);
      }
    } catch(_e) {}

    const d = new Date(v);
    if (isNaN(d.getTime())) return String(value);
    return d.toISOString().slice(0, 10);
  };

  const upsertControlInStorage = async (updated) => {
    const isDraft = !!updated?.isDraft;
    const key = isDraft ? 'draft_controls' : 'completed_controls';
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    const id = updated?.id;
    if (!id) throw new Error('Kontrollen saknar id');
    const idx = arr.findIndex(c => c && c.id === id);
    if (idx !== -1) arr[idx] = updated;
    else arr.push(updated);
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  };

  // Format week number
  function getWeek(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }
  const week = getWeek(date);
  // Status text
  const statusText = status === 'UTFÖRD' || status === 'Slutförd' ? 'Slutförd' : 'Pågående';
  const isCompleted = statusText === 'Slutförd' && !safeControl.isDraft;
  const participantsLabel = type === 'Mottagningskontroll' ? 'Mottagare' : 'Deltagare';

  // Checklist points: group by section, show approved and deviation points with icons
  // checklistSections ska alltid innehålla remediation-objekt
  const checklistSections = useMemo(() => {
    const coerceArrayLike = (v) => {
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        const keys = Object.keys(v)
          .filter(k => String(parseInt(k, 10)) === k)
          .map(k => parseInt(k, 10))
          .sort((a, b) => a - b);
        if (!keys.length) return [];
        const arr = [];
        keys.forEach(k => { arr[k] = v[k]; });
        return arr;
      }
      return [];
    };

    const normalizePointText = (pt) => {
      if (typeof pt === 'string') return pt;
      if (pt && typeof pt === 'object') return pt.text || pt.label || pt.name || '';
      return '';
    };

    const normalizeStatus = (v) => {
      if (v === 'ok' || v === 'avvikelse' || v === 'ejaktuell') return v;
      if (v === true) return 'ok';
      if (v === false) return 'avvikelse';
      const s = String(v ?? '').trim().toLowerCase();
      if (!s) return null;
      if (['ok', 'approved', 'godkänd', 'godkand', 'ja', 'yes', 'true', 'green', 'grön', 'gron'].includes(s)) return 'ok';
      if (['avvikelse', 'deviation', 'nej', 'no', 'false', 'fail', 'red', 'röd', 'rod', 'anmärkning', 'anmarkning', 'risk'].includes(s)) return 'avvikelse';
      if (['ejaktuell', 'inte aktuell', 'n/a', 'na'].includes(s)) return 'ejaktuell';
      return null;
    };

    const arr = Array.isArray(checklistRaw) ? checklistRaw : [];
    return arr.map((section) => {
      if (!section || typeof section !== 'object') return null;

      const label = section.label || section.title || section.name || 'Kontrollpunkter';

      let remediation = section.remediation;
      if (!remediation || typeof remediation !== 'object') remediation = {};

      const items = [];

      // Legacy/precomputed shape: section.approved / section.deviation
      const approvedRaw = coerceArrayLike(section.approved ?? section.approvedPoints ?? null);
      const deviationRaw = coerceArrayLike(section.deviation ?? section.deviationPoints ?? null);
      if (approvedRaw.length > 0 || deviationRaw.length > 0) {
        approvedRaw.forEach((pt, i) => {
          const text = String(normalizePointText(pt) || '').trim();
          if (text) items.push({ text, idx: i, status: 'ok' });
        });
        deviationRaw.forEach((pt, i) => {
          const text = String(normalizePointText(pt) || '').trim();
          if (text) items.push({ text, idx: i, status: 'avvikelse' });
        });
        if (items.length === 0) return null;
        return { label, items, remediation };
      }

      const pointsRaw = coerceArrayLike(section.points ?? section.items ?? []);
      if (!pointsRaw.length) return null;
      const statusesRaw = coerceArrayLike(section.statuses ?? section.status ?? []);

      pointsRaw.forEach((pt, idx) => {
        const text = String(normalizePointText(pt) || '').trim();
        if (!text) return;
        const statusFromPoint = (pt && typeof pt === 'object' && pt.status !== undefined) ? pt.status : undefined;
        const st = normalizeStatus(statusFromPoint !== undefined ? statusFromPoint : statusesRaw[idx]);
        items.push({ text, idx, status: st });
      });

      if (items.length === 0) return null;
      return { label, items, remediation };
    }).filter(Boolean);
  }, [checklistRaw]);

  // Get icon and label for this control type
  const { icon, color, label } = CONTROL_TYPE_ICONS[type] || { icon: 'alert-circle', color: '#D32F2F', label: type || 'Kontroll' };

  const pageContent = (
    <View style={[styles.page, Platform.OS === 'web' ? styles.pageWeb : null]}>
      <View style={styles.headerCard}>
        {companyLogoUrl ? (
            <View style={{ marginBottom: 12, alignItems: 'flex-start', width: '100%' }}>
            <Image source={{ uri: companyLogoUrl }} style={styles.companyLogo} resizeMode="contain" />
            <View style={styles.companyLogoDivider} />
          </View>
        ) : null}

        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleRow}>
            <Ionicons name={icon} size={28} color={color} style={{ marginRight: 10 }} />
            <Text style={styles.title}>{label}</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.statusPill, isCompleted ? styles.statusPillDone : styles.statusPillOngoing]}>
              <Text style={[styles.statusPillText, isCompleted ? styles.statusPillTextDone : styles.statusPillTextOngoing]}>{statusText}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                let screen = null;
                switch (type) {
                  case 'Riskbedömning': screen = 'RiskbedömningScreen'; break;
                  case 'Arbetsberedning': screen = 'ArbetsberedningScreen'; break;
                  case 'Egenkontroll': screen = 'EgenkontrollScreen'; break;
                  case 'Fuktmätning': screen = 'FuktmätningScreen'; break;
                  case 'Mottagningskontroll': screen = 'MottagningskontrollScreen'; break;
                  case 'Skyddsrond': screen = 'SkyddsrondScreen'; break;
                  default: screen = null;
                }
                if (screen) navigation.navigate(screen, { initialValues: safeControl, project });
              }}
              style={[styles.headerActionBtn, { marginLeft: 8 }]}
              accessibilityLabel="Redigera kontroll"
            >
              <Ionicons name="create-outline" size={22} color="#1976D2" />
            </TouchableOpacity>
          </View>
        </View>

        {project?.id || project?.name ? (
          <View style={styles.projectBar}>
            <Text style={styles.projectBarText} numberOfLines={1} ellipsizeMode="tail">
              Projekt - {project?.id ? String(project.id).trim() : ''}{project?.id && project?.name ? ' - ' : ''}{project?.name ? String(project.name).trim() : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Overview (matches mock) */}
      <View style={styles.overviewCard}>
        <View style={styles.overviewRow}>
          <Text style={styles.overviewLabel}>Datum för kontroll:</Text>
          <View style={styles.overviewValueWrap}>
            <View style={styles.metaIconWrap}>
              <Ionicons name="calendar-outline" size={16} color={META_ICON_COLOR} />
            </View>
            <Text style={styles.overviewValue}>{formatYmd(date)}{week ? `  v.${week}` : ''}</Text>
          </View>
        </View>
        <View style={styles.overviewRowDivider} />

        <View style={styles.overviewRow}>
          <Text style={styles.overviewLabel}>{participantsLabel}:</Text>
          <View style={{ flex: 1 }}>
            {participants.length > 0 ? participants.map((p, i) => {
              const name = typeof p === 'string' ? p : (p?.name || p?.displayName || '');
              const company = typeof p === 'object' ? (p?.company || p?.companyName || p?.foretag || p?.['f\u00f6retag'] || '') : '';
              const role = typeof p === 'object' ? (p?.role || p?.yrkesroll || p?.titel || '') : '';
              const mobile = typeof p === 'object' ? (p?.mobile || p?.mobil || p?.phone || p?.telefon || p?.tel || '') : '';
              const details = [name, company, role, mobile].filter(Boolean).join('  |  ');
              const hasAny = !!(name || company || role || mobile);
              if (!hasAny) return null;
              return (
                <View key={i} style={styles.metaMultiLineRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="person-outline" size={16} color={META_ICON_COLOR} />
                  </View>
                  {Platform.OS === 'web' ? (
                    <View style={styles.participantTableRow}>
                      <Text style={[styles.overviewValue, styles.participantColName]} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
                      <Text style={[styles.overviewValue, styles.participantColCompany]} numberOfLines={1} ellipsizeMode="tail">{company}</Text>
                      <Text style={[styles.overviewValue, styles.participantColRole]} numberOfLines={1} ellipsizeMode="tail">{role}</Text>
                      <Text style={[styles.overviewValue, styles.participantColMobile]} numberOfLines={1} ellipsizeMode="tail">{mobile}</Text>
                    </View>
                  ) : (
                    <Text style={styles.overviewValue} numberOfLines={1} ellipsizeMode="tail">{details}</Text>
                  )}
                </View>
              );
            }) : (
              <Text style={[styles.overviewValue, { color: '#888' }]}>-</Text>
            )}
          </View>
        </View>

        {weather ? (
          <>
            <View style={styles.overviewRowDivider} />
            <View style={styles.overviewRow}>
              <Text style={styles.overviewLabel}>Väder:</Text>
              <View style={styles.overviewValueWrap}>
                <View style={styles.metaIconWrap}>
                  <Ionicons name="sunny-outline" size={16} color={META_ICON_COLOR} />
                </View>
                <Text style={styles.overviewValue}>{String(weather)}</Text>
              </View>
            </View>
          </>
        ) : null}
      </View>

      {/* Deltagare/Väder visas i Översikt-kortet ovan */}

      {/* Beskrivning av moment */}
      {((type === 'Mottagningskontroll' && (materialDesc || qualityDesc || coverageDesc || generalNote)) || deliveryDesc || description) && (
        <View style={styles.card}>
          {type === 'Mottagningskontroll' ? (
            <>
              {materialDesc ? (
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>Beskrivning:</Text>
                  <View style={styles.overviewValueWrap}>
                    <View style={styles.metaIconWrap}>
                      <Ionicons name="cube-outline" size={16} color={META_ICON_COLOR} />
                    </View>
                    <Text style={styles.overviewValue}>{String(materialDesc)}</Text>
                  </View>
                </View>
              ) : null}
              {qualityDesc ? (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.noteText}>Kvalité / krav</Text>
                  <Text style={styles.overviewValue}>{String(qualityDesc)}</Text>
                </View>
              ) : null}
              {coverageDesc ? (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.noteText}>Omfattning / mängd</Text>
                  <Text style={styles.overviewValue}>{String(coverageDesc)}</Text>
                </View>
              ) : null}
              {generalNote ? (
                <View>
                  <Text style={styles.noteText}>Anteckning</Text>
                  <Text style={styles.overviewValue}>{String(generalNote)}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Beskrivning</Text>
              <Text style={styles.bodyText}>{deliveryDesc || description}</Text>
            </>
          )}
        </View>
      )}



      {/* Kontrollpunkter */}
      {checklistSections.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kontrollpunkter</Text>
          {checklistSections.map((section, idx) => (
            <View key={idx} style={{ marginBottom: 8 }}>
              {idx > 0 && <View style={styles.innerDivider} />}
              <Text style={{ fontWeight: '600', fontSize: 15, color: '#444', marginBottom: 2 }}>{section.label}</Text>
              {(section.items || []).map((item, i) => {
                const pt = item?.text;
                const st = item?.status;
                const remediationKey = String(pt || '').trim();
                const idxKey = String(item?.idx ?? '');
                const remediation = (
                  (section.remediation && section.remediation[remediationKey])
                  || (section.remediation && idxKey && section.remediation[idxKey])
                  || null
                );
                const isDeviation = st === 'avvikelse';
                const isHandled = isDeviation && !!remediation;

                const iconName = isDeviation
                  ? (isHandled ? 'checkmark-circle' : 'alert-circle')
                  : (st === 'ok' ? 'checkmark-circle' : (st === 'ejaktuell' ? 'remove-circle-outline' : 'ellipse-outline'));
                const iconColor = isDeviation
                  ? (isHandled ? '#388E3C' : '#D32F2F')
                  : (st === 'ok' ? '#388E3C' : (st === 'ejaktuell' ? '#757575' : '#9E9E9E'));
                const textColor = isDeviation
                  ? (isHandled ? '#1976D2' : '#D32F2F')
                  : '#222';

                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, flexWrap: 'wrap' }}>
                    <Ionicons name={iconName} size={18} color={iconColor} style={{ marginRight: 6, marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bodyText, { color: textColor, flexWrap: 'wrap' }]}>{pt}</Text>
                      {isHandled && remediation && (
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          Åtgärdad {remediation.date ? remediation.date.slice(0, 10) : ''} av {remediation.name || ''}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}


      {(() => {
        // Gruppera avvikelser per sektion
        const grouped = {};
        checklistSections.forEach(section => {
          const deviations = (section.items || []).filter(it => it && it.status === 'avvikelse');
          if (deviations.length === 0) return;
          if (!grouped[section.label]) grouped[section.label] = [];
          deviations.forEach((item) => {
            const pt = item?.text;
            const idxKey = String(item?.idx ?? '');
            grouped[section.label].push({
              pt,
              remediation: (
                (section.remediation && section.remediation[String(pt || '').trim()])
                || (section.remediation && idxKey && section.remediation[idxKey])
                || null
              )
            });
          });
        });
        const sectionLabels = Object.keys(grouped);
        if (sectionLabels.length === 0) return null;
        // Visa åtgärdsknapp endast för Skyddsrond
        const isSkyddsrond = type === 'Skyddsrond';
        return (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Avvikelser/risker:</Text>
              {sectionLabels.map((label, idx) => (
                <View key={label} style={{ marginBottom: 4 }}>
                  <Text style={{ fontWeight: '600', color: '#444', marginBottom: 2 }}>{label}:</Text>
                  {grouped[label].map((item, i) => {
                    const { pt, remediation } = item;
                    const isHandled = !!remediation;
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, flexWrap: 'wrap', marginLeft: 12 }}>
                        <Ionicons name={isHandled ? "checkmark-circle" : "alert-circle"} size={18} color={isHandled ? "#388E3C" : "#D32F2F"} style={{ marginRight: 6, marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bodyText, { color: isHandled ? '#222' : '#D32F2F', flexWrap: 'wrap' }]}>{pt}</Text>
                          {isHandled && remediation && (
                            <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                              Åtgärdad {remediation.date ? remediation.date.slice(0, 10) : ''} av {remediation.name || ''}
                            </Text>
                          )}
                        </View>
                        {isSkyddsrond && (
                          isHandled ? (
                            <TouchableOpacity
                              style={{ marginLeft: 8, backgroundColor: '#FFC107', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }}
                              onPress={() => setActionModal({ visible: true, section: label, point: pt, img: remediation.img, comment: remediation.comment, signature: remediation.signature, name: remediation.name, date: remediation.date, infoMode: true })}
                            >
                              <Ionicons name="information-circle-outline" size={16} color="#222" style={{ marginRight: 4 }} />
                              <Text style={{ color: '#222', fontSize: 13 }}>Info</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={{ marginLeft: 8, backgroundColor: '#1976D2', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 }}
                              onPress={() => setActionModal({ visible: true, section: label, point: pt, img: null, comment: '', signature: '', name: '', infoMode: false })}
                            >
                              <Text style={{ color: '#fff', fontSize: 13 }}>Åtgärda</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Modal för åtgärd */}
            <Modal
              visible={actionModal.visible}
              transparent
              animationType="slide"
              onRequestClose={() => setActionModal(a => ({ ...a, visible: false, /* INGEN SPARLOGIK HÄR */ }))}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 22, width: 320, alignItems: 'center' }}>
                  {/* X-stäng uppe till höger */}
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                    onPress={() => setActionModal(a => ({ ...a, visible: false, /* INGEN SPARLOGIK HÄR */ }))}
                  >
                    <Ionicons name="close" size={26} color="#222" />
                  </TouchableOpacity>
                  {actionModal.infoMode ? (
                    <>
                      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>Åtgärdsinfo</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 8, textAlign: 'center' }}>{actionModal.section}: {actionModal.point}</Text>
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>Beskrivning:</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 10 }}>{actionModal.comment}</Text>
                      {actionModal.img && (
                        <Image source={{ uri: actionModal.img }} style={{ width: 120, height: 90, borderRadius: 8, marginBottom: 10 }} />
                      )}
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Namn:</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 10 }}>{actionModal.name}</Text>
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Signatur:</Text>
                      {actionModal.signature ? (
                        <Image source={{ uri: actionModal.signature }} style={{ width: 80, height: 32, backgroundColor: '#fff', borderRadius: 4, marginBottom: 10 }} />
                      ) : (
                        <Text style={{ color: '#888', fontSize: 15, marginBottom: 10 }}>Ingen signatur</Text>
                      )}
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Åtgärdat datum:</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 10 }}>{actionModal.date ? actionModal.date.slice(0, 10) : '-'}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 6 }}>Åtgärda brist</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, textAlign: 'center' }}>{actionModal.section}: {actionModal.point}</Text>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Datum:</Text>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, backgroundColor: '#f3f3f3', marginBottom: 2 }}
                          onLongPress={() => {
                            Alert.prompt(
                              'Ändra datum',
                              'Skriv nytt datum (YYYY-MM-DD)',
                              [
                                {
                                  text: 'Avbryt',
                                  style: 'cancel',
                                },
                                {
                                  text: 'OK',
                                  onPress: (newDate) => {
                                    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                                      Alert.alert('Fel', 'Datumet måste vara på formatet YYYY-MM-DD');
                                      return;
                                    }
                                    const today = new Date().toISOString().slice(0, 10);
                                    if (newDate > today) {
                                      Alert.alert('Fel', 'Du kan inte välja ett datum i framtiden.');
                                      return;
                                    }
                                    setActionModal(a => ({ ...a, date: newDate }));
                                  },
                                },
                              ],
                              'plain-text',
                              actionModal.date || new Date().toISOString().slice(0, 10)
                            );
                          }}
                        >
                          <Text style={{ fontSize: 15, color: '#888' }}>{actionModal.date || new Date().toISOString().slice(0, 10)}</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Håll inne för att ändra datum</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>Beskriv åtgärd:</Text>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <TextInput
                          value={actionModal.comment}
                          onChangeText={t => setActionModal(a => ({ ...a, comment: t }))}
                          placeholder="Beskriv vad som åtgärdats..."
                          style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, fontSize: 15, minHeight: 40, backgroundColor: '#fafbfc' }}
                          multiline
                          placeholderTextColor="#aaa"
                        />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <TouchableOpacity
                          style={{ backgroundColor: '#1976D2', borderRadius: 50, padding: 10, marginRight: 10 }}
                          onPress={async () => {
                            // Välj/tar foto
                            // Dynamically import ImagePicker for camera capture
                            if (!ImagePicker) {
                              try { ImagePicker = await import('expo-image-picker'); } catch(_e) { ImagePicker = null; }
                            }
                            const launch = (ImagePicker && typeof ImagePicker.launchCameraAsync === 'function') ? ImagePicker.launchCameraAsync : null;
                            const mediaTypes = (ImagePicker && ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images) ? ImagePicker.MediaTypeOptions.Images : undefined;
                            const result = launch ? await launch({ mediaTypes: mediaTypes, quality: 0.7 }) : null;
                            if (result && !result.canceled && result.assets && result.assets.length > 0) {
                              setActionModal(a => ({ ...a, img: result.assets[0].uri }));
                            }
                          }}
                        >
                          <Ionicons name="camera" size={24} color="#fff" />
                        </TouchableOpacity>
                        {actionModal.img && (
                          <Image source={{ uri: actionModal.img }} style={{ width: 60, height: 45, borderRadius: 8 }} />
                        )}
                      </View>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Namn på åtgärdande person:</Text>
                        <TextInput
                          value={actionModal.name}
                          onChangeText={t => setActionModal(a => ({ ...a, name: t }))}
                          placeholder="Namn..."
                          style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, fontSize: 15, backgroundColor: '#fafbfc' }}
                          placeholderTextColor="#aaa"
                        />
                      </View>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Signatur:</Text>
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, backgroundColor: '#fafbfc', minHeight: 44 }}
                          onPress={() => setActionModal(a => ({ ...a, showSignatureModal: true }))}
                        >
                          {actionModal.signature ? (
                            <Image source={{ uri: actionModal.signature }} style={{ width: 80, height: 32, backgroundColor: '#fff', borderRadius: 4 }} />
                          ) : (
                            <>
                              <Ionicons name="pencil" size={20} color="#1976D2" style={{ marginRight: 8 }} />
                              <Text style={{ color: '#888', fontSize: 15 }}>Tryck för signatur</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <SignatureModal
                          visible={!!actionModal.showSignatureModal}
                          onOK={uri => setActionModal(a => ({ ...a, signature: uri, showSignatureModal: false }))}
                          onCancel={() => setActionModal(a => ({ ...a, showSignatureModal: false }))}
                        />
                      </View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 40,
                          paddingVertical: 8,
                          marginTop: 18,
                          backgroundColor: (actionModal.comment && actionModal.name && actionModal.signature) ? '#1976D2' : '#e0e0e0',
                          borderRadius: 8,
                          shadowColor: '#1976D2',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.10,
                          shadowRadius: 4,
                        }}
                        onPress={async () => {
                          if (!(actionModal.comment && actionModal.name && actionModal.signature)) {
                            // Visa alert med saknade fält
                            const missing = [];
                            if (!actionModal.comment) missing.push('Beskriv åtgärd');
                            if (!actionModal.name) missing.push('Namn');
                            if (!actionModal.signature) missing.push('Signatur');
                            Alert.alert('Saknas', 'Följande fält måste fyllas i: ' + missing.join(', '));
                            return;
                          }
                          // Immutabel kopia av checklistan och kontrollen
                          const hasChecklist = Array.isArray(safeControl.checklist);
                          const sourceChecklist = hasChecklist
                            ? safeControl.checklist
                            : (Array.isArray(safeControl.checklistSections) ? safeControl.checklistSections : []);

                          let newChecklist = Array.isArray(sourceChecklist)
                            ? sourceChecklist.map(s => ({ ...s, remediation: { ...(s && s.remediation ? s.remediation : {}) } }))
                            : [];

                          const sectionIdx = newChecklist.findIndex(s => (s && (s.label || s.title)) === actionModal.section);
                          if (sectionIdx !== -1) {
                            // Hitta exakt rätt punkttext (pt) i sektionen, trimma för säker matchning
                            const pt = (newChecklist[sectionIdx].points || []).find(p => String(p || '').trim() === String(actionModal.point || '').trim());
                            const remediationKey = String((pt || actionModal.point) || '').trim();
                            const today = new Date().toISOString().slice(0, 10);
                            const remediationDate = actionModal.date && /^\d{4}-\d{2}-\d{2}$/.test(actionModal.date) ? actionModal.date : today;
                            newChecklist[sectionIdx].remediation[remediationKey] = {
                              comment: actionModal.comment,
                              img: actionModal.img,
                              signature: actionModal.signature,
                              name: actionModal.name,
                              date: remediationDate,
                            };
                          } else {
                            Alert.alert('Fel', 'Kunde inte hitta sektionen för åtgärden.');
                            return;
                          }
                          const updatedControl = {
                            ...safeControl,
                            ...(hasChecklist ? { checklist: newChecklist } : { checklistSections: newChecklist }),
                            savedAt: new Date().toISOString(),
                          };

                          try {
                            await upsertControlInStorage(updatedControl);
                            setControlState(updatedControl);
                            setActionModal(a => ({ ...a, visible: false }));
                            Alert.alert('Åtgärd sparad', 'Din åtgärd har sparats.', [
                              { text: 'OK' }
                            ]);
                          } catch(_e) {
                            Alert.alert('Fel', 'Kunde inte spara åtgärden. Försök igen.');
                          }
                        }}
                      >
                        <Ionicons name="save-outline" size={22} color={(actionModal.comment && actionModal.name && actionModal.signature) ? '#fff' : '#888'} style={{ marginRight: 8 }} />
                        <Text style={{
                          color: (actionModal.comment && actionModal.name && actionModal.signature) ? '#fff' : '#888',
                          fontWeight: 'bold',
                          fontSize: 17,
                          letterSpacing: 0.5,
                          textAlign: 'center',
                        }}>Spara</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </Modal>
          </>
        );
      })()}

      {/* Åtgärder vidtagna (om finns) tas bort, endast en rad ska visas */}

      {/* Signaturer */}
      {mottagningsSignatures.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Signaturer</Text>
          {mottagningsSignatures.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="pencil" size={18} color="#1976D2" style={{ marginRight: 8, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyText}>{s?.name || 'Signerad'}</Text>
                {s?.uri ? (
                  <Image source={{ uri: s.uri }} style={{ width: 140, height: 52, marginTop: 6, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#eee' }} resizeMode="contain" />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Bifogade bilder */}
      {mottagningsPhotos.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bifogade bilder</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {mottagningsPhotos.map((img, idx) => {
              const uri = img.uri || img;
              return (
                <TouchableOpacity
                  key={idx}
                  style={{ marginRight: 8 }}
                  onPress={() => {
                    setSelectedPhoto(uri);
                    setPhotoModalVisible(true);
                  }}
                  accessibilityLabel="Visa bild i stor vy"
                >
                  <Image source={{ uri }} style={{ width: 84, height: 84, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#eee' }} />
                  {img.comment ? (
                    <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 }}>
                      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12 }}>{img.comment}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Modal
            visible={photoModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setPhotoModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setPhotoModalVisible(false)}>
              <View style={styles.modalContent}>
                {selectedPhoto && (
                  <Image
                    source={{ uri: selectedPhoto }}
                    style={{ width: '100%', height: 350, borderRadius: 12, backgroundColor: '#000' }}
                    resizeMode="contain"
                  />
                )}
                <Text style={{ color: '#fff', marginTop: 12, textAlign: 'center' }}>Tryck utanför bilden för att stänga</Text>
              </View>
            </Pressable>
          </Modal>
        </View>
      )}

    </View>
  );

  // If no control was provided, show a friendly message (check placed after Hooks
  // and pageContent so Hook call order remains stable for ESLint).
  if (!control) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}> 
        <Text style={{ color: '#555' }}>Kunde inte hitta kontrollen.</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, styles.webScrollRoot, { height: windowHeight || undefined }]}>
        <View style={[styles.content, styles.contentWeb]}>
          {pageContent}
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {pageContent}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  // RN-web does not reliably apply `overflowY`; use `overflow` to enable scrolling.
  webScrollRoot: { overflow: 'auto', minHeight: 0 },
  content: { padding: 16, paddingBottom: 24 },
  contentWeb: { alignItems: 'flex-start' },
  page: { width: '100%' },
  pageWeb: { width: A4_WEB_MAX_WIDTH },

  title: { fontSize: 22, fontWeight: 'bold', color: PRIMARY },
  projectLine: { fontSize: 14, color: '#666', marginTop: 2 },
  subInfo: { fontSize: 13, color: '#666', marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: PRIMARY, marginBottom: 10 },
  bodyText: { fontSize: 15, color: '#222' },
  noteText: { fontSize: 13, color: '#444', marginTop: 2 },

  headerCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  companyLogo: {
    width: 260,
    maxWidth: '100%',
    height: 56,
  },
  companyLogoDivider: {
    height: 1,
    backgroundColor: '#e6e6e6',
    marginTop: 10,
    width: '100%',
    alignSelf: 'stretch',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 },
  headerActionBtn: { padding: 6, marginLeft: 8 },

  projectBar: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f6f6f6',
    borderWidth: 1,
    borderColor: '#ededed',
  },
  projectBarText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'space-between' },
  metaItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  metaText: { fontSize: 14, color: '#222' },

  statusPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  statusPillDone: { backgroundColor: '#E8F5E9', borderColor: '#43A047' },
  statusPillOngoing: { backgroundColor: '#FFF8E1', borderColor: '#FFD600' },
  statusPillText: { fontSize: 13, fontWeight: '700' },
  statusPillTextDone: { color: '#2E7D32' },
  statusPillTextOngoing: { color: '#222' },

  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
    marginTop: 12,
  },
  innerDivider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },

  overviewCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  overviewRowDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  overviewLabel: {
    fontSize: 13,
    color: '#444',
    fontWeight: '700',
    width: 145,
    paddingRight: 10,
  },
  overviewValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
  },
  metaIconWrap: { width: 22, alignItems: 'center', marginRight: 8 },
  metaMultiLineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  participantTableRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  participantColName: { width: 170, paddingRight: 10 },
  participantColCompany: { width: 170, paddingRight: 10 },
  participantColRole: { width: 160, paddingRight: 10 },
  participantColMobile: { width: 120 },
  overviewValue: {
    fontSize: 13,
    color: '#333',
    flexShrink: 1,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 16 },
  modalContent: { alignItems: 'center' },
});
