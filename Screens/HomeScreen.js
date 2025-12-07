
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ImageBackground, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
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
          {/* Rubrik ovanför knappar */}
          <Text style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 18, color: '#263238' }}>
            Skapa ny kontroll
          </Text>
          {/* Knappar för kontroller */}
          {[
            { label: 'Arbetsberedning', icon: <Ionicons name="construct-outline" size={26} color="#1976D2" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('ArbetsberedningScreen') */} },
            { label: 'Egenkontroll', icon: <Ionicons name="checkmark-done-outline" size={26} color="#388E3C" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('EgenkontrollScreen') */} },
            { label: 'Fuktmätning', icon: <Ionicons name="water-outline" size={26} color="#0288D1" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('FuktmatningScreen') */} },
            { label: 'Riskbedömning', icon: <Ionicons name="alert-circle-outline" size={26} color="#F9A825" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('RiskbedomningScreen') */} },
            { label: 'Skyddsrond', icon: <Ionicons name="shield-checkmark-outline" size={26} color="#D32F2F" style={{ marginRight: 16 }} />, onPress: () => navigation.navigate('SkyddsrondScreen') },
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
                maxWidth: 240,
                width: '90%',
                paddingLeft: 14,
                paddingRight: 10,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: '#222',
              }}
              activeOpacity={0.85}
              onPress={btn.onPress}
            >
              {btn.icon}
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
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



