import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// AppLoading borttagen, ersätts med View och Text

import ErrorBoundary from './components/ErrorBoundary';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo, HomeHeaderSearch } from './components/HeaderComponents';
import GlobalPhaseToolbar from './components/GlobalPhaseToolbar';

// Importera skärmar
import AdminAuditLog from './Screens/AdminAuditLog';
import CameraCapture from './Screens/CameraCapture';
import ContactRegistryScreen from './Screens/ContactRegistryScreen';
import ControlDetails from './Screens/ControlDetails';
import ControlForm from './Screens/ControlForm';
import HomeScreen from './Screens/HomeScreen';
import SuppliersScreen from './Screens/SuppliersScreen';
import LoginScreen from './Screens/LoginScreen';
import ManageCompany from './Screens/ManageCompany';
import ManageControlTypes from './Screens/ManageControlTypes';
import ManageUsers from './Screens/ManageUsers';
import ProjectDetails from './Screens/ProjectDetails';
import TemplateControlScreen from './Screens/TemplateControlScreen';
import KMAScreen from './features/kma/screens/KMAScreen';

const Stack = createStackNavigator();

const formatProjectLabelForBreadcrumb = (project) => {
  const id = String(project?.id || '').trim();
  const name = String(project?.name || '').trim();
  const combined = `${id} ${name}`.trim();
  return combined || name || id || 'Projekt';
};

const WebBreadcrumbHeader = ({ segments }) => {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const linkStyle = { color: '#1976D2', fontWeight: '700' };
  const sepStyle = { color: '#9E9E9E', fontWeight: '600' };
  const currentStyle = { color: '#222', fontWeight: '700' };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, maxWidth: 760 }}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 14, flexShrink: 1 }}>
        {safeSegments.map((seg, idx) => {
          const label = String(seg?.label || '').trim();
          if (!label) return null;
          const isLast = idx === safeSegments.length - 1;
          const onPress = typeof seg?.onPress === 'function' ? seg.onPress : null;
          return (
            <Text key={`${idx}-${label}`}>
              {idx > 0 ? <Text style={sepStyle}> / </Text> : null}
              <Text onPress={onPress || undefined} style={isLast ? currentStyle : linkStyle}>
                {label}
              </Text>
            </Text>
          );
        })}
      </Text>
    </View>
  );
};

const dispatchWindowEvent = (name, detail) => {
  try {
    if (typeof window === 'undefined') return;
    const evt = (typeof CustomEvent === 'function')
      ? new CustomEvent(name, { detail })
      : (() => {
        const e = document.createEvent('Event');
        e.initEvent(name, true, true);
        e.detail = detail;
        return e;
      })();
    window.dispatchEvent(evt);
  } catch (_e) {}
};

const dispatchBreadcrumbNavigate = (target) => {
  dispatchWindowEvent('dkBreadcrumbNavigate', { target });
};

