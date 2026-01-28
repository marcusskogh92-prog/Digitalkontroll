import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { auth, fetchUserProfile, logCompanyActivity, upsertCompanyMember } from '../components/firebase';

/**
 * Hanterar användarrelaterad aktivitet i Home:
 * - Loggar inloggnings-activity (throttlad)
 * - Ser till att användaren finns i company members-katalogen
 */
export function useHomeUserActivity({ companyId, routeCompanyId, authClaims }) {
  // Logga login-event så andra kan se vem som loggat in
  React.useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    const user = auth?.currentUser;
    if (!cid) return;
    if (!user?.uid && !user?.email) return;

    let cancelled = false;
    (async () => {
      try {
        const idPart = user?.uid || user?.email || 'unknown';
        const throttleKey = `dk_last_login_activity:${cid}:${idPart}`;
        const last = await AsyncStorage.getItem(throttleKey);
        if (last) {
          const lastMs = new Date(last).getTime() || 0;
          if (lastMs && (Date.now() - lastMs) < 5 * 60 * 1000) return;
        }
        const ok = await logCompanyActivity({
          type: 'login',
          uid: user?.uid || null,
          email: user?.email || null,
          displayName: user?.displayName || null,
        }, cid);
        if (!ok) return;
        if (cancelled) return;
        await AsyncStorage.setItem(throttleKey, new Date().toISOString());
      } catch(_e) {}
    })();

    return () => { cancelled = true; };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  // Se till att nuvarande användare finns i company members-katalogen
  React.useEffect(() => {
    if (!companyId) return;
    if (!auth?.currentUser?.uid) return;
    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user?.uid) return;
        const profile = await fetchUserProfile(user.uid).catch(() => null);
        const displayName = profile?.displayName || profile?.name || (user.email ? String(user.email).split('@')[0] : null);
        const role = profile?.role || null;
        await upsertCompanyMember({
          companyId: routeCompanyId || null,
          uid: user.uid,
          displayName,
          email: user.email || null,
          role,
        });
      } catch(_e) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, auth?.currentUser?.uid]);
}
