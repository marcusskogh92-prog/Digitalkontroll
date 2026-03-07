/**
 * Planeringsmodul – veckoplanering och kapacitet.
 * Layout: flikar (per typ) → vänsterpanel (Projekt + Personal) + högerpanel (Gantt, veckovy).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../components/firebase';
import {
  clearPlaneringPresence,
  savePlaneringPlan,
  setPlaneringPresence,
  subscribePlaneringPlan,
  subscribePlaneringPresence,
} from '../../components/firebase';
import { MODAL_THEME } from '../../constants/modalTheme';
import { PRIMARY_TOPBAR } from '../../constants/topbarTheme';
import AddPersonModal from './AddPersonModal';
import EditPersonModal from './EditPersonModal';
import ResursbankModal from './ResursbankModal';

let createPortal = null;
try {
  createPortal = require('react-dom').createPortal;
} catch (_e) {
  createPortal = null;
}

const STORAGE_PREFIX = 'dk_planering';

const DAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const DAY_WIDTH = 44;
const ROW_HEIGHT = 40;
const LEFT_PANEL_WIDTH = 260;
/** Min bredd för projektnamnscellen i kundkolumner så att långa projektnamn får plats på en rad */
const CUSTOMER_COLUMN_NAME_MIN = 220;
const HEADER_MONTH_ROW_HEIGHT = 24;
const HEADER_WEEK_ROW_HEIGHT = 24;
const HEADER_DAYS_ROW_HEIGHT = 24;
const HEADER_TOTAL_HEIGHT = HEADER_MONTH_ROW_HEIGHT + HEADER_WEEK_ROW_HEIGHT + HEADER_DAYS_ROW_HEIGHT;

// Gantt grid design tokens – single source for week/day structure and colors
const WEEK_DIVIDER_COLOR = '#94a3b8';
const DAY_DIVIDER_COLOR = '#e2e8f0';
const WEEKDAY_BG = '#ffffff';
const WEEKEND_BG = '#f3f5f8';

function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getInitials(name) {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKS_PER_YEAR = 52;

/** Bygg lista med veckor från given måndag (timestamp) och framåt. Inga passerade veckor. */
function getWeeksFrom(startWeekMondayTime, numWeeks) {
  const weeks = [];
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = new Date(startWeekMondayTime + w * 7 * MS_PER_DAY);
    const weekNumber = getWeekNumber(weekStart);
    const days = [];
    for (let d = 0; d < 7; d++) {
      days.push(new Date(weekStart.getTime() + d * MS_PER_DAY));
    }
    weeks.push({ weekStart, weekNumber, days });
  }
  return weeks;
}

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Returnera YYYY-MM-DD för svenska röda dagar (fasta + påskberäkning) för ett givet år. */
function getSwedishHolidayDates(year) {
  const out = new Set();
  const y = Number(year);
  const add = (month, date) => {
    const d = new Date(y, month - 1, date);
    out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };
  add(1, 1);   // Nyårsdagen
  add(1, 6);   // Trettondedag jul
  add(5, 1);   // Första maj
  add(6, 6);   // Nationaldagen
  add(12, 25); // Juldagen
  add(12, 26); // Annandag jul
  // Påsk (förenklad: första söndagen efter första fullmånen efter vårdagjämning)
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(y, month - 1, day);
  add(easter.getMonth() + 1, easter.getDate() - 2);  // Långfredagen
  add(easter.getMonth() + 1, easter.getDate());       // Påskdagen
  add(easter.getMonth() + 1, easter.getDate() + 1);   // Annandag påsk
  const ascension = new Date(easter);
  ascension.setDate(ascension.getDate() + 39);
  add(ascension.getMonth() + 1, ascension.getDate()); // Kristi himmelsfärdsdag
  // Midsommar: lördag mellan 20–26 juni
  for (let j = 20; j <= 26; j++) {
    const md = new Date(y, 5, j);
    if (md.getDay() === 6) {
      add(6, j);     // Midsommardagen
      add(6, j - 1); // Midsommarafton (fredag)
      break;
    }
  }
  // Alla helgons dag: lördag mellan 31 okt och 6 nov
  for (let j = 31; j <= 37; j++) {
    const ah = new Date(y, 9, j);
    if (ah.getDay() === 6) {
      add(10, j);
      break;
    }
  }
  return out;
}

/** Returnera YYYY-MM-DD för alla dagar i vecka 28–31 (byggsemester) för ett givet år. */
function getByggsemesterDates(year) {
  const out = new Set();
  const y = Number(year);
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(y, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, month, day);
      const w = getWeekNumber(d);
      if (w >= 28 && w <= 31) out.add(dateToKey(d));
    }
  }
  return out;
}

function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lägg N månader på ett datum (YYYY-MM-DD); returnerar ny dateKey. Använder lokala datum för att undvika tidszonsskift. */
function addMonthsToDateKey(dateKey, months) {
  if (!dateKey || typeof dateKey !== 'string' || !Number.isInteger(months)) return dateKey;
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) return dateKey;
  const d = new Date(y, m, day);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setMonth(d.getMonth() + months);
  return dateToKey(d);
}

/** Standarduppföljning om användaren bara fyllt i anställningsdag men inte valt månader (bakåtkompatibelt + automatik). */
const DEFAULT_UPPFÖLJNING_MÅNADER = [3, 5, 6];

/** Hämta provanställningshändelser för en resurs: anställningsstart + uppföljning 1–6 mån + fast anställning. Allt beräknas automatiskt från anställningsdatumet. */
function getProvanställningEvents(resource) {
  if (!resource || !resource.employmentStartDate) return [];
  const start = String(resource.employmentStartDate).trim();
  if (!start) return [];
  const events = [{ dateKey: start, label: 'Anställningsstart', type: 'start' }];
  const månader = Array.isArray(resource.provanUppföljningMånader) && resource.provanUppföljningMånader.length > 0
    ? resource.provanUppföljningMånader.filter((m) => m >= 1 && m <= 6)
    : DEFAULT_UPPFÖLJNING_MÅNADER;
  månader.forEach((m) => {
    const dk = addMonthsToDateKey(start, m);
    events.push({
      dateKey: dk,
      label: m === 6 ? 'Fast anställning' : `${m} mån`,
      type: m === 6 ? 'fast' : 'uppföljning',
    });
  });
  return events;
}

const ABSENCE_TYPE_LABELS = { semester: 'Semester', föräldraledig: 'Föräldraledig', sjukskrivning: 'Sjukskrivning', sjuk: 'Sjuk', annan: 'Frånvaro' };

/** Returnerar frånvaro för en resurs på en given datumkey (om dagens datum ligger inom någon frånvaroperiod). */
function getAbsenceOnDate(resource, dateKey) {
  if (!resource || !Array.isArray(resource.absences) || !dateKey) return null;
  const found = resource.absences.find((a) => a.startDate && a.endDate && dateKey >= a.startDate && dateKey <= a.endDate);
  return found ? { type: found.type, label: ABSENCE_TYPE_LABELS[found.type] || found.type } : null;
}

/** Nästa lediga projektkod för kunden (prefix + minsta lediga nummer 1, 2, 3… så att t.ex. T13 blir ledig efter "Klart"). */
function getNextProjectCode(customer, projectsForCustomer) {
  const prefix = (customer?.projectPrefix || '').trim();
  if (!prefix) return '';
  const used = (projectsForCustomer || [])
    .map((p) => {
      const c = (p.code || '').trim();
      if (!c.startsWith(prefix)) return null;
      const num = parseInt(c.slice(prefix.length), 10);
      return Number.isInteger(num) && num >= 1 ? num : null;
    })
    .filter((n) => n != null);
  let n = 1;
  while (used.includes(n)) n++;
  return `${prefix}${n}`;
}

