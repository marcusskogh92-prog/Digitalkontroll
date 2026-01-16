/**
 * ProjectTreeNode - Renders a single project with its functions
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { getProjectPhase } from '../../../features/projects/constants';
import { isWeb } from '../../../utils/platform';
import ProjectFunctionNode from './ProjectFunctionNode';

export default function ProjectTreeNode({
  project,
  isExpanded,
  onToggle,
  onSelect,
  onSelectFunction,
  navigation,
  companyId,
  isSelected = false,
  selectedPhase = null,
}) {
  const hasFunctions = Array.isArray(project.children) && 
    project.children.some(child => child.type === 'projectFunction');

  const functions = hasFunctions 
    ? project.children.filter(child => child.type === 'projectFunction')
        .sort((a, b) => (a.order || 999) - (b.order || 999))
    : [];

  const handlePress = () => {
    if (hasFunctions) {
      // Toggle expand/collapse if project has functions
      if (onToggle) {
        onToggle(project.id);
      }
    } else {
      // Direct navigation if no functions
      handleSelect();
    }
  };

  const handleSelect = () => {
    if (isWeb) {
      // Web: set selected project (handled by parent)
      if (onSelect) onSelect(project);
    } else {
      // Native: navigate to ProjectDetails
      if (navigation) {
        navigation.navigate('ProjectDetails', {
          project: {
            id: project.id,
            name: project.name,
            ansvarig: project.ansvarig || '',
            adress: project.adress || '',
            fastighetsbeteckning: project.fastighetsbeteckning || '',
            client: project.client || '',
            status: project.status || 'ongoing',
            createdAt: project.createdAt || '',
            createdBy: project.createdBy || ''
          },
          companyId
        });
      }
    }
  };

  const statusColor = project.status === 'completed' ? '#222' : '#43A047';
  const phase = getProjectPhase(project);

  return (
    <View style={{ marginLeft: 14 }}>
      {/* Project row */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 6,
          backgroundColor: '#fff',
          borderRadius: 8,
          marginVertical: 2,
          paddingHorizontal: 8
        }}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* Chevron for expand/collapse (only if has functions) */}
        {hasFunctions && (
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color="#666"
            style={{ marginRight: 6 }}
          />
        )}
        
        {/* Status indicator - dölj för eftermarknad */}
        {selectedPhase !== 'eftermarknad' && (
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: statusColor,
              marginRight: 8,
              borderWidth: 1,
              borderColor: '#bbb'
            }}
          />
        )}
        
        {/* Project name */}
        <Text
          style={{
            fontSize: 15,
            color: '#222',
            fontWeight: isSelected ? '700' : '400',
            flexShrink: 1
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {project.id} — {project.name}
        </Text>
      </TouchableOpacity>

      {/* Functions list (when expanded) */}
      {isExpanded && hasFunctions && functions.length > 0 && (
        <View style={{ marginLeft: 20, marginTop: 4 }}>
          {functions.map((func) => (
            <ProjectFunctionNode
              key={func.id}
              functionItem={func}
              project={project}
              onSelect={() => {
                if (onSelectFunction) {
                  onSelectFunction(project, func);
                }
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