const WebGlobalBreadcrumb = ({ navigation, route, titleFallback = '' }) => {
  const [homeSegments, setHomeSegments] = React.useState(null);
  const [manageCompanySegments, setManageCompanySegments] = React.useState(null);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    // If Home already published segments before this component mounted, use them immediately.
    try {
      const cached = window.__dkBreadcrumbHomeSegments;
      if (Array.isArray(cached) && cached.length > 0) setHomeSegments(cached);
    } catch (_e) {}

    const onUpdate = (event) => {
      try {
        const detail = event?.detail || {};
        if (detail.scope === 'home') {
          const segs = Array.isArray(detail.segments) ? detail.segments : [];
          setHomeSegments(segs);
        } else if (detail.scope === 'manageCompany') {
          const segs = Array.isArray(detail.segments) ? detail.segments : [];
          setManageCompanySegments(segs);
        }
      } catch (_e) {}
    };

    try { window.addEventListener('dkBreadcrumbUpdate', onUpdate); } catch (_e) {}
    return () => {
      try { window.removeEventListener('dkBreadcrumbUpdate', onUpdate); } catch (_e) {}
    };
  }, []);

  const isWeb = Platform.OS === 'web';
  if (!isWeb) return null;

  const goHome = () => {
    try {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (_e) {
      try { navigation.navigate('Home'); } catch (__e) {}
    }
  };

  const runTarget = (target) => {
    const t = target || {};
    const kind = String(t.kind || '').trim();
    if (!kind || kind === 'noop') return;

    if (String(route?.name || '') !== 'Home') {
      // Navigate to Home first, then let Home apply the target.
      goHome();
      setTimeout(() => dispatchBreadcrumbNavigate(t), 60);
      return;
    }
    dispatchBreadcrumbNavigate(t);
  };

  const currentRouteName = String(route?.name || '').trim();

  const fallbackTitle = String(titleFallback || '').trim() || (
    currentRouteName === 'ManageCompany' ? 'Företag'
      : currentRouteName === 'ManageUsers' ? 'Användare'
        : currentRouteName === 'ManageControlTypes' ? 'Kontrolltyper'
          : currentRouteName === 'ContactRegistry' ? 'Kontaktregister'
          : currentRouteName === 'AdminAuditLog' ? 'Adminlogg'
            : currentRouteName === 'TemplateControlScreen' ? 'Kontroll'
              : currentRouteName === 'ControlForm' ? 'Kontroll'
                : currentRouteName || 'Sida'
  );

  const routeSegments = (() => {
    // Home: show the detailed path published by HomeScreen.
    if (currentRouteName === 'Home' && Array.isArray(homeSegments) && homeSegments.length > 0) {
      return homeSegments.map((s) => ({
        label: s?.label,
        onPress: () => runTarget(s?.target),
      }));
    }

    // Other screens: at least Dashboard / Screen.
    // Keep everything clickable: Dashboard always goes Home; Screen just re-navigates to itself.
    const segs = [
      { label: 'Startsida', onPress: () => runTarget({ kind: 'dashboard' }) },
      { label: fallbackTitle, onPress: () => {
        try {
          if (currentRouteName && navigation?.navigate) navigation.navigate(currentRouteName, route?.params);
        } catch (_e) {}
      } },
    ];

    // TemplateControlScreen: show Dashboard / Kontrolltyper / {kontrolltyp eller mall}
    if (currentRouteName === 'TemplateControlScreen') {
      const controlType = String(route?.params?.controlType || '').trim();
      const templateName = String(route?.params?.template?.name || '').trim();
      const leaf = templateName || controlType;
      if (leaf) {
        return [
          { label: 'Startsida', onPress: () => runTarget({ kind: 'dashboard' }) },
          { label: 'Kontrolltyper', onPress: () => {
            try { navigation.navigate('ManageControlTypes'); } catch (_e) {}
          } },
          { label: leaf, onPress: () => { try { /* stay */ } catch (_e) {} } },
        ];
      }
    }

    // ControlForm: show Dashboard / {projekt} / {kontroll}
    if (currentRouteName === 'ControlForm') {
      const project = route?.params?.project || route?.params?.initialValues?.project || route?.params?.initialValues?.control?.project;
      const projectLabel = formatProjectLabelForBreadcrumb(project);
      const controlLabel = String(route?.params?.controlType || route?.params?.initialValues?.type || 'Kontroll').trim();
      return [
        { label: 'Startsida', onPress: () => runTarget({ kind: 'dashboard' }) },
        { label: projectLabel, onPress: () => { try { navigation.goBack(); } catch (_e) {} } },
        { label: controlLabel, onPress: () => { try { /* stay */ } catch (_e) {} } },
      ];
    }

    // ManageCompany: show Dashboard / Företag / {företagsnamn}
    if (currentRouteName === 'ManageCompany') {
      // Use segments published by ManageCompany component if available
      if (Array.isArray(manageCompanySegments) && manageCompanySegments.length > 0) {
        return manageCompanySegments.map((s) => ({
          label: s?.label,
          onPress: s?.onPress || (() => {
            try {
              if (navigation?.navigate) navigation.navigate('ManageCompany');
            } catch (_e) {}
          }),
        }));
      }
      // Fallback to default
      const companyName = String(route?.params?.companyName || '').trim();
      if (companyName) {
        return [
          { label: 'Startsida', onPress: () => runTarget({ kind: 'dashboard' }) },
          { label: 'Företag', onPress: () => {
            try {
              if (navigation?.navigate) navigation.navigate('ManageCompany');
            } catch (_e) {}
          } },
          { label: companyName, onPress: () => { try { /* stay */ } catch (_e) {} } },
        ];
      }
    }

    return segs;
  })();

  return (
    <View style={{ marginTop: 2 }}>
      <WebBreadcrumbHeader segments={routeSegments} />
    </View>
  );
};

