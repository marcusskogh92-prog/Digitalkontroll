import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { LOGIN_CARD_STYLE } from '../constants/backgroundTheme';
import { auth, fetchCompanyProfile, fetchUserProfile, signInEmailPassword, signInWithCustomToken, ssoEntraLoginCallable } from '../components/firebase';
import { clearSSOStorage, exchangeCodeForSSOIdToken, getSSOCallbackParams, startSSOLogin } from '../services/azure/authService';

/** Animerad laddningsindikator för inloggning: pulserande ikon + studsande prickar */
function LoginLoadingAnimation() {
  const iconScale = useRef(new Animated.Value(1)).current;
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const useNative = Platform.OS !== 'web';

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconScale, {
          toValue: 1.12,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: useNative,
        }),
        Animated.timing(iconScale, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: useNative,
        }),
      ])
    );
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(dot0, { toValue: -10, duration: 100, useNativeDriver: useNative }),
        Animated.timing(dot0, { toValue: 0, duration: 100, useNativeDriver: useNative }),
        Animated.timing(dot1, { toValue: -10, duration: 100, useNativeDriver: useNative }),
        Animated.timing(dot1, { toValue: 0, duration: 100, useNativeDriver: useNative }),
        Animated.timing(dot2, { toValue: -10, duration: 100, useNativeDriver: useNative }),
        Animated.timing(dot2, { toValue: 0, duration: 100, useNativeDriver: useNative }),
        Animated.delay(120),
      ])
    );
    pulse.start();
    bounce.start();
    return () => {
      pulse.stop();
      bounce.stop();
    };
  }, [iconScale, dot0, dot1, dot2, useNative]);

  return (
    <View style={loginLoadingStyles.wrap}>
      <Animated.View style={[loginLoadingStyles.iconWrap, { transform: [{ scale: iconScale }] }]}>
        <Ionicons name="lock-open-outline" size={44} color="#263238" />
      </Animated.View>
      <View style={loginLoadingStyles.dotsRow}>
        <Animated.View style={[loginLoadingStyles.dot, { transform: [{ translateY: dot0 }] }]} />
        <Animated.View style={[loginLoadingStyles.dot, { transform: [{ translateY: dot1 }] }]} />
        <Animated.View style={[loginLoadingStyles.dot, { transform: [{ translateY: dot2 }] }]} />
      </View>
    </View>
  );
}

const loginLoadingStyles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  iconWrap: { marginBottom: 16 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#263238',
  },
});

