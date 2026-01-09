import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createUserRemote, fetchCompanyMembers, fetchCompanyProfile } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import MainLayout from '../components/MainLayout';

export default function ManageUsers({ route, navigation }) {
  const [companyId] = useState(() => route?.params?.companyId || '');
  const [members, setMembers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const prof = await fetchCompanyProfile(companyId);
        setProfile(prof || null);
        const mems = await fetchCompanyMembers(companyId) || [];
        setMembers(mems);
      } catch (e) {
        console.warn(e);
      } finally { setLoading(false); }
    })();
    try {
      navigation.setOptions({
        headerTitle: () => <Text style={{ fontSize: 18, fontWeight: '700' }}>Hantera användare</Text>,
        headerLeft: () => (
          <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
            <DigitalKontrollHeaderLogo />
          </View>
        ),
        headerRight: () => (
          <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center' }}>
            <CompanyHeaderLogo />
          </View>
        ),
        headerBackTitle: '',
      });
    } catch (_e) {}
  }, [companyId]);

  const seatsLeft = (profile && typeof profile.userLimit === 'number') ? Math.max(0, (profile.userLimit || 0) - (Array.isArray(members) ? members.length : 0)) : null;

  const handleAdd = async () => {
    if (!newEmail) return Alert.alert('Fel', 'Ange e-post');
    if (seatsLeft !== null && seatsLeft <= 0) return Alert.alert('Fel', 'Inga platser kvar enligt userLimit');
    // Use callable Cloud Function to create Auth user + member doc
    try {
      const email = String(newEmail).trim().toLowerCase();
      const displayName = String(newName).trim() || email.split('@')[0];
      const payload = { companyId, email, displayName };
      const result = await createUserRemote(payload);
      if (result && result.ok) {
        Alert.alert('Ok', `Användare skapad. Temporärt lösenord: ${result.tempPassword || result.tempPassword || result.tempPassword || result.tempPassword || result.tempPassword || ''}`.replace(/: $/, ''));
        setNewName(''); setNewEmail('');
        const mems = await fetchCompanyMembers(companyId) || [];
        setMembers(mems);
      } else if (result && result.uid) {
        Alert.alert('Ok', 'Användare skapad.');
        setNewName(''); setNewEmail('');
        const mems = await fetchCompanyMembers(companyId) || [];
        setMembers(mems);
      } else {
        Alert.alert('Fel', 'Kunde inte skapa användare.');
      }
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const renderItem = ({ item }) => (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
      <Text style={{ fontSize: 15, fontWeight: '600' }}>{formatPersonName(item.displayName || item.email)}</Text>
      <Text style={{ color: '#666', marginTop: 4 }}>{item.email || ''}</Text>
    </View>
  );

  // Web: wrap in MainLayout to show sidebar + activity
    if (Platform.OS === 'web') {
    return (
      <MainLayout>
        <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ padding: 16 }}>
            <View style={{ marginTop: 8 }}>
              <Text>{profile ? `Platser: ${profile.userLimit || '—'} — Användare: ${members.length}` : 'Läser profil...'}</Text>
            </View>
            {seatsLeft !== null ? <View style={{ marginTop: 6 }}><Text style={{ color: seatsLeft > 0 ? '#2E7D32' : '#D32F2F' }}>{`Platser kvar: ${seatsLeft}`}</Text></View> : null}

            <View style={{ marginTop: 12 }}>
              <Text style={{ marginBottom: 6 }}>Namn</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder="Förnamn Efternamn" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />
              <Text style={{ marginTop: 12, marginBottom: 6 }}>Email</Text>
              <TextInput value={newEmail} onChangeText={setNewEmail} placeholder="user@company.se" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity onPress={handleAdd} style={{ backgroundColor: '#1976D2', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#fff' }}>Lägg till användare</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Nuvarande användare</Text>
              <View>
                {members.map(m => (
                  <View key={m.uid || m.id || m.email} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
                    <Text style={{ fontSize: 15, fontWeight: 600 }}>{formatPersonName(m.displayName || m.email)}</Text>
                    <Text style={{ color: '#666', marginTop: 4 }}>{m.email || ''}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </MainLayout>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Hantera användare</Text>
        <Text style={{ marginTop: 8 }}>{profile ? `Platser: ${profile.userLimit || '—'} — Användare: ${members.length}` : 'Läser profil...'}</Text>
        {seatsLeft !== null ? <Text style={{ marginTop: 6, color: seatsLeft > 0 ? '#2E7D32' : '#D32F2F' }}>{`Platser kvar: ${seatsLeft}`}</Text> : null}

        <View style={{ marginTop: 12 }}>
          <Text style={{ marginBottom: 6 }}>Namn</Text>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Förnamn Efternamn" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />
          <Text style={{ marginTop: 12, marginBottom: 6 }}>Email</Text>
          <TextInput value={newEmail} onChangeText={setNewEmail} placeholder="user@company.se" keyboardType="email-address" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />
          <TouchableOpacity onPress={handleAdd} style={{ backgroundColor: '#1976D2', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lägg till användare</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Nuvarande användare</Text>
          <FlatList data={members} keyExtractor={(i) => String(i.uid || i.id || i.email || Math.random())} renderItem={renderItem} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