export default function PlaneringView({ companyId, onActiveTabName }) {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState('resurser'); // 'resurser' | 'projekt'
  const [weekOffset, setWeekOffset] = useState(0);
  const [resources, setResources] = useState([]); // { id, name, role? } – lokal state tills backend
  const [customers, setCustomers] = useState([]); // { id, number, name, collapsed?, projectPrefix? } – kunder (12 - Lejonfastigheter), projectPrefix = t.ex. L eller LF för auto L1, L2, LF1, LF2
  const [projects, setProjects] = useState([]); // { id, customerId, code, name } – projekt under kund (L01 - Projektnamn)
  const [addPersonalVisible, setAddPersonalVisible] = useState(false);
  const [addProjectVisible, setAddProjectVisible] = useState(false);
  const [addCustomerVisible, setAddCustomerVisible] = useState(false);
  const [resursbankModalVisible, setResursbankModalVisible] = useState(false);
  const [projektModalVisible, setProjektModalVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [addProjectCustomerId, setAddProjectCustomerId] = useState(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerProjectPrefix, setNewCustomerProjectPrefix] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [showWeekends, setShowWeekends] = useState(true);
  const [showSwedishHolidays, setShowSwedishHolidays] = useState(false);
  const [showByggsemester, setShowByggsemester] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [delaUnderUppbyggnadVisible, setDelaUnderUppbyggnadVisible] = useState(false);
  const [searchFilter, setSearchFilter] = useState(''); // Sök resurser eller projekt
  const [viewWeeksMode, setViewWeeksMode] = useState(6); // 1 = Dag, 6 | 12 | 32 = antal veckor
  const [hoveredCell, setHoveredCell] = useState(null); // { rowIndex, dateKey }
  const [hoveredCornerRow, setHoveredCornerRow] = useState(null); // rowIndex
  const [hoveredProjectId, setHoveredProjectId] = useState(null); // projektrad i kundkolumn
  const [hoveredCustomerId, setHoveredCustomerId] = useState(null); // kundrubrik hover
  const [draftProjectNameByCustomer, setDraftProjectNameByCustomer] = useState({}); // { [customerId]: string } för inline nya projekt
  const [editingProjectId, setEditingProjectId] = useState(null); // inline redigering av projektnamn
  const [editingProjectName, setEditingProjectName] = useState('');
  const inlineProjectNameInputRef = useRef(null);
  const [dragResourceId, setDragResourceId] = useState(null);
  const [dragCursorPosition, setDragCursorPosition] = useState(null); // { x, y } – fixed ghost följer musen
  const [allocations, setAllocations] = useState([]); // { resourceId, startKey, endKey }[]
  const [selectionStart, setSelectionStart] = useState(null); // { rowIndex, dateKey }
  const [selectionEnd, setSelectionEnd] = useState(null);
  // Service-läge: grupper (collapsible) och block (overlay)
  const [serviceGroups, setServiceGroups] = useState([]); // { id, name, personIds: string[], collapsed: boolean }[]
  const [serviceAssignments, setServiceAssignments] = useState([]); // ServiceAssignment[]
  const [blockInteraction, setBlockInteraction] = useState(null); // { assignmentId, mode, startX, startY, startStartKey, startEndKey, startPersonId, overlayLeft, overlayTop }
  const [personContextMenu, setPersonContextMenu] = useState(null); // { resourceId, x, y } | null
  const [projectContextMenu, setProjectContextMenu] = useState(null); // { projectId, x, y } | null
  const [customerContextMenu, setCustomerContextMenu] = useState(null); // { customerId, x, y } | null
  const [planeringPresenceUsers, setPlaneringPresenceUsers] = useState([]); // { uid, displayName, updatedAt }[] – vilka som är inne i planeringen
  const [editProjectId, setEditProjectId] = useState(null); // öppnar redigera-projekt-modal
  const [editCustomerId, setEditCustomerId] = useState(null); // öppnar redigera-kund-modal
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectCode, setEditProjectCode] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPrefix, setEditCustomerPrefix] = useState('');
  const [editPersonVisible, setEditPersonVisible] = useState(false);
  const [editPersonId, setEditPersonId] = useState(null);
  const [editPersonInitialTab, setEditPersonInitialTab] = useState('uppgifter'); // 'uppgifter' | 'fravaro'

  const storageKeyTabs = `${STORAGE_PREFIX}_tabs_${companyId || 'default'}`;
  const storageKeyActive = `${STORAGE_PREFIX}_active_${companyId || 'default'}`;
  const planLoadedForTabIdRef = useRef(null);
  const planSaveTimeoutRef = useRef(null);
  const companyIdRef = useRef(companyId);
  const activeTabIdRef = useRef(activeTabId);
  companyIdRef.current = companyId;
  activeTabIdRef.current = activeTabId;
  const dragStartRef = useRef(null); // { resourceId, fromIndex, clientX, clientY } – drag startar endast vid move > threshold
  const listForRowsRef = useRef([]);
  const isServiceModeRef = useRef(false);
  const serviceOverlayRef = useRef(null);

  const loadStored = useCallback(async () => {
    if (!companyId) return;
    try {
      const [rawTabs, rawActive] = await Promise.all([
        AsyncStorage.getItem(storageKeyTabs),
        AsyncStorage.getItem(storageKeyActive),
      ]);
      const parsed = rawTabs ? JSON.parse(rawTabs) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const visibleList = list.filter((t) => t.visible !== false);
      setTabs(visibleList);
      const active =
        rawActive && visibleList.some((t) => t.id === rawActive)
          ? rawActive
          : (visibleList[0]?.id ?? null);
      setActiveTabId(active);
    } catch (_e) {
      setTabs([]);
      setActiveTabId(null);
    } finally {
      setLoaded(true);
    }
  }, [companyId, storageKeyTabs, storageKeyActive]);

  const storageKeyPlan = `${STORAGE_PREFIX}_plan_${companyId || 'default'}_${activeTabId || 'default'}`;

  /** Applicera plan-data på state (samma form som från AsyncStorage/Firestore). */
  const applyPlanData = useCallback((data) => {
    if (!data || typeof data !== 'object') {
      setResources([]);
      setCustomers([]);
      setProjects([]);
      setAllocations([]);
      setServiceGroups([]);
      setServiceAssignments([]);
      return;
    }
    if (Array.isArray(data.resources)) {
      setResources(data.resources.map((r) => ({
        id: r.id,
        name: r.name ?? '',
        role: r.role,
        employmentStartDate: r.employmentStartDate,
        provanUppföljningMånader: Array.isArray(r.provanUppföljningMånader) ? r.provanUppföljningMånader : undefined,
        absences: Array.isArray(r.absences) ? r.absences : [],
      })));
    } else {
      setResources([]);
    }
    if (Array.isArray(data.customers)) {
      setCustomers(data.customers.map((c) => ({ id: c.id, number: c.number ?? '', name: c.name ?? '', collapsed: c.collapsed === true, projectPrefix: c.projectPrefix ?? '' })));
    } else {
      setCustomers([]);
    }
    if (Array.isArray(data.projects)) {
      const projs = data.projects.map((p) => ({
        id: p.id,
        customerId: p.customerId ?? null,
        code: p.code ?? (p.name ? '' : ''),
        name: p.name ?? '',
      }));
      const hasLegacyProjects = projs.some((p) => p.customerId == null);
      const hasNoCustomers = !Array.isArray(data.customers) || data.customers.length === 0;
      if (hasLegacyProjects && hasNoCustomers) {
        const defaultCustomerId = `cust_${Date.now()}`;
        setCustomers([{ id: defaultCustomerId, number: '0', name: 'Övriga', collapsed: false, projectPrefix: '' }]);
        setProjects(projs.map((p) => (p.customerId == null ? { ...p, customerId: defaultCustomerId } : p)));
      } else {
        setProjects(projs);
      }
    } else {
      setProjects([]);
    }
    if (Array.isArray(data.allocations)) setAllocations(data.allocations);
    else setAllocations([]);
    if (Array.isArray(data.serviceGroups)) setServiceGroups(data.serviceGroups);
    else setServiceGroups([]);
    if (Array.isArray(data.serviceAssignments)) setServiceAssignments(data.serviceAssignments);
    else setServiceAssignments([]);
  }, []);

  const loadPlanForTab = useCallback(async () => {
    if (!companyId || activeTabId == null) return;
    const tabId = activeTabId;
    try {
      const raw = await AsyncStorage.getItem(storageKeyPlan);
      const data = raw ? JSON.parse(raw) : null;
      applyPlanData(data || {});
      planLoadedForTabIdRef.current = tabId;
    } catch (_e) {
      applyPlanData({});
      planLoadedForTabIdRef.current = tabId;
    }
  }, [companyId, activeTabId, storageKeyPlan, applyPlanData]);

  useEffect(() => {
    if (!loaded || !companyId || activeTabId == null) return;
    const tabId = activeTabId;
    const unsub = subscribePlaneringPlan(companyId, tabId, {
      onData: (data) => {
        const hasData = data && typeof data === 'object' && (
          (Array.isArray(data.resources) && data.resources.length > 0) ||
          (Array.isArray(data.customers) && data.customers.length > 0) ||
          (Array.isArray(data.projects) && data.projects.length > 0) ||
          (Array.isArray(data.serviceAssignments) && data.serviceAssignments.length > 0)
        );
        if (hasData) {
          applyPlanData(data);
          planLoadedForTabIdRef.current = tabId;
        } else {
          loadPlanForTab().then(async () => {
            const raw = await AsyncStorage.getItem(storageKeyPlan);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === 'object') {
              await savePlaneringPlan(companyId, tabId, {
                resources: parsed.resources ?? [],
                customers: parsed.customers ?? [],
                projects: parsed.projects ?? [],
                allocations: parsed.allocations ?? [],
                serviceGroups: parsed.serviceGroups ?? [],
                serviceAssignments: parsed.serviceAssignments ?? [],
              });
            }
          }).catch(() => {});
        }
      },
    });
    return () => { unsub(); };
  }, [loaded, companyId, activeTabId, applyPlanData, loadPlanForTab, storageKeyPlan]);

  useEffect(() => {
    if (!loaded || !companyId || activeTabId == null) return;
    if (planLoadedForTabIdRef.current !== activeTabId) return;
    if (planSaveTimeoutRef.current) clearTimeout(planSaveTimeoutRef.current);
    planSaveTimeoutRef.current = setTimeout(() => {
      planSaveTimeoutRef.current = null;
      const payload = {
        resources,
        customers,
        projects,
        allocations,
        serviceGroups,
        serviceAssignments,
      };
      savePlaneringPlan(companyId, activeTabId, payload).catch(() => {});
      try {
        AsyncStorage.setItem(storageKeyPlan, JSON.stringify(payload));
      } catch (_e) {}
    }, 800);
    return () => {
      if (planSaveTimeoutRef.current) {
        clearTimeout(planSaveTimeoutRef.current);
        planSaveTimeoutRef.current = null;
      }
    };
  }, [loaded, companyId, activeTabId, storageKeyPlan, resources, customers, projects, allocations, serviceGroups, serviceAssignments]);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  useEffect(() => {
    if (!loaded || !companyId || activeTabId == null) return;
    try {
      AsyncStorage.setItem(storageKeyActive, activeTabId);
    } catch (_e) {}
  }, [loaded, companyId, activeTabId, storageKeyActive]);

  const currentUser = auth?.currentUser ?? null;

  useEffect(() => {
    if (!loaded || !companyId || activeTabId == null || !currentUser) return;
    const uid = currentUser.uid;
    const displayName = (currentUser.displayName || currentUser.email || '').trim() || null;
    setPlaneringPresence(companyId, activeTabId, uid, displayName).catch(() => {});
    const heartbeat = setInterval(() => {
      setPlaneringPresence(companyId, activeTabId, uid, displayName).catch(() => {});
    }, 30000);
    return () => {
      clearInterval(heartbeat);
      clearPlaneringPresence(companyId, activeTabId, uid).catch(() => {});
    };
  }, [loaded, companyId, activeTabId, currentUser?.uid]);

  useEffect(() => {
    if (!loaded || !companyId || activeTabId == null) return;
    const unsub = subscribePlaneringPresence(companyId, activeTabId, {
      onData: (users) => setPlaneringPresenceUsers(Array.isArray(users) ? users : []),
    });
    return () => { unsub(); };
  }, [loaded, companyId, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isServiceMode = activeTab?.planningType === 'service';

  /** Resurser filtrerade på sökning (namn, roll, projektnamn via assignment). */
  const filteredResources = useMemo(() => {
    const q = (searchFilter || '').trim().toLowerCase();
    if (!q) return resources;
    return resources.filter((r) => {
      const nameMatch = (r.name || '').toLowerCase().includes(q);
      const roleMatch = (r.role || '').toLowerCase().includes(q);
      const projectMatch = serviceAssignments.some(
        (a) => a.personId === r.id && (projects.find((p) => p.id === a.projectId)?.name || '').toLowerCase().includes(q)
      );
      return nameMatch || roleMatch || projectMatch;
    });
  }, [resources, searchFilter, serviceAssignments, projects]);

  // Service-läge: om inga grupper finns, skapa en grupp "Personal" med alla resurser
  useEffect(() => {
    if (!isServiceMode || serviceGroups.length > 0 || resources.length === 0) return;
    setServiceGroups([{ id: `grp_${Date.now()}`, name: 'Personal', personIds: resources.map((r) => r.id), collapsed: false }]);
  }, [isServiceMode, serviceGroups.length, resources]);


  useEffect(() => {
    if (typeof onActiveTabName === 'function') {
      onActiveTabName(activeTab?.name ?? '');
    }
  }, [activeTab?.name, onActiveTabName]);

  const weeks = useMemo(() => {
    const now = new Date();
    const currentWeekMonday = getWeekStart(now).getTime();
    const startWeekTime = currentWeekMonday + weekOffset * 7 * MS_PER_DAY;
    const weeksAhead = viewWeeksMode === 1 ? 1 : Math.min(viewWeeksMode, activeTab?.weeksAhead ?? WEEKS_PER_YEAR);
    return getWeeksFrom(startWeekTime, Math.max(1, weeksAhead));
  }, [weekOffset, viewWeeksMode, activeTab?.weeksAhead]);

  const today = useMemo(() => new Date(), []);

  const visibleDaysPerWeek = useMemo(
    () => (showWeekends ? week => week.days : week => week.days.filter(d => d.getDay() >= 1 && d.getDay() <= 5)),
    [showWeekends]
  );

  const holidayDates = useMemo(() => {
    const years = new Set(weeks.map(w => w.days[0]?.getFullYear()).filter(Boolean));
    const set = new Set();
    if (showSwedishHolidays) {
      years.forEach(yr => getSwedishHolidayDates(yr).forEach(k => set.add(k)));
    }
    if (showByggsemester) {
      years.forEach(yr => getByggsemesterDates(yr).forEach(k => set.add(k)));
    }
    return set;
  }, [showSwedishHolidays, showByggsemester, weeks]);

  const totalGridWidth = useMemo(
    () => weeks.reduce((acc, w) => acc + visibleDaysPerWeek(w).length * DAY_WIDTH, 0),
    [weeks, visibleDaysPerWeek]
  );
  const gridStartKey = useMemo(
    () => (weeks[0]?.days[0] ? dateToKey(weeks[0].days[0]) : null),
    [weeks]
  );
  /** Månader som syns i griden, med antal dagar vardera – för att rita en markering per månad (1 feb–28 feb, 1 mar–31 mar). */
  const visibleMonths = useMemo(() => {
    if (!gridStartKey || !weeks.length) return [];
    const numDays = totalGridWidth / DAY_WIDTH;
    const byMonth = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date(gridStartKey);
      d.setDate(d.getDate() + i);
      const key = dateToKey(d);
      const monthKey = key.slice(0, 7);
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { monthKey, label: d.toLocaleDateString('sv-SE', { month: 'short' }), dayCount: 0 };
      }
      byMonth[monthKey].dayCount++;
    }
    return Object.keys(byMonth).sort().map((k) => byMonth[k]);
  }, [gridStartKey, totalGridWidth, weeks.length]);
  const dayOffsetFromGridStart = useCallback(
    (dateKey) => {
      if (!gridStartKey) return 0;
      return Math.round((new Date(dateKey) - new Date(gridStartKey)) / MS_PER_DAY);
    },
    [gridStartKey]
  );
  const dateKeyFromDayOffset = useCallback(
    (offset) => {
      if (!gridStartKey) return gridStartKey;
      const d = new Date(gridStartKey);
      d.setDate(d.getDate() + offset);
      return dateToKey(d);
    },
    [gridStartKey]
  );

  const SERVICE_COLOR_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  const customerColorMap = useMemo(() => {
    const ids = [...new Set(serviceAssignments.map((a) => a.customerId).filter(Boolean))];
    const map = {};
    ids.forEach((id, i) => (map[id] = SERVICE_COLOR_PALETTE[i % SERVICE_COLOR_PALETTE.length]));
    return map;
  }, [serviceAssignments]);

  const seededDummyRef = useRef(null);
  useEffect(() => {
    if (activeTabId != null) seededDummyRef.current = null;
  }, [activeTabId]);

  // Service-läge: platt lista för vänsterpanel (grupprubrik + personer) och grid (endast personer)
  const leftPanelRows = useMemo(() => {
    if (!isServiceMode || !serviceGroups.length) return [];
    const rows = [];
    serviceGroups.forEach((g) => {
      rows.push({ type: 'group', id: `group-${g.id}`, groupId: g.id, name: g.name, collapsed: g.collapsed });
      if (!g.collapsed) {
        g.personIds.forEach((personId) => {
          const r = filteredResources.find((res) => res.id === personId);
          if (r) rows.push({ type: 'person', id: r.id, personId: r.id, name: r.name, role: r.role });
        });
      }
    });
    return rows;
  }, [isServiceMode, serviceGroups, filteredResources]);

  const visiblePersonRows = useMemo(
    () => leftPanelRows.filter((r) => r.type === 'person').map((r) => r.personId),
    [leftPanelRows]
  );

  useEffect(() => {
    if (!isServiceMode || serviceAssignments.length > 0 || visiblePersonRows.length === 0) return;
    if (seededDummyRef.current === activeTabId) return;
    const gridStart = weeks[0]?.days[0];
    if (!gridStart) return;
    const sk = dateToKey(gridStart);
    const dayKey = (n) => dateToKey(new Date(gridStart.getTime() + n * MS_PER_DAY));
    seededDummyRef.current = activeTabId;
    setServiceAssignments([
      { id: 'dummy1', personId: visiblePersonRows[0], projectId: 'proj_dummy', customerId: 'cust_a', startDate: sk, endDate: dayKey(4) },
      ...(visiblePersonRows.length > 1
        ? [{ id: 'dummy2', personId: visiblePersonRows[1], projectId: 'proj_dummy2', customerId: 'cust_b', startDate: dayKey(2), endDate: dayKey(6) }]
        : []),
    ]);
  }, [isServiceMode, serviceAssignments.length, visiblePersonRows, weeks, activeTabId]);

  const listForRows = useMemo(() => {
    const personRows = isServiceMode
      ? leftPanelRows
      : filteredResources.map((r) => ({ id: r.id, type: 'resource', name: r.name, role: r.role, personId: r.id }));
    return personRows;
  }, [isServiceMode, leftPanelRows, filteredResources]);

  /* Min bredd för scroll-innehållet: endast tidslinjen (inga kundkolumner) */
  const scrollContentMinWidth = totalGridWidth;

  listForRowsRef.current = listForRows;
  isServiceModeRef.current = isServiceMode;

  const toggleServiceGroup = useCallback((groupId) => {
    setServiceGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)));
  }, []);

  const toggleCustomerGroup = useCallback((customerId) => {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, collapsed: !c.collapsed } : c)));
  }, []);

  const handleAddPerson = useCallback((data) => {
    const { name, role, employmentStartDate, provanUppföljningMånader } = data;
    if (!name?.trim()) return;
    const newId = `res_${Date.now()}`;
    setResources((prev) => [
      ...prev,
      { id: newId, name: name.trim(), role: role || undefined, employmentStartDate, provanUppföljningMånader, absences: [] },
    ]);
    if (isServiceMode) {
      setServiceGroups((prev) =>
        prev.length ? prev.map((g, i) => (i === 0 ? { ...g, personIds: [...g.personIds, newId] } : g)) : prev
      );
    }
    setAddPersonalVisible(false);
  }, [isServiceMode]);

  const addCustomer = useCallback(() => {
    const name = newCustomerName.trim();
    if (!name) return;
    const projectPrefix = (newCustomerProjectPrefix || '').trim().toUpperCase();
    setCustomers((prev) => [...prev, { id: `cust_${Date.now()}`, number: '', name, collapsed: false, projectPrefix }]);
    setNewCustomerName('');
    setNewCustomerProjectPrefix('');
    setAddCustomerVisible(false);
  }, [newCustomerName, newCustomerProjectPrefix]);

  const addCustomerRef = useRef(addCustomer);
  addCustomerRef.current = addCustomer;

  useEffect(() => {
    if (!addCustomerVisible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAddCustomerVisible(false);
        setNewCustomerName('');
        setNewCustomerProjectPrefix('');
        return;
      }
      if (e.key === 'Enter') {
        const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toUpperCase() : '';
        if (tag === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        addCustomerRef.current();
        return;
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [addCustomerVisible]);

  const addProject = useCallback(() => {
    const name = newProjectName.trim();
    if (!name) return;
    const customerId = addProjectCustomerId || (customers[0]?.id ?? null);
    if (!customerId) return;
    const customer = customers.find((c) => c.id === customerId);
    const custProjects = projects.filter((p) => p.customerId === customerId);
    const code = getNextProjectCode(customer, custProjects) || newProjectCode.trim();
    setProjects((prev) => [...prev, { id: `proj_${Date.now()}`, customerId, code: code || '', name }]);
    setNewProjectCode('');
    setNewProjectName('');
    setAddProjectCustomerId(null);
    setAddProjectVisible(false);
  }, [newProjectCode, newProjectName, addProjectCustomerId, customers, projects]);

  /** Lägg till projekt direkt från kundkolumn (inline): kod = prefix + minsta lediga nummer (T1, T2… T13 om T13 är ledig). */
  const addProjectForCustomer = useCallback((customerId, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const customer = customers.find((c) => c.id === customerId);
    const custProjects = projects.filter((p) => p.customerId === customerId);
    const code = getNextProjectCode(customer, custProjects);
    setProjects((prev) => [...prev, { id: `proj_${Date.now()}`, customerId, code, name: trimmed }]);
    setDraftProjectNameByCustomer((prev) => ({ ...prev, [customerId]: '' }));
  }, [customers, projects]);

  const saveEditProject = useCallback(() => {
    if (!editProjectId) return;
    const name = (editProjectName || '').trim();
    if (!name) return;
    setProjects((prev) => prev.map((p) => (p.id === editProjectId ? { ...p, name } : p)));
    setEditProjectId(null);
    setEditProjectName('');
    setEditProjectCode('');
  }, [editProjectId, editProjectName]);

  const saveEditCustomer = useCallback(() => {
    if (!editCustomerId) return;
    const name = (editCustomerName || '').trim();
    if (!name) return;
    const customer = customers.find((c) => c.id === editCustomerId);
    const oldPrefix = (customer?.projectPrefix ?? '').toUpperCase();
    const newPrefix = (editCustomerPrefix || '').trim().toUpperCase();

    const newCustomers = customers.map((c) => (c.id === editCustomerId ? { ...c, name, projectPrefix: newPrefix } : c));
    const newProjects = projects.map((p) => {
      if (p.customerId !== editCustomerId) return p;
      if (!oldPrefix || !(p.code || '').startsWith(oldPrefix)) return p;
      return { ...p, code: newPrefix + (p.code || '').slice(oldPrefix.length) };
    });

    setCustomers(newCustomers);
    setProjects(newProjects);
    setEditCustomerId(null);
    setEditCustomerName('');
    setEditCustomerPrefix('');

    // Spara direkt till Firestore + AsyncStorage så ändringen inte försvinner vid siduppdatering
    const cid = companyIdRef.current;
    const tid = activeTabIdRef.current;
    if (!cid || tid == null) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Planering: kunde inte spara (redigera kund) – companyId eller activeTabId saknas', { cid: cid || null, tid: tid ?? null });
      }
    } else {
      if (planSaveTimeoutRef.current) {
        clearTimeout(planSaveTimeoutRef.current);
        planSaveTimeoutRef.current = null;
      }
      const payload = {
        resources,
        customers: newCustomers,
        projects: newProjects,
        allocations,
        serviceGroups,
        serviceAssignments,
      };
      savePlaneringPlan(cid, tid, payload).then(
        () => {},
        (err) => {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('Planering spara (redigera kund) misslyckades:', err);
          }
        }
      );
      try {
        AsyncStorage.setItem(storageKeyPlan, JSON.stringify(payload));
      } catch (_e) {}
    }
  }, [editCustomerId, editCustomerName, editCustomerPrefix, customers, projects, resources, allocations, serviceGroups, serviceAssignments, storageKeyPlan]);

  const saveEditCustomerRef = useRef(saveEditCustomer);
  saveEditCustomerRef.current = saveEditCustomer;
  useEffect(() => {
    if (!editCustomerId || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditCustomerId(null);
        setEditCustomerName('');
        setEditCustomerPrefix('');
        return;
      }
      if (e.key === 'Enter') {
        const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toUpperCase() : '';
        if (tag === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        if ((editCustomerName || '').trim()) saveEditCustomerRef.current();
        return;
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [editCustomerId, editCustomerName]);

  const deleteProject = useCallback((projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setServiceAssignments((prev) => prev.filter((a) => a.projectId !== projectId));
    setProjectContextMenu(null);
  }, []);

  const deleteCustomer = useCallback((customerId) => {
    const projectIdsToRemove = new Set(projects.filter((p) => p.customerId === customerId).map((p) => p.id));
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    setProjects((prev) => prev.filter((p) => p.customerId !== customerId));
    setServiceAssignments((prev) => prev.filter((a) => !projectIdsToRemove.has(a.projectId)));
    setCustomerContextMenu(null);
  }, [projects]);

  const handlePersonContextMenu = useCallback((e, resourceId) => {
    if (Platform.OS === 'web') {
      e.preventDefault();
      setPersonContextMenu({ resourceId, x: e.clientX, y: e.clientY });
    }
  }, []);

  const handlePersonLongPress = useCallback((resourceId) => {
    if (Platform.OS !== 'web') setPersonContextMenu({ resourceId });
  }, []);

  const openEditPersonModal = useCallback((resourceId, tab = 'uppgifter') => {
    setEditPersonId(resourceId);
    setEditPersonInitialTab(tab);
    setEditPersonVisible(true);
  }, []);

  const saveEditPerson = useCallback((updated) => {
    if (!updated?.id) return;
    setResources((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    setEditPersonVisible(false);
    setEditPersonId(null);
  }, []);

  const removePerson = useCallback((resourceId) => {
    setResources((prev) => prev.filter((r) => r.id !== resourceId));
    setAllocations((prev) => prev.filter((a) => a.resourceId !== resourceId));
    if (isServiceMode) {
      setServiceGroups((prev) =>
        prev.map((g) => ({ ...g, personIds: g.personIds.filter((id) => id !== resourceId) }))
      );
      setServiceAssignments((prev) => prev.filter((a) => a.personId !== resourceId));
    }
  }, [isServiceMode]);

  const DRAG_THRESHOLD_PX = 5;

  const handleResourcePointerDown = useCallback((e, resourceId, rowIndex) => {
    if (Platform.OS !== 'web' || !resourceId) return;
    const fromIndex = rowIndex;
    if (fromIndex < 0) return;
    dragStartRef.current = {
      resourceId,
      fromIndex,
      clientX: e.clientX,
      clientY: e.clientY,
    };
  }, []);

  const RESIZE_HANDLE_PX = 8;
  const handleServiceBlockPointerDown = useCallback(
    (e, assignment, blockLeftPx, blockWidthPx) => {
      if (Platform.OS !== 'web' || !serviceOverlayRef.current) return;
      e.stopPropagation();
      const rect = serviceOverlayRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - blockLeftPx;
      let mode = 'move';
      if (x < RESIZE_HANDLE_PX) mode = 'resizeLeft';
      else if (x > blockWidthPx - RESIZE_HANDLE_PX) mode = 'resizeRight';
      setBlockInteraction({
        assignmentId: assignment.id,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startStartKey: assignment.startDate,
        startEndKey: assignment.endDate,
        startPersonId: assignment.personId,
        overlayLeft: rect.left,
        overlayTop: rect.top,
      });
    },
    []
  );

  useEffect(() => {
    if (typeof document === 'undefined' || !blockInteraction) return;
    const { assignmentId, mode, startX, startY, startStartKey, startEndKey, startPersonId, overlayLeft, overlayTop } = blockInteraction;
    const onPointerMove = (e) => {
      const gridStartKeyVal = gridStartKey;
      const visiblePersonRowsVal = visiblePersonRows;
      if (!gridStartKeyVal) return;
      const deltaPx = e.clientX - startX;
      const deltaDays = Math.round(deltaPx / DAY_WIDTH);
      setServiceAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          if (mode === 'move') {
            const newStartOff = dayOffsetFromGridStart(startStartKey) + deltaDays;
            const newEndOff = dayOffsetFromGridStart(startEndKey) + deltaDays;
            const newStartKey = dateKeyFromDayOffset(Math.max(0, newStartOff));
            const newEndKey = dateKeyFromDayOffset(Math.max(newStartOff, newEndOff));
            const rowIndex = Math.floor((e.clientY - overlayTop) / ROW_HEIGHT);
            const newPersonId = visiblePersonRowsVal[Math.max(0, Math.min(rowIndex, visiblePersonRowsVal.length - 1))] ?? startPersonId;
            return { ...a, startDate: newStartKey, endDate: newEndKey, personId: newPersonId };
          }
          if (mode === 'resizeLeft') {
            const newStartOff = dayOffsetFromGridStart(startStartKey) + deltaDays;
            const endOff = dayOffsetFromGridStart(startEndKey);
            const clamped = Math.min(Math.max(0, newStartOff), endOff);
            return { ...a, startDate: dateKeyFromDayOffset(clamped) };
          }
          if (mode === 'resizeRight') {
            const newEndOff = dayOffsetFromGridStart(startEndKey) + deltaDays;
            const startOff = dayOffsetFromGridStart(startStartKey);
            const clamped = Math.max(startOff, newEndOff);
            return { ...a, endDate: dateKeyFromDayOffset(clamped) };
          }
          return a;
        })
      );
    };
    const onPointerUp = () => setBlockInteraction(null);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, [blockInteraction, gridStartKey, visiblePersonRows, dayOffsetFromGridStart, dateKeyFromDayOffset]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onPointerMove = (e) => {
      const start = dragStartRef.current;
      if (start) {
        const dx = e.clientX - start.clientX;
        const dy = e.clientY - start.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (!dragResourceId && dist >= DRAG_THRESHOLD_PX) {
          setDragResourceId(start.resourceId);
          setDragCursorPosition({ x: e.clientX, y: e.clientY });
        }
      }
      if (dragResourceId) {
        setDragCursorPosition({ x: e.clientX, y: e.clientY });
        if (typeof document.elementFromPoint === 'function') {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const rowEl = el?.closest?.('[data-rowindex]');
          if (rowEl) {
            const toRowIndex = parseInt(rowEl.getAttribute('data-rowindex') ?? '', 10);
            if (!Number.isNaN(toRowIndex)) {
              const list = listForRowsRef.current;
              const fromRowIndex = start?.fromIndex ?? -1;
              if (isServiceModeRef.current) {
                const start = dragStartRef.current;
                const personRows = list.filter((r) => r.type === 'person');
                const fromPersonIndex =
                  start != null ? list.slice(0, start.fromIndex + 1).filter((r) => r.type === 'person').length - 1 : -1;
                const toPersonIndex = list.slice(0, toRowIndex + 1).filter((r) => r.type === 'person').length - 1;
                if (fromPersonIndex < 0 || fromPersonIndex === toPersonIndex) return;
                const visibleOrder = personRows.map((r) => r.personId);
                const [moved] = visibleOrder.splice(fromPersonIndex, 1);
                visibleOrder.splice(toPersonIndex, 0, moved);
                setServiceGroups((prev) => {
                  const personToGroup = {};
                  prev.forEach((g) => g.personIds.forEach((pid) => (personToGroup[pid] = g.id)));
                  return prev.map((g) => ({
                    ...g,
                    personIds: visibleOrder.filter((pid) => personToGroup[pid] === g.id),
                  }));
                });
              } else {
                setResources((prev) => {
                  const from = prev.findIndex((r) => r.id === dragResourceId);
                  if (from < 0 || from === toRowIndex) return prev;
                  const next = [...prev];
                  const [item] = next.splice(from, 1);
                  next.splice(toRowIndex, 0, item);
                  return next;
                });
              }
            }
          }
        }
      }
    };
    const onPointerUp = () => {
      if (dragResourceId) {
        setDragResourceId(null);
        setDragCursorPosition(null);
      }
      dragStartRef.current = null;
    };
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragResourceId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (dragResourceId) {
      document.body.style.cursor = 'grabbing';
      return () => { document.body.style.cursor = ''; };
    }
  }, [dragResourceId]);

  const handleCellMouseDown = useCallback((rowIndex, dateKey) => {
    if (rowIndex < 0) return;
    if (isServiceMode) {
      const personId = listForRows[rowIndex]?.type === 'person' ? listForRows[rowIndex].personId : null;
      if (personId) {
        // Hook för nästa steg: skapa nytt ServiceAssignment. Inget inline-sök ännu.
        // onServiceCellClick?.(personId, dateKey);
      }
      return;
    }
    setSelectionStart({ rowIndex, dateKey });
    setSelectionEnd({ rowIndex, dateKey });
  }, [isServiceMode, listForRows]);

  const handleCellMouseEnter = useCallback((rowIndex, dateKey) => {
    if (selectionStart && selectionStart.rowIndex === rowIndex) {
      setSelectionEnd({ rowIndex, dateKey });
    }
  }, [selectionStart]);

  const handleCellMouseUp = useCallback(() => {
    if (isServiceMode) {
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }
    if (selectionStart && selectionEnd && selectionStart.rowIndex >= 0) {
      const resourceId = resources[selectionStart.rowIndex]?.id;
      if (resourceId) {
        const keys = [selectionStart.dateKey, selectionEnd.dateKey].sort();
        setAllocations((prev) => [...prev, { resourceId, startKey: keys[0], endKey: keys[1] }]);
      }
    }
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [selectionStart, selectionEnd, resources, isServiceMode]);

  const isDateInSelection = useCallback((rowIndex, dateKey) => {
    if (!selectionStart || !selectionEnd || selectionStart.rowIndex !== rowIndex) return false;
    const keys = [selectionStart.dateKey, selectionEnd.dateKey].sort();
    return dateKey >= keys[0] && dateKey <= keys[1];
  }, [selectionStart, selectionEnd]);

  const isDateInAllocation = useCallback((resourceId, dateKey) => {
    return allocations.some((a) => a.resourceId === resourceId && dateKey >= a.startKey && dateKey <= a.endKey);
  }, [allocations]);

  useEffect(() => {
    if (typeof document === 'undefined' || !selectionStart) return;
    const onMouseUp = () => handleCellMouseUp();
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [selectionStart, handleCellMouseUp]);

  const presenceToShow = useMemo(() => {
    const list = Array.isArray(planeringPresenceUsers) ? planeringPresenceUsers : [];
    const cutoff = Date.now() - 90 * 1000;
    return list.filter((u) => u.updatedAt && (u.updatedAt.getTime ? u.updatedAt.getTime() : u.updatedAt) > cutoff);
  }, [planeringPresenceUsers]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Laddar planering…</Text>
        </View>
      </View>
    );
  }

  const isWeb = Platform.OS === 'web';

  if (!activeTab) {
    return (
      <View style={styles.container}>
        <View style={[styles.tabBarWrap, isWeb && styles.tabBarWrapSticky]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent} style={styles.tabBarScroll}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.id}
                style={[styles.tabItem, isWeb ? styles.tabItemHover : null]}
                onPress={() => setActiveTabId(tab.id)}
              >
                <Text style={styles.tabItemText} numberOfLines={1}>{tab.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>
            {tabs.length === 0 ? 'Inga planeringsflikar än' : 'Ingen flik vald'}
          </Text>
          <Text style={styles.emptyStateText}>
            {tabs.length === 0
              ? 'Flikar skapas i Företagsinställningar → Planering.'
              : 'Välj en flik ovan.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.tabBarWrap, isWeb && styles.tabBarWrapSticky]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent} style={styles.tabBarScroll}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabItem, !isActive && (isWeb ? styles.tabItemHover : null)]}
                onPress={() => setActiveTabId(tab.id)}
              >
                <Text style={[styles.tabItemText, isActive && styles.tabItemTextActive]} numberOfLines={1}>{tab.name}</Text>
                {isActive && <View style={styles.tabItemUnderline} />}
              </Pressable>
            );
          })}
        </ScrollView>
        {presenceToShow.length > 0 && (
          <View style={styles.planeringPresenceWrap}>
            <Ionicons name="people-outline" size={16} color="#64748b" />
            <Text style={styles.planeringPresenceLabel}>Inne:</Text>
            {presenceToShow.map((u) => {
              const name = (u.displayName || '').trim() || 'Användare';
              const initial = name.charAt(0).toUpperCase();
              return (
                <View key={u.uid} style={styles.planeringPresenceAvatar} title={name}>
                  <Text style={styles.planeringPresenceInitial}>{initial}</Text>
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.tabBarActionButtons}>
          <Pressable
            style={({ pressed }) => [styles.tabBarActionBtn, pressed && styles.tabBarActionBtnPressed]}
            onPress={() => setResursbankModalVisible(true)}
          >
            <Ionicons name="people-outline" size={16} color="#2563eb" />
            <Text style={styles.tabBarActionBtnText}>Resurs</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.tabBarActionBtn, pressed && styles.tabBarActionBtnPressed]}
            onPress={() => setProjektModalVisible(true)}
          >
            <Ionicons name="folder-open-outline" size={16} color="#2563eb" />
            <Text style={styles.tabBarActionBtnText}>Projekt</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.mainRow}>
        {/* Gantt: vänsterkolumn = Resurser/Projekt + lista, höger = kalender */}
        <View style={styles.ganttPanel}>
          <View style={styles.ganttToolbar}>
            <Pressable style={styles.ganttToolbarBtn} onPress={() => setWeekOffset((o) => o - 1)}>
              <Ionicons name="chevron-back" size={20} color="#475569" />
            </Pressable>
            <Pressable style={styles.ganttToolbarBtn} onPress={() => setWeekOffset(0)}>
              <Text style={styles.ganttToolbarBtnText}>Idag</Text>
            </Pressable>
            <Pressable style={styles.ganttToolbarBtn} onPress={() => setWeekOffset((o) => o + 1)}>
              <Ionicons name="chevron-forward" size={20} color="#475569" />
            </Pressable>
            <Text style={styles.ganttToolbarLabel}>
              {weeks.length > 0 && weeks[0].days[0]
                ? weeks.length === 1
                  ? `Vecka ${weeks[0].weekNumber}, ${weeks[0].days[0].toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' })}`
                  : `v.${weeks[0].weekNumber} – v.${weeks[weeks.length - 1].weekNumber} ${weeks[weeks.length - 1].days[0]?.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' }) ?? ''}`
                : 'Veckovy'}
            </Text>
            <View style={styles.ganttToolbarSpacer} />
            <Pressable style={[styles.ganttToolbarFilterBtn]} onPress={() => {}}>
              <Ionicons name="filter-outline" size={18} color="#64748b" />
              <Text style={styles.ganttToolbarFilterText}>Filter</Text>
            </Pressable>
            <View style={styles.ganttToolbarSearchWrap}>
              <Ionicons name="search-outline" size={18} color="#94a3b8" style={styles.ganttToolbarSearchIcon} />
              <TextInput
                style={styles.ganttToolbarSearchInput}
                value={searchFilter}
                onChangeText={setSearchFilter}
                placeholder="Sök resurser eller projekt"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.ganttToolbarViewToggles}>
              {[
                { key: 1, label: 'Dag' },
                { key: 6, label: '6v' },
                { key: 12, label: '12v' },
                { key: 32, label: '32v' },
              ].map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={[styles.ganttToolbarViewBtn, viewWeeksMode === key && styles.ganttToolbarViewBtnActive]}
                  onPress={() => setViewWeeksMode(key)}
                >
                  <Text style={[styles.ganttToolbarViewBtnText, viewWeeksMode === key && styles.ganttToolbarViewBtnTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.ganttToolbarSettingsWrap}>
              <Pressable
                style={styles.ganttToolbarSettingsBtn}
                onPress={() => setSettingsMenuVisible((v) => !v)}
                {...(Platform.OS === 'web' ? { title: 'Inställningar' } : {})}
              >
                <Ionicons name="settings-outline" size={20} color="#64748b" />
              </Pressable>
              {settingsMenuVisible && (
                <Modal visible transparent animationType="fade">
                  <Pressable style={StyleSheet.absoluteFill} onPress={() => setSettingsMenuVisible(false)} />
                  <View style={styles.settingsDropdown} pointerEvents="box-none">
                    <View style={styles.settingsDropdownBox}>
                      <Text style={styles.settingsDropdownTitle}>Inställningar</Text>
                      <Pressable
                        style={styles.settingsDropdownRow}
                        onPress={() => setShowWeekends((v) => !v)}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Ionicons name={showWeekends ? 'checkbox' : 'square-outline'} size={22} color={showWeekends ? '#2563eb' : '#94a3b8'} />
                        <Text style={styles.settingsDropdownLabel}>Visa helger</Text>
                      </Pressable>
                      <Pressable
                        style={styles.settingsDropdownRow}
                        onPress={() => setShowSwedishHolidays((v) => !v)}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Ionicons name={showSwedishHolidays ? 'checkbox' : 'square-outline'} size={22} color={showSwedishHolidays ? '#2563eb' : '#94a3b8'} />
                        <Text style={styles.settingsDropdownLabel}>Högtider</Text>
                      </Pressable>
                      <Pressable
                        style={styles.settingsDropdownRow}
                        onPress={() => setShowByggsemester((v) => !v)}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Ionicons name={showByggsemester ? 'checkbox' : 'square-outline'} size={22} color={showByggsemester ? '#2563eb' : '#94a3b8'} />
                        <Text style={styles.settingsDropdownLabel}>Byggsemester (v.28–31)</Text>
                      </Pressable>
                    </View>
                  </View>
                </Modal>
              )}
            </View>
            <View style={styles.ganttToolbarActions}>
              <Pressable
                style={styles.ganttToolbarActionBtn}
                onPress={() => {}}
                {...(Platform.OS === 'web' ? { title: 'Anteckningar' } : {})}
              >
                <Ionicons name="document-text-outline" size={18} color="#64748b" />
                <Text style={styles.ganttToolbarActionBtnText}>Anteckningar</Text>
              </Pressable>
              <Pressable
                style={styles.ganttToolbarActionBtn}
                onPress={() => setResursbankModalVisible(true)}
                {...(Platform.OS === 'web' ? { title: 'Resurser' } : {})}
              >
                <Ionicons name="people-outline" size={18} color="#64748b" />
                <Text style={styles.ganttToolbarActionBtnText}>Resurser</Text>
              </Pressable>
              <Pressable
                style={styles.ganttToolbarActionBtn}
                onPress={() => {}}
                {...(Platform.OS === 'web' ? { title: 'Ledighet' } : {})}
              >
                <Ionicons name="calendar-outline" size={18} color="#64748b" />
                <Text style={styles.ganttToolbarActionBtnText}>Ledighet</Text>
              </Pressable>
              <Pressable
                style={styles.ganttToolbarActionBtn}
                onPress={() => setDelaUnderUppbyggnadVisible(true)}
                {...(Platform.OS === 'web' ? { title: 'Dela' } : {})}
              >
                <Ionicons name="share-outline" size={18} color="#64748b" />
                <Text style={styles.ganttToolbarActionBtnText}>Dela</Text>
              </Pressable>
              <Pressable
                style={styles.ganttToolbarActionBtn}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.print) {
                    window.print();
                  } else {
                    Alert.alert('PDF', 'PDF-export kommer i en senare version.');
                  }
                }}
                {...(Platform.OS === 'web' ? { title: 'Skriv ut PDF' } : {})}
              >
                <Ionicons name="document-outline" size={18} color="#64748b" />
                <Text style={styles.ganttToolbarActionBtnText}>PDF</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.ganttVerticalScroll} contentContainerStyle={styles.ganttVerticalScrollContent} showsVerticalScrollIndicator={true}>
          <View style={styles.ganttRowWrap}>
            {/* Fast vänsterkolumn: personal/projektlista – scrollar inte i sidled */}
            <View style={styles.ganttFixedLeft}>
              {/* Månadsrad – samma höjd som tidslinjens månadsrad för linjejustering */}
              <View style={[styles.ganttRow, styles.ganttHeaderMonthRow]}>
                <View style={[styles.ganttCorner, styles.ganttCornerMonth]}>
                  <Text style={styles.ganttMonthLabel}>Månad</Text>
                </View>
              </View>
              {/* Flikar Resurser / Projekt (som referensappen) */}
              <View style={[styles.ganttRow, styles.ganttHeaderRow, styles.leftPanelTabsRow]}>
                <View style={[styles.ganttCorner, styles.ganttHeaderCell, styles.ganttCornerHeaderCompact, styles.leftPanelTabsWrap]}>
                  <Pressable
                    style={[styles.leftPanelTab, leftPanelTab === 'resurser' && styles.leftPanelTabActive]}
                    onPress={() => setLeftPanelTab('resurser')}
                  >
                    <Text style={[styles.leftPanelTabLabel, leftPanelTab === 'resurser' && styles.leftPanelTabLabelActive]}>Resurser</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.leftPanelTab, leftPanelTab === 'projekt' && styles.leftPanelTabActive]}
                    onPress={() => setLeftPanelTab('projekt')}
                  >
                    <Text style={[styles.leftPanelTabLabel, leftPanelTab === 'projekt' && styles.leftPanelTabLabelActive]}>Projekt</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.ganttBodyWrap}>
                {leftPanelTab === 'projekt' ? (
                  <ScrollView style={styles.leftPanelProjectScroll} contentContainerStyle={styles.leftPanelProjectScrollContent} showsVerticalScrollIndicator>
                    {projects.length === 0 ? (
                      <Text style={styles.leftPanelProjectEmpty}>Inga projekt. Lägg till via Projekt i verktygsfältet.</Text>
                    ) : (
                      projects.map((p) => {
                        const cust = customers.find((c) => c.id === p.customerId);
                        const label = [p.code, p.name].filter(Boolean).join(' – ') || p.name || '–';
                        const sub = cust?.name;
                        return (
                          <View key={p.id} style={styles.leftPanelProjectRow}>
                            <Text style={styles.leftPanelProjectRowLabel} numberOfLines={1}>{label}</Text>
                            {sub ? <Text style={styles.leftPanelProjectRowSub} numberOfLines={1}>{sub}</Text> : null}
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                ) : (
                listForRows.map((item, rowIndex) => {
                  const isGroupRow = item.type === 'group';
                  const isSpacer = false;
                  const isDivider = false;
                  const isInlanadHeader = item.type === 'inlanadHeader';
                  const isInlanadItem = item.type === 'inlanadItem';
                  const isResourceRow = !isGroupRow && !isInlanadHeader && !isInlanadItem && (item.type === 'resource' || item.type === 'person');
                  const resourceId = isResourceRow ? (item.personId ?? item.id) : null;
                  const isDragging = isResourceRow && dragResourceId === (item.personId ?? item.id);
                  const isCustomerGroup = isGroupRow && customers.some((c) => c.id === item.groupId);
                  const isLastPersonRow = rowIndex === listForRows.length - 1;
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.ganttRow,
                        styles.ganttBodyRow,
                        isResourceRow && styles.ganttRowResource,
                        isResourceRow && hoveredCornerRow === rowIndex && !dragResourceId && styles.ganttRowResourceHover,
                        isDragging && styles.ganttRowSpacer,
                        isGroupRow && styles.ganttRowGroupHeader,
                        isInlanadHeader && styles.ganttRowGroupHeader,
                        isInlanadItem && styles.ganttRowResource,
                        isSpacer && styles.ganttRowSpacerBg,
                        isDivider && styles.ganttRowDivider,
                      ]}
                    >
                      <View
                        style={[
                          styles.ganttCorner,
                          styles.ganttCornerBody,
                          hoveredCornerRow === rowIndex && !isDragging && !isGroupRow && !isSpacer && !isDivider && !isInlanadHeader && styles.ganttCornerHover,
                          isResourceRow && !isDragging && styles.ganttCornerDraggable,
                          isGroupRow && styles.ganttCornerGroupHeader,
                          isInlanadHeader && styles.ganttCornerGroupHeader,
                          isLastPersonRow && styles.ganttCornerLastRowBottom,
                          isSpacer && styles.ganttCornerNoBorder,
                          isDivider && styles.ganttCornerDivider,
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoveredCornerRow((isSpacer || isDivider) ? null : rowIndex) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoveredCornerRow(null) : undefined}
                        onPointerDown={Platform.OS === 'web' && isResourceRow ? (e) => handleResourcePointerDown(e, item.personId ?? item.id, rowIndex) : undefined}
                        onContextMenu={isResourceRow ? (e) => handlePersonContextMenu(e, item.personId ?? item.id) : undefined}
                        onLongPress={isResourceRow && Platform.OS !== 'web' ? () => handlePersonLongPress(item.personId ?? item.id) : undefined}
                      >
                        {isDragging ? (
                          <View style={styles.ganttCornerNameRow} />
                        ) : isSpacer ? (
                          <View style={styles.ganttCornerNameRow} />
                        ) : isDivider ? (
                          <View style={styles.ganttCornerNameRow} />
                        ) : isGroupRow ? (
                          <Pressable
                            style={styles.ganttCornerNameRow}
                            onPress={() => (isCustomerGroup ? toggleCustomerGroup(item.groupId) : toggleServiceGroup(item.groupId))}
                          >
                            <Ionicons name={item.collapsed ? 'chevron-forward' : 'chevron-down'} size={16} color="#64748b" style={{ marginRight: 6 }} />
                            <Text style={styles.ganttGroupHeaderText} numberOfLines={1}>{item.name}</Text>
                          </Pressable>
                        ) : (
                          <View style={styles.ganttCornerNameRow}>
                            <View style={styles.ganttCornerAvatar}>
                              <Text style={styles.ganttCornerAvatarText}>{getInitials(item.name)}</Text>
                            </View>
                            <View style={styles.ganttCornerNameBlock}>
                              <View style={styles.ganttCornerNameAndRole}>
                                <Text style={styles.listRowName} numberOfLines={1}>{item.name}</Text>
                                {item.role ? (
                                  <View style={styles.listRowRolePill}>
                                    <Text style={styles.listRowRolePillText} numberOfLines={1}>{item.role}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
                )}
              </View>
            </View>

            {/* Scrollbar tidslinje */}
            <ScrollView horizontal style={styles.ganttScroll} contentContainerStyle={[styles.ganttScrollContent, { minWidth: scrollContentMinWidth }]} showsHorizontalScrollIndicator={true}>
              <View style={styles.ganttScrollInner}>
                <View style={[styles.ganttGrid, { minWidth: totalGridWidth }]}>
                {/* Månadsrad – en markering per månad som spänner hela månaden (1 feb–28 feb, 1 mar–31 mar) */}
                <View style={[styles.ganttRow, styles.ganttHeaderMonthRow]}>
                  {visibleMonths.map((month, idx) => (
                    <View
                      key={month.monthKey}
                      style={[
                        styles.ganttMonthCell,
                        { width: month.dayCount * DAY_WIDTH },
                        idx === 0 && styles.ganttWeekColFirst,
                      ]}
                    >
                      <Text style={styles.ganttMonthCellText}>{month.label}</Text>
                    </View>
                  ))}
                </View>
                {/* Veckonummer + dagar */}
                <View style={[styles.ganttRow, styles.ganttHeaderRow, { height: HEADER_WEEK_ROW_HEIGHT + HEADER_DAYS_ROW_HEIGHT }]}>
                {weeks.map((week, weekIndex) => {
                  const visibleDays = visibleDaysPerWeek(week);
                  const weekWidth = visibleDays.length * DAY_WIDTH;
                  const isFirstWeek = weekIndex === 0;
                  return (
                    <View
                      key={week.weekNumber}
                      style={[
                        styles.ganttWeekCol,
                        { width: weekWidth },
                        isFirstWeek && styles.ganttWeekColFirst,
                      ]}
                    >
                      <View
                        style={[
                          styles.ganttWeekNum,
                          { width: weekWidth },
                          isFirstWeek && styles.ganttWeekNumFirst,
                        ]}
                      >
                        <Text style={styles.ganttWeekNumText}>
                          Vecka {week.weekNumber}, {week.days[0]?.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' }) ?? ''}
                        </Text>
                      </View>
                      <View style={[styles.ganttDaysRow, { height: HEADER_DAYS_ROW_HEIGHT }]}>
                        {visibleDays.map((day, dayIndex) => {
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          const isHoliday = holidayDates.has(dateToKey(day));
                          const isLastInWeek = dayIndex === visibleDays.length - 1;
                          return (
                            <View
                              key={day.toISOString()}
                              style={[
                                styles.ganttDayCell,
                                isWeekend && styles.ganttDayWeekend,
                                isHoliday && styles.ganttDayHoliday,
                                isLastInWeek && styles.ganttDayCellLastInWeek,
                              ]}
                            >
                              <Text style={styles.ganttDayLabel}>{DAY_LABELS[day.getDay() === 0 ? 6 : day.getDay() - 1]}</Text>
                              <Text style={styles.ganttDayNum}>{day.getDate()}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
              {/* Rader: endast tidslinjeceller (personkolumnen är i ganttFixedLeft) */}
              <View style={styles.ganttBodyWrap}>
              {listForRows.map((item, rowIndex) => {
                const isGroupRow = item.type === 'group';
                const isInlanadHeader = item.type === 'inlanadHeader';
                const isInlanadItem = item.type === 'inlanadItem';
                const isResourceRow = !isGroupRow && !isInlanadHeader && !isInlanadItem && (item.type === 'resource' || item.type === 'person');
                const resourceId = isResourceRow ? (item.personId ?? item.id) : null;
                const isDragging = isResourceRow && dragResourceId === (item.personId ?? item.id);
                const isLastPersonRow = rowIndex === listForRows.length - 1;
                const isSepRow = isInlanadHeader || isInlanadItem;
                const isDivider = item.type === 'divider';
                return (
                  <React.Fragment key={item.id}>
                    <View
                      style={[
                        styles.ganttRow,
                        styles.ganttBodyRow,
                        isResourceRow && styles.ganttRowResource,
                        isResourceRow && hoveredCornerRow === rowIndex && !dragResourceId && styles.ganttRowResourceHover,
                        isDragging && styles.ganttRowSpacer,
                        isGroupRow && styles.ganttRowGroupHeader,
                        isInlanadHeader && styles.ganttRowGroupHeader,
                        isInlanadItem && styles.ganttRowResource,
                        isSepRow && styles.ganttRowSpacerBg,
                      ]}
                      {...(Platform.OS === 'web' ? { dataSet: { rowindex: String(rowIndex) } } : {})}
                    >
                    {weeks.map((week, weekIndex) => {
                      const visibleDays = visibleDaysPerWeek(week);
                      const weekWidth = visibleDays.length * DAY_WIDTH;
                      const isFirstWeek = weekIndex === 0;
                      return (
                        <View
                          key={`body-${week.weekNumber}`}
                          style={[
                            styles.ganttWeekCol,
                            { width: weekWidth },
                            isFirstWeek && styles.ganttWeekColFirst,
                          ]}
                        >
                          <View style={styles.ganttDaysRow}>
                            {visibleDays.map((day, dayIndex) => {
                              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                              const isHoliday = holidayDates.has(dateToKey(day));
                              const isLastInWeek = dayIndex === visibleDays.length - 1;
                              const dateKey = dateToKey(day);
                              const hovered = Platform.OS === 'web' && hoveredCell?.rowIndex === rowIndex && hoveredCell?.dateKey === dateKey;
                              const inSelection = !isDragging && !isServiceMode && isDateInSelection(rowIndex, dateKey);
                              const inAllocation = !isDragging && !isServiceMode && resourceId && isDateInAllocation(resourceId, dateKey);
                              const resource = resourceId ? resources.find((r) => r.id === resourceId) : null;
                              const provanEvent = resource ? getProvanställningEvents(resource).find((e) => e.dateKey === dateKey) : null;
                              const absenceOnDay = resource ? getAbsenceOnDate(resource, dateKey) : null;
                              return (
                                <View
                                  key={day.toISOString()}
                                  style={[
                                    styles.ganttCell,
                                    isWeekend && !isSepRow && styles.ganttDayWeekend,
                                    isHoliday && styles.ganttCellHoliday,
                                    isSameDay(day, today) && !isSepRow && styles.ganttCellToday,
                                    isLastInWeek && !isSepRow && styles.ganttCellLastInWeek,
                                    hovered && !isSepRow && styles.ganttCellHover,
                                    inSelection && styles.ganttCellSelection,
                                    inAllocation && styles.ganttCellAllocation,
                                    isLastPersonRow && styles.ganttCellLastRowBottom,
                                    isSepRow && styles.ganttCellNoGrid,
                                    isDivider && styles.ganttCellDividerBottom,
                                  ]}
                                  onMouseDown={Platform.OS === 'web' && !isSepRow ? () => handleCellMouseDown(rowIndex, dateKey) : undefined}
                                  onMouseEnter={
                                    Platform.OS === 'web'
                                      ? () => {
                                          if (isSepRow) {
                                            setHoveredCell(null);
                                          } else {
                                            setHoveredCell({ rowIndex, dateKey });
                                            handleCellMouseEnter(rowIndex, dateKey);
                                          }
                                        }
                                      : undefined
                                  }
                                  onMouseLeave={Platform.OS === 'web' ? () => setHoveredCell(null) : undefined}
                                >
                                  <View style={styles.cellBadgesWrap}>
                                    {provanEvent ? (
                                      <View
                                        style={[
                                          styles.provanEventBadge,
                                          provanEvent.type === 'start' && styles.provanEventBadgeStart,
                                          provanEvent.type === 'fast' && styles.provanEventBadgeFast,
                                        ]}
                                        {...(Platform.OS === 'web' ? { title: provanEvent.label } : {})}
                                      >
                                        <Text style={styles.provanEventBadgeText} numberOfLines={1}>{provanEvent.label}</Text>
                                      </View>
                                    ) : null}
                                    {absenceOnDay ? (
                                      <View style={styles.absenceEventBadge} {...(Platform.OS === 'web' ? { title: absenceOnDay.label } : {})}>
                                        <Text style={styles.provanEventBadgeText} numberOfLines={1}>{absenceOnDay.label}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  </React.Fragment>
                );
              })}
              {isServiceMode && totalGridWidth > 0 && gridStartKey && (() => {
                const personRowCount = (() => {
                  const idx = listForRows.findIndex((r) => r.type === 'inlanadHeader' || r.type === 'spacer');
                  return idx >= 0 ? idx : listForRows.length;
                })();
                return (
                <View
                  ref={serviceOverlayRef}
                  style={[
                    styles.serviceOverlay,
                    {
                      left: 0,
                      width: totalGridWidth,
                      height: personRowCount * ROW_HEIGHT,
                    },
                  ]}
                  pointerEvents="box-none"
                >
                  {serviceAssignments.map((a) => {
                    const rowIndexInList = listForRows.findIndex((r) => r.type === 'person' && r.personId === a.personId);
                    if (rowIndexInList < 0) return null;
                    const startOff = dayOffsetFromGridStart(a.startDate);
                    const endOff = dayOffsetFromGridStart(a.endDate);
                    const numDays = Math.max(1, endOff - startOff + 1);
                    const left = startOff * DAY_WIDTH;
                    const width = numDays * DAY_WIDTH;
                    const top = rowIndexInList * ROW_HEIGHT;
                    const color = customerColorMap[a.customerId] || '#94a3b8';
                    const proj = projects.find((p) => p.id === a.projectId);
                    const projectLabel = proj ? [proj.code, proj.name].filter(Boolean).join(' ') || proj.name || 'Projekt' : 'Projekt';
                    return (
                      <View
                        key={a.id}
                        style={[
                          styles.serviceBlock,
                          { left, width, top, height: ROW_HEIGHT, backgroundColor: color },
                          Platform.OS === 'web' && { cursor: blockInteraction?.assignmentId === a.id ? 'grabbing' : 'grab' },
                        ]}
                        {...(Platform.OS === 'web' ? { title: projectLabel } : {})}
                        onPointerDown={Platform.OS === 'web' ? (e) => handleServiceBlockPointerDown(e, a, left, width) : undefined}
                      >
                        <Text style={styles.serviceBlockText} numberOfLines={1}>{projectLabel}</Text>
                      </View>
                    );
                  })}
                </View>
              );
              })()}
              {gridStartKey && (() => {
                const todayOff = dayOffsetFromGridStart(dateToKey(today));
                const numDays = totalGridWidth / DAY_WIDTH;
                if (todayOff < 0 || todayOff >= numDays) return null;
                return (
                  <View
                    style={[
                      styles.ganttTodayLine,
                      {
                        left: todayOff * DAY_WIDTH,
                        top: HEADER_TOTAL_HEIGHT,
                        height: listForRows.length * ROW_HEIGHT,
                      },
                    ]}
                    pointerEvents="none"
                  />
                );
              })()}
            </View>
            </View>
          </View>
          </ScrollView>
          </View>
          </ScrollView>
        </View>
      </View>

      {/* Drag-ghost i portal så namnet alltid syns ovanför rail (undviker overflow/clipping) */}
      {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && dragResourceId && dragCursorPosition && (() => {
        const r = resources.find((res) => res.id === dragResourceId);
        if (!r) return null;
        const ghostStyle = {
          position: 'fixed',
          left: dragCursorPosition.x + 12,
          top: dragCursorPosition.y + 12,
          zIndex: 10000,
          pointerEvents: 'none',
        };
        return createPortal(
          <View style={[styles.dragGhostCard, ghostStyle]}>
            <Text style={styles.dragGhostName} numberOfLines={1}>{r.name}</Text>
            {r.role ? <Text style={styles.dragGhostRole} numberOfLines={1}>{r.role}</Text> : null}
          </View>,
          document.body
        );
      })()}

      {/* Modal: Lägg till personal – samma look som Redigera (banner, flikar), endast Uppgifter + Provanställning */}
      <AddPersonModal
        visible={addPersonalVisible}
        onClose={() => setAddPersonalVisible(false)}
        onAdd={handleAddPerson}
      />

      {/* Modal: Lägg till kund (golden rules: mörk banner, mörka knappar, ingen vit ram) */}
      <Modal visible={addCustomerVisible} transparent animationType="fade" onRequestClose={() => setAddCustomerVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddCustomerVisible(false)} />
          <View style={styles.addCustomerModalBox}>
            <View style={styles.addCustomerModalBanner}>
              <View style={styles.addCustomerModalBannerLeft}>
                <View style={styles.addCustomerModalBannerIcon}>
                  <Ionicons name="business-outline" size={14} color={MODAL_THEME.banner.titleColor} />
                </View>
                <Text style={styles.addCustomerModalBannerTitle}>Lägg till kund</Text>
              </View>
              <TouchableOpacity
                style={styles.addCustomerModalBannerClose}
                onPress={() => { setAddCustomerVisible(false); setNewCustomerName(''); setNewCustomerProjectPrefix(''); }}
                accessibilityLabel="Stäng"
              >
                <Ionicons name="close" size={18} color={MODAL_THEME.banner.titleColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.addCustomerModalBody}>
              <Text style={styles.modalLabel}>Kundnamn</Text>
              <TextInput
                style={styles.modalInput}
                value={newCustomerName}
                onChangeText={setNewCustomerName}
                placeholder="T.ex. Lejonfastigheter eller 8 - Tekniska Verken"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              <Text style={styles.modalLabel}>Projektprefix (valfritt)</Text>
              <TextInput
                style={styles.modalInput}
                value={newCustomerProjectPrefix}
                onChangeText={setNewCustomerProjectPrefix}
                placeholder="T.ex. L eller LF – då blir projekt L1, L2…"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.addCustomerModalFooter}>
              <TouchableOpacity style={styles.addCustomerModalFooterBtnSecondary} onPress={() => { setAddCustomerVisible(false); setNewCustomerName(''); setNewCustomerProjectPrefix(''); }}>
                <Text style={styles.addCustomerModalFooterBtnSecondaryText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addCustomerModalFooterBtnPrimary, !newCustomerName.trim() && styles.modalBtnDisabled]} onPress={addCustomer} disabled={!newCustomerName.trim()}>
                <Text style={styles.addCustomerModalFooterBtnPrimaryText}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Lägg till projekt (under kund: projektkod + namn) */}
      <Modal visible={addProjectVisible} transparent animationType="fade" onRequestClose={() => setAddProjectVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddProjectVisible(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Lägg till projekt</Text>
            {customers.length === 0 ? (
              <Text style={styles.modalHint}>Lägg till minst en kund först (Lägg till kund).</Text>
            ) : null}
            {customers.length > 0 && (
              <>
                <Text style={styles.modalLabel}>Kund</Text>
                <View style={styles.modalSelectWrap}>
                  <ScrollView style={styles.modalSelectScroll} nestedScrollEnabled>
                    {customers.map((c) => {
                      const label = [c.number, c.name].filter(Boolean).join(' - ') || c.name;
                      const isSelected = (addProjectCustomerId || customers[0]?.id) === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          style={[styles.modalSelectOption, isSelected && styles.modalSelectOptionActive]}
                          onPress={() => setAddProjectCustomerId(c.id)}
                        >
                          <Text style={[styles.modalSelectOptionText, isSelected && styles.modalSelectOptionTextActive]} numberOfLines={1}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </>
            )}
            {(() => {
              const selCust = customers.find((c) => c.id === (addProjectCustomerId || customers[0]?.id));
              const hasPrefix = selCust && (selCust.projectPrefix || '').trim();
              if (!hasPrefix) {
                return (
                  <>
                    <Text style={styles.modalLabel}>Projektkod</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newProjectCode}
                      onChangeText={setNewProjectCode}
                      placeholder="T.ex. L01"
                      placeholderTextColor="#94a3b8"
                    />
                  </>
                );
              }
              const nextNum = projects.filter((p) => p.customerId === selCust.id).length + 1;
              return (
                <Text style={styles.modalHint}>Kod sätts automatiskt: {selCust.projectPrefix.trim()}{nextNum}</Text>
              );
            })()}
            <Text style={styles.modalLabel}>Projektnamn</Text>
            <TextInput
              style={styles.modalInput}
              value={newProjectName}
              onChangeText={setNewProjectName}
              placeholder="T.ex. Projektnamn"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => { setAddProjectVisible(false); setNewProjectCode(''); setNewProjectName(''); setAddProjectCustomerId(null); }}>
                <Text style={styles.modalBtnSecondaryText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, (!newProjectName.trim() || customers.length === 0 || (customers.length > 0 && !(addProjectCustomerId || customers[0]?.id))) && styles.modalBtnDisabled]}
                onPress={addProject}
                disabled={!newProjectName.trim() || customers.length === 0 || (customers.length > 0 && !(addProjectCustomerId || customers[0]?.id))}
              >
                <Text style={styles.modalBtnPrimaryText}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Kontextmeny: högerklick på person */}
      <Modal visible={!!personContextMenu} transparent animationType="fade" onRequestClose={() => setPersonContextMenu(null)}>
        <Pressable style={[StyleSheet.absoluteFill, Platform.OS !== 'web' && { justifyContent: 'center', alignItems: 'center' }]} onPress={() => setPersonContextMenu(null)}>
          {personContextMenu && (
            <View
              style={[
                styles.personContextMenu,
                Platform.OS === 'web' && typeof personContextMenu.x === 'number' && typeof personContextMenu.y === 'number'
                  ? { position: 'fixed', left: personContextMenu.x, top: personContextMenu.y }
                  : styles.personContextMenuCenter,
              ]}
              onStartShouldSetResponder={() => true}
            >
              <Pressable
                style={styles.personContextMenuItem}
                onPress={() => {
                  openEditPersonModal(personContextMenu.resourceId);
                  setPersonContextMenu(null);
                }}
              >
                <Ionicons name="pencil-outline" size={18} color="#475569" />
                <Text style={styles.personContextMenuText}>Redigera</Text>
              </Pressable>
              <Pressable
                style={styles.personContextMenuItem}
                onPress={() => {
                  openEditPersonModal(personContextMenu.resourceId, 'fravaro');
                  setPersonContextMenu(null);
                }}
              >
                <Ionicons name="calendar-outline" size={18} color="#475569" />
                <Text style={styles.personContextMenuText}>Lägg in frånvaro</Text>
              </Pressable>
              <Pressable
                style={[styles.personContextMenuItem, styles.personContextMenuItemDanger]}
                onPress={() => {
                  const resourceId = personContextMenu.resourceId;
                  setPersonContextMenu(null);
                  Alert.alert(
                    'Ta bort person',
                    'Vill du verkligen ta bort denna person från planeringen?',
                    [
                      { text: 'Avbryt', style: 'cancel' },
                      { text: 'Ta bort', style: 'destructive', onPress: () => removePerson(resourceId) },
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text style={[styles.personContextMenuText, styles.personContextMenuTextDanger]}>Ta bort</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Kontextmeny: högerklick på projekt */}
      <Modal visible={!!projectContextMenu} transparent animationType="fade" onRequestClose={() => setProjectContextMenu(null)}>
        <Pressable style={[StyleSheet.absoluteFill, Platform.OS !== 'web' && { justifyContent: 'center', alignItems: 'center' }]} onPress={() => setProjectContextMenu(null)}>
          {projectContextMenu && (() => {
            const proj = projects.find((p) => p.id === projectContextMenu.projectId);
            const cust = proj ? customers.find((c) => c.id === proj.customerId) : null;
            const hasPrefix = cust && (cust.projectPrefix || '').trim();
            return (
              <View
                style={[
                  styles.personContextMenu,
                  Platform.OS === 'web' && typeof projectContextMenu.x === 'number' && typeof projectContextMenu.y === 'number'
                    ? { position: 'fixed', left: projectContextMenu.x, top: projectContextMenu.y }
                    : styles.personContextMenuCenter,
                ]}
                onStartShouldSetResponder={() => true}
              >
                <Pressable
                  style={styles.personContextMenuItem}
                  onPress={() => {
                    if (proj) {
                      setEditProjectName(proj.name ?? '');
                      setEditProjectId(proj.id);
                    }
                    setProjectContextMenu(null);
                  }}
                >
                  <Ionicons name="pencil-outline" size={18} color="#475569" />
                  <Text style={styles.personContextMenuText}>Redigera projekt</Text>
                </Pressable>
                <Pressable
                  style={styles.personContextMenuItem}
                  onPress={() => {
                    const projectId = projectContextMenu.projectId;
                    const msg = 'Markera projektet som klart? Projektet tas bort från listan och löpnumret blir ledigt för nästa projekt.';
                    setProjectContextMenu(null);
                    if (Platform.OS === 'web') {
                      if (typeof window !== 'undefined' && window.confirm(msg)) {
                        deleteProject(projectId);
                      }
                    } else {
                      Alert.alert('Klart', msg, [
                        { text: 'Avbryt', style: 'cancel' },
                        { text: 'Klart', onPress: () => deleteProject(projectId) },
                      ]);
                    }
                  }}
                >
                  <Ionicons name="checkmark-done-outline" size={18} color="#16a34a" />
                  <Text style={styles.personContextMenuText}>Klart</Text>
                </Pressable>
                <Pressable
                  style={[styles.personContextMenuItem, styles.personContextMenuItemDanger]}
                  onPress={() => {
                    const projectId = projectContextMenu.projectId;
                    setProjectContextMenu(null);
                    if (Platform.OS === 'web') {
                      if (typeof window !== 'undefined' && window.confirm('Vill du verkligen ta bort detta projekt?')) {
                        deleteProject(projectId);
                      }
                    } else {
                      Alert.alert(
                        'Ta bort projekt',
                        'Vill du verkligen ta bort detta projekt?',
                        [
                          { text: 'Avbryt', style: 'cancel' },
                          { text: 'Ta bort', style: 'destructive', onPress: () => deleteProject(projectId) },
                        ]
                      );
                    }
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  <Text style={[styles.personContextMenuText, styles.personContextMenuTextDanger]}>Ta bort projekt</Text>
                </Pressable>
              </View>
            );
          })()}
        </Pressable>
      </Modal>

      {/* Kontextmeny: högerklick på kund */}
      <Modal visible={!!customerContextMenu} transparent animationType="fade" onRequestClose={() => setCustomerContextMenu(null)}>
        <Pressable style={[StyleSheet.absoluteFill, Platform.OS !== 'web' && { justifyContent: 'center', alignItems: 'center' }]} onPress={() => setCustomerContextMenu(null)}>
          {customerContextMenu && (
            <View
              style={[
                styles.personContextMenu,
                Platform.OS === 'web' && typeof customerContextMenu.x === 'number' && typeof customerContextMenu.y === 'number'
                  ? { position: 'fixed', left: customerContextMenu.x, top: customerContextMenu.y }
                  : styles.personContextMenuCenter,
              ]}
              onStartShouldSetResponder={() => true}
            >
              <Pressable
                style={styles.personContextMenuItem}
                onPress={() => {
                  const cust = customers.find((c) => c.id === customerContextMenu.customerId);
                  if (cust) {
                    setEditCustomerName(cust.name ?? '');
                    setEditCustomerPrefix(cust.projectPrefix ?? '');
                    setEditCustomerId(cust.id);
                  }
                  setCustomerContextMenu(null);
                }}
              >
                <Ionicons name="pencil-outline" size={18} color="#475569" />
                <Text style={styles.personContextMenuText}>Redigera kund</Text>
              </Pressable>
              <Pressable
                style={[styles.personContextMenuItem, styles.personContextMenuItemDanger]}
                onPress={() => {
                  const customerId = customerContextMenu.customerId;
                  const cust = customers.find((c) => c.id === customerId);
                  const projectCount = projects.filter((p) => p.customerId === customerId).length;
                  const message = projectCount > 0
                    ? `Vill du verkligen ta bort "${cust?.name ?? 'kunden'}"? Alla ${projectCount} projekt och tillhörande planering tas bort.`
                    : `Vill du verkligen ta bort "${cust?.name ?? 'kunden'}"?`;
                  setCustomerContextMenu(null);
                  if (Platform.OS === 'web') {
                    if (typeof window !== 'undefined' && window.confirm(message)) {
                      deleteCustomer(customerId);
                    }
                  } else {
                    Alert.alert('Ta bort kund', message, [
                      { text: 'Avbryt', style: 'cancel' },
                      { text: 'Ta bort', style: 'destructive', onPress: () => deleteCustomer(customerId) },
                    ]);
                  }
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text style={[styles.personContextMenuText, styles.personContextMenuTextDanger]}>Ta bort kund</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Modal: Redigera projekt – kod är alltid automatisk och visas endast som text */}
      <Modal visible={!!editProjectId} transparent animationType="fade" onRequestClose={() => { setEditProjectId(null); setEditProjectName(''); setEditProjectCode(''); }}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setEditProjectId(null); setEditProjectName(''); setEditProjectCode(''); }} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Redigera projekt</Text>
            {(() => {
              const proj = projects.find((p) => p.id === editProjectId);
              return (
                <Text style={styles.modalHint}>Projektkod: {proj?.code ?? '–'} (hanteras automatiskt)</Text>
              );
            })()}
            <Text style={styles.modalLabel}>Projektnamn</Text>
            <TextInput
              style={styles.modalInput}
              value={editProjectName}
              onChangeText={setEditProjectName}
              placeholder="Projektnamn"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => { setEditProjectId(null); setEditProjectName(''); setEditProjectCode(''); }}>
                <Text style={styles.modalBtnSecondaryText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnPrimary, !editProjectName.trim() && styles.modalBtnDisabled]} onPress={saveEditProject} disabled={!editProjectName.trim()}>
                <Text style={styles.modalBtnPrimaryText}>Spara</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Redigera kund (samma golden rules som Lägg till kund) */}
      <Modal visible={!!editCustomerId} transparent animationType="fade" onRequestClose={() => { setEditCustomerId(null); setEditCustomerName(''); setEditCustomerPrefix(''); }}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setEditCustomerId(null); setEditCustomerName(''); setEditCustomerPrefix(''); }} />
          <View style={styles.addCustomerModalBox}>
            <View style={styles.addCustomerModalBanner}>
              <View style={styles.addCustomerModalBannerLeft}>
                <View style={styles.addCustomerModalBannerIcon}>
                  <Ionicons name="business-outline" size={14} color={MODAL_THEME.banner.titleColor} />
                </View>
                <Text style={styles.addCustomerModalBannerTitle}>Redigera kund</Text>
              </View>
              <TouchableOpacity
                style={styles.addCustomerModalBannerClose}
                onPress={() => { setEditCustomerId(null); setEditCustomerName(''); setEditCustomerPrefix(''); }}
                accessibilityLabel="Stäng"
              >
                <Ionicons name="close" size={18} color={MODAL_THEME.banner.titleColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.addCustomerModalBody}>
              <Text style={styles.modalLabel}>Kundnamn</Text>
              <TextInput
                style={styles.modalInput}
                value={editCustomerName}
                onChangeText={setEditCustomerName}
                placeholder="T.ex. Lejonfastigheter eller 8 - Tekniska Verken"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              <Text style={styles.modalLabel}>Projektprefix (valfritt)</Text>
              <TextInput
                style={styles.modalInput}
                value={editCustomerPrefix}
                onChangeText={setEditCustomerPrefix}
                placeholder="T.ex. L eller LF – då blir projekt L1, L2…"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.addCustomerModalFooter}>
              <TouchableOpacity style={styles.addCustomerModalFooterBtnSecondary} onPress={() => { setEditCustomerId(null); setEditCustomerName(''); setEditCustomerPrefix(''); }}>
                <Text style={styles.addCustomerModalFooterBtnSecondaryText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addCustomerModalFooterBtnPrimary, !editCustomerName.trim() && styles.modalBtnDisabled]} onPress={saveEditCustomer} disabled={!editCustomerName.trim()}>
                <Text style={styles.addCustomerModalFooterBtnPrimaryText}>Spara</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Redigera personal – golden rules, flikar Uppgifter/Frånvaro */}
      <EditPersonModal
        visible={editPersonVisible}
        person={resources.find((r) => r.id === editPersonId) ?? null}
        initialTab={editPersonInitialTab}
        onClose={() => { setEditPersonVisible(false); setEditPersonId(null); }}
        onSave={saveEditPerson}
      />

      <ResursbankModal
        visible={resursbankModalVisible}
        onClose={() => setResursbankModalVisible(false)}
        resources={resources}
        onAddPerson={() => {
          setResursbankModalVisible(false);
          setAddPersonalVisible(true);
        }}
        onEditPerson={(resourceId) => {
          setResursbankModalVisible(false);
          openEditPersonModal(resourceId);
        }}
      />

      {/* Dela – funktion under uppbyggnad */}
      <Modal visible={delaUnderUppbyggnadVisible} transparent animationType="fade" onRequestClose={() => setDelaUnderUppbyggnadVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDelaUnderUppbyggnadVisible(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Dela</Text>
            <Text style={styles.placeholderText}>Funktion under uppbyggnad.</Text>
            <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setDelaUnderUppbyggnadVisible(false)}>
              <Text style={styles.modalBtnSecondaryText}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Placeholder: Projekt-modal (kan utökas senare) */}
      <Modal visible={projektModalVisible} transparent animationType="fade" onRequestClose={() => setProjektModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.projektModalBox}>
            <View style={[styles.modalBanner, { backgroundColor: MODAL_THEME?.banner?.backgroundColor || '#1e293b' }]}>
              <Text style={styles.modalBannerTitle}>Projekt</Text>
            </View>
            <View style={styles.projektModalBody}>
              <Text style={styles.placeholderText}>Projekthantering kommer att kopplas hit.</Text>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalFooterBtnSecondary} onPress={() => setProjektModalVisible(false)}>
                <Text style={styles.modalFooterBtnSecondaryText}>Stäng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    fontSize: 15,
    color: '#64748b',
  },
  tabBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_TOPBAR.scrollBg || 'rgba(255,255,255,0.72)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    minHeight: 52,
    paddingVertical: PRIMARY_TOPBAR.paddingVertical,
    paddingHorizontal: PRIMARY_TOPBAR.paddingHorizontal,
  },
  tabBarWrapSticky: {
    ...(Platform.OS === 'web'
      ? {
          position: 'sticky',
          top: 0,
          zIndex: PRIMARY_TOPBAR.stickyZIndex,
          boxShadow: PRIMARY_TOPBAR.scrollShadow,
          backdropFilter: `blur(${PRIMARY_TOPBAR.scrollBlur}px)`,
          WebkitBackdropFilter: `blur(${PRIMARY_TOPBAR.scrollBlur}px)`,
        }
      : {}),
  },
  planeringPresenceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.08)',
  },
  planeringPresenceLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  planeringPresenceAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planeringPresenceInitial: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  tabBarScroll: { flex: 1, maxHeight: 52, minWidth: 0 },
  tabBarContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: PRIMARY_TOPBAR.itemGap,
    paddingRight: 8,
  },
  tabItem: {
    position: 'relative',
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 36,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  tabItemHover: {},
  tabItemText: {
    fontSize: PRIMARY_TOPBAR.fontSize,
    fontWeight: PRIMARY_TOPBAR.fontWeight,
    color: PRIMARY_TOPBAR.textInactive,
    maxWidth: 160,
    ...(Platform.OS === 'web' ? { letterSpacing: PRIMARY_TOPBAR.letterSpacing } : {}),
  },
  tabItemTextActive: { color: PRIMARY_TOPBAR.textActive },
  tabItemUnderline: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    height: PRIMARY_TOPBAR.underlineHeight,
    backgroundColor: PRIMARY_TOPBAR.underlineColor,
    borderRadius: PRIMARY_TOPBAR.underlineBorderRadius,
  },
  tabBarActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.08)',
  },
  tabBarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  tabBarActionBtnPressed: { opacity: 0.8 },
  tabBarActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  leftPanel: {
    width: LEFT_PANEL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    flexShrink: 0,
  },
  leftPanelTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  leftPanelTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  leftPanelTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  leftPanelTabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  leftPanelTabLabelActive: {
    color: '#1e40af',
    fontWeight: '600',
  },
  leftPanelTabsRow: {
    minHeight: HEADER_WEEK_ROW_HEIGHT + HEADER_DAYS_ROW_HEIGHT,
  },
  leftPanelTabsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  leftPanelProjectScroll: {
    flex: 1,
    minHeight: 120,
  },
  leftPanelProjectScrollContent: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  leftPanelProjectEmpty: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  leftPanelProjectRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  leftPanelProjectRowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
  },
  leftPanelProjectRowSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  leftPanelContent: {
    flex: 1,
    minHeight: 0,
  },
  leftPanelContentInner: {
    padding: 14,
    paddingBottom: 24,
  },
  leftPanelSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  leftPanelPlaceholder: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 8,
  },
  leftPanelHint: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  listBlock: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  listRow: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listRowName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  listRowNameDragging: {
    color: '#0f172a',
  },
  listRowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  listRowMetaDragging: {
    color: '#475569',
  },
  ganttCornerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  ganttCornerAvatarText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  ganttCornerAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    marginRight: 8,
    flexShrink: 0,
  },
  ganttCornerNameAndRole: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  listRowRolePill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    maxWidth: 100,
  },
  listRowRolePillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: 320,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 20px rgba(0,0,0,0.15)' } : { elevation: 8 }),
  },
  /* Lägg till kund – box utan padding så bannern når kanten (som StandardModal) */
  addCustomerModalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    width: 360,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.22)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)' } : { elevation: 16 }),
  },
  /* Next-inspirerad: minimal banner, små knappar */
  addCustomerModalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: MODAL_THEME.banner.backgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: MODAL_THEME.banner.borderBottomColor,
  },
  addCustomerModalBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  addCustomerModalBannerIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: MODAL_THEME.banner.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomerModalBannerTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: MODAL_THEME.banner.titleColor,
  },
  addCustomerModalBannerClose: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: MODAL_THEME.banner.iconBg,
  },
  addCustomerModalBody: {
    padding: 16,
  },
  addCustomerModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: MODAL_THEME.footer.borderTopColor,
    backgroundColor: MODAL_THEME.footer.backgroundColor,
  },
  addCustomerModalFooterBtnSecondary: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  addCustomerModalFooterBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#b91c1c',
  },
  addCustomerModalFooterBtnPrimary: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: MODAL_THEME.banner.backgroundColor,
    backgroundColor: MODAL_THEME.banner.backgroundColor,
  },
  addCustomerModalFooterBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: MODAL_THEME.footer.btnTextColor,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#0f172a',
  },
  modalCloseBtn: {
    padding: 4,
    margin: -4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  modalHint: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  modalSelectWrap: {
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    marginBottom: 4,
  },
  modalSelectScroll: {
    maxHeight: 118,
  },
  modalSelectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalSelectOptionActive: {
    backgroundColor: '#eff6ff',
  },
  modalSelectOptionText: {
    fontSize: 14,
    color: '#334155',
  },
  modalSelectOptionTextActive: {
    fontWeight: '600',
    color: '#2563eb',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalBtnPrimary: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  modalBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  modalBtnSecondary: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  modalBtnAvbryt: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnAvbrytText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnDark: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnDarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  personContextMenu: {
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, shadowOpacity: 0.15 }),
  },
  personContextMenuCenter: {
    alignSelf: 'center',
    marginTop: '40%',
  },
  personContextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  personContextMenuItemDanger: {},
  personContextMenuText: {
    fontSize: 14,
    color: '#334155',
  },
  personContextMenuTextDanger: {
    color: '#dc2626',
  },
  ganttPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#fff',
  },
  ganttToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  ganttToolbarBtn: {
    padding: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttToolbarBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  ganttToolbarLabel: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
  },
  ganttToolbarSpacer: {
    flex: 1,
    minWidth: 16,
  },
  ganttToolbarFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttToolbarFilterText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  ganttToolbarSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    maxWidth: 280,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  ganttToolbarSearchIcon: {
    marginRight: 8,
  },
  ganttToolbarSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  ganttToolbarViewToggles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ganttToolbarViewBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttToolbarViewBtnActive: {
    backgroundColor: '#2563eb',
  },
  ganttToolbarViewBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  ganttToolbarViewBtnTextActive: {
    color: '#fff',
  },
  ganttToolbarToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttToolbarToggleActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  ganttToolbarToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  ganttToolbarToggleTextActive: {
    color: '#fff',
  },
  ganttToolbarSettingsWrap: {
    position: 'relative',
  },
  ganttToolbarSettingsBtn: {
    padding: 8,
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  settingsDropdown: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: 52,
    paddingRight: 16,
  },
  settingsDropdownBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 220,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' } : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 }),
  },
  settingsDropdownTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 4,
  },
  settingsDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  settingsDropdownLabel: {
    fontSize: 14,
    color: '#334155',
  },
  ganttToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.08)',
  },
  ganttToolbarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttToolbarActionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  ganttVerticalScroll: {
    flex: 1,
    minHeight: 0,
  },
  ganttVerticalScrollContent: {
    flexGrow: 1,
  },
  ganttRowWrap: {
    flexDirection: 'row',
    flex: 1,
    minHeight: 0,
  },
  ganttFixedLeft: {
    width: LEFT_PANEL_WIDTH,
    minWidth: LEFT_PANEL_WIDTH,
    borderRightWidth: 2,
    borderRightColor: WEEK_DIVIDER_COLOR,
    backgroundColor: '#fff',
  },
  ganttScroll: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  ganttScrollContent: {
    paddingBottom: 24,
  },
  ganttScrollInner: {
    flexDirection: 'column',
    flexGrow: 1,
  },
  ganttGrid: {
    minWidth: '100%',
    position: 'relative',
  },
  ganttTodayLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#dc2626',
    zIndex: 5,
  },
  ganttBodyWrap: {
    position: 'relative',
  },
  serviceOverlay: {
    position: 'absolute',
    top: 0,
    pointerEvents: 'box-none',
  },
  serviceBlock: {
    position: 'absolute',
    borderRadius: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    minWidth: 24,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : {}),
  },
  serviceBlockText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  ganttRow: {
    flexDirection: 'row',
    minHeight: ROW_HEIGHT,
  },
  ganttBodyRow: {
    height: ROW_HEIGHT,
  },
  ganttRowResource: {
    ...(Platform.OS === 'web'
      ? { transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease' }
      : {}),
  },
  ganttRowResourceHover: {
    backgroundColor: '#f8fafc',
  },
  ganttRowSpacer: {
    /* Tom rad under drag – behåller layout, tar emot elementFromPoint */
  },
  ganttRowGroupHeader: {
    backgroundColor: '#f1f5f9',
  },
  ganttCornerLastRowBottom: {
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
  },
  ganttRowSpacerBg: {
    backgroundColor: '#fafafa',
  },
  ganttCornerNoBorder: {
    borderBottomWidth: 0,
  },
  ganttRowDivider: {
    backgroundColor: '#fafafa',
    /* Samma som spacer så raden ovanför Kunder är vit; tjock linje ritas av cellerna (ganttCellDividerBottom) */
  },
  ganttRowKunderHeader: {
    backgroundColor: '#f1f5f9',
  },
  ganttRowKunderTableHeader: {
    backgroundColor: '#e2e8f0',
  },
  ganttRowCustomerDivider: {
    backgroundColor: '#fafafa',
  },
  ganttCornerKunderTableHeader: {
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  ganttKunderTableHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  ganttCornerProjectCells: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  ganttCornerProjectCode: {
    width: 56,
    minWidth: 56,
    marginRight: 8,
  },
  ganttCornerProjectName: {
    flex: 1,
    minWidth: 0,
  },
  ganttCornerProjectCellText: {
    fontSize: 13,
    color: '#334155',
  },
  ganttCornerCustomerDivider: {
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
    justifyContent: 'center',
  },
  ganttCornerDivider: {
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
    justifyContent: 'center',
  },
  /* Divider-rad med Kunder + knappar (ingen extra rad mellan divider och kundkolumner) */
  ganttCornerDividerKunder: {
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
  },
  ganttCornerKunderHeader: {
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  ganttCornerKunderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  customerColumnsLeftSpacer: {
    width: '100%',
    backgroundColor: '#fafafa',
    borderTopWidth: 1,
    borderTopColor: DAY_DIVIDER_COLOR,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  kunderCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  kunderCompactLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  /* Stående kundkolumner: en kolumn per kund (till höger om dividern) */
  customerColumnsWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: DAY_DIVIDER_COLOR,
    backgroundColor: '#fafafa',
  },
  customerColumn: {
    width: DAY_WIDTH + CUSTOMER_COLUMN_NAME_MIN,
    minWidth: DAY_WIDTH + CUSTOMER_COLUMN_NAME_MIN,
    borderRightWidth: 2,
    borderRightColor: WEEK_DIVIDER_COLOR,
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
  },
  customerColumnHeader: {
    height: ROW_HEIGHT,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  customerColumnHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  customerColumnHeaderHover: {
    backgroundColor: '#cbd5e1',
    ...(Platform.OS === 'web' ? { cursor: 'context-menu' } : {}),
  },
  customerColumnProjectRow: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    minHeight: ROW_HEIGHT,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  customerColumnCellCode: {
    width: DAY_WIDTH,
    minWidth: DAY_WIDTH,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: DAY_DIVIDER_COLOR,
    backgroundColor: WEEKDAY_BG,
  },
  customerColumnCellName: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
    backgroundColor: WEEKDAY_BG,
  },
  customerColumnNamePressable: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  customerColumnCellText: {
    fontSize: 12,
    color: '#334155',
  },
  customerColumnNextCodeText: {
    color: '#94a3b8',
  },
  customerColumnNameInput: {
    fontSize: 12,
    color: '#334155',
    padding: 4,
    minHeight: 0,
  },
  customerColumnProjectRowHover: {
    backgroundColor: '#f1f5f9',
  },
  ganttKunderHeaderLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  ganttCornerAddBtnTextSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  ganttCellLastRowBottom: {
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
  },
  ganttCellNoBorder: {
    borderBottomWidth: 0,
  },
  /* Inga tunna rutnätslinjer i spacer/divider-raderna – bara tjock divider under divider-raden */
  ganttCellNoGrid: {
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  ganttCellDividerBottom: {
    borderBottomWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
  },
  ganttCornerGroupHeader: {
    backgroundColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttGroupHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    flex: 1,
  },
  resourcePlaceholder: {
    height: ROW_HEIGHT,
    minHeight: ROW_HEIGHT,
    alignSelf: 'stretch',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: 'rgba(0,0,0,0.02)',
    ...(Platform.OS === 'web' ? { width: '100%', boxSizing: 'border-box' } : {}),
  },
  dragGhostCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: LEFT_PANEL_WIDTH - 24,
    maxWidth: LEFT_PANEL_WIDTH - 24,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 24px rgba(0,0,0,0.15)' }
      : {}),
  },
  dragGhostName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  dragGhostRole: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  ganttHeaderRow: {
    backgroundColor: '#f1f5f9',
  },
  ganttHeaderMonthRow: {
    height: HEADER_MONTH_ROW_HEIGHT,
    minHeight: HEADER_MONTH_ROW_HEIGHT,
    backgroundColor: '#e2e8f0',
  },
  ganttCornerMonth: {
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  ganttMonthLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  ganttMonthCell: {
    height: HEADER_MONTH_ROW_HEIGHT,
    minHeight: HEADER_MONTH_ROW_HEIGHT,
    borderRightWidth: 2,
    borderBottomWidth: 1,
    borderRightColor: WEEK_DIVIDER_COLOR,
    borderBottomColor: WEEK_DIVIDER_COLOR,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ganttMonthCellText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  ganttCorner: {
    width: LEFT_PANEL_WIDTH,
    minWidth: LEFT_PANEL_WIDTH,
    borderRightWidth: 2,
    borderRightColor: WEEK_DIVIDER_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  ganttCornerBody: {
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  ganttCornerHover: {
    backgroundColor: '#f1f5f9',
  },
  ganttCornerDraggable: {
    ...(Platform.OS === 'web' ? { cursor: 'grab' } : {}),
  },
  ganttCornerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  ganttCornerNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  ganttRowDropTarget: {
    borderTopWidth: 2,
    borderTopColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  ganttCornerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ganttCornerHeaderCompact: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: DAY_DIVIDER_COLOR,
  },
  ganttCornerPersonalHeader: {
    flexDirection: 'column',
    gap: 8,
  },
  ganttCornerPersonalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  ganttCornerTabs: {
    flexDirection: 'row',
    gap: 4,
  },
  ganttCornerTab: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttCornerTabActive: {
    backgroundColor: '#2563eb',
  },
  ganttCornerTabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  ganttCornerTabLabelActive: {
    color: '#fff',
  },
  ganttCornerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttCornerAddBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  ganttCornerAddBtnRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  ganttCornerAddBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  ganttHeaderCell: {
    backgroundColor: '#f1f5f9',
  },
  ganttWeekCol: {
    flexDirection: 'column',
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  ganttWeekColFirst: {
    borderLeftWidth: 0,
  },
  ganttWeekNum: {
    height: HEADER_WEEK_ROW_HEIGHT,
    minHeight: HEADER_WEEK_ROW_HEIGHT,
    borderBottomWidth: 1,
    borderRightWidth: 2,
    borderBottomColor: WEEK_DIVIDER_COLOR,
    borderRightColor: WEEK_DIVIDER_COLOR,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
  },
  ganttWeekNumFirst: {
    borderLeftWidth: 0,
  },
  ganttWeekNumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  ganttDaysRow: {
    flexDirection: 'row',
    height: HEADER_DAYS_ROW_HEIGHT,
    minHeight: HEADER_DAYS_ROW_HEIGHT,
  },
  ganttDayCell: {
    width: DAY_WIDTH,
    minWidth: DAY_WIDTH,
    height: HEADER_DAYS_ROW_HEIGHT,
    minHeight: HEADER_DAYS_ROW_HEIGHT,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: DAY_DIVIDER_COLOR,
    backgroundColor: WEEKDAY_BG,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ganttDayCellLastInWeek: {
    borderRightWidth: 2,
    borderRightColor: WEEK_DIVIDER_COLOR,
  },
  ganttDayWeekend: {
    backgroundColor: WEEKEND_BG,
  },
  ganttDayHoliday: {
    backgroundColor: '#fef2f2',
  },
  ganttDayLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  ganttDayNum: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  ganttCell: {
    width: DAY_WIDTH,
    minWidth: DAY_WIDTH,
    height: ROW_HEIGHT,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: DAY_DIVIDER_COLOR,
    backgroundColor: WEEKDAY_BG,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ganttCellLastInWeek: {
    borderRightWidth: 2,
    borderRightColor: WEEK_DIVIDER_COLOR,
  },
  ganttCellToday: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  ganttCellHoliday: {
    backgroundColor: '#fef2f2',
  },
  ganttCellHover: {
    backgroundColor: '#f1f5f9',
  },
  ganttCellSelection: {
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
  },
  ganttCellAllocation: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
  },
  cellBadgesWrap: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    maxWidth: DAY_WIDTH - 4,
  },
  provanEventBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#e0e7ff',
    maxWidth: DAY_WIDTH - 4,
  },
  provanEventBadgeStart: {
    backgroundColor: '#dbeafe',
  },
  provanEventBadgeFast: {
    backgroundColor: '#d1fae5',
  },
  absenceEventBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fef3c7',
    maxWidth: DAY_WIDTH - 4,
  },
  provanEventBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#334155',
  },
  ganttRowLabelPlaceholder: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});
