
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Image, Text, View } from 'react-native';
// AppLoading borttagen, ersätts med View och Text

// Importera skärmar
import ArbetsberedningScreen from './Screens/ArbetsberedningScreen';
import CameraCapture from './Screens/CameraCapture';
import ControlDetails from './Screens/ControlDetails';
import ControlForm from './Screens/ControlForm';
import EgenkontrollScreen from './Screens/EgenkontrollScreen';
import FuktmätningScreen from './Screens/FuktmätningScreen';
import HomeScreen from './Screens/HomeScreen';
import LoginScreen from './Screens/LoginScreen';
import ProjectDetails from './Screens/ProjectDetails';
import RiskbedömningScreen from './Screens/RiskbedömningScreen';
import SkyddsrondScreen from './Screens/SkyddsrondScreen';

const Stack = createStackNavigator();

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
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#000',
          headerTitleStyle: { fontWeight: 'bold', color: '#000', fontFamily: 'Inter_700Bold' },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Logga in' }} />
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ 
            headerTitle: () => (
              <Image
                source={require('./assets/images/digitalkontroll.lang.transparant.jpg')}
                style={{ width: 150, height: 80, resizeMode: 'contain', marginLeft: 0 }}
                accessibilityLabel="Digitalkontroll logotyp"
              />
            ),
            headerBackTitleVisible: false,
          }} 
        />
        <Stack.Screen name="ControlDetails" component={ControlDetails} options={{ title: 'Kontrolldetaljer' }} />
        <Stack.Screen name="ControlForm" component={ControlForm} options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="checkbox-outline" size={28} color="#7B1FA2" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Mottagningskontroll</Text>
            </View>
          ),
          headerBackTitleVisible: false,
        }} />
        <Stack.Screen name="ArbetsberedningScreen" component={ArbetsberedningScreen} options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="construct-outline" size={28} color="#1976D2" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Arbetsberedning</Text>
            </View>
          ),
          headerBackTitleVisible: false,
        }} />
        <Stack.Screen name="RiskbedömningScreen" component={RiskbedömningScreen} options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="warning-outline" size={28} color="#FFD600" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Riskbedömning</Text>
            </View>
          ),
          headerBackTitleVisible: false,
        }} />
        <Stack.Screen name="FuktmätningScreen" component={FuktmätningScreen} options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="water-outline" size={28} color="#0288D1" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Fuktmätning</Text>
            </View>
          ),
          headerBackTitleVisible: false,
        }} />
        <Stack.Screen name="EgenkontrollScreen" component={EgenkontrollScreen} options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="checkmark-done-outline" size={28} color="#388E3C" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Egenkontroll</Text>
            </View>
          ),
          headerBackTitleVisible: false,
        }} />
        <Stack.Screen name="ProjectDetails" component={ProjectDetails} options={{ title: 'Projekt' }} />
        <Stack.Screen name="SkyddsrondScreen" component={SkyddsrondScreen} options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="shield-half-outline" size={28} color="#388E3C" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Skyddsrond</Text>
            </View>
          ),
          headerBackTitleVisible: false,
        }} />
        <Stack.Screen name="CameraCapture" component={CameraCapture} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
