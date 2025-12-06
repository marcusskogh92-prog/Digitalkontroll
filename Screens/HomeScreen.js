
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { auth } from '../components/firebase';

function getFirstName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  return localPart.split('.')[0].charAt(0).toUpperCase() + localPart.split('.')[0].slice(1);
}

export default function HomeScreen({ route }) {
  const navigation = useNavigation();
  const email = route.params?.email || '';
  const firstName = getFirstName(email);
  const [loggingOut, setLoggingOut] = useState(false);
  const [hierarchy, setHierarchy] = useState([]);

  return (
    <ImageBackground
      source={require('../assets/images/inlogg.app.png')}
      style={{ flex: 1, resizeMode: 'cover' }}
      imageStyle={{ opacity: 1 }}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.85)' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F7FAFC' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, backgroundColor: '#eee', borderRadius: 24, marginRight: 12, overflow: 'hidden' }}>
              {/* Logotyp */}
            </View>
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#263238' }}>Hej, {firstName || 'Användare'}!</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>Välkommen till Digitalkontroll</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 2,
              borderColor: '#222',
              paddingVertical: 5,
              paddingHorizontal: 14,
              alignItems: 'center',
            }}
            onPress={async () => {
              setLoggingOut(true);
              await auth.signOut();
              setLoggingOut(false);
              navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
            }}
          >
            <Text style={{ color: '#222', fontWeight: 'bold', fontSize: 16 }}>Logga ut</Text>
          </TouchableOpacity>
        </View>

        {/* Knappar och pågående kontroller */}
        <View style={{ marginTop: 32, marginBottom: 16, alignItems: 'center' }}>
          {[
            { label: 'Skapa kontroll', icon: require('../assets/images/plus.png'), onPress: () => navigation.navigate('ControlForm') },
            { label: 'Skyddsrond', icon: require('../assets/images/shield.png'), onPress: () => navigation.navigate('SkyddsrondScreen') },
            { label: 'Projekt', icon: require('../assets/images/project.png'), onPress: () => navigation.navigate('ProjectDetails') },
          ].map((btn) => (
            <TouchableOpacity
              key={btn.label}
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                marginBottom: 16,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'flex-start',
                shadowColor: '#1976D2',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.10,
                shadowRadius: 6,
                elevation: 2,
                minHeight: 56,
                minWidth: 0,
                maxWidth: 320,
                width: '100%',
                paddingLeft: 24,
                paddingRight: 18,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: '#222',
              }}
              activeOpacity={0.85}
              onPress={btn.onPress}
            >
              <Image source={btn.icon} style={{ width: 26, height: 26, marginRight: 16, resizeMode: 'contain', zIndex: 1 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
          {/* Pågående kontroller-knapp */}
          <TouchableOpacity
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              marginBottom: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              shadowColor: '#1976D2',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.10,
              shadowRadius: 6,
              elevation: 2,
              minHeight: 56,
              minWidth: 0,
              maxWidth: 320,
              width: '100%',
              paddingLeft: 24,
              paddingRight: 18,
              overflow: 'hidden',
              borderWidth: 2,
              borderColor: '#222',
            }}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ControlDetails')}
          >
            <Image source={require('../assets/images/app.icon.png')} style={{ width: 26, height: 26, marginRight: 16, resizeMode: 'contain', zIndex: 1 }} />
            <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5 }}>Pågående kontroller</Text>
            <View style={{
              marginLeft: 12,
              backgroundColor: '#222',
              borderRadius: 12,
              minWidth: 28,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
            }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{3}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Projektlista */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#263238', marginBottom: 16, marginTop: 32, letterSpacing: 0.2, textAlign: 'left', paddingHorizontal: 16 }}>
            Projekt
          </Text>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, padding: 16, paddingTop: 0 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ marginBottom: 18 }}>
                <TextInput
                  placeholder="Sök projekt..."
                  placeholderTextColor="#888888"
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: '#bbb',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    fontSize: 17,
                    color: '#222',
                    width: '100%',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                  returnKeyType="search"
                />
              </View>
              {hierarchy.length === 0 ? (
                <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                  Inga projekt eller mappar ännu.
                </Text>
              ) : (
                <View>
                  {/* Här kan du rendera din projekt-/grupp-lista */}
                  {/* Exempel: FlatList eller map() över hierarchy */}
                </View>
              )}
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}
        {/* Plats för modaler och InfoPopup */}
        {/*
          <Modal visible={showNewProjectModal} ... >...</Modal>
          <InfoPopup ... />
        */}



