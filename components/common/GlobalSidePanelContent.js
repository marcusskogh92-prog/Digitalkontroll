/**
 * SidePanel-innehåll för Register, Administration, SharePoint.
 * Återanvänder samma navigation/modaler som tidigare banner-dropdowns.
 * Använder SidebarItem, 8/12 padding, aktiv route-markering.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEFT_NAV } from '../../constants/leftNavTheme';
import {
  CONTEXT_PANEL_BORDER_COLOR,
  CONTEXT_PANEL_GAP,
  CONTEXT_PANEL_HEADER_HEIGHT,
  CONTEXT_PANEL_ITEM_HOVER_BG,
  CONTEXT_PANEL_ITEM_RADIUS,
  CONTEXT_PANEL_PADDING,
  CONTEXT_PANEL_ROW_MIN_HEIGHT,
} from './layoutConstants';
import { AnimatedChevron } from './leftNavMicroAnimations';
import SidebarItem from './SidebarItem';

const GRID = 8;
const SECTION_HEADER_PADDING_VERTICAL = 12;
const SECTION_HEADER_PADDING_HORIZONTAL = LEFT_NAV.rowPaddingHorizontal;

/** Företag som alltid ska ligga överst i Superadmin och markeras som superadmin-företag. */
const SUPERADMIN_COMPANY_IDS = ['MS Byggsystem', 'ms-byggsystem'];
function isSuperadminCompany(id) {
  const s = String(id || '').trim();
  return SUPERADMIN_COMPANY_IDS.some((x) => s === x || s.toLowerCase() === x.toLowerCase());
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  sectionHeader: {
    minHeight: CONTEXT_PANEL_HEADER_HEIGHT,
    paddingVertical: 0,
    paddingHorizontal: CONTEXT_PANEL_PADDING,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: CONTEXT_PANEL_BORDER_COLOR,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
  },
  groupHeader: {
    paddingVertical: 8,
    paddingHorizontal: CONTEXT_PANEL_PADDING,
    paddingTop: 14,
    marginTop: 4,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
  },
  list: {
    paddingVertical: GRID,
    paddingHorizontal: CONTEXT_PANEL_PADDING,
  },
  itemWrapper: {
    marginBottom: CONTEXT_PANEL_GAP,
  },
});

/** Rubrik för vänsterpanelen – samma stil för alla rail-val. Exporteras för återanvändning i HomeScreen. */
export function LeftPanelRailHeader({ title, icon }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? (
          <Ionicons name={icon} size={20} color={LEFT_NAV.textDefault} style={{ marginTop: 1 }} accessibilityLabel={`${title} ikon`} />
        ) : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    </View>
  );
}

/** Register – Relationer: Kontakter, Leverantörer, Kunder */
const REGISTER_RELATIONER_ITEMS = [
  { key: 'kontakter', label: 'Kontakter', route: 'ContactRegistry', icon: 'people-outline' },
  { key: 'leverantorer', label: 'Leverantörer', route: 'Suppliers', icon: 'briefcase-outline' },
  { key: 'kunder', label: 'Kunder', route: 'Customers', icon: 'people-circle-outline' },
];

/** Register – Struktur: Byggdelar, Konto, Kategorier, Mallar */
const REGISTER_STRUKTUR_ITEMS = [
  { key: 'byggdelar', label: 'Byggdelar', route: 'ManageCompany', focus: 'byggdel', icon: 'cube-outline' },
  { key: 'konton', label: 'Konto', route: 'ManageCompany', focus: 'kontoplan', icon: 'wallet-outline' },
  { key: 'kategorier', label: 'Kategorier', route: 'ManageCompany', focus: 'kategorier', icon: 'pricetag-outline' },
  { key: 'mallar', label: 'Mallar', openModal: 'openMallarModal', icon: 'document-text-outline' },
];

