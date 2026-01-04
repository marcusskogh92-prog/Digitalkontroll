import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { saveControlToFirestore, saveDraftToFirestore, saveHierarchy } from '../components/firebase';

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
        const raw = await AsyncStorage.getItem('hierarchy_local');
        if (!raw) {
          setStatus('synced');
          if (onStatus) onStatus('synced');
          return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
          // nothing to sync
          await AsyncStorage.removeItem('hierarchy_local');
          setStatus('synced');
          if (onStatus) onStatus('synced');
          return;
        }
        // attempt sync with retries/backoff
        setStatus('syncing');
        if (onStatus) onStatus('syncing');
        let ok = false;
        attemptsRef.current = 0;
        while (attemptsRef.current < 5 && !ok) {
          attemptsRef.current += 1;
          try {
            const res = await saveHierarchy(companyId, parsed);
            ok = res === true || (res && res.ok === true);
            if (ok) break;
          } catch (e) {
            // ignore, will backoff
          }
          // exponential backoff
          const waitMs = Math.min(30000, 500 * Math.pow(2, attemptsRef.current));
          await new Promise(r => backoffTimer.current = setTimeout(r, waitMs));
        }
        if (ok) {
          try { await AsyncStorage.removeItem('hierarchy_local'); } catch (e) {}
          setStatus('synced');
          if (onStatus) onStatus('synced');
        } else {
          setStatus('error');
          if (onStatus) onStatus('error');
        }
        // Additionally attempt to sync any locally stored controls (completed and drafts)
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
                } catch (e) {
                  remaining.push(ctl);
                }
              }
              if (remaining.length === 0) {
                try { await AsyncStorage.removeItem('completed_controls'); } catch (e) {}
              } else {
                try { await AsyncStorage.setItem('completed_controls', JSON.stringify(remaining)); } catch (e) {}
              }
            }
          }
        } catch (e) {}
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
                } catch (e) {
                  remainingDrafts.push(d);
                }
              }
              if (remainingDrafts.length === 0) {
                try { await AsyncStorage.removeItem('draft_controls'); } catch (e) {}
              } else {
                try { await AsyncStorage.setItem('draft_controls', JSON.stringify(remainingDrafts)); } catch (e) {}
              }
            }
          }
        } catch (e) {}
      } catch (err) {
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
