
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Image } from 'react-native';

// Importera skärmar
import ControlDetails from './Screens/ControlDetails';
import ControlForm from './Screens/ControlForm';
import HomeScreen from './Screens/HomeScreen';
import LoginScreen from './Screens/LoginScreen';
import ProjectDetails from './Screens/ProjectDetails';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#000',
          headerTitleStyle: { fontWeight: 'bold', color: '#000' },
        }}
      >
        {/* Inloggning */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: 'Logga in' }}
        />
        {/* Startsida */}
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerTitle: () => (
              Image ? (
                <Image
                  source={require('./assets/images/kontrollbygg.lang.transparant.jpg')}
                  style={{ width: 800, height: 240, resizeMode: 'contain', alignSelf: 'flex-start', maxWidth: '100%' }}
                />
              ) : null
            ),
            headerTitleAlign: 'left',
            headerStyle: { backgroundColor: '#FFFFFF' },
          }}
        />
        {/* Projektdetaljer */}
        <Stack.Screen
          name="ProjectDetails"
          component={ProjectDetails}
          options={{ title: 'Projektinformation' }}
        />
        {/* Skapa/Utför kontroll */}
        <Stack.Screen
          name="ControlForm"
          component={ControlForm}
          options={{ title: 'Ny kontroll' }}
        />
        {/* Visa sparad kontroll */}
        <Stack.Screen
          name="ControlDetails"
          component={ControlDetails}
          options={{ title: 'Kontrolldetaljer' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
