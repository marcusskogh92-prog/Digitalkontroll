import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';

// Centraliserar logik för SharePoint-anslutning och aktiv mapp i HomeScreen
// utan att ändra beteende. Används för att driva ikonen i headern och
// (potentiellt) visa vilken SharePoint-mapp som är aktiv.
export function useSharePointStatus({ companyId, searchSpinAnim }) {
  const [activeFolderPath, setActiveFolderPath] = useState(null);
  const [sharePointStatus, setSharePointStatus] = useState({
    connected: false,
    checking: true,
    error: null,
    siteId: null,
    siteUrl: null,
    siteName: null,
  });

  // Lyssna på globala events från vänsterpanelen för att veta vilken mapp som är aktiv
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleFolderSelected = (event) => {
      try {
        const detail = event?.detail || {};
        if (detail.folderPath) {
          setActiveFolderPath(detail.folderPath);
        }
      } catch (_e) {}
    };

    window.addEventListener('dkFolderSelected', handleFolderSelected);
    return () => {
      try {
        window.removeEventListener('dkFolderSelected', handleFolderSelected);
      } catch (_e) {}
    };
  }, []);

  // Mappar SharePoint-mappnamn till färger (används för att färgkoda faser)
  const getFolderColor = useCallback((folderName) => {
    if (!folderName) return '#1976D2'; // Default blue
    const name = String(folderName).toLowerCase();
    if (name.includes('kalkyl')) return '#1976D2'; // Blue
    if (name.includes('produktion')) return '#43A047'; // Green
    if (name.includes('avslut')) return '#616161'; // Gray
    if (name.includes('eftermarknad')) return '#7B1FA2'; // Purple
    return '#1976D2'; // Default
  }, []);

  // Hämtar sista delen av sökvägen som användarvänligt mappnamn
  const getActiveFolderName = useCallback(() => {
    if (!activeFolderPath) return null;
    try {
      const parts = activeFolderPath.split('/');
      return parts[parts.length - 1] || activeFolderPath;
    } catch (_e) {
      return activeFolderPath;
    }
  }, [activeFolderPath]);

  // Kolla SharePoint-anslutning och animera ikon i headern
  useEffect(() => {
    if (!companyId) {
      setSharePointStatus({
        connected: false,
        checking: false,
        error: null,
        siteId: null,
        siteUrl: null,
        siteName: null,
      });
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setSharePointStatus((prev) => ({ ...prev, checking: true }));

        // Ladda checkSharePointConnection dynamiskt (samma mönster som övriga hierarchyService-anrop)
        const { checkSharePointConnection } = await import('../services/azure/hierarchyService');
        const connectionStatus = await checkSharePointConnection(companyId);
        if (!mounted) return;

        setSharePointStatus({
          connected: connectionStatus.connected,
          checking: false,
          error: connectionStatus.error,
          siteId: connectionStatus.siteId,
          siteUrl: connectionStatus.siteUrl,
          siteName: connectionStatus.siteName,
        });

        // Starta pulserande animation på ikonen beroende på status
        const isConnected = connectionStatus.connected;
        const duration = isConnected ? 1500 : 1000;
        try {
          Animated.loop(
            Animated.sequence([
              Animated.timing(searchSpinAnim, {
                toValue: 1,
                duration,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
              Animated.timing(searchSpinAnim, {
                toValue: 0,
                duration,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
            ]),
          ).start();
        } catch (_e) {}
      } catch (error) {
        if (!mounted) return;
        setSharePointStatus({
          connected: false,
          checking: false,
          error: error?.message || 'Okänt fel',
          siteId: null,
          siteUrl: null,
          siteName: null,
        });

        // Röd pulserande animation vid fel
        try {
          Animated.loop(
            Animated.sequence([
              Animated.timing(searchSpinAnim, {
                toValue: 1,
                duration: 1000,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
              Animated.timing(searchSpinAnim, {
                toValue: 0,
                duration: 1000,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
            ]),
          ).start();
        } catch (_e) {}
      }
    })();

    return () => {
      mounted = false;
    };
  }, [companyId, searchSpinAnim]);

  return {
    activeFolderPath,
    sharePointStatus,
    getFolderColor,
    getActiveFolderName,
  };
}
