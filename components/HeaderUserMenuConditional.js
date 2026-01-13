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
        const user = auth?.currentUser;
        const emailLower = String(user?.email || '').toLowerCase();
        const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';

        let tokenRes = null;
        try { tokenRes = await user?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));

        const allow = !!(isEmailSuperadmin || isSuperClaim || isAdminClaim);
        if (mounted) setAllowed(allow);
        return;
      } catch(_e) {}
      if (mounted) setAllowed(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (!allowed) return null;
  return <HeaderUserMenu />;
}
