import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  ArbetsberedningControl,
  EgenkontrollControl,
  FuktmätningControl,
  RiskbedömningControl,
  SkyddsrondControl,
  MottagningskontrollControl,
} from '../components/controls';

// Kontrolltyper med metadata
const CONTROL_TYPES = [
  {
    key: 'arbetsberedning',
    name: 'Arbetsberedning',
    icon: 'construct-outline',
    color: '#1976D2',
    category: 'Kvalitet',
    component: ArbetsberedningControl,
  },
  {
    key: 'egenkontroll',
    name: 'Egenkontroll',
    icon: 'checkmark-circle-outline',
    color: '#43A047',
    category: 'Kvalitet',
    component: EgenkontrollControl,
  },
  {
    key: 'mottagningskontroll',
    name: 'Mottagningskontroll',
    icon: 'checkbox-outline',
    color: '#7B1FA2',
    category: 'Kvalitet',
    component: MottagningskontrollControl,
  },
  {
    key: 'fuktmätning',
    name: 'Fuktmätning',
    icon: 'water-outline',
    color: '#0288D1',
    category: 'Miljö',
    component: FuktmätningControl,
  },
  {
    key: 'riskbedömning',
    name: 'Riskbedömning',
    icon: 'warning-outline',
    color: '#F57C00',
    category: 'Arbetsmiljö',
    component: RiskbedömningControl,
  },
  {
    key: 'skyddsrond',
    name: 'Skyddsrond',
    icon: 'shield-checkmark-outline',
    color: '#D32F2F',
    category: 'Arbetsmiljö',
    component: SkyddsrondControl,
  },
];

export default function KMAScreen({ project: projectProp, controlType: controlTypeProp, initialValues: initialValuesProp, date: dateProp, participants: participantsProp, onExit, onFinished }) {
  const route = useRoute();
  const navigation = useNavigation();
  const project = projectProp ?? route.params?.project;
  const initialControlType = controlTypeProp ?? route.params?.controlType;
  const initialValues = initialValuesProp ?? route.params?.initialValues;
  const date = dateProp ?? route.params?.date;
  const participants = participantsProp ?? route.params?.participants ?? [];

  const [selectedControlType, setSelectedControlType] = useState(initialControlType || null);

  // Om en specifik kontrolltyp är vald, visa den direkt
  if (selectedControlType) {
    const controlType = CONTROL_TYPES.find(ct => ct.key === selectedControlType);
    if (controlType) {
      const ControlComponent = controlType.component;
      return (
        <ControlComponent
          project={project}
          date={date}
          participants={participants}
          initialValues={initialValues}
          onExit={() => {
            if (onExit) {
              onExit();
            } else if (initialControlType) {
              // Om vi kom hit med en specifik typ, gå tillbaka
              navigation.goBack();
            } else {
              // Annars visa lista igen
              setSelectedControlType(null);
            }
          }}
          onFinished={(data) => {
            if (onFinished) {
              onFinished(data);
            } else {
              navigation.goBack();
            }
          }}
        />
      );
    }
  }

  // Gruppera kontrolltyper per kategori
  const controlsByCategory = CONTROL_TYPES.reduce((acc, control) => {
    const category = control.category || 'Övrigt';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(control);
    return acc;
  }, {});

  const categories = Object.keys(controlsByCategory);

  const handleSelectControl = (controlKey) => {
    if (Platform.OS === 'web') {
      // På web: öppna inline
      setSelectedControlType(controlKey);
    } else {
      // På native: navigera till kontrollen
      navigation.navigate('KMAScreen', {
        project,
        controlType: controlKey,
        initialValues,
      });
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#222' }}>
          KMA - Kontroller
        </Text>
        <Text style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
          Välj typ av kontroll att skapa eller redigera
        </Text>

        {categories.map((category) => (
          <View key={category} style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222' }}>
              {category}
            </Text>
            {controlsByCategory[category].map((control) => (
              <TouchableOpacity
                key={control.key}
                onPress={() => handleSelectControl(control.key)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 2,
                }}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: control.color + '20',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 16,
                  }}
                >
                  <Ionicons name={control.icon} size={24} color={control.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#222' }}>
                    {control.name}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
