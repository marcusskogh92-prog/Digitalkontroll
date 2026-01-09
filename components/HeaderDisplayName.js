import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { auth } from './firebase';
import { formatPersonName } from './formatPersonName';

export default function HeaderDisplayName({ style }) {
  const [displayName, setDisplayName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');

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
    const refreshRole = async () => {
      try {
        const user = auth?.currentUser;
        if (!user || !user.getIdTokenResult) {
          if (mounted) setRoleLabel('');
          return;
        }
        let tokenRes = null;
        try { tokenRes = await user.getIdTokenResult(false).catch(() => null); } catch (_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const emailLower = String(user.email || '').toLowerCase();
        const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';
        const isSuperadmin = !!(claims.superadmin === true || claims.role === 'superadmin' || isEmailSuperadmin);
        const isAdmin = !!(claims.admin === true || claims.role === 'admin');
        let label = '';
        if (isSuperadmin) label = 'Superadmin';
        else if (isAdmin) label = 'Admin';
        else label = 'Användare';
        if (mounted) setRoleLabel(label);
      } catch (_e) {
        if (mounted) setRoleLabel('');
      }
    };

    refreshRole();
    let unsub = null;
    try {
      unsub = auth.onAuthStateChanged((u) => { setFromUser(u); refreshRole(); });
    } catch (_e) { unsub = null; }
    return () => { mounted = false; try { if (typeof unsub === 'function') unsub(); } catch(_e) {} };
  }, []);

  if (Platform.OS !== 'web') return null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#4caf50', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Ionicons name="person" size={16} color="#fff" />
      </View>
      <View style={{ flexDirection: 'column' }}>
        <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
        {!!roleLabel && (
          <Text style={{ fontSize: 12, color: '#607D8B', marginTop: 2 }}>{roleLabel}</Text>
        )}
      </View>
    </View>
  );
}
