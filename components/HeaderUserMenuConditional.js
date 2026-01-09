import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import HeaderUserMenu from './HeaderUserMenu';
import { auth } from './firebase';

export default function HeaderUserMenuConditional() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        if (email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se') {
          if (mounted) setAllowed(true);
          return;
        }
        // try claims
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const companyId = companyFromClaims || stored || '';
        if (companyId === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) setAllowed(true);
          return;
        }
      } catch(_e) {}
      if (mounted) setAllowed(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (!allowed) return null;
  return <HeaderUserMenu />;
}