// Suppress specific deprecation warnings on web that are noisy but safe
if (typeof Platform !== 'undefined' && Platform && Platform.OS === 'web') {
  try {
    const _origWarn = console.warn && console.warn.bind && console.warn.bind(console);
    console.warn = (...args) => {
      try {
        const msg = String(args && args[0] ? args[0] : '');
        if (msg.includes('props.pointerEvents is deprecated') || msg.includes('"shadow*" style props are deprecated')) {
          return; // ignore these specific RN-web deprecation warnings
        }
      } catch (e) {}
      if (_origWarn) _origWarn(...args);
    };
  } catch (e) {}
}

function ensureWebTitle() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  document.title = 'DigitalKontroll';
}



export default function App() {
  const [currentRoute, setCurrentRoute] = React.useState(null);
  const navigationRef = React.useRef(null);
  
  let [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
    Inter_600SemiBold,
    ...(Ionicons?.font || {}),
  });
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 18, color: '#222' }}>Laddar typsnitt...</Text>
      </View>
    );
  }
  
  const handleStateChange = (state) => {
    ensureWebTitle();
    // Extract current route name
    if (state) {
      const route = state.routes[state.index];
      setCurrentRoute(route?.name || null);
    }
  };
  
  const showToolbar = false; // Disabled - phase selector is now in left sidebar
  // const showToolbar = currentRoute && currentRoute !== 'Login';
  
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {showToolbar && (
          <GlobalPhaseToolbar 
            navigation={navigationRef.current}
            route={{ name: currentRoute }}
          />
        )}
        <View style={{ flex: 1, paddingTop: showToolbar && Platform.OS === 'web' ? 48 : 0 }}>
          <NavigationContainer
            ref={navigationRef}
            documentTitle={{ enabled: false }}
            onReady={ensureWebTitle}
            onStateChange={handleStateChange}
          >
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={({ route, navigation }) => {
              const isWeb = Platform.OS === 'web';
              const edgeNudge = isWeb ? -144 : 0;
              const dkExtraNudge = isWeb ? -10 : 0;
              return ({
                // Clean base header for all screens; detailed layout handled via container styles
                headerStyle: { backgroundColor: '#FFFFFF', height: 96 },
                headerTintColor: '#000',
                headerTitleStyle: { fontWeight: 'bold', color: '#000', fontFamily: 'Inter_700Bold' },
                headerTitleAlign: 'center',
                headerTitleContainerStyle: isWeb
                  ? { flex: 1, paddingLeft: 300, paddingRight: 300 }
                  : { flex: 1, paddingLeft: 0, paddingRight: 0 },
                headerTitle: () => (
                  isWeb
                    ? (
                      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                        {route?.name === 'Home' ? (
                          <HomeHeaderSearch navigation={navigation} route={route} />
                        ) : null}
                      </View>
                    )
                    : null
                ),
                headerLeft: () => (
                  <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
                    <DigitalKontrollHeaderLogo />
                  </View>
                ),
                headerLeftContainerStyle: isWeb
                  ? { position: 'absolute', left: 20, top: 0, height: '100%', justifyContent: 'center', paddingLeft: 0, zIndex: 20 }
                  : { width: 260, alignItems: 'flex-start', justifyContent: 'center', marginLeft: edgeNudge + dkExtraNudge, paddingLeft: 0 },
                headerRight: () => (
                  <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {/* On native, hide company logo + header menu to keep header compact */}
                    {isWeb && (
                      <>
                        <CompanyHeaderLogo companyId={route?.params?.companyId || ''} />
                      </>
                    )}
                  </View>
                ),
                headerRightContainerStyle: isWeb
                  ? { position: 'absolute', right: 20, top: 0, height: '100%', justifyContent: 'center', paddingRight: 0 }
                  : { width: 260, alignItems: 'flex-end', justifyContent: 'center', marginRight: edgeNudge, paddingRight: 0 },
                headerBackTitleVisible: false,
              });
            }}
          >
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen 
              name="Home" 
              component={HomeScreen} 
              options={({ route, navigation }) => {
                const isWeb = Platform.OS === 'web';
                const edgeNudge = isWeb ? -144 : 0;
                const dkExtraNudge = isWeb ? -10 : 0;
                return ({
                  // Keep header clean on native; extra layout is handled via container styles
                  headerStyle: { backgroundColor: '#FFFFFF', height: 96 },
                headerTitleAlign: 'center',
                headerTitleContainerStyle: isWeb
                  ? { flex: 1, paddingLeft: 300, paddingRight: 300 }
                  : { flex: 1, paddingLeft: 0, paddingRight: 0 },
                // Web: show search + breadcrumb via global screenOptions; native uses centered logo.
                headerTitle: () => (
                  isWeb
                    ? (
                      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <HomeHeaderSearch navigation={navigation} route={route} />
                      </View>
                    )
                    : (
                      <View style={{ marginBottom: 4, marginLeft: -28 }}>
                        <DigitalKontrollHeaderLogo />
                      </View>
                    )
                ),
                // På webben ligger loggan till vänster, i appen behövs ingen vänster-komponent här.
                headerLeft: () => (
                  isWeb ? (
                    <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
                      <DigitalKontrollHeaderLogo />
                    </View>
                  ) : null
                ),
                  headerLeftContainerStyle: isWeb
                    ? { position: 'absolute', left: 20, top: 0, height: '100%', justifyContent: 'center', paddingLeft: 0, zIndex: 20 }
                    : { width: 0, alignItems: 'flex-start', justifyContent: 'center', marginLeft: 0, paddingLeft: 0 },
                headerRight: () => (
                  <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {/* Only show company logo in header on web; native keeps header minimal */}
                    {isWeb && <CompanyHeaderLogo companyId={route?.params?.companyId || ''} />}
                  </View>
                ),
                  headerRightContainerStyle: isWeb
                    ? { position: 'absolute', right: 20, top: 0, height: '100%', justifyContent: 'center', paddingRight: 0 }
                    : { width: 0, alignItems: 'flex-end', justifyContent: 'center', marginRight: 0, paddingRight: 0 },
                headerBackTitleVisible: false,
                });
              }}
            />
            <Stack.Screen name="ControlDetails" component={ControlDetails} options={{ title: 'Kontrolldetaljer' }} />
            <Stack.Screen name="ControlForm" component={ControlForm} options={({ navigation, route }) => ({
              headerTitle: () => {
                const isWeb = Platform.OS === 'web';
                if (isWeb) {
                  return (
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <WebGlobalBreadcrumb navigation={navigation} route={route} />
                    </View>
                  );
                }

                const title = route?.params?.controlType || 'Mottagningskontroll';
                const iconName = route?.params?.controlIcon || 'checkbox-outline';
                const iconColor = route?.params?.controlColor || '#7B1FA2';
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={iconName} size={28} color={iconColor} style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>{title}</Text>
                  </View>
                );
              },
              headerBackTitleVisible: false,
              headerBackTitle: '',
            })} />
            <Stack.Screen name="KMAScreen" component={KMAScreen} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'KMA',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'KMA',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="ProjectDetails" component={ProjectDetails} options={{ title: 'Projekt' }} />
            <Stack.Screen name="ManageCompany" component={ManageCompany} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Företag',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Företag',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="AdminAuditLog" component={AdminAuditLog} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Adminlogg',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Adminlogg',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="ManageUsers" component={ManageUsers} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Användare',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Användare',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="ManageControlTypes" component={ManageControlTypes} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Kontrolltyper',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Kontrolltyper',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="ContactRegistry" component={ContactRegistryScreen} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Kontaktregister',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Kontaktregister',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="Suppliers" component={SuppliersScreen} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Leverantörer',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Leverantörer',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen name="Customers" component={SuppliersScreen} options={({ navigation }) => {
              const isWeb = Platform.OS === 'web';
              if (isWeb) {
                return ({
                  title: 'Kunder',
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                });
              }

              return ({
                title: 'Kunder',
                headerBackTitleVisible: false,
                headerBackTitle: '',
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Tillbaka"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                  >
                    <Ionicons name="chevron-back" size={30} color="#000" />
                  </TouchableOpacity>
                ),
              });
            }} />
            <Stack.Screen
              name="TemplateControlScreen"
              component={TemplateControlScreen}
              options={({ navigation }) => {
                const isWeb = Platform.OS === 'web';
                if (isWeb) {
                  return ({
                    headerBackTitleVisible: false,
                    headerBackTitle: '',
                  });
                }

                return ({
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                  headerLeft: () => (
                    <TouchableOpacity
                      onPress={() => navigation.goBack()}
                      accessibilityLabel="Tillbaka"
                      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                      style={{ width: 56, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}
                    >
                      <Ionicons name="chevron-back" size={30} color="#000" />
                    </TouchableOpacity>
                  ),
                });
              }}
            />
            <Stack.Screen name="CameraCapture" component={CameraCapture} options={{ headerShown: false }} />
          </Stack.Navigator>
          </NavigationContainer>
        </View>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
