import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRef, useState } from 'react';
import { Alert, Animated, Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { showAlert } from '../../utils/alerts';
import ContextMenu from '../ContextMenu';
import HeaderDisplayName from '../HeaderDisplayName';
import HeaderUserMenu from '../HeaderUserMenu';
import { formatPersonName } from '../formatPersonName';
import { UploadPanelTrigger } from './uploads/UploadPanel';

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
}) {
  const userBtnRef = useRef(null);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const [, setLoggingOut] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const [leftHeaderWidth, setLeftHeaderWidth] = useState(0);
  const [rightHeaderWidth, setRightHeaderWidth] = useState(0);

  const email = route?.params?.email || '';
  const firstName = formatPersonName(email);

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

        {sharePointStatus.connected && sharePointStatus.siteName && (
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: '#ddd',
              ...(Platform.OS === 'web'
                ? {
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }
                : {}),
            }}
          >
            <Text
              style={{
                color: '#333',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {sharePointStatus.siteName}
            </Text>
          </View>
        )}
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
              showAlert(
                'Auth info',
                `user: ${user ? user.email + ' (' + user.uid + ')' : 'not signed in'}\nclaims.companyId: ${claims.companyId || '—'}\ndk_companyId: ${stored || '—'}`,
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