/** Register-panel med grupper: Relationer (Kontakter, Leverantörer, Kunder) och Struktur (Byggdelar, Konto, Kategorier). */
function RegisterSection({ activeRouteName, activeItemKey, onPress }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (activeItemKey) return;
    setHoveredKey(null);
  }, [activeItemKey]);

  const renderItems = (items) =>
    items.map((item) => {
      const routeMatch = item.route && activeRouteName === item.route && !item.focus;
      const focusMatch = item.focus && activeRouteName === 'ManageCompany';
      const active = activeItemKey === item.key || routeMatch || (item.route === 'ManageCompany' && focusMatch);
      const isHovered = Platform.OS === 'web' && hoveredKey === item.key;
      const getIconColor = (state) => (state.active ? ICON_COLOR_ACTIVE : state.hovered ? ICON_COLOR_HOVER : ICON_COLOR_DEFAULT);
      const iconName = item.icon || 'ellipse-outline';

      return (
        <View key={item.key} style={styles.itemWrapper}>
          <SidebarItem
            label={item.label}
            active={active}
            hovered={isHovered}
            onPress={() => onPress?.(item)}
            onHoverIn={Platform.OS === 'web' ? () => setHoveredKey(item.key) : undefined}
            onHoverOut={Platform.OS === 'web' ? () => setHoveredKey(null) : undefined}
            indentMode="padding"
            indent={LEFT_NAV.indentPerLevel}
            fullWidth
            hoverBg={CONTEXT_PANEL_ITEM_HOVER_BG}
            itemBorderRadius={CONTEXT_PANEL_ITEM_RADIUS}
            itemMinHeight={CONTEXT_PANEL_ROW_MIN_HEIGHT}
            itemMarginBottom={0}
            left={(state) => (
              <Ionicons name={iconName} size={ICON_SIZE} color={getIconColor(state)} style={{ marginRight: 8 }} />
            )}
            style={{
              paddingVertical: LEFT_NAV.rowPaddingVertical,
              paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
            }}
            labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
          />
        </View>
      );
    });

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="grid-outline" size={20} color={LEFT_NAV.textDefault} style={{ marginTop: 1 }} accessibilityLabel="Register ikon" />
          <Text style={styles.sectionTitle}>Register</Text>
        </View>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: GRID * 2 }} keyboardShouldPersistTaps="handled">
        <View style={styles.groupHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="people-outline" size={16} color="#64748b" />
            <Text style={styles.groupTitle}>Relationer</Text>
          </View>
        </View>
        {renderItems(REGISTER_RELATIONER_ITEMS)}
        <View style={styles.groupHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="construct-outline" size={16} color="#64748b" />
            <Text style={styles.groupTitle}>Struktur</Text>
          </View>
        </View>
        {renderItems(REGISTER_STRUKTUR_ITEMS)}
      </ScrollView>
    </View>
  );
}

/** Administration: Användare, Roller, Företagsinställningar, SharePoint-kopplingar, Planering */
const ADMIN_ITEMS = [
  { key: 'anvandare', label: 'Användare', route: 'ManageUsers', icon: 'people-outline' },
  { key: 'roller', label: 'Roller', route: 'ManageControlTypes', icon: 'key-outline' },
  { key: 'foretagsinstallningar', label: 'Företagsinställningar', route: 'ManageCompany', icon: 'business-outline' },
  { key: 'integrationer', label: 'SharePoint-kopplingar', route: 'ManageCompany', focus: 'sharepoint', icon: 'cloud-outline' },
  { key: 'planering', label: 'Planering', route: 'Planering', icon: 'calendar-outline' },
];

/** SharePoint: Siter, Projekt, Trädstruktur */
const SHAREPOINT_ITEMS = [
  { key: 'siter', label: 'Siter', route: 'ManageSharePointNavigation', icon: 'server-outline' },
  { key: 'projekt', label: 'Projekt', route: 'ManageSharePointNavigation', params: { tab: 'projekt' }, icon: 'folder-outline' },
  { key: 'tradstruktur', label: 'Trädstruktur', route: 'ManageSharePointNavigation', params: { tab: 'trad' }, icon: 'git-network-outline' },
];