export default function LoginScreen() {
  const navigation = useNavigation();
  // Toggle this to `true` only for fast local development. Leave `false` for real login flow.
  const DEV_BYPASS = false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loginOverlayAnim = useRef(new Animated.Value(0)).current;
  const [autoHandled, setAutoHandled] = useState(false);
  const isEmailValid = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  const isFormValid = isEmailValid(email.trim()) && password.length > 0;
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [rememberMe, setRememberMe] = useState(false);

  const isCompanyEnabled = (profile) => {
    if (!profile) return true;
    if (profile.deleted) return false;
    if (typeof profile.enabled === 'boolean') return profile.enabled;
    if (typeof profile.active === 'boolean') return profile.active;
    return true;
  };

  const checkCompanyAccessForUser = async (user) => {
    try {
      if (!user) return { allowed: false, companyId: null };
      const profile = await fetchUserProfile(user.uid).catch(() => null);
      const companyId = profile?.companyId || null;
      if (!companyId) return { allowed: true, companyId: null };
      const companyProfile = await fetchCompanyProfile(companyId).catch(() => null);
      const enabled = isCompanyEnabled(companyProfile || {});
      return { allowed: !!enabled, companyId };
    } catch (e) {
      // Vid fel, tillåt inloggning men logga till konsol
      console.log('[Login] checkCompanyAccessForUser error', e?.message || e);
      return { allowed: true, companyId: null };
    }
  };

  // Load saved email if user previously chose to be remembered
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('dk_saved_email');
        if (saved) {
          setEmail(saved);
          setRememberMe(true);
        }
      } catch(_e) {}
    })();
  }, []);

  // Animerad overlay när loading är true (fade + kort scale)
  useEffect(() => {
    if (loading) {
      loginOverlayAnim.setValue(0);
      Animated.timing(loginOverlayAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      loginOverlayAnim.setValue(0);
    }
  }, [loading]);

  // SSO callback: om vi landat med code + state (efter "Logga in med Microsoft-konto") – byt code mot id_token, hämta custom token, logga in
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = getSSOCallbackParams();
    if (!params) return;
    let cancelled = false;
    (async () => {
      setLoadingMessage('Loggar in med Microsoft-konto…');
      setLoading(true);
      setError('');
      try {
        const idToken = await exchangeCodeForSSOIdToken(params.code, params.codeVerifier);
        if (cancelled) return;
        const { data } = await ssoEntraLoginCallable({ idToken });
        if (cancelled) return;
        if (!data || !data.customToken) throw new Error('Ingen custom token från servern.');
        await signInWithCustomToken(auth, data.customToken);
        if (cancelled) return;
        setAutoHandled(true);
        if (typeof window !== 'undefined' && window.history) {
          const url = new URL(window.location.href);
          url.hash = '';
          url.search = '';
          window.history.replaceState({}, '', url.toString());
        }
        clearSSOStorage();
      } catch (e) {
        if (cancelled) return;
        // Visa backend-meddelande från ssoEntraLogin (HttpsError); Firebase kan sätta message till felkoden (t.ex. INTERNAL)
        let msg = (e && e.message) ? String(e.message) : '';
        if (e && e.details && typeof e.details === 'object' && e.details.message) msg = e.details.message;
        if (!msg || msg === 'INTERNAL' || /^functions\//.test(msg)) {
          msg = 'SSO-inloggning misslyckades. Kontrollera att företaget har Azure Tenant ID och att din användare finns i DigitalKontroll.';
        }
        setError(msg);
        clearSSOStorage();
        if (typeof window !== 'undefined' && window.history) {
          const url = new URL(window.location.href);
          url.hash = '';
          url.search = '';
          window.history.replaceState({}, '', url.toString());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMessage('');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Dev-only: bypass login to speed up testing
  useEffect(() => {
    if (DEV_BYPASS && __DEV__ && !autoHandled) {
      (async () => {
        try {
          const storedCompanyId = await AsyncStorage.getItem('dk_companyId');
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'Home',
                params: { email: 'dev@test.local', companyId: storedCompanyId || null }
              }
            ]
          });
        } finally {
          setAutoHandled(true);
        }
      })();
    }
  }, [navigation, autoHandled]);

  // Auto-redirect if already signed in
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user && !autoHandled) {
        const t0 = Date.now();
        try {
          const { allowed, companyId } = await checkCompanyAccessForUser(user);
          if (!allowed) {
            try { await auth.signOut(); } catch (_e) {}
            try { await AsyncStorage.removeItem('dk_companyId'); } catch (_e) {}
            setError('Företaget är pausat. Kontakta administratören.');
            return;
          }
          const params = { email: user.email || '' };
          if (companyId) {
            try { await AsyncStorage.setItem('dk_companyId', companyId); } catch (_e) {}
            params.companyId = companyId;
          }
          navigation.reset({ index: 0, routes: [ { name: 'Home', params } ] });
          console.log('[Login] Auto redirect total ms:', Date.now() - t0);
        } catch(e) {
          console.log('[Login] Auto redirect error', e?.code || e?.message);
        } finally {
          setAutoHandled(true);
        }
      }
    });
    return () => unsub();
  }, [navigation, autoHandled]);

  const handleLogin = async () => {
    const t0 = Date.now();
    try {
      setLoadingMessage('Loggar in…');
      setLoading(true);
      const cred = await signInEmailPassword(email.trim(), password);
      console.log('[Login] Auth ms:', Date.now() - t0);
      setError('');
      // Förhindra dubbelnavigering från onAuthStateChanged tills vi har hanterat företagsstatus
      setAutoHandled(true);
      // Persist remembered email preference
      try {
        if (rememberMe) {
          await AsyncStorage.setItem('dk_saved_email', email.trim());
        } else {
          await AsyncStorage.removeItem('dk_saved_email');
        }
      } catch(_e) {}

      // Refresh ID token to pick up any custom claims, then fetch and update companyId
      try {
        if (cred && cred.user) {
          await auth.currentUser.getIdToken(true);
        }
      } catch(e) {
        console.log('[Login] Token refresh failed', e?.message || e);
      }
      const { allowed, companyId } = await checkCompanyAccessForUser(cred.user);
      if (!allowed) {
        try { await auth.signOut(); } catch (_e) {}
        try { await AsyncStorage.removeItem('dk_companyId'); } catch (_e) {}
        setError('Företaget är pausat. Kontakta administratören.');
        // Tillåt auto-redirect att köras igen om användaren loggar in på annat företag
        setAutoHandled(false);
        return;
      }

      const params = { email };
      if (companyId) {
        try { await AsyncStorage.setItem('dk_companyId', companyId); } catch (_e) {}
        params.companyId = companyId;
      }
      navigation.reset({ index: 0, routes: [ { name: 'Home', params } ] });
      console.log('[Login] Profile+company check ms:', Date.now() - t0);
    } catch(e) {
      let message = 'Fel e-post eller lösenord';
      if (e?.code) {
        switch (e.code) {
          case 'auth/invalid-email':
            message = 'Ogiltig e-postadress';
            break;
          case 'auth/user-not-found':
            message = 'Användaren hittades inte';
            break;
          case 'auth/wrong-password':
            message = 'Fel lösenord';
            break;
          case 'auth/too-many-requests':
            message = 'För många försök, försök igen senare';
            break;
          case 'auth/network-request-failed':
            message = 'Nätverksfel, kontrollera uppkopplingen';
            break;
          default:
            message = 'Kunde inte logga in. Försök igen.';
        }
      }
      setError(message);
      // focus email field when login fails
      try { emailRef.current?.focus(); } catch(_e) {}
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // On web, TouchableWithoutFeedback can interfere with input focus — use a plain View wrapper there.
  const isWeb = Platform.OS === 'web';
  if (isWeb) {
    const overlayBackdropOpacity = loginOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const overlayCardOpacity = loginOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const overlayCardScale = loginOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

    return (
      <View style={styles.bg}>
        <Modal visible={loading} transparent animationType="fade" statusBarTranslucent>
          <View style={styles.loginOverlayRoot} pointerEvents={loading ? 'auto' : 'none'}>
            <Animated.View style={[styles.loginOverlayBackdrop, { opacity: overlayBackdropOpacity }]} />
            <Animated.View
              style={[
                styles.loginOverlayCard,
                {
                  opacity: overlayCardOpacity,
                  transform: [{ scale: overlayCardScale }],
                },
              ]}
            >
              <LoginLoadingAnimation />
              <Text style={styles.loginOverlayText}>{loadingMessage || 'Loggar in…'}</Text>
            </Animated.View>
          </View>
        </Modal>
        <ImageBackground
          source={require('../assets/images/bakgrundsbild-inlogg.png')}
          style={[StyleSheet.absoluteFill, styles.bgImageWeb]}
          imageStyle={styles.bgImageWeb}
          resizeMode="cover"
        >
          <View style={styles.overlayWeb} />
          <KeyboardAvoidingView style={[styles.container, { flex: 1 }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.contentWrapper, LOGIN_CARD_STYLE]}>
            <Image
              source={require('../assets/images/digitalkontroll.lang.transparant.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
            

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>E-postadress</Text>
              <TextInput
                style={styles.input}
                placeholder="Fyll i e-postadress"
                placeholderTextColor="#888"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                ref={emailRef}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              {!isEmailValid(email.trim()) && email.length > 0 ? (
                <Text style={styles.hint}>Ogiltig e‑postadress</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Lösenord</Text>
              <TextInput
                style={styles.input}
                placeholder="Fyll i lösenord"
                placeholderTextColor="#888"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                ref={passwordRef}
                returnKeyType="go"
                onSubmitEditing={() => { if (!loading && isFormValid) handleLogin(); }}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <Text style={styles.toggleText}>{showPassword ? 'Dölj lösenord' : 'Visa lösenord'}</Text>
              </TouchableOpacity>
              {password.length === 0 && error ? (
                <Text style={styles.hint}>Fyll i ditt lösenord</Text>
              ) : null}
            </View>

            <TouchableOpacity onPress={() => setRememberMe(v => !v)} style={styles.rememberRow}>
              <View style={styles.rememberBox}>
                {rememberMe ? <View style={styles.rememberFill} /> : null}
              </View>
              <Text style={styles.rememberText}>Kom ihåg mig</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, (loading || !isFormValid) && styles.buttonDisabled]} onPress={loading || !isFormValid ? undefined : handleLogin} disabled={loading || !isFormValid}>
              <Text style={styles.buttonText}>{loading ? 'Loggar in…' : 'LOGGA IN'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ssoButton, loading && styles.ssoButtonDisabled]}
              onPress={async () => {
                if (loading) return;
                try {
                  setLoadingMessage('Loggar in med Microsoft-konto…');
                  setLoading(true);
                  setError('');
                  await startSSOLogin();
                } catch (e) {
                  setError((e && e.message) ? e.message : 'Kunde inte starta inloggning med Microsoft-konto.');
                } finally {
                  setLoading(false);
                  setLoadingMessage('');
                }
              }}
              disabled={loading}
            >
              <View style={styles.ssoButtonContent}>
                <Ionicons name="logo-microsoft" size={22} color="#263238" style={styles.ssoButtonIcon} />
                <Text style={styles.ssoButtonText}>{loading ? 'Loggar in med Microsoft-konto…' : 'Logga in med Microsoft-konto'}</Text>
              </View>
            </TouchableOpacity>

          {/* Konto skapas av administratör – ingen självregistrering */}
            </View>
          </KeyboardAvoidingView>
        </ImageBackground>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ImageBackground
        source={require('../assets/images/inlogg.app.png')}
        style={styles.bg}
        imageStyle={styles.bgImage}
        resizeMode="cover"
      >
      <View style={styles.overlay} />
      <View style={[styles.contentWrapper, { justifyContent: 'flex-start', paddingTop: 12, paddingBottom: 24 }]}>
        <Image
          source={require('../assets/images/digitalkontroll.lang.transparant.jpg')}
          style={styles.logo}
          resizeMode="contain"
        />
        

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>E-postadress</Text>
          <TextInput
            style={styles.input}
            placeholder="Fyll i e-postadress"
            placeholderTextColor="#888"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            ref={emailRef}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          {!isEmailValid(email.trim()) && email.length > 0 ? (
            <Text style={styles.hint}>Ogiltig e‑postadress</Text>
          ) : null}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Lösenord</Text>
          <TextInput
            style={styles.input}
            placeholder="Fyll i lösenord"
            placeholderTextColor="#888"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            ref={passwordRef}
            returnKeyType="go"
            onSubmitEditing={() => { if (!loading && isFormValid) handleLogin(); }}
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
            <Text style={styles.toggleText}>{showPassword ? 'Dölj lösenord' : 'Visa lösenord'}</Text>
          </TouchableOpacity>
          {password.length === 0 && error ? (
            <Text style={styles.hint}>Fyll i ditt lösenord</Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={() => setRememberMe(v => !v)} style={styles.rememberRow}>
          <View style={styles.rememberBox}>
            {rememberMe ? <View style={styles.rememberFill} /> : null}
          </View>
          <Text style={styles.rememberText}>Kom ihåg mig</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, (loading || !isFormValid) && styles.buttonDisabled]} onPress={loading || !isFormValid ? undefined : handleLogin} disabled={loading || !isFormValid}>
          {loading ? (
            <View style={styles.buttonLoadingRow}>
              <ActivityIndicator size="small" color="#fff" style={styles.buttonSpinner} />
              <Text style={styles.buttonText}>Loggar in…</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>LOGGA IN</Text>
          )}
        </TouchableOpacity>

      {/* Konto skapas av administratör – ingen självregistrering */}
      </View>
      </ImageBackground>
    </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bgImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  bgImageWeb: {
    width: '100%',
    height: '100%'
  },
  overlayWeb: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.28)'
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 24,
    marginTop: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    marginTop: 8,
  },
  inputContainer: {
    width: '100%',
    maxWidth: 350,
    marginTop: 12,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: '#111',
    fontWeight: 'bold',
    marginBottom: 4,
    marginLeft: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  input: {
    width: '100%',
    maxWidth: 350,
    height: 48,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
  },
  toggleText: {
    marginTop: 6,
    marginLeft: 4,
    color: '#263238',
    fontSize: 14,
    fontWeight: '600',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  logo: {
    width: 200,
    height: 90,
    marginTop: 0,
    marginBottom: 12,
  },
  slogan: {
    fontSize: 16,
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 8,
    opacity: 0.9,
    fontWeight: '600',
  },
  errorBox: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#fdecea',
    borderLeftWidth: 4,
    borderLeftColor: '#d32f2f',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorText: {
    color: '#b71c1c',
    fontSize: 14,
  },
  button: {
    width: '100%',
    maxWidth: 350,
    height: 48,
    backgroundColor: '#263238',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  ssoButton: {
    width: '100%',
    maxWidth: 350,
    height: 44,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#263238',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  ssoButtonDisabled: {
    opacity: 0.6,
  },
  ssoButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ssoButtonIcon: {
    marginRight: 10,
  },
  ssoButtonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ssoButtonSpinner: {
    marginRight: 10,
  },
  ssoButtonText: {
    color: '#263238',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    marginTop: 6,
    marginLeft: 4,
    color: '#d32f2f',
    fontSize: 13,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  rememberBox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#222',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  rememberFill: {
    width: 12,
    height: 12,
    backgroundColor: '#1976D2',
  },
  rememberText: {
    color: '#222',
    fontWeight: '600',
  },
  loginOverlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loginOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  loginOverlayCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 32,
    minWidth: 280,
    maxWidth: 360,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loginOverlayText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#263238',
    textAlign: 'center',
  },
  link: {
    color: '#263238',
    fontSize: 16,
    marginTop: 8,
  },
});

