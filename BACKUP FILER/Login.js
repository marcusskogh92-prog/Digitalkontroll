
import React, { useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet } from 'react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // Här kan du lägga till Firebase-inloggning senare
    console.log('Loggar in med:', email, password);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logga in</Text>

      {/* Uppdaterad bild med rätt namn och sökväg */}
      <Image
        source={require('../assets/images/MS_Kontroll_liten.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* E-postfält */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Mejladress</Text>
        <TextInput
          style={styles.input}
          placeholder="exempel@mejl.se"
          placeholderTextColor="#888"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
      </View>

      {/* Lösenordsfält */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Lösenord</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {/* Logga in-knapp */}
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>LOGGA IN</Text>
      </TouchableOpacity>

      {/* Skapa konto-länk */}
      <TouchableOpacity>
        <Text style={styles.link}>Skapa konto</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  logo: {
    width: 160,
    height: 80,
    marginBottom: 32,
  },
  inputContainer: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: '#222',
    marginBottom: 4,
    marginLeft: 4,
  },
  input: {
    width: '100%',
    maxWidth: 400,
    height: 48,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#222',
  },
  button: {
    width: '100%',
    maxWidth: 400,
    height: 48,
    backgroundColor: '#2979FF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  link: {
    color: '#2979FF',
    fontSize: 16,
    marginTop: 8,
  },
});
