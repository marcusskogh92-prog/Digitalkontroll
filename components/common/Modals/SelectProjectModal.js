/**
 * SelectProjectModal - Modal for selecting a project
 * Extracted from HomeScreen.js to improve code organization
 */

import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const SelectProjectModal = ({
  visible,
  type,
  hierarchy = [],
  searchText = '',
  onSearchTextChange,
  onClose,
  onSelectProject,
}) => {
  const [expandedMain, setExpandedMain] = useState([]);
  const [expandedSub, setExpandedSub] = useState([]);
  
  const isMainExpanded = (id) => expandedMain[0] === id;
  const isSubExpanded = (id) => expandedSub.includes(id);
  const toggleMain = (id) => setExpandedMain(exp => exp[0] === id ? [] : [id]);
  const toggleSub = (id) => setExpandedSub(exp => exp.includes(id) ? exp.filter(e => e !== id) : [...exp, id]);

  // Reset expanded state when modal opens
  useEffect(() => {
    if (visible) {
      setExpandedMain([]);
      setExpandedSub([]);
    }
  }, [visible]);

  const handleSelectProject = (project) => {
    onSelectProject(project, type);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
          onPress={onClose}
        />
        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 360, maxHeight: 540 }}>
          {type && (
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 6, color: '#222', textAlign: 'center' }}>
              {type}
            </Text>
          )}
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj projekt</Text>
          <View style={{ position: 'relative', marginBottom: 14 }}>
            <TextInput
              value={searchText}
              onChangeText={onSearchTextChange}
              placeholder="Sök projektnamn eller nummer..."
              style={{
                borderWidth: 1,
                borderColor: '#222',
                borderRadius: 16,
                padding: 10,
                fontSize: 16,
                backgroundColor: '#fff',
                color: '#222',
                paddingRight: 38
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchText.trim().length > 0 && (
              <View style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', zIndex: 10, maxHeight: 180 }}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {hierarchy.flatMap(main =>
                    main.children.flatMap(sub =>
                      (sub.children || [])
                        .filter(child => child.type === 'project' && (
                          child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                          child.name.toLowerCase().includes(searchText.toLowerCase())
                        ))
                        .map(proj => (
                          <TouchableOpacity
                            key={proj.id}
                            style={{ padding: 10, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                            onPress={() => handleSelectProject(proj)}
                          >
                            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                            <Text style={{ fontSize: 14, color: '#1976D2', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
                          </TouchableOpacity>
                        ))
                    )
                  )}
                </ScrollView>
              </View>
            )}
          </View>
          <ScrollView style={{ maxHeight: 370 }}>
            {[...hierarchy]
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
              .filter(main =>
                main.name.toLowerCase().includes(searchText.toLowerCase()) ||
                main.children.some(sub =>
                  sub.name.toLowerCase().includes(searchText.toLowerCase()) ||
                  (sub.children || []).some(child =>
                    child.type === 'project' && (
                      child.name.toLowerCase().includes(searchText.toLowerCase()) ||
                      child.id.toLowerCase().includes(searchText.toLowerCase())
                    )
                  )
                )
              )
              .map(main => (
                <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 3, padding: 6, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => toggleMain(main.id)} activeOpacity={0.7}>
                    <Ionicons name={isMainExpanded(main.id) ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                  </TouchableOpacity>
                  {isMainExpanded(main.id) && (
                    !main.children || main.children.length === 0 ? (
                      <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>Inga undermappar skapade</Text>
                    ) : (
                      [...main.children]
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                        .filter(sub =>
                          sub.name.toLowerCase().includes(searchText.toLowerCase()) ||
                          (sub.children || []).some(child =>
                            child.type === 'project' && (
                              child.name.toLowerCase().includes(searchText.toLowerCase()) ||
                              child.id.toLowerCase().includes(searchText.toLowerCase())
                            )
                          )
                        )
                        .map(sub => (
                          <View key={sub.id} style={{ marginLeft: 20, marginBottom: 0, padding: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', padding: '2px 0 2px 0', userSelect: 'none' }}>
                              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => toggleSub(sub.id)} activeOpacity={0.7}>
                                <Ionicons name={isSubExpanded(sub.id) ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 4 }} />
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginLeft: 2 }}>{sub.name}</Text>
                              </TouchableOpacity>
                            </View>
                            {isSubExpanded(sub.id) && (
                              (sub.children || []).filter(child => child.type === 'project').map(proj => (
                                <View key={proj.id} style={{ marginLeft: 32 }}>
                                  <TouchableOpacity 
                                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 4, padding: '2px 4px', marginBottom: 0 }}
                                    onPress={() => handleSelectProject(proj)}
                                  >
                                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 6, borderWidth: 1, borderColor: '#bbb' }} />
                                    <Text style={{ fontSize: 13, color: '#1976D2', fontWeight: '400', marginLeft: 2, marginRight: 6, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} — {proj.name}</Text>
                                  </TouchableOpacity>
                                </View>
                              ))
                            )}
                          </View>
                        ))
                    )
                  )}
                </View>
              ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default SelectProjectModal;
