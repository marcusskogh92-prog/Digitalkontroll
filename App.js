
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View } from 'react-native';
// AppLoading borttagen, ersätts med View och Text

// Importera skärmar
import ControlDetails from './Screens/ControlDetails';
import ControlForm from './Screens/ControlForm';
import HomeScreen from './Screens/HomeScreen';
import LoginScreen from './Screens/LoginScreen';
import ProjectDetails from './Screens/ProjectDetails';

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
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Hem' }} />
        <Stack.Screen name="ControlDetails" component={ControlDetails} options={{ title: 'Kontrolldetaljer' }} />
        <Stack.Screen name="ControlForm" component={ControlForm} options={{ title: 'Ny kontroll' }} />
        <Stack.Screen name="ProjectDetails" component={ProjectDetails} options={{ title: 'Projekt' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
