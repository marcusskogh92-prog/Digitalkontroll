
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { auth, fetchCompanyProfile, fetchUserProfile, signInEmailPassword } from '../components/firebase';

export default function LoginScreen() {
  const navigation = useNavigation();
  // Toggle this to `true` only for fast local development. Leave `false` for real login flow.
  const DEV_BYPASS = false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    }
  };

  // On web, TouchableWithoutFeedback can interfere with input focus — use a plain View wrapper there.
  const isWeb = Platform.OS === 'web';
  if (isWeb) {
    return (
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ImageBackground
            source={require('../assets/images/inlogg.webb.png')}
            style={styles.bg}
            imageStyle={styles.bgImageWeb}
              resizeMode="cover"
          >
          <View style={styles.overlayWeb} />
          <View style={styles.contentWrapper}>
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

          {/* Konto skapas av administratör – ingen självregistrering */}
          </View>
          </ImageBackground>
        </KeyboardAvoidingView>
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
          <Text style={styles.buttonText}>{loading ? 'Loggar in…' : 'LOGGA IN'}</Text>
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
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
  link: {
    color: '#263238',
    fontSize: 16,
    marginTop: 8,
  },
});

