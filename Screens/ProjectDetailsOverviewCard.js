import React from 'react';
import { View, Text, TouchableOpacity, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectDetailsOverviewCard({
  companyLogoUri,
  toggleProjectInfo,
  projectInfoExpanded,
  projectInfoRotate,
  editableProject,
  formatPersonName,
  skyddsrondInfo,
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18, padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' }}>
      {companyLogoUri ? (
        <View style={{ marginRight: 16 }}>
          <Image source={{ uri: companyLogoUri }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' }} resizeMode="contain" />
        </View>
      ) : null}
      <View style={{ flex: 1, position: 'relative' }}>
        <TouchableOpacity
          onPress={toggleProjectInfo}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: projectInfoExpanded ? 8 : 0 }}
        >
          <View style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: editableProject?.status === 'completed' ? '#222' : '#43A047',
            marginRight: 8,
            borderWidth: 2,
            borderColor: '#bbb',
          }} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', marginRight: 8 }}>{editableProject?.projectNumber || editableProject?.number || editableProject?.id || ''}</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{editableProject?.projectName || editableProject?.name || editableProject?.fullName || 'Projekt'}</Text>
          <Animated.View style={{ marginLeft: 8, transform: [{ rotate: projectInfoRotate }] }}>
            <Ionicons name={projectInfoExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
          </Animated.View>
        </TouchableOpacity>

        {projectInfoExpanded && (
          <View style={{ marginBottom: 2 }}>
            <View style={{ marginBottom: 2 }}>
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Skapad:</Text> {editableProject?.createdAt
                  ? <Text>{new Date(editableProject.createdAt).toLocaleDateString()}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Ansvarig:</Text> {editableProject?.ansvarig
                  ? <Text>{formatPersonName(editableProject.ansvarig)}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Status:</Text> {editableProject?.status === 'completed'
                  ? <Text>Avslutat</Text>
                  : editableProject?.status === 'ongoing'
                    ? <Text>Pågående</Text>
                    : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Kund:</Text> {editableProject?.client
                  ? <Text>{editableProject.client}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Adress:</Text> {editableProject?.adress
                  ? <Text>{editableProject.adress}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Fastighetsbeteckning:</Text> {editableProject?.fastighetsbeteckning
                  ? <Text>{editableProject.fastighetsbeteckning}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Valfritt</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Skyddsronder:</Text>{' '}
                {skyddsrondInfo.enabled
                  ? (
                    <>
                      var {skyddsrondInfo.intervalWeeks} veckor. Senaste: {skyddsrondInfo.lastLabel}. Nästa senast:{' '}
                      <Text
                        style={{
                          color: skyddsrondInfo.overdue ? '#D32F2F' : (skyddsrondInfo.soon ? '#FFD600' : '#555'),
                          fontWeight: (skyddsrondInfo.overdue || skyddsrondInfo.soon) ? '700' : '400',
                        }}
                      >
                        {skyddsrondInfo.nextLabel}
                      </Text>
                    </>
                  )
                  : <Text>Inaktiverad</Text>
                }
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
