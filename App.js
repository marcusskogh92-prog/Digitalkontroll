import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// AppLoading borttagen, ersätts med View och Text

import ErrorBoundary from './components/ErrorBoundary';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo, HomeHeaderSearch } from './components/HeaderComponents';
import HeaderUserMenuConditional from './components/HeaderUserMenuConditional';

// Importera skärmar
import AdminAuditLog from './Screens/AdminAuditLog';
import ArbetsberedningScreen from './Screens/ArbetsberedningScreen';
import CameraCapture from './Screens/CameraCapture';
import ControlDetails from './Screens/ControlDetails';
import ControlForm from './Screens/ControlForm';
import EgenkontrollScreen from './Screens/EgenkontrollScreen';
import FuktmätningScreen from './Screens/FuktmätningScreen';
import HomeScreen from './Screens/HomeScreen';
import LoginScreen from './Screens/LoginScreen';
import ManageCompany from './Screens/ManageCompany';
import ManageControlTypes from './Screens/ManageControlTypes';
import ManageTemplates from './Screens/ManageTemplates';
import ManageUsers from './Screens/ManageUsers';
import MottagningskontrollScreen from './Screens/MottagningskontrollScreen';
import ProjectDetails from './Screens/ProjectDetails';
import RiskbedömningScreen from './Screens/RiskbedömningScreen';
import SkyddsrondScreen from './Screens/SkyddsrondScreen';

const Stack = createStackNavigator();

function ensureWebTitle() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  document.title = 'DigitalKontroll';
}



export default function App() {
  let [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
    Inter_600SemiBold,
  });
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 18, color: '#222' }}>Laddar typsnitt...</Text>
      </View>
    );
  }
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer
          documentTitle={{ enabled: false }}
          onReady={ensureWebTitle}
          onStateChange={ensureWebTitle}
        >
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={({ route, navigation }) => {
              const edgeNudge = Platform.OS === 'web' ? -144 : 0;
              const dkExtraNudge = Platform.OS === 'web' ? -10 : 0;
              return ({
                headerStyle: { backgroundColor: '#FFFFFF', height: 96, paddingLeft: 0, paddingRight: 0, zIndex: 10, overflow: 'visible' },
                headerTintColor: '#000',
                headerTitleStyle: { fontWeight: 'bold', color: '#000', fontFamily: 'Inter_700Bold' },
                headerTitleAlign: 'center',
                headerTitleContainerStyle: Platform.OS === 'web'
                  ? { flex: 1, paddingLeft: 300, paddingRight: 300 }
                  : { flex: 1, paddingLeft: 0, paddingRight: 0 },
                headerTitle: () => <HomeHeaderSearch navigation={navigation} route={route} />,
                headerLeft: () => (
                  <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
                    <DigitalKontrollHeaderLogo />
                  </View>
                ),
                headerLeftContainerStyle: Platform.OS === 'web'
                  ? { position: 'absolute', left: 20, top: 0, height: '100%', justifyContent: 'center', paddingLeft: 0, zIndex: 20 }
                  : { width: 260, alignItems: 'flex-start', justifyContent: 'center', marginLeft: edgeNudge + dkExtraNudge, paddingLeft: 0 },
                headerRight: () => (
                  <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <CompanyHeaderLogo companyId={route?.params?.companyId || ''} />
                    {/* Persistent user menu (web) - hide on Home, Home renders it inline next to Verktyg */}
                    {Platform.OS === 'web' && route?.name !== 'Home' ? (
                      <View style={{ marginLeft: 12 }}>
                        <HeaderUserMenuConditional />
                      </View>
                    ) : null}
                  </View>
                ),
                headerRightContainerStyle: Platform.OS === 'web'
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
                const edgeNudge = Platform.OS === 'web' ? -144 : 0;
                const dkExtraNudge = Platform.OS === 'web' ? -10 : 0;
                return ({
                  headerStyle: { backgroundColor: '#FFFFFF', height: 96, paddingLeft: 0, paddingRight: 0, zIndex: 10, overflow: 'visible' },
                headerTitleAlign: 'center',
                headerTitleContainerStyle: Platform.OS === 'web'
                  ? { flex: 1, paddingLeft: 300, paddingRight: 300 }
                  : { flex: 1, paddingLeft: 0, paddingRight: 0 },
                headerTitle: () => <HomeHeaderSearch navigation={navigation} route={route} />,
                headerLeft: () => (
                  <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
                    <DigitalKontrollHeaderLogo />
                  </View>
                ),
                  headerLeftContainerStyle: Platform.OS === 'web'
                    ? { position: 'absolute', left: 20, top: 0, height: '100%', justifyContent: 'center', paddingLeft: 0, zIndex: 20 }
                    : { width: 260, alignItems: 'flex-start', justifyContent: 'center', marginLeft: edgeNudge + dkExtraNudge, paddingLeft: 0 },
                headerRight: () => (
                  <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <CompanyHeaderLogo companyId={route?.params?.companyId || ''} />
                  </View>
                ),
                  headerRightContainerStyle: Platform.OS === 'web'
                    ? { position: 'absolute', right: 20, top: 0, height: '100%', justifyContent: 'center', paddingRight: 0 }
                    : { width: 260, alignItems: 'flex-end', justifyContent: 'center', marginRight: edgeNudge, paddingRight: 0 },
                headerBackTitleVisible: false,
                });
              }}
            />
            <Stack.Screen name="ControlDetails" component={ControlDetails} options={{ title: 'Kontrolldetaljer' }} />
            <Stack.Screen name="ControlForm" component={ControlForm} options={({ navigation }) => ({
              headerTitle: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="checkbox-outline" size={28} color="#7B1FA2" style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Mottagningskontroll</Text>
                </View>
              ),
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
            })} />
            <Stack.Screen name="ArbetsberedningScreen" component={ArbetsberedningScreen} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="RiskbedömningScreen" component={RiskbedömningScreen} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="FuktmätningScreen" component={FuktmätningScreen} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="EgenkontrollScreen" component={EgenkontrollScreen} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="ProjectDetails" component={ProjectDetails} options={{ title: 'Projekt' }} />
            <Stack.Screen name="ManageCompany" component={ManageCompany} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="AdminAuditLog" component={AdminAuditLog} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="ManageUsers" component={ManageUsers} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="ManageTemplates" component={ManageTemplates} options={({ navigation }) => ({
              title: 'Mallar',
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
            })} />
            <Stack.Screen name="ManageControlTypes" component={ManageControlTypes} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="SkyddsrondScreen" component={SkyddsrondScreen} options={({ navigation }) => ({
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
            })} />
            <Stack.Screen name="CameraCapture" component={CameraCapture} options={{ headerShown: false }} />
            <Stack.Screen name="MottagningskontrollScreen" component={MottagningskontrollScreen} options={({ navigation }) => ({
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
            })} />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