const ICON_SIZE = 18;
const ICON_COLOR_DEFAULT = LEFT_NAV.iconDefault;
const ICON_COLOR_ACTIVE = LEFT_NAV.accent;
const ICON_COLOR_HOVER = LEFT_NAV.hoverIcon;
const COMPANY_ICON_ACTIVE = '#22c55e';
const COMPANY_ICON_PAUSED = '#dc2626';

function SectionList({ title, headerIcon = null, items, activeRouteName, activeItemKey, onPress }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  // When a modal closes, HomeScreen clears activeItemKey.
  // Also clear any cached hover so a row doesn't look selected/hovered after close.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (activeItemKey) return;
    setHoveredKey(null);
  }, [activeItemKey]);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {headerIcon ? (
            <Ionicons
              name={headerIcon}
              size={20}
              color={LEFT_NAV.textDefault}
              style={{ marginTop: 1 }}
              accessibilityLabel={`${title} ikon`}
            />
          ) : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: GRID * 2 }} keyboardShouldPersistTaps="handled">
        {items.map((item) => {
          const routeMatch = item.route && activeRouteName === item.route && !item.focus;
          const focusMatch = item.focus && activeRouteName === 'ManageCompany';
          const active = activeItemKey === item.key || routeMatch || (item.route === 'ManageCompany' && focusMatch);
          const isHovered = Platform.OS === 'web' && hoveredKey === item.key;
          const hasIcon = item.icon != null;
          const hasBold = item.labelWeight != null;
          const getIconColor = (state) => (state.active ? ICON_COLOR_ACTIVE : state.hovered ? ICON_COLOR_HOVER : ICON_COLOR_DEFAULT);

          return (
            <View key={item.key} style={styles.itemWrapper}>
              <SidebarItem
                label={item.label}
                active={active}
                hovered={isHovered}
                onPress={() => onPress(item)}
                onHoverIn={Platform.OS === 'web' ? () => setHoveredKey(item.key) : undefined}
                onHoverOut={Platform.OS === 'web' ? () => setHoveredKey(null) : undefined}
                indentMode="padding"
                fullWidth
                labelWeight={hasBold ? item.labelWeight : undefined}
                hoverBg={CONTEXT_PANEL_ITEM_HOVER_BG}
                itemBorderRadius={CONTEXT_PANEL_ITEM_RADIUS}
                itemMinHeight={CONTEXT_PANEL_ROW_MIN_HEIGHT}
                itemMarginBottom={0}
                left={hasIcon ? (state) => (
                  <Ionicons name={item.icon} size={ICON_SIZE} color={getIconColor(state)} style={{ marginRight: 8 }} />
                ) : undefined}
                style={{
                  paddingVertical: LEFT_NAV.rowPaddingVertical,
                  paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
                }}
                labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Ikoner och fet text för Superadmin-rader (som SharePoint-siterna). */
const SUPERADMIN_ITEMS = [
  { key: 'sharepoint-nav', label: 'SharePoint Nav', route: 'ManageSharePointNavigation', icon: 'cloud-outline', labelWeight: '600' },
  { key: 'foretag', label: 'Företag', route: 'ManageCompany', icon: 'business-outline', labelWeight: '600' },
  { key: 'anvandare', label: 'Användare', route: 'ManageUsers', icon: 'person-outline', labelWeight: '600' },
  { key: 'mallar', label: 'Mallar', route: 'ManageControlTypes', icon: 'document-text-outline', labelWeight: '600' },
];

/** Färg på företagsikon: grön = aktiv, röd = pausad, grå = dolt. */
function getCompanyIconColor(company) {
  if (!company?.profile) return LEFT_NAV.iconDefault;
  if (company.profile.deleted) return LEFT_NAV.textMuted;
  if (company.profile.enabled === false) return COMPANY_ICON_PAUSED;
  return COMPANY_ICON_ACTIVE;
}

/** Rad för ett företag under Företag (indragen, normal vikt, högerklick + klick → popup). */
function CompanyRow({ company, onPress, onContextMenu, onHoverIn, onHoverOut, isHovered }) {
  const name = (company?.profile && (company.profile.companyName || company.profile.name)) || company?.id || '';
  const deleted = !!(company?.profile && company.profile.deleted);
  const label = deleted ? `${name} (dolt)` : name;
  const iconColor = getCompanyIconColor(company);
  const displayColor = isHovered ? LEFT_NAV.hoverIcon : iconColor;
  const showSuperadminBadge = isSuperadminCompany(company?.id);
  return (
    <View style={styles.itemWrapper}>
      <SidebarItem
        label={label}
        labelWeight="400"
        active={false}
        hovered={isHovered}
        onPress={() => onPress?.(company)}
        onContextMenu={Platform.OS === 'web' ? (e) => { try { e?.preventDefault?.(); } catch (_) {} onContextMenu?.(e, company); } : undefined}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        indentMode="padding"
        indent={LEFT_NAV.indentPerLevel}
        fullWidth
        hoverBg={CONTEXT_PANEL_ITEM_HOVER_BG}
        itemBorderRadius={CONTEXT_PANEL_ITEM_RADIUS}
        itemMinHeight={CONTEXT_PANEL_ROW_MIN_HEIGHT}
        itemMarginBottom={0}
        left={(state) => (
          <Ionicons
            name="business-outline"
            size={14}
            color={displayColor}
            style={{ marginRight: 8 }}
          />
        )}
        right={showSuperadminBadge ? () => (
          <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(21, 101, 192, 0.12)' }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#1565C0' }}>Superadmin</Text>
          </View>
        ) : undefined}
        style={{
          paddingVertical: LEFT_NAV.rowPaddingVertical,
          paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
        }}
        labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
      />
    </View>
  );
}

/**
 * @param {'register' | 'administration' | 'sharepoint' | 'superadmin'} activeModule
 * @param {string} [activeRouteName] - current route name for highlight
 * @param {string} [activeItemKey] - last selected item key per module for highlight
 * @param {Function} onNavigateRegister - (item) => void
 * @param {Function} onNavigateAdmin - (item) => void
 * @param {Function} onNavigateSharePoint - (item) => void
 * @param {Array} [superadminCompanies] - { id, profile }[] för expanderbar Företag
 * @param {boolean} [superadminForetagExpanded] - om Företag är expanderad
 * @param {Function} [onSuperadminForetagToggle] - () => void
 * @param {Function} [onSuperadminCompanyClick] - (company) => void → öppna popup
 * @param {Function} [onSuperadminCompanyContextMenu] - (e, company) => void
 * @param {Function} [onSuperadminAddCompany] - () => void → skapa nytt företag (navigera till ManageCompany createNew)
 */
export function GlobalSidePanelContent({
  activeModule,
  activeRouteName,
  activeItemKey,
  onNavigateRegister,
  onNavigateAdmin,
  onNavigateSharePoint,
  superadminCompanies = [],
  superadminForetagExpanded = false,
  onSuperadminForetagToggle,
  onSuperadminCompanyClick,
  onSuperadminCompanyContextMenu,
  onSuperadminAddCompany,
}) {
  if (activeModule === 'register') {
    return (
      <RegisterSection
        activeRouteName={activeRouteName}
        activeItemKey={activeItemKey}
        onPress={(item) => onNavigateRegister?.(item)}
      />
    );
  }
  if (activeModule === 'administration') {
    return (
      <SectionList
        title="Administration"
        headerIcon="business-outline"
        items={ADMIN_ITEMS}
        activeRouteName={activeRouteName}
        activeItemKey={activeItemKey}
        onPress={(item) => onNavigateAdmin?.(item)}
      />
    );
  }
  if (activeModule === 'superadmin') {
    return (
      <SuperadminSection
        activeRouteName={activeRouteName}
        activeItemKey={activeItemKey}
        onNavigateAdmin={onNavigateAdmin}
        superadminCompanies={superadminCompanies}
        superadminForetagExpanded={superadminForetagExpanded}
        onSuperadminForetagToggle={onSuperadminForetagToggle}
        onSuperadminCompanyClick={onSuperadminCompanyClick}
        onSuperadminCompanyContextMenu={onSuperadminCompanyContextMenu}
        onSuperadminAddCompany={onSuperadminAddCompany}
      />
    );
  }
  if (activeModule === 'sharepoint') {
    return (
      <SectionList
        title="SharePoint"
        headerIcon="cloud-outline"
        items={SHAREPOINT_ITEMS}
        activeRouteName={activeRouteName}
        activeItemKey={activeItemKey}
        onPress={(item) => onNavigateSharePoint?.(item)}
      />
    );
  }
  return null;
}

function SuperadminSection({
  activeRouteName,
  activeItemKey,
  onNavigateAdmin,
  superadminCompanies,
  superadminForetagExpanded,
  onSuperadminForetagToggle,
  onSuperadminCompanyClick,
  onSuperadminCompanyContextMenu,
  onSuperadminAddCompany,
}) {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredCompanyId, setHoveredCompanyId] = useState(null);
  const [hoveredAddCompany, setHoveredAddCompany] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={LEFT_NAV.textDefault} style={{ marginTop: 1 }} accessibilityLabel="Superadmin ikon" />
          <Text style={styles.sectionTitle}>Superadmin</Text>
        </View>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: GRID * 2 }} keyboardShouldPersistTaps="handled">
        {SUPERADMIN_ITEMS.map((item) => {
          if (item.key === 'foretag') {
            const isHovered = Platform.OS === 'web' && hoveredKey === item.key;
            const getIconColor = (state) => (state.active ? ICON_COLOR_ACTIVE : state.hovered ? ICON_COLOR_HOVER : ICON_COLOR_DEFAULT);
            return (
              <View key={item.key} style={styles.itemWrapper}>
                <SidebarItem
                  label={item.label}
                  labelWeight="600"
                  active={false}
                  hovered={isHovered}
                  onPress={() => onSuperadminForetagToggle?.()}
                  onHoverIn={Platform.OS === 'web' ? () => setHoveredKey(item.key) : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHoveredKey(null) : undefined}
                  indentMode="padding"
                  fullWidth
                  hoverBg={CONTEXT_PANEL_ITEM_HOVER_BG}
                  itemBorderRadius={CONTEXT_PANEL_ITEM_RADIUS}
                  itemMinHeight={CONTEXT_PANEL_ROW_MIN_HEIGHT}
                  itemMarginBottom={0}
                  left={(state) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                      <AnimatedChevron
                        expanded={superadminForetagExpanded}
                        size={12}
                        color={getIconColor(state)}
                        rotationDeg={90}
                      />
                      <Ionicons name={item.icon} size={ICON_SIZE} color={getIconColor(state)} style={{ marginLeft: 4 }} />
                    </View>
                  )}
                  style={{
                    paddingVertical: LEFT_NAV.rowPaddingVertical,
                    paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
                  }}
                  labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
                />
                {superadminForetagExpanded ? (
                  <View style={{ marginLeft: LEFT_NAV.indentPerLevel, marginTop: 2 }}>
                    {onSuperadminAddCompany ? (
                      <View style={styles.itemWrapper}>
                        <SidebarItem
                          label="Nytt företag"
                          labelWeight="400"
                          active={false}
                          hovered={Platform.OS === 'web' && hoveredAddCompany}
                          onPress={() => onSuperadminAddCompany()}
                          onHoverIn={Platform.OS === 'web' ? () => setHoveredAddCompany(true) : undefined}
                          onHoverOut={Platform.OS === 'web' ? () => setHoveredAddCompany(false) : undefined}
                          indentMode="padding"
                          indent={LEFT_NAV.indentPerLevel}
                          fullWidth
                          hoverBg={CONTEXT_PANEL_ITEM_HOVER_BG}
                          itemBorderRadius={CONTEXT_PANEL_ITEM_RADIUS}
                          itemMinHeight={CONTEXT_PANEL_ROW_MIN_HEIGHT}
                          itemMarginBottom={0}
                          left={(state) => (
                            <View style={{ marginRight: 8, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="business-outline" size={18} color={state.hovered ? ICON_COLOR_HOVER : ICON_COLOR_DEFAULT} />
                              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="add" size={10} color="#fff" />
                              </View>
                            </View>
                          )}
                          right={() => (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#2563eb' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 }}>NYTT</Text>
                            </View>
                          )}
                          style={{
                            paddingVertical: LEFT_NAV.rowPaddingVertical,
                            paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
                          }}
                          labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
                        />
                      </View>
                    ) : null}
                    {Array.isArray(superadminCompanies) && superadminCompanies.length > 0
                      ? [...superadminCompanies]
                          .sort((a, b) => {
                            const aFirst = isSuperadminCompany(a?.id);
                            const bFirst = isSuperadminCompany(b?.id);
                            if (aFirst && !bFirst) return -1;
                            if (!aFirst && bFirst) return 1;
                            const aName = String((a?.profile && (a.profile.companyName || a.profile.name)) || a?.id || '').trim();
                            const bName = String((b?.profile && (b.profile.companyName || b.profile.name)) || b?.id || '').trim();
                            return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
                          })
                          .map((company) => (
                          <CompanyRow
                            key={company?.id || ''}
                            company={company}
                            onPress={onSuperadminCompanyClick}
                            onContextMenu={onSuperadminCompanyContextMenu}
                            onHoverIn={Platform.OS === 'web' ? () => setHoveredCompanyId(company?.id || '') : undefined}
                            onHoverOut={Platform.OS === 'web' ? () => setHoveredCompanyId(null) : undefined}
                            isHovered={Platform.OS === 'web' && hoveredCompanyId === (company?.id || '')}
                          />
                        ))
                      : null}
                  </View>
                ) : null}
              </View>
            );
          }
          const routeMatch = item.route && activeRouteName === item.route && !item.focus;
          const active = activeItemKey === item.key || routeMatch;
          const isHovered = Platform.OS === 'web' && hoveredKey === item.key;
          const getIconColor = (state) => (state.active ? ICON_COLOR_ACTIVE : state.hovered ? ICON_COLOR_HOVER : ICON_COLOR_DEFAULT);
          const hasChevron = item.key === 'sharepoint-nav' || item.key === 'foretag';
          return (
            <View key={item.key} style={styles.itemWrapper}>
              <SidebarItem
                label={item.label}
                active={active}
                hovered={isHovered}
                onPress={() => onNavigateAdmin?.(item)}
                onHoverIn={Platform.OS === 'web' ? () => setHoveredKey(item.key) : undefined}
                onHoverOut={Platform.OS === 'web' ? () => setHoveredKey(null) : undefined}
                indentMode="padding"
                fullWidth
                labelWeight={item.labelWeight}
                hoverBg={CONTEXT_PANEL_ITEM_HOVER_BG}
                itemBorderRadius={CONTEXT_PANEL_ITEM_RADIUS}
                itemMinHeight={CONTEXT_PANEL_ROW_MIN_HEIGHT}
                itemMarginBottom={0}
                left={item.icon ? (state) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                    {hasChevron ? (
                      <>
                        <AnimatedChevron
                          expanded={item.key === 'foretag' ? superadminForetagExpanded : false}
                          size={12}
                          color={getIconColor(state)}
                          rotationDeg={90}
                        />
                        <Ionicons name={item.icon} size={ICON_SIZE} color={getIconColor(state)} style={{ marginLeft: 4 }} />
                      </>
                    ) : (
                      <Ionicons name={item.icon} size={ICON_SIZE} color={getIconColor(state)} />
                    )}
                  </View>
                ) : undefined}
                style={{
                  paddingVertical: LEFT_NAV.rowPaddingVertical,
                  paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
                }}
                labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
