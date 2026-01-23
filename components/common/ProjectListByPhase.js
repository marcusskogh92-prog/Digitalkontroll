/**
 * ProjectListByPhase - Displays projects grouped by phase as clickable items
 * Projects are not expandable - clicking navigates to project view
 */

import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_PHASES } from '../../features/projects/constants';

export default function ProjectListByPhase({
  projectsByPhase,
  onSelectProject,
  navigation = null,
  companyId,
  search = '',
}) {
  // Filter projects by search
  const filterProjects = (projectList) => {
    if (!search || !search.trim()) return projectList;
    const query = search.toLowerCase();
    return projectList.filter(p => {
      const fullName = (p.fullName || p.name || '').toLowerCase();
      const number = (p.number || '').toLowerCase();
      return fullName.includes(query) || number.includes(query);
    });
  };

  // Render a single project item
  const renderProject = (project) => {
    const projectLabel = project.fullName || `${project.number} ${project.name}`;
    const [isHovered, setIsHovered] = React.useState(false);

    const handleClick = () => {
      // Prepare project data
      const projectData = {
        id: project.id,
        name: project.name,
        number: project.number,
        fullName: project.fullName,
        phase: project.phase,
        path: project.path,
        type: 'project',
        ...project.folder, // Include all folder properties
      };
      
      // If navigation is available, navigate directly
      if (navigation) {
        navigation.navigate('ProjectDetails', {
          project: projectData,
          companyId,
        });
      } else if (onSelectProject) {
        // Fallback: use onSelectProject callback
        onSelectProject(projectData);
      }
    };

    if (Platform.OS === 'web') {
      return (
        <div
          key={project.id}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: 6,
            marginVertical: 2,
            backgroundColor: isHovered ? '#E3F2FD' : 'transparent',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: '#43A047',
              marginRight: 10,
              border: '1px solid #bbb',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 14,
              color: '#222',
              fontWeight: '400',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {projectLabel}
          </span>
        </div>
      );
    }

    return (
      <TouchableOpacity
        key={project.id}
        onPress={handleClick}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 6,
          marginVertical: 2,
        }}
        activeOpacity={0.7}
      >
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: '#43A047',
            marginRight: 10,
            borderWidth: 1,
            borderColor: '#bbb',
          }}
        />
        <Text
          style={{
            fontSize: 14,
            color: '#222',
            fontWeight: '400',
            flex: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {projectLabel}
        </Text>
      </TouchableOpacity>
    );
  };

  // Render phase section
  const renderPhaseSection = (phaseKey, phaseConfig) => {
    const projects = filterProjects(projectsByPhase[phaseKey] || []);
    if (projects.length === 0 && !search) return null;

    return (
      <View key={phaseKey} style={{ marginBottom: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons
            name={phaseConfig.icon}
            size={18}
            color={phaseConfig.color}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: phaseConfig.color,
            }}
          >
            {phaseConfig.name}
          </Text>
          <Text
            style={{
              marginLeft: 8,
              fontSize: 13,
              color: '#666',
            }}
          >
            ({projects.length})
          </Text>
        </View>
        {projects.length > 0 ? (
          <View style={{ paddingLeft: 8 }}>
            {projects.map(project => renderProject(project))}
          </View>
        ) : search ? (
          <Text style={{ color: '#888', fontSize: 13, paddingLeft: 12, fontStyle: 'italic' }}>
            Inga projekt matchar sökningen
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ padding: 12 }}>
      {PROJECT_PHASES.map(phase => renderPhaseSection(phase.key, phase))}
      
      {/* Show unknown phase projects if any */}
      {filterProjects(projectsByPhase.unknown || []).length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#666', marginBottom: 8, paddingHorizontal: 12 }}>
            Övriga projekt ({filterProjects(projectsByPhase.unknown || []).length})
          </Text>
          <View style={{ paddingLeft: 8 }}>
            {filterProjects(projectsByPhase.unknown || []).map(project => renderProject(project))}
          </View>
        </View>
      )}
      
      {/* Empty state */}
      {Object.values(projectsByPhase).every(arr => arr.length === 0) && (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: '#888', fontSize: 15, textAlign: 'center' }}>
            {search ? 'Inga projekt matchar sökningen' : 'Inga projekt hittades'}
          </Text>
        </View>
      )}
    </View>
  );
}
