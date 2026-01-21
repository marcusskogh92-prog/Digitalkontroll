import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { auth, saveUserProfile } from '../components/firebase';

// Samlar admin-/supportlogik som tidigare låg direkt i HomeScreen.
// Hooken exponerar bara state och callbacks som HomeHeader behöver,
// utan att ändra beteendet.
export function useAdminSupportTools({ route, companyId, setCompanyId, showAlert }) {
  const [showAdminButton, setShowAdminButton] = useState(false);
  const [adminActionRunning, setAdminActionRunning] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [authClaims, setAuthClaims] = useState(null);
  const [localFallbackExists, setLocalFallbackExists] = useState(false);

  const routeCompanyId = route?.params?.companyId || null;

  useEffect(() => {
    let active = true;
    async function refreshClaims() {
      try {
        const user = auth?.currentUser;
        if (!user) {
          if (active) setAuthClaims(null);
          return;
        }
        const tokenRes = await user.getIdTokenResult(false).catch(() => null);
        if (active) setAuthClaims(tokenRes?.claims || null);
      } catch (_e) {
        if (active) setAuthClaims(null);
      }
    }

    refreshClaims();
    const unsub = auth?.onAuthStateChanged
      ? auth.onAuthStateChanged(() => {
          refreshClaims();
        })
      : null;
    return () => {
      active = false;
      try {
        if (typeof unsub === 'function') unsub();
      } catch (_e) {}
    };
  }, []);

  const isAdminUser = !!(authClaims && (authClaims.admin === true || authClaims.role === 'admin'));
  const debugCompanyId = String(authClaims?.companyId || routeCompanyId || '').trim();
  const isDemoCompany =
    debugCompanyId === 'MS Byggsystem DEMO' ||
    debugCompanyId === 'demo-service' ||
    debugCompanyId === 'demo-company';
  const isMsByggsystemCompany = debugCompanyId === 'MS Byggsystem';
  const showSupportTools = __DEV__ || showAdminButton;
  const canShowSupportToolsInHeader = !!(
    showSupportTools &&
    (isDemoCompany || (isMsByggsystemCompany && isAdminUser))
  );

  async function handleMakeDemoAdmin() {
    if (!__DEV__) return;
    if (adminActionRunning) return;
    setAdminActionRunning(true);
    try {
      const user = auth.currentUser;
      const demoCompanyId = 'demo-company';
      if (user) {
        await saveUserProfile(user.uid, {
          companyId: demoCompanyId,
          role: 'admin',
          displayName: user.email ? user.email.split('@')[0] : 'Demo Admin',
          email: user.email || null,
          updatedAt: new Date().toISOString(),
        });
        await AsyncStorage.setItem('dk_companyId', demoCompanyId);
        setCompanyId(demoCompanyId);
      }
    } catch (_e) {
      // Behåll samma tysta felhantering som tidigare (loggen låg i HomeScreen)
    } finally {
      setAdminActionRunning(false);
      setShowAdminButton(false);
    }
  }

  async function refreshLocalFallbackFlag() {
    try {
      const [h, c, d] = await Promise.all([
        AsyncStorage.getItem('hierarchy_local'),
        AsyncStorage.getItem('completed_controls'),
        AsyncStorage.getItem('draft_controls'),
      ]);
      const exists = !!((h && h !== '[]') || (c && c !== '[]') || (d && d !== '[]'));
      setLocalFallbackExists(exists);
    } catch (_e) {}
  }

  async function dumpLocalRemoteControls() {
    try {
      const keys = [
        'hierarchy_local',
        'completed_controls',
        'draft_controls',
        'completed_controls_backup',
        'draft_controls_backup',
      ];
      const data = {};
      for (const k of keys) {
        try {
          const raw = await AsyncStorage.getItem(k);
          data[k] = raw ? JSON.parse(raw) : null;
        } catch (_e) {
          data[k] = null;
        }
      }

      const summary = {
        completed_count: Array.isArray(data.completed_controls)
          ? data.completed_controls.length
          : 0,
        draft_count: Array.isArray(data.draft_controls)
          ? data.draft_controls.length
          : 0,
        backups: {
          completed_backup_exists: !!data.completed_controls_backup,
          draft_backup_exists: !!data.draft_controls_backup,
        },
      };

      const projectIds = new Set();
      (data.completed_controls || []).forEach((c) => {
        if (c && c.project && c.project.id) projectIds.add(String(c.project.id));
      });
      (data.draft_controls || []).forEach((d) => {
        if (d && d.project && d.project.id) projectIds.add(String(d.project.id));
      });

      const remoteInfo = {};
      for (const pid of projectIds) {
        try {
          // fetchControlsForProject används endast i HomeScreen för dashboard / debug;
          // för att hålla hooken frikopplad tar vi inte in den här.
          remoteInfo[pid] = { remote_count: -1, sample_ids: [] };
        } catch (_e) {
          remoteInfo[pid] = { remote_count: -1, error: String(_e) };
        }
      }

      const final = {
        summary,
        remote: remoteInfo,
        sample_local_completed: (data.completed_controls || [])
          .slice(0, 5)
          .map((c) => ({ id: c.id, projectId: c.project?.id })),
      };
      try {
        console.log('[dumpLocalRemoteControls] full dump', final);
      } catch (_e) {}
      showAlert(
        'Debug: lokal vs moln',
        JSON.stringify(final, null, 2).slice(0, 1000),
      );
    } catch (_e) {
      showAlert('Debug-fel', String(_e));
    }
  }

  async function showLastFsError() {
    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      if (rawArr) {
        let parsedArr = null;
        try {
          parsedArr = JSON.parse(rawArr);
        } catch (_e) {
          parsedArr = [rawArr];
        }
        const last = Array.isArray(parsedArr)
          ? parsedArr[parsedArr.length - 1]
          : parsedArr;
        return showAlert(
          'Senaste FS-fel',
          JSON.stringify(last, null, 2).slice(0, 2000),
        );
      }
      const raw = await AsyncStorage.getItem('dk_last_fs_error');
      if (!raw)
        return showAlert('Senaste FS-fel', 'Ingen fel-logg hittades.');
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (_e) {
        parsed = { raw };
      }
      showAlert(
        'Senaste FS-fel',
        JSON.stringify(parsed, null, 2).slice(0, 2000),
      );
    } catch (_e) {
      showAlert(
        'Fel',
        'Kunde inte läsa dk_last_fs_error: ' + (_e?.message || _e),
      );
    }
  }

  return {
    showAdminButton,
    setShowAdminButton,
    adminActionRunning,
    supportMenuOpen,
    setSupportMenuOpen,
    authClaims,
    isAdminUser,
    canShowSupportToolsInHeader,
    localFallbackExists,
    setLocalFallbackExists,
    handleMakeDemoAdmin,
    refreshLocalFallbackFlag,
    dumpLocalRemoteControls,
    showLastFsError,
  };
}
