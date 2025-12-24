import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { saveHierarchy } from '../components/firebase';

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
