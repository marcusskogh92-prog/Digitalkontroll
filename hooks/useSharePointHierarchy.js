import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import { auth, fetchUserProfile } from '../components/firebase';
import { getSharePointHierarchy } from '../services/azure/hierarchyService';

/**
 * Laddar SharePoint-hierarkin (mappar/projekt) för ett företag.
 *
 * - Löser companyId från state, route, AsyncStorage och auth-claims.
 * - Hämtar hela hierarkin från SharePoint (getSharePointHierarchy).
 * - Håller en ref (hierarchyRef) i sync för sökningar/effekter.
 */
export function useSharePointHierarchy({ companyId, setCompanyId, routeCompanyId, authClaims, route, reloadKey }) {
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [hierarchy, setHierarchy] = useState([]);
  const hierarchyRef = useRef([]);

  const didInitialLoadRef = useRef(false);
  const loadedHierarchyForCompanyRef = useRef(null);

  // Håll ref i sync med aktuell hierarki
  useEffect(() => {
    try {
      hierarchyRef.current = hierarchy;
    } catch (_e) {}
  }, [hierarchy]);

  // Ladda hierarchy från SharePoint när vi har ett companyId (route/stored/claims)
  // Viktigt på web: claims kommer ofta in efter första render, så vi måste re-run.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Resolve company id robustly (order matters):
      // 1) explicit state/route
      // 2) persisted selection (dk_companyId)
      // 3) auth claims
      let cid = String(companyId || routeCompanyId || '').trim();

      if (!cid) {
        try {
          const stored = await AsyncStorage.getItem('dk_companyId');
          const storedTrim = String(stored || '').trim();
          if (storedTrim) {
            cid = storedTrim;
            try { setCompanyId?.(cid); } catch (_e) {}
          }
        } catch (_e) {}
      }

      // Legacy: try user profile by uid if present
      if (!cid && route?.params?.uid) {
        try {
          const userProfile = await fetchUserProfile(route.params.uid).catch(() => null);
          const profCid = String(userProfile?.companyId || '').trim();
          if (profCid) {
            cid = profCid;
            try { setCompanyId?.(cid); } catch (_e) {}
          }
        } catch (_e) {}
      }

      if (!cid) {
        const fromClaims = String(authClaims?.companyId || '').trim();
        if (fromClaims) {
          cid = fromClaims;
          try { setCompanyId?.(cid); } catch (_e) {}
        }
      }

      if (!cid) {
        // Sista fallback: försök läsa från auth.currentUser profil om det finns
        try {
          const user = auth?.currentUser;
          if (user?.uid && !route?.params?.uid) {
            const profile = await fetchUserProfile(user.uid).catch(() => null);
            const profCid = String(profile?.companyId || '').trim();
            if (profCid) {
              cid = profCid;
              try { setCompanyId?.(cid); } catch (_e) {}
            }
          }
        } catch (_e) {}
      }

      if (!cid) {
        setLoadingHierarchy(false);
        return;
      }

      // Track companyId + reloadKey to control reloads
      const hierarchyKey = `${cid}|${reloadKey || 0}`;
      if (didInitialLoadRef.current && loadedHierarchyForCompanyRef.current === hierarchyKey) {
        setLoadingHierarchy(false);
        return;
      }
      loadedHierarchyForCompanyRef.current = hierarchyKey;

      if (cancelled) return;
      setLoadingHierarchy(true);

      // Load ALL root folders from SharePoint - SharePoint is the single source of truth
      // No Firestore fallback - SharePoint is required
      try {
        const sharePointFolders = await getSharePointHierarchy(cid, null);

        if (cancelled) return;

        // Use SharePoint folders directly - no adapter, no Firestore
        setHierarchy(Array.isArray(sharePointFolders) ? sharePointFolders : []);
        console.log(`[useSharePointHierarchy]  Loaded ${sharePointFolders?.length || 0} SharePoint folders for company: ${cid}`);
      } catch (error) {
        console.error('[useSharePointHierarchy] Error fetching SharePoint hierarchy:', error);
        if (cancelled) return;
        // SharePoint is required - show empty if connection fails
        setHierarchy([]);
      }

      setLoadingHierarchy(false);
      // mark that initial load completed to avoid initial empty save overwriting server
      didInitialLoadRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, routeCompanyId, authClaims?.companyId, route?.params?.uid, reloadKey]);

  return {
    loadingHierarchy,
    hierarchy,
    setHierarchy,
    hierarchyRef,
  };
}
