import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { auth } from './firebase';
import { formatPersonName } from './formatPersonName';

export default function HeaderDisplayName({ style }) {
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    const setFromUser = (user) => {
      try {
        const raw = user ? (user.displayName || user.email || '') : '';
        const name = formatPersonName(raw);
        if (mounted) setDisplayName(name);
      } catch (_e) {}
    };
    try {
      const user = auth?.currentUser;
      setFromUser(user);
    } catch (_e) {}
    let unsub = null;
    try {
      unsub = auth.onAuthStateChanged((u) => setFromUser(u));
    } catch (_e) { unsub = null; }
    return () => { mounted = false; try { if (typeof unsub === 'function') unsub(); } catch(_e) {} };
  }, []);

  if (Platform.OS !== 'web') return null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#4caf50', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Ionicons name="person" size={16} color="#fff" />
      </View>
      <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
    </View>
  );
}
