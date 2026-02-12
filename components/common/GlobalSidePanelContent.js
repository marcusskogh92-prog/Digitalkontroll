/**
 * SidePanel-innehåll för Register, Administration, SharePoint.
 * Återanvänder samma navigation/modaler som tidigare banner-dropdowns.
 * Använder SidebarItem, 8/12 padding, aktiv route-markering.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEFT_NAV } from '../../constants/leftNavTheme';
import { AnimatedChevron } from './leftNavMicroAnimations';
import SidebarItem from './SidebarItem';

const GRID = 8;
const SECTION_HEADER_PADDING_VERTICAL = 12;
const SECTION_HEADER_PADDING_HORIZONTAL = LEFT_NAV.rowPaddingHorizontal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  sectionHeader: {
    paddingVertical: SECTION_HEADER_PADDING_VERTICAL,
    paddingHorizontal: SECTION_HEADER_PADDING_HORIZONTAL,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
  },
  list: {
    paddingVertical: GRID,
  },
  itemWrapper: {
    marginBottom: 2,
  },
});

/** Rubrik för vänsterpanelen – samma stil för alla rail-val. Exporteras för återanvändning i HomeScreen. */
export function LeftPanelRailHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/** Register: Kontakter, Leverantörer, Kunder, Byggdelar, Konton, Kategorier */
const REGISTER_ITEMS = [
  { key: 'kontakter', label: 'Kontakter', route: 'ContactRegistry' },
  { key: 'leverantorer', label: 'Leverantörer', route: 'Suppliers' },
  { key: 'kunder', label: 'Kunder', route: 'Customers' },
  { key: 'byggdelar', label: 'Byggdelar', route: 'ManageCompany', focus: 'byggdel' },
  { key: 'konton', label: 'Konton', route: 'ManageCompany', focus: 'kontoplan' },
  { key: 'kategorier', label: 'Kategorier', route: 'ManageCompany', focus: 'kategorier' },
];

/** Administration: Användare, Roller, Företagsinställningar, Integrationer */
const ADMIN_ITEMS = [
  { key: 'anvandare', label: 'Användare', route: 'ManageUsers' },
  { key: 'roller', label: 'Roller', route: 'ManageControlTypes' },
  { key: 'foretagsinstallningar', label: 'Företagsinställningar', route: 'ManageCompany' },
  { key: 'integrationer', label: 'Integrationer', route: 'ManageSharePointNavigation' },
];

/** SharePoint: Siter, Projekt, Trädstruktur */
const SHAREPOINT_ITEMS = [
  { key: 'siter', label: 'Siter', route: 'ManageSharePointNavigation' },
  { key: 'projekt', label: 'Projekt', route: 'ManageSharePointNavigation', params: { tab: 'projekt' } },
  { key: 'tradstruktur', label: 'Trädstruktur', route: 'ManageSharePointNavigation', params: { tab: 'trad' } },
];

const ICON_SIZE = 18;
const ICON_COLOR_DEFAULT = LEFT_NAV.iconDefault;
const ICON_COLOR_ACTIVE = LEFT_NAV.accent;
const ICON_COLOR_HOVER = LEFT_NAV.hoverIcon;
const COMPANY_ICON_ACTIVE = '#22c55e';
const COMPANY_ICON_PAUSED = '#dc2626';

function SectionList({ title, items, activeRouteName, activeItemKey, onPress }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
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
                left={hasIcon ? (state) => (
                  <Ionicons name={item.icon} size={ICON_SIZE} color={getIconColor(state)} style={{ marginRight: 2 }} />
                ) : undefined}
                style={{
                  minHeight: LEFT_NAV.rowMinHeight,
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
        left={(state) => (
          <Ionicons
            name="business-outline"
            size={14}
            color={displayColor}
            style={{ marginRight: 4 }}
          />
        )}
        style={{
          minHeight: LEFT_NAV.rowMinHeight,
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
}) {
  if (activeModule === 'register') {
    return (
      <SectionList
        title="Register"
        items={REGISTER_ITEMS}
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
      />
    );
  }
  if (activeModule === 'sharepoint') {
    return (
      <SectionList
        title="SharePoint"
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
}) {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredCompanyId, setHoveredCompanyId] = useState(null);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Superadmin</Text>
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
                  left={(state) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
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
                    minHeight: LEFT_NAV.rowMinHeight,
                    paddingVertical: LEFT_NAV.rowPaddingVertical,
                    paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
                  }}
                  labelStyle={{ fontSize: LEFT_NAV.rowFontSize }}
                />
                {superadminForetagExpanded && Array.isArray(superadminCompanies) && superadminCompanies.length > 0 ? (
                  <View style={{ marginLeft: LEFT_NAV.indentPerLevel, marginTop: 2 }}>
                    {superadminCompanies.map((company) => (
                      <CompanyRow
                        key={company?.id || ''}
                        company={company}
                        onPress={onSuperadminCompanyClick}
                        onContextMenu={onSuperadminCompanyContextMenu}
                        onHoverIn={Platform.OS === 'web' ? () => setHoveredCompanyId(company?.id || '') : undefined}
                        onHoverOut={Platform.OS === 'web' ? () => setHoveredCompanyId(null) : undefined}
                        isHovered={Platform.OS === 'web' && hoveredCompanyId === (company?.id || '')}
                      />
                    ))}
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
                left={item.icon ? (state) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 2 }}>
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
                  minHeight: LEFT_NAV.rowMinHeight,
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
