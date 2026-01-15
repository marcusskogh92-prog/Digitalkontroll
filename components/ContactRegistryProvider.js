import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

import ContactRegistryModal from './ContactRegistryModal';
import { auth, fetchCompanyProfile } from './firebase';

const ContactRegistryContext = React.createContext({
  openContactRegistry: async (_opts) => {},
  closeContactRegistry: () => {},
});

async function resolveActiveCompanyId() {
  // Try claims first, then AsyncStorage, then window.localStorage.
  try {
    const tokenRes = await auth?.currentUser?.getIdTokenResult?.(true).catch(() => null);
    const claims = tokenRes?.claims || {};
    const fromClaims = String(claims?.companyId || '').trim();
    if (fromClaims) return fromClaims;
  } catch (_e) {}

  try {
    const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
    if (stored) return stored;
  } catch (_e) {}

  if (Platform.OS === 'web') {
    try {
      const fromLs = String(window?.localStorage?.getItem?.('dk_companyId') || '').trim();
      if (fromLs) return fromLs;
    } catch (_e) {}
  }

  return '';
}

export function ContactRegistryProvider({ children }) {
  const [visible, setVisible] = React.useState(false);
  const [companyId, setCompanyId] = React.useState('');
  const [companyName, setCompanyName] = React.useState('');
  const [allCompanies, setAllCompanies] = React.useState(false);

  const closeContactRegistry = React.useCallback(() => {
    setVisible(false);
  }, []);

  const openContactRegistry = React.useCallback(async (opts = {}) => {
    const wantsAll = !!opts?.allCompanies;
    setAllCompanies(wantsAll);

    if (wantsAll) {
      setCompanyId('__all__');
      setCompanyName('Alla företag');
      setVisible(true);
      return;
    }

    const overrideCompanyId = String(opts?.companyId || '').trim();
    const overrideCompanyName = String(opts?.companyName || '').trim();

    let cid = overrideCompanyId;
    if (!cid) cid = await resolveActiveCompanyId();

    setCompanyId(cid);

    if (overrideCompanyName) {
      setCompanyName(overrideCompanyName);
    } else if (cid) {
      try {
        const profile = await fetchCompanyProfile(cid);
        const name = String(profile?.companyName || profile?.name || '').trim();
        setCompanyName(name || cid);
      } catch (_e) {
        setCompanyName(cid);
      }
    } else {
      setCompanyName('');
    }

    setVisible(true);
  }, []);

  const value = React.useMemo(() => ({ openContactRegistry, closeContactRegistry }), [openContactRegistry, closeContactRegistry]);

  return (
    <ContactRegistryContext.Provider value={value}>
      {children}
      <ContactRegistryModal
        visible={visible}
        onClose={closeContactRegistry}
        companyId={companyId}
        companyName={companyName}
        allCompanies={allCompanies}
      />
    </ContactRegistryContext.Provider>
  );
}

export function useContactRegistry() {
  return React.useContext(ContactRegistryContext);
}

export function ContactRegistryHeaderButton({ companyId: routeCompanyId }) {
  const { openContactRegistry } = useContactRegistry();
  const isWeb = Platform.OS === 'web';

  return (
    <TouchableOpacity
      onPress={() => openContactRegistry({ companyId: String(routeCompanyId || '').trim() })}
      accessibilityLabel="Öppna kontaktregister"
      style={{
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#222',
        paddingVertical: 8,
        paddingHorizontal: isWeb ? 12 : 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="book-outline" size={14} color="#fff" />
      </View>
      {isWeb ? (
        <Text style={{ color: '#222', fontWeight: '800', fontSize: 13 }}>Kontaktregister</Text>
      ) : null}
    </TouchableOpacity>
  );
}
