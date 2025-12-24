
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { auth, fetchUserProfile, signInEmailPassword } from '../components/firebase';

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
          // Start profile fetch but navigate immediately for speed
          const profilePromise = fetchUserProfile(user.uid).catch(() => null);
          navigation.reset({ index: 0, routes: [ { name: 'Home', params: { email: user.email || '' } } ] });
          const profile = await profilePromise;
          const companyId = profile?.companyId || null;
          if (companyId) {
            await AsyncStorage.setItem('dk_companyId', companyId);
            // Update route params with companyId without adding a back entry
            navigation.reset({ index: 0, routes: [ { name: 'Home', params: { email: user.email || '', companyId } } ] });
          }
          console.log('[Login] Auto redirect total ms:', Date.now() - t0);
        } catch (e) {
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
      setAutoHandled(true); // Prevent onAuthStateChanged duplicate navigation
      // Navigate immediately (without waiting for profile)
      navigation.reset({ index: 0, routes: [ { name: 'Home', params: { email } } ] });
      // Refresh ID token to pick up any custom claims, then fetch and update companyId
      try {
        if (cred && cred.user) {
          await auth.currentUser.getIdToken(true);
        }
      } catch (e) {
        console.log('[Login] Token refresh failed', e?.message || e);
      }
      fetchUserProfile(cred.user.uid)
        .then(async (profile) => {
          const companyId = profile?.companyId || null;
          if (companyId) {
            await AsyncStorage.setItem('dk_companyId', companyId);
            navigation.reset({ index: 0, routes: [ { name: 'Home', params: { email, companyId } } ] });
          }
          console.log('[Login] Profile async ms:', Date.now() - t0);
        })
        .catch((e) => console.log('[Login] Profile error', e?.code || e?.message));
    } catch (err) {
      let message = 'Fel e-post eller lösenord';
      if (err?.code) {
        switch (err.code) {
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
            source={require('../assets/images/inlogg.app.png')}
            style={styles.bg}
            imageStyle={styles.bgImage}
            resizeMode="cover"
          >
          <View style={styles.overlay} />
          <View style={styles.contentWrapper}>
          <Text style={styles.title}>Logga in</Text>
          <Text style={styles.slogan}>Digitala kontroller – direkt i telefonen</Text>

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
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.toggleText}>{showPassword ? 'Dölj lösenord' : 'Visa lösenord'}</Text>
            </TouchableOpacity>
            {password.length === 0 && error ? (
              <Text style={styles.hint}>Fyll i ditt lösenord</Text>
            ) : null}
          </View>

          <Image
            source={require('../assets/images/digitalkontroll.lang.transparant.jpg')}
            style={[styles.logo, { alignSelf: 'center' }]}
            resizeMode="contain"
          />

          {error ? <Text style={{ color: 'red', marginBottom: 8 }}>{error}</Text> : null}

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
      <View style={styles.contentWrapper}>
      <Text style={styles.title}>Logga in</Text>
      <Text style={styles.slogan}>Digitala kontroller – direkt i telefonen</Text>

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
        />
        <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
          <Text style={styles.toggleText}>{showPassword ? 'Dölj lösenord' : 'Visa lösenord'}</Text>
        </TouchableOpacity>
        {password.length === 0 && error ? (
          <Text style={styles.hint}>Fyll i ditt lösenord</Text>
        ) : null}
      </View>

      <Image
        source={require('../assets/images/digitalkontroll.lang.transparant.jpg')}
        style={[styles.logo, { alignSelf: 'center' }]}
        resizeMode="contain"
      />

      {error ? <Text style={{ color: 'red', marginBottom: 8 }}>{error}</Text> : null}

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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingTop: 56,
    position: 'relative',
    marginTop: -16,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    position: 'absolute',
    top: -16,
    textAlign: 'center',
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
  },
  logo: {
    width: 240,
    height: 120,
    marginTop: 8,
    marginBottom: 16,
  },
  slogan: {
    fontSize: 16,
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: -16,
    opacity: 0.9,
    fontWeight: '600',
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
  link: {
    color: '#263238',
    fontSize: 16,
    marginTop: 8,
  },
});
