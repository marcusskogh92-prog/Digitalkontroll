import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { showAlert } from '../../utils/alerts';
import { fetchCompanySharePointSiteMetas } from '../firebase';
import { checkSharePointSiteById } from '../../services/azure/hierarchyService';
import ContextMenu from '../ContextMenu';
import HeaderDisplayName from '../HeaderDisplayName';
import HeaderUserMenu from '../HeaderUserMenu';
import { formatPersonName } from '../formatPersonName';
import { UploadPanelTrigger } from './uploads/UploadPanel';

let createPortal = null;
if (typeof Platform !== 'undefined' && Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch (_e) { createPortal = null; }
}

export function HomeHeader({
  headerHeight,
  setHeaderHeight,
  navigation,
  route,
  auth,
  selectedProject,
  isSuperAdmin,
  allowedTools,
  showHeaderUserMenu,
  canShowSupportToolsInHeader,
  supportMenuOpen,
  setSupportMenuOpen,
  companyId,
  routeCompanyId,
  showAdminButton,
  adminActionRunning,
  localFallbackExists,
  handleMakeDemoAdmin,
  refreshLocalFallbackFlag,
  dumpLocalRemoteControls,
  showLastFsError,
  saveControlToFirestore,
  saveDraftToFirestore,
  searchSpinAnim,
  sharePointStatus,
  userNotifications = [],
  notificationsUnreadCount = 0,
  notificationsError = null,
  formatRelativeTime,
}) {
  const userBtnRef = useRef(null);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const [, setLoggingOut] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [leftHeaderWidth, setLeftHeaderWidth] = useState(0);
  const [rightHeaderWidth, setRightHeaderWidth] = useState(0);
  const [isSuperAdminResolved, setIsSuperAdminResolved] = useState(false);
  const [sharePointDropdownVisible, setSharePointDropdownVisible] = useState(false);
  const [sharePointSitesList, setSharePointSitesList] = useState([]);
  const [sharePointSitesLoading, setSharePointSitesLoading] = useState(false);
  const [sharePointCloudHover, setSharePointCloudHover] = useState(false);
  const [sharePointDropdownPosition, setSharePointDropdownPosition] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const sharePointCloudRef = useRef(null);
  const [notificationDropdownVisible, setNotificationDropdownVisible] = useState(false);
  const [notificationDropdownPosition, setNotificationDropdownPosition] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const notificationBellRef = useRef(null);
  const [notificationBellHover, setNotificationBellHover] = useState(false);

  const email = route?.params?.email || '';
  const firstName = formatPersonName(email);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = auth?.currentUser;
        const rawEmail = String(user?.email || '').toLowerCase();
        const isEmailSuperadmin = rawEmail === 'marcus@msbyggsystem.se'
          || rawEmail === 'marcus.skogh@msbyggsystem.se'
          || rawEmail === 'marcus.skogh@msbyggsystem.com'
          || rawEmail === 'marcus.skogh@msbyggsystem';
        let tokenRes = null;
        try { tokenRes = await user?.getIdTokenResult(false).catch(() => null); } catch (_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const isSuperClaim = !!(claims.superadmin === true || claims.role === 'superadmin');
        if (mounted) setIsSuperAdminResolved(!!(isEmailSuperadmin || isSuperClaim));
      } catch (_e) {
        if (mounted) setIsSuperAdminResolved(false);
      }
    })();
    return () => { mounted = false; };
  }, [auth]);

  const canShowSharePointNav = !!(isSuperAdmin || isSuperAdminResolved);

  const resolveProjectBannerText = () => {
    try {
      const p = selectedProject || null;
      if (!p) return null;

      const number = String(
        p.projectNumber || p.number || p.projectId || p.id || ''
      ).trim();
      const name = String(
        p.projectName || p.name || ''
      ).trim();
      const fullName = String(p.fullName || '').trim();

      const cleanedName = (() => {
        if (!name && fullName) {
          // Try to remove leading number from fullName
          if (number && fullName.startsWith(number)) {
            let rest = fullName.slice(number.length).trim();
            if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) rest = rest.slice(1).trim();
            return rest || fullName;
          }
          return fullName;
        }
        if (number && name.startsWith(number)) {
          let rest = name.slice(number.length).trim();
          if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) rest = rest.slice(1).trim();
          return rest || name;
        }
        return name;
      })();

      const hasAny = !!(number || cleanedName || fullName);
      if (!hasAny) return null;
      return {
        number: number || '',
        name: cleanedName || '',
        fullName: fullName || '',
      };
    } catch (_e) {
      return null;
    }
  };

  const projectBanner = resolveProjectBannerText();

  const bannerSideGutter = (() => {
    const w = Number(windowWidth || 0);
    const max = Platform.OS === 'web' ? 240 : 140;
    const computed = Math.round(w * 0.22);
    return Math.max(72, Math.min(max, computed || 120));
  })();

  const bannerLeftGutter = Math.max(bannerSideGutter, Number(leftHeaderWidth || 0) + 16);
  const bannerRightGutter = Math.max(bannerSideGutter, Number(rightHeaderWidth || 0) + 16);

  const openUserMenu = () => {
    try {
      const node = userBtnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          setUserMenuVisible(true);
        });
        return;
      }
    } catch (_e) {}
    setUserMenuVisible(true);
  };

  return (
    <View
      onLayout={(e) => {
        const h = e?.nativeEvent?.layout?.height;
        if (Platform.OS === 'web' && typeof h === 'number' && h > 0 && Math.abs(h - headerHeight) > 1) {
          setHeaderHeight(h);
        }
      }}
      style={{
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: (() => {
          return 'rgba(25, 118, 210, 0.2)';
        })(),
        borderBottomWidth: 1,
        borderColor: 'rgba(25, 118, 210, 0.3)',
        borderLeftWidth: 4,
        borderLeftColor: '#1976D2',
      }}
    >
      {projectBanner ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: bannerLeftGutter,
            right: bannerRightGutter,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
            opacity: 0.9,
          }}
        >
          <View style={{ maxWidth: 720, width: '100%', alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                fontSize: 13,
                fontWeight: '400',
                color: 'rgba(51, 65, 85, 0.80)',
                textAlign: 'center',
              }}
            >
              {projectBanner.number ? (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: 'rgba(15, 23, 42, 0.78)',
                  }}
                >
                  {projectBanner.number}
                </Text>
              ) : null}
              {projectBanner.number && (projectBanner.name || projectBanner.fullName) ? ' — ' : ''}
              {(projectBanner.name || projectBanner.fullName) ? (
                <Text style={{ fontSize: 13, fontWeight: '400', color: 'rgba(51, 65, 85, 0.80)' }}>
                  {projectBanner.name || projectBanner.fullName}
                </Text>
              ) : null}
            </Text>
          </View>
        </View>
      ) : null}
      <View
        onLayout={(e) => {
          const w = e?.nativeEvent?.layout?.width;
          if (typeof w === 'number' && w > 0 && Math.abs(w - leftHeaderWidth) > 1) {
            setLeftHeaderWidth(w);
          }
        }}
      >
        {Platform.OS !== 'web' ? (() => {
          let displayName = '';
          if (route?.params?.displayName) displayName = route.params.displayName;
          else if (auth?.currentUser) {
            const user = auth.currentUser;
            if (user.displayName && String(user.displayName).trim().includes(' ')) {
              displayName = String(user.displayName).trim();
            } else {
              displayName = formatPersonName(user) || (user.displayName ? String(user.displayName).trim() : '');
            }
          }
          displayName = displayName || firstName || 'Användare';
          const nameSeed = String(displayName || '').trim();
          const hash = Array.from(nameSeed).reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 0);
          const colors = ['#F44336','#E91E63','#9C27B0','#3F51B5','#2196F3','#03A9F4','#009688','#4CAF50','#FF9800','#FFC107'];
          const avatarBg = colors[Math.abs(hash) % colors.length];

          const menuItems = [];
          if (isSuperAdmin) {
            menuItems.push({ key: 'manage_company', label: 'Hantera företag', icon: <Ionicons name="business" size={16} color="#2E7D32" /> });
            menuItems.push({ key: 'manage_users', label: 'Hantera användare', icon: <Ionicons name="person-add" size={16} color="#1976D2" /> });
            menuItems.push({ key: 'admin_audit', label: 'Adminlogg', icon: <Ionicons name="list" size={16} color="#1565C0" /> });
          }

          menuItems.push({ key: 'logout', label: 'Logga ut', icon: <Ionicons name="log-out-outline" size={16} color="#D32F2F" /> });

          return (
            <>
              <TouchableOpacity
                ref={userBtnRef}
                onPress={() => { try { openUserMenu(); } catch(_e) {} }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={16} color="#fff" />
                </View>
                <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color="#666"
                  style={{ marginLeft: 6, transform: [{ rotate: (userMenuVisible ? '180deg' : '0deg') }] }}
                />
              </TouchableOpacity>
              <ContextMenu
                visible={userMenuVisible}
                x={menuPos.x}
                y={menuPos.y}
                items={menuItems}
                onClose={() => setUserMenuVisible(false)}
                onSelect={async (it) => {
                  try {
                    setUserMenuVisible(false);
                    if (!it) return;
                    if (it.key === 'manage_company') {
                      try { navigation.navigate('ManageCompany'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna Hantera företag'); }
                      return;
                    }
                    if (it.key === 'admin_audit') {
                      try { navigation.navigate('AdminAuditLog'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna adminlogg'); }
                      return;
                    }
                    if (it.key === 'manage_users') {
                      try { navigation.navigate('ManageUsers', { companyId: String(companyId || routeCompanyId || '') }); } catch(_e) { Alert.alert('Valt', it.label); }
                      return;
                    }
                    if (it.key === 'logout') {
                      try { setLoggingOut(true); } catch(_e) {}
                      try { await AsyncStorage.removeItem('dk_companyId'); } catch(_e) {}
                      try { await auth.signOut(); } catch(_e) {}
                      try { setLoggingOut(false); } catch(_e) {}
                      try {
                        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                      } catch(_e) {
                        try { navigation.navigate('Login'); } catch(__e) {}
                      }
                      return;
                    }
                    Alert.alert('Valt', it.label);
                  } catch(_e) {}
                }}
              />
            </>
          );
        })() : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 8 }}>
          {Platform.OS === 'web' ? (
            <>
              <View style={{ marginRight: 6 }}>
                {showHeaderUserMenu ? (
                  <HeaderUserMenu />
                ) : <HeaderDisplayName />}
              </View>
              {allowedTools ? (
                <TouchableOpacity
                  style={{ backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                  onPress={() => setSupportMenuOpen(s => !s)}
                >
                  <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
      </View>

      <View
        onLayout={(e) => {
          const w = e?.nativeEvent?.layout?.width;
          if (typeof w === 'number' && w > 0 && Math.abs(w - rightHeaderWidth) > 1) {
            setRightHeaderWidth(w);
          }
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <UploadPanelTrigger />
        <View ref={notificationBellRef} collapsable={false} style={{ position: 'relative' }}>
          <TouchableOpacity
            onPress={() => {
              const next = !notificationDropdownVisible;
              if (!next) {
                setNotificationDropdownVisible(false);
                return;
              }
              const node = notificationBellRef.current;
              if (node && typeof node.measureInWindow === 'function') {
                node.measureInWindow((x, y, w, h) => {
                  setNotificationDropdownPosition({ left: x, top: y + (h || 0) + 4, width: w || 0, height: h || 0 });
                  setNotificationDropdownVisible(true);
                });
              } else {
                setNotificationDropdownVisible(true);
              }
            }}
            onMouseEnter={() => Platform.OS === 'web' && setNotificationBellHover(true)}
            onMouseLeave={() => Platform.OS === 'web' && setNotificationBellHover(false)}
            style={{
              position: 'relative',
              padding: 8,
              borderRadius: 8,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              ...(notificationBellHover && Platform.OS === 'web' ? { opacity: 0.85, backgroundColor: 'rgba(0,0,0,0.06)' } : {}),
            }}
            accessibilityLabel="Notiser"
          >
            <Ionicons name="notifications-outline" size={26} color="#1976D2" />
            {notificationsUnreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  backgroundColor: '#D32F2F',
                  borderRadius: 10,
                  minWidth: 18,
                  height: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 5,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                  {notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
        {notificationDropdownVisible && Platform.OS !== 'web' && (
          <>
            <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9998 }} onPress={() => setNotificationDropdownVisible(false)} />
            <View style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 280, maxWidth: 400, maxHeight: 400, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', zIndex: 9999, paddingVertical: 8, overflow: 'auto' }}>
              <Text style={{ paddingHorizontal: 12, paddingBottom: 6, fontSize: 12, fontWeight: '700', color: '#333' }}>Notiser</Text>
              {notificationsError ? (
                <Text style={{ fontSize: 12, color: '#b91c1c', marginHorizontal: 12, marginBottom: 8 }}>{notificationsError}</Text>
              ) : null}
              {userNotifications.length === 0 && !notificationsError ? (
                <Text style={{ fontSize: 12, color: '#777', paddingHorizontal: 12 }}>Inga notiser än. När någon nämner dig i en kommentar (t.ex. @ditt namn) visas det här.</Text>
              ) : (
                userNotifications.map((n, index) => {
                  const isCommentMention = n?.type === 'comment_mention';
                  const authorName = (n?.authorName && String(n.authorName).trim()) || 'Någon';
                  const textPreview = (n?.textPreview && String(n.textPreview).trim()) ? String(n.textPreview).trim().slice(0, 120) : '';
                  const timeText = (typeof formatRelativeTime === 'function' && n?.createdAt ? formatRelativeTime(n.createdAt) : null) || (n?.createdAt ? new Date(n.createdAt).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
                  return (
                    <View key={n.id || index} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: index < userNotifications.length - 1 ? 1 : 0, borderBottomColor: '#E2E8F0' }}>
                      {isCommentMention ? (
                        <>
                          <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '500' }}>{authorName} nämnde dig i en kommentar</Text>
                          {textPreview ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>"{textPreview}{textPreview.length >= 120 ? '…' : ''}"</Text> : null}
                        </>
                      ) : (
                        <Text style={{ fontSize: 13, color: '#0F172A' }}>{n?.textPreview || 'Ny händelse'}</Text>
                      )}
                      {timeText ? <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{timeText}</Text> : null}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
        {canShowSharePointNav ? (
          <TouchableOpacity
            onPress={() => {
              try {
                const cid = String(companyId || routeCompanyId || '').trim();
                navigation.navigate('ManageSharePointNavigation', cid ? { companyId: cid } : undefined);
              } catch (_e) {}
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#CFE3FF',
              backgroundColor: '#F0F7FF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel="SharePoint Nav"
          >
            <Ionicons name="git-branch-outline" size={18} color="#1976D2" />
          </TouchableOpacity>
        ) : null}
        <View style={{ position: 'relative' }} ref={sharePointCloudRef} collapsable={false}>
          <TouchableOpacity
            onPress={async () => {
              const cid = String(companyId || routeCompanyId || '').trim();
              if (!cid) return;
              const next = !sharePointDropdownVisible;
              if (!next) {
                setSharePointDropdownVisible(false);
                return;
              }
              setSharePointSitesLoading(true);
              setSharePointSitesList([]);
              try {
                const metas = await fetchCompanySharePointSiteMetas(cid);
                const list = await Promise.all(
                  (metas || []).map(async (meta) => {
                    const siteId = meta.siteId || meta.id;
                    const status = siteId ? await checkSharePointSiteById(siteId) : { connected: false, error: 'Saknar siteId' };
                    return { meta, status };
                  })
                );
                setSharePointSitesList(list);
              } catch (e) {
                setSharePointSitesList([{ meta: {}, status: { connected: false, error: e?.message || 'Kunde inte ladda siter' } }]);
              } finally {
                setSharePointSitesLoading(false);
              }
              const node = sharePointCloudRef.current;
              if (node && typeof node.measureInWindow === 'function') {
                node.measureInWindow((x, y, w, h) => {
                  setSharePointDropdownPosition({ left: x, top: y + (h || 0) + 4, width: w || 0, height: h || 0 });
                  setSharePointDropdownVisible(true);
                });
              } else {
                setSharePointDropdownVisible(true);
              }
            }}
            onMouseEnter={() => Platform.OS === 'web' && setSharePointCloudHover(true)}
            onMouseLeave={() => Platform.OS === 'web' && setSharePointCloudHover(false)}
            style={{
              padding: 4,
              borderRadius: 8,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              ...(sharePointCloudHover && Platform.OS === 'web' ? { opacity: 0.85, backgroundColor: 'rgba(0,0,0,0.06)' } : {}),
            }}
            accessibilityLabel="SharePoint-siter"
          >
            <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              {sharePointStatus.checking ? (
                <Animated.View
                  style={{
                    opacity: searchSpinAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.5, 1, 0.5],
                    }),
                  }}
                >
                  <Ionicons name="hourglass-outline" size={24} color="#888" />
                </Animated.View>
              ) : sharePointStatus.connected ? (
                <>
                  <Ionicons name="cloud" size={32} color="#1976D2" />
                  <Animated.View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      opacity: searchSpinAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 1, 0.6],
                      }),
                      transform: [{
                        scale: searchSpinAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.9, 1.1, 0.9],
                        }),
                      }],
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: '#43A047',
                        borderRadius: 10,
                        width: 20,
                        height: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: '#fff',
                      }}
                    >
                      <Ionicons name="sync" size={12} color="#fff" />
                    </View>
                  </Animated.View>
                </>
              ) : (
                <>
                  <Ionicons name="cloud" size={32} color="#999" />
                  <Animated.View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      opacity: searchSpinAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 1, 0.6],
                      }),
                      transform: [{
                        scale: searchSpinAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.9, 1.1, 0.9],
                        }),
                      }],
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: '#D32F2F',
                        borderRadius: 10,
                        width: 20,
                        height: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: '#fff',
                      }}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </View>
                  </Animated.View>
                </>
              )}
            </View>
          </TouchableOpacity>

          {sharePointDropdownVisible && Platform.OS !== 'web' && (
            <>
              <Pressable
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9998,
                }}
                onPress={() => setSharePointDropdownVisible(false)}
              />
              <View
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  minWidth: 240,
                  maxWidth: 320,
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  zIndex: 9999,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ paddingHorizontal: 12, paddingBottom: 6, fontSize: 12, fontWeight: '700', color: '#333' }}>
                  Företagets SharePoint-siter
                </Text>
                {sharePointSitesLoading ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>Laddar siter…</Text>
                  </View>
                ) : sharePointSitesList.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>Inga siter kopplade</Text>
                  </View>
                ) : (
                  sharePointSitesList.map(({ meta, status }, idx) => {
                    const name = meta.displayName || status.siteName || meta.siteId || meta.id || 'Okänd site';
                    const ok = status.connected;
                    return (
                      <View
                        key={String(meta.siteId || meta.id || idx)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          gap: 8,
                        }}
                      >
                        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={ok ? '#43A047' : '#D32F2F'} />
                        <Text style={{ flex: 1, fontSize: 12, color: '#333' }} numberOfLines={1}>
                          {name}
                        </Text>
                        {!ok && status.error ? (
                          <Text style={{ fontSize: 10, color: '#999' }} numberOfLines={1}>
                            {status.error}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            </>
          )}
        </View>

        {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && sharePointDropdownVisible && (() => {
          const dropMinW = 240;
          const dropMaxW = 320;
          const dropMaxH = 400;
          const pad = 8;
          const vw = typeof window !== 'undefined' ? window.innerWidth : windowWidth;
          const vh = typeof window !== 'undefined' ? window.innerHeight : windowHeight;
          let left = sharePointDropdownPosition.left;
          let top = sharePointDropdownPosition.top;
          if (left + dropMaxW > vw - pad) left = Math.max(pad, vw - dropMaxW - pad);
          if (left < pad) left = pad;
          if (top + dropMaxH > vh - pad) top = Math.max(pad, sharePointDropdownPosition.top - dropMaxH - 4);
          if (top < pad) top = pad;
          return createPortal(
            <View>
              <Pressable
                style={{
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 2147483646,
                }}
                onPress={() => setSharePointDropdownVisible(false)}
              />
              <View
                style={{
                  position: 'fixed',
                  left,
                  top,
                  minWidth: dropMinW,
                  maxWidth: dropMaxW,
                  maxHeight: dropMaxH,
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  zIndex: 2147483647,
                  paddingVertical: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  overflow: 'auto',
                }}
              >
                <Text style={{ paddingHorizontal: 12, paddingBottom: 6, fontSize: 12, fontWeight: '700', color: '#333' }}>
                  Företagets SharePoint-siter
                </Text>
                {sharePointSitesLoading ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>Laddar siter…</Text>
                  </View>
                ) : sharePointSitesList.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>Inga siter kopplade</Text>
                  </View>
                ) : (
                  sharePointSitesList.map(({ meta, status }, idx) => {
                    const name = meta.displayName || status.siteName || meta.siteId || meta.id || 'Okänd site';
                    const ok = status.connected;
                    return (
                      <View
                        key={String(meta.siteId || meta.id || idx)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          gap: 8,
                        }}
                      >
                        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={ok ? '#43A047' : '#D32F2F'} />
                        <Text style={{ flex: 1, fontSize: 12, color: '#333' }} numberOfLines={1}>
                          {name}
                        </Text>
                        {!ok && status.error ? (
                          <Text style={{ fontSize: 10, color: '#999' }} numberOfLines={1}>
                            {status.error}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            </View>,
            document.body
          );
        })()}

        {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && notificationDropdownVisible && (() => {
          const dropMinW = 280;
          const dropMaxW = 400;
          const dropMaxH = 400;
          const pad = 8;
          const vw = typeof window !== 'undefined' ? window.innerWidth : windowWidth;
          const vh = typeof window !== 'undefined' ? window.innerHeight : windowHeight;
          let left = notificationDropdownPosition.left;
          let top = notificationDropdownPosition.top;
          if (left + dropMaxW > vw - pad) left = Math.max(pad, vw - dropMaxW - pad);
          if (left < pad) left = pad;
          if (top + dropMaxH > vh - pad) top = Math.max(pad, notificationDropdownPosition.top - dropMaxH - 4);
          if (top < pad) top = pad;
          return createPortal(
            <View>
              <Pressable style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2147483646 }} onPress={() => setNotificationDropdownVisible(false)} />
              <View
                style={{
                  position: 'fixed',
                  left,
                  top,
                  minWidth: dropMinW,
                  maxWidth: dropMaxW,
                  maxHeight: dropMaxH,
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  zIndex: 2147483647,
                  paddingVertical: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  overflow: 'auto',
                }}
              >
                <Text style={{ paddingHorizontal: 12, paddingBottom: 6, fontSize: 12, fontWeight: '700', color: '#333' }}>Notiser</Text>
                {notificationsError ? (
                  <Text style={{ fontSize: 12, color: '#b91c1c', marginHorizontal: 12, marginBottom: 8 }}>{notificationsError}</Text>
                ) : null}
                {userNotifications.length === 0 && !notificationsError ? (
                  <Text style={{ fontSize: 12, color: '#777', paddingHorizontal: 12 }}>Inga notiser än. När någon nämner dig i en kommentar (t.ex. @ditt namn) visas det här.</Text>
                ) : (
                  userNotifications.map((n, index) => {
                    const isCommentMention = n?.type === 'comment_mention';
                    const authorName = (n?.authorName && String(n.authorName).trim()) || 'Någon';
                    const textPreview = (n?.textPreview && String(n.textPreview).trim()) ? String(n.textPreview).trim().slice(0, 120) : '';
                    const timeText = (typeof formatRelativeTime === 'function' && n?.createdAt ? formatRelativeTime(n.createdAt) : null) || (n?.createdAt ? new Date(n.createdAt).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
                    return (
                      <View key={n.id || index} style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: index < userNotifications.length - 1 ? 1 : 0, borderBottomColor: '#E2E8F0' }}>
                        {isCommentMention ? (
                          <>
                            <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '500' }}>{authorName} nämnde dig i en kommentar</Text>
                            {textPreview ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>"{textPreview}{textPreview.length >= 120 ? '…' : ''}"</Text> : null}
                          </>
                        ) : (
                          <Text style={{ fontSize: 13, color: '#0F172A' }}>{n?.textPreview || 'Ny händelse'}</Text>
                        )}
                        {timeText ? <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{timeText}</Text> : null}
                      </View>
                    );
                  })
                )}
              </View>
            </View>,
            document.body
          );
        })()}
      </View>

      {canShowSupportToolsInHeader && supportMenuOpen && (
        <TouchableOpacity
          style={{ backgroundColor: '#1565C0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={() => {
            try { navigation.navigate('AdminAuditLog'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna adminlogg'); }
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Adminlogg</Text>
        </TouchableOpacity>
      )}
      {__DEV__ && showAdminButton && canShowSupportToolsInHeader && supportMenuOpen && (
        <TouchableOpacity
          style={{ backgroundColor: '#43A047', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={async () => {
            await handleMakeDemoAdmin();
            alert('Din användare är nu markerad som demo/admin (client-side).');
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{adminActionRunning ? 'Kör...' : 'Gör mig demo-admin'}</Text>
        </TouchableOpacity>
      )}
      {canShowSupportToolsInHeader && supportMenuOpen && localFallbackExists && (
        <TouchableOpacity
          style={{ backgroundColor: '#FFB300', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={async () => {
            try {
              const rawCompleted = await AsyncStorage.getItem('completed_controls');
              const rawDrafts = await AsyncStorage.getItem('draft_controls');

              if (!rawCompleted && !rawDrafts) {
                Alert.alert('Ingen lokal data', 'Inga lokalt sparade kontroller hittades.');
                await refreshLocalFallbackFlag();
                return;
              }

              Alert.alert(
                'Migrera lokal data',
                'Vill du migrera lokalt sparade kontroller till molnet för kontot? Detta kan skriva över befintlig molndata.',
                [
                  { text: 'Avbryt', style: 'cancel' },
                  {
                    text: 'Migrera',
                    onPress: async () => {
                      try {
                        const successMsgs = [];

                        if (rawCompleted) {
                          try {
                            await AsyncStorage.setItem('completed_controls_backup', rawCompleted);
                            const parsedCompleted = JSON.parse(rawCompleted);
                            let okCount = 0;
                            for (const ctl of parsedCompleted) {
                              try {
                                const ok = await saveControlToFirestore(ctl);
                                if (ok) okCount++;
                              } catch (_e) {}
                            }
                            if (okCount > 0) {
                              await AsyncStorage.removeItem('completed_controls');
                              successMsgs.push(`${okCount} utförda kontroller migrerade`);
                            } else {
                              successMsgs.push('Inga utförda kontroller migrerade');
                            }
                          } catch (_e) {
                            successMsgs.push('Backup/migrering av utförda kontroller misslyckades');
                          }
                        }

                        if (rawDrafts) {
                          try {
                            await AsyncStorage.setItem('draft_controls_backup', rawDrafts);
                            const parsedDrafts = JSON.parse(rawDrafts);
                            let okDrafts = 0;
                            for (const d of parsedDrafts) {
                              try {
                                const ok = await saveDraftToFirestore(d);
                                if (ok) okDrafts++;
                              } catch (_e) {}
                            }
                            if (okDrafts > 0) {
                              await AsyncStorage.removeItem('draft_controls');
                              successMsgs.push(`${okDrafts} utkast migrerade`);
                            } else {
                              successMsgs.push('Inga utkast migrerade');
                            }
                          } catch (_e) {
                            successMsgs.push('Backup/migrering av utkast misslyckades');
                          }
                        }

                        Alert.alert('Migrering klar', successMsgs.join('\n'));
                        await refreshLocalFallbackFlag();
                      } catch (_e) {
                        Alert.alert('Fel', 'Kunde inte migrera: ' + (_e?.message || 'okänt fel'));
                      }
                    },
                  },
                ],
              );
            } catch (_e) {
              Alert.alert('Fel', 'Kunde inte läsa lokal data.');
            }
          }}
        >
          <Text style={{ color: '#222', fontWeight: '700' }}>Migrera lokal data</Text>
        </TouchableOpacity>
      )}
      {canShowSupportToolsInHeader && supportMenuOpen && auth && auth.currentUser && (
        <TouchableOpacity
          style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={async () => {
            try {
              await auth.currentUser.getIdToken(true);
              showAlert('Token uppdaterad', 'ID-token uppdaterad. Hierarki migreras inte längre automatiskt eftersom SharePoint är källa.');
            } catch (_e) {
              showAlert('Fel', 'Kunde inte uppdatera token eller migrera: ' + (_e?.message || _e));
            }
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Uppdatera token & synka</Text>
        </TouchableOpacity>
      )}
      {canShowSupportToolsInHeader && supportMenuOpen && (
        <TouchableOpacity
          style={{ backgroundColor: '#eee', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={async () => {
            try {
              const user = auth.currentUser;
              const tokenRes = user ? await auth.currentUser.getIdTokenResult(true).catch(() => null) : null;
              const claims = tokenRes?.claims || {};
              const stored = await AsyncStorage.getItem('dk_companyId');
              const tokenEmail = claims.email || '—';
              const superadmin = claims.superadmin === true || claims.role === 'superadmin';
              showAlert(
                'Auth info',
                `user: ${user ? user.email + ' (' + user.uid + ')' : 'not signed in'}\ntoken.email: ${tokenEmail}\nsuperadmin/role: ${superadmin ? 'ja' : 'nej'}\nclaims.companyId: ${claims.companyId || '—'}\ndk_companyId: ${stored || '—'}`,
              );
            } catch (_e) {
              showAlert('Fel', 'Kunde inte läsa auth info: ' + (_e?.message || _e));
            }
          }}
        >
          <Text style={{ color: '#222', fontWeight: '700' }}>Visa auth-info</Text>
        </TouchableOpacity>
      )}
      {canShowSupportToolsInHeader && supportMenuOpen && (
        <TouchableOpacity
          style={{ backgroundColor: '#ddd', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={async () => {
            await dumpLocalRemoteControls();
          }}
        >
          <Text style={{ color: '#222', fontWeight: '700' }}>Debug: visa lokal/moln</Text>
        </TouchableOpacity>
      )}
      {canShowSupportToolsInHeader && supportMenuOpen && (
        <TouchableOpacity
          style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
          onPress={async () => {
            await showLastFsError();
          }}
        >
          <Text style={{ color: '#222', fontWeight: '700' }}>Visa senaste FS-fel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
