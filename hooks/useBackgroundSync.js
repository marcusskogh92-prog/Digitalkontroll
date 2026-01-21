import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { saveControlToFirestore, saveDraftToFirestore } from '../components/firebase';

export default function useBackgroundSync(companyId, opts = {}) {
  const { onStatus } = opts;
  const [status, setStatus] = useState('idle'); // idle | pending | syncing | synced | error | offline
  const attemptsRef = useRef(0);
  const backoffTimer = useRef(null);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = !!(state.isConnected && (state.isInternetReachable ?? true));
      if (!mounted) return;
      if (!online) {
        setStatus('offline');
        if (onStatus) onStatus('offline');
        return;
      }
      // online -> try to sync
      try {
        // För hierarkin används nu SharePoint som källa; hoppa över hierarchy_local-sync
        setStatus('syncing');
        if (onStatus) onStatus('syncing');

        // Försök istället bara synka lokala kontroller (utförda och utkast)
        try {
          // Sync completed controls
          const rawCompleted = await AsyncStorage.getItem('completed_controls');
          if (rawCompleted) {
            let completedArr = JSON.parse(rawCompleted) || [];
            if (Array.isArray(completedArr) && completedArr.length > 0) {
              const remaining = [];
              for (const ctl of completedArr) {
                try {
                  const res = await saveControlToFirestore(ctl);
                  if (!res) remaining.push(ctl);
                } catch(_e) {
                  remaining.push(ctl);
                }
              }
              if (remaining.length === 0) {
                try { await AsyncStorage.removeItem('completed_controls'); } catch(_e) {}
              } else {
                try { await AsyncStorage.setItem('completed_controls', JSON.stringify(remaining)); } catch(_e) {}
              }
            }
          }
        } catch(_e) {}
        try {
          // Sync draft controls
          const rawDrafts = await AsyncStorage.getItem('draft_controls');
          if (rawDrafts) {
            let draftArr = JSON.parse(rawDrafts) || [];
            if (Array.isArray(draftArr) && draftArr.length > 0) {
              const remainingDrafts = [];
              for (const d of draftArr) {
                try {
                  const res = await saveDraftToFirestore(d);
                  if (!res) remainingDrafts.push(d);
                } catch(_e) {
                  remainingDrafts.push(d);
                }
              }
              if (remainingDrafts.length === 0) {
                try { await AsyncStorage.removeItem('draft_controls'); } catch(_e) {}
              } else {
                try { await AsyncStorage.setItem('draft_controls', JSON.stringify(remainingDrafts)); } catch(_e) {}
              }
            }
          }
        } catch(_e) {}
        } catch(_e) {
        setStatus('error');
        if (onStatus) onStatus('error');
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      if (backoffTimer.current) clearTimeout(backoffTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return { status };
}
