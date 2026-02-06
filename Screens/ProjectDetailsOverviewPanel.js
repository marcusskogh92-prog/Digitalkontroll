import React from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ProjectDetailsOverviewPanel({
  selectedAction,
  editableProject,
  setEditableProject,
  editProjectParticipants,
  navigation,
  originalProjectId,
  emitProjectUpdated,
  isValidIsoDateYmd,
  formatPersonName,
}) {
  if (selectedAction?.kind !== 'overblick' || Platform.OS !== 'web') return null;
  if (!editableProject) return null;

  const sectionTitle = { fontSize: 13, fontWeight: '500', color: '#111', marginBottom: 10 };
  const labelStyle = { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 };
  const inputStyleBase = {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#111',
    ...(Platform.OS === 'web' ? {
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none',
    } : {}),
  };

  const getAddressStreet = () => {
    if (editableProject?.address?.street) return editableProject.address.street;
    if (editableProject?.adress) return editableProject.adress;
    return '';
  };
  const getAddressPostal = () => editableProject?.address?.postalCode || '';
  const getAddressCity = () => editableProject?.address?.city || '';
  const getClientContactName = () => editableProject?.clientContact?.name || '';
  const getClientContactPhone = () => editableProject?.clientContact?.phone || '';
  const getClientContactEmail = () => editableProject?.clientContact?.email || '';

  return (
    <View style={{ paddingBottom: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 20 }}>Överblick</Text>

      <View style={{
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        gap: 20,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={sectionTitle}>Projektinformation</Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={labelStyle}>Projektnummer</Text>
            <TextInput
              value={editableProject?.projectNumber || editableProject?.number || editableProject?.id || ''}
              onChangeText={(v) => setEditableProject(p => ({ ...p, projectNumber: v, number: v }))}
              placeholder="Projektnummer..."
              placeholderTextColor="#94A3B8"
              style={inputStyleBase}
              editable={false}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={labelStyle}>Projektnamn</Text>
            <TextInput
              value={editableProject?.projectName || editableProject?.name || ''}
              onChangeText={(v) => setEditableProject(p => ({ ...p, projectName: v, name: v }))}
              placeholder="Projektnamn..."
              placeholderTextColor="#94A3B8"
              style={inputStyleBase}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={labelStyle}>Skapad</Text>
            <TextInput
              value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
              editable={false}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={{ ...inputStyleBase, backgroundColor: '#F1F5F9', color: '#64748B' }}
            />
          </View>

          <Text style={labelStyle}>Kund</Text>
          <TextInput
            value={editableProject?.customer || editableProject?.client || ''}
            onChangeText={(v) => setEditableProject(p => ({ ...p, customer: v, client: v }))}
            placeholder="Kundens företagsnamn..."
            placeholderTextColor="#94A3B8"
            style={{ ...inputStyleBase, marginBottom: 14 }}
          />

          <Text style={{ ...labelStyle, marginBottom: 8 }}>Uppgifter till projektansvarig hos beställaren</Text>
          <TextInput
            value={getClientContactName()}
            onChangeText={(v) => setEditableProject(p => ({
              ...p,
              clientContact: { ...(p?.clientContact || {}), name: v },
            }))}
            placeholder="Namn"
            placeholderTextColor="#94A3B8"
            style={{ ...inputStyleBase, marginBottom: 10 }}
          />
          <TextInput
            value={getClientContactPhone()}
            onChangeText={(v) => setEditableProject(p => ({
              ...p,
              clientContact: { ...(p?.clientContact || {}), phone: v },
            }))}
            placeholder="Telefonnummer"
            placeholderTextColor="#94A3B8"
            style={{ ...inputStyleBase, marginBottom: 10 }}
          />
          <TextInput
            value={getClientContactEmail()}
            onChangeText={(v) => setEditableProject(p => ({
              ...p,
              clientContact: { ...(p?.clientContact || {}), email: v },
            }))}
            placeholder="namn@foretag.se"
            placeholderTextColor="#94A3B8"
            style={{ ...inputStyleBase, marginBottom: 14 }}
          />

          <Text style={labelStyle}>Adress</Text>
          <TextInput
            value={getAddressStreet()}
            onChangeText={(v) => setEditableProject(p => ({
              ...p,
              address: { ...(p?.address || {}), street: v },
              adress: v,
            }))}
            placeholder="Gata och nr..."
            placeholderTextColor="#94A3B8"
            style={{ ...inputStyleBase, marginBottom: 10 }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <TextInput
              value={getAddressPostal()}
              onChangeText={(v) => setEditableProject(p => ({
                ...p,
                address: { ...(p?.address || {}), postalCode: v },
              }))}
              placeholder="Postnummer"
              placeholderTextColor="#94A3B8"
              style={{ ...inputStyleBase, flex: 0.45 }}
            />
            <TextInput
              value={getAddressCity()}
              onChangeText={(v) => setEditableProject(p => ({
                ...p,
                address: { ...(p?.address || {}), city: v },
              }))}
              placeholder="Ort"
              placeholderTextColor="#94A3B8"
              style={{ ...inputStyleBase, flex: 0.55 }}
            />
          </View>
          <TextInput
            value={editableProject?.propertyDesignation || editableProject?.fastighetsbeteckning || ''}
            onChangeText={(v) => setEditableProject(p => ({ ...p, propertyDesignation: v, fastighetsbeteckning: v }))}
            placeholder="Fastighetsbeteckning"
            placeholderTextColor="#94A3B8"
            style={{ ...inputStyleBase, marginBottom: 14 }}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={sectionTitle}>Ansvariga och deltagare</Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={labelStyle}>Ansvarig</Text>
            <TextInput
              value={editableProject?.ansvarig || ''}
              editable={false}
              placeholder="Ansvarig..."
              placeholderTextColor="#94A3B8"
              style={{ ...inputStyleBase, backgroundColor: '#F1F5F9', color: '#64748B' }}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={labelStyle}>Deltagare</Text>
            <TextInput
              value={(editProjectParticipants || []).map(p => formatPersonName(p)).join(', ') || ''}
              editable={false}
              placeholder="Inga deltagare valda..."
              placeholderTextColor="#94A3B8"
              multiline
              style={{ ...inputStyleBase, backgroundColor: '#F1F5F9', color: '#64748B', minHeight: 60 }}
            />
          </View>

          <View style={{ marginTop: 20, flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                const isEnabled = editableProject?.skyddsrondEnabled !== false;
                const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                if (!isFirstDueValid) return;

                const sanitizedProject = {
                  ...editableProject,
                  skyddsrondFirstDueDate: isEnabled ? (firstDueTrim || null) : null,
                  participants: (editProjectParticipants || []).map(p => ({
                    uid: p.uid || p.id,
                    displayName: p.displayName || null,
                    email: p.email || null
                  })),
                };
                if (typeof navigation?.setParams === 'function') {
                  navigation.setParams({ project: sanitizedProject });
                }
                emitProjectUpdated({ ...sanitizedProject, originalId: originalProjectId });
              }}
              style={{
                backgroundColor: '#1976D2',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 18,
                minWidth: 110,
                alignItems: 'center',
                ...(Platform.OS === 'web' ? {
                  transition: 'background-color 0.2s',
                  cursor: 'pointer',
                } : {}),
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Spara ändringar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}
