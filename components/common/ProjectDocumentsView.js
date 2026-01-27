/**
 * ProjectDocumentsView - Shows SharePoint folder structure inside a project
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_PHASE } from '../../features/projects/constants';
import { getProjectFolders } from '../../services/azure/hierarchyService';

function RecursiveFolderView({
  folder,
  level = 0,
  expandedFolders,
  onToggle,
  companyId,
  projectId,
  phaseKey,
}) {
  const isExpanded = expandedFolders[folder.id];
  const marginLeft = 12 + level * 12;
  const fontSize = Math.max(12, 15 - level);

  const handlePress = () => {
    if (onToggle) onToggle(folder.id);
  };

  if (Platform.OS === 'web') {
    return (
      <div style={{ marginLeft, marginTop: 4 }}>
        <div
          onClick={handlePress}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            backgroundColor: 'transparent',
          }}
        >
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={Math.max(12, 16 - level)}
            color="#222"
            style={{ marginRight: 6 }}
          />
          <Ionicons
            name="folder-outline"
            size={Math.max(14, 18 - level)}
            color="#1976D2"
            style={{ marginRight: 6 }}
          />
          <span style={{ fontSize, color: '#222' }}>{folder.name}</span>
        </div>
        {isExpanded && folder.children && folder.children.length > 0 && (
          <div style={{ marginLeft: 8, marginTop: 2 }}>
            {folder.children.map(child => (
              <RecursiveFolderView
                key={child.id}
                folder={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                onToggle={onToggle}
                companyId={companyId}
                projectId={projectId}
                phaseKey={phaseKey}
              />
            ))}
          </div>
        )}
        {isExpanded && folder.children && folder.children.length === 0 && (
          <div style={{ marginLeft: 24, marginTop: 4, color: '#888', fontSize: 13, fontStyle: 'italic' }}>
            Mappen är tom
          </div>
        )}
      </div>
    );
  }

  return (
    <View style={{ marginLeft, marginTop: 4 }}>
      <TouchableOpacity
        onPress={handlePress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 4,
          paddingHorizontal: 8,
        }}
      >
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={Math.max(12, 16 - level)}
          color="#222"
          style={{ marginRight: 6 }}
        />
        <Ionicons
          name="folder-outline"
          size={Math.max(14, 18 - level)}
          color="#1976D2"
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontSize, color: '#222' }}>{folder.name}</Text>
      </TouchableOpacity>
      {isExpanded && folder.children && folder.children.length > 0 && (
        <View style={{ marginLeft: 8, marginTop: 2 }}>
          {folder.children.map(child => (
            <RecursiveFolderView
              key={child.id}
              folder={child}
              level={level + 1}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              companyId={companyId}
              projectId={projectId}
              phaseKey={phaseKey}
            />
          ))}
        </View>
      )}
      {isExpanded && folder.children && folder.children.length === 0 && (
        <Text style={{ marginLeft: 24, marginTop: 4, color: '#888', fontSize: 13, fontStyle: 'italic' }}>
          Mappen är tom
        </Text>
      )}
    </View>
  );
}

export default function ProjectDocumentsView({
  project,
  companyId,
}) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});

  useEffect(() => {
    if (!project || !companyId || !project.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        const phaseKey = project.phase || DEFAULT_PHASE;
        const projectFolders = await getProjectFolders(
          companyId,
          project.id,
          phaseKey,
          project.path || project.projectPath || null,
        );
        
        if (!cancelled) {
          setFolders(Array.isArray(projectFolders) ? projectFolders : []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[ProjectDocumentsView] Error loading folders:', err);
          setError(err?.message || 'Kunde inte ladda mappar');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, companyId]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  if (loading) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>
          Laddar mappstruktur...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Ionicons name="alert-circle-outline" size={48} color="#D32F2F" />
        <Text style={{ marginTop: 12, color: '#D32F2F', fontSize: 14, textAlign: 'center' }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!folders || folders.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Ionicons name="folder-outline" size={48} color="#888" />
        <Text style={{ marginTop: 12, color: '#888', fontSize: 14, textAlign: 'center' }}>
          Inga mappar hittades i projektet
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' }}>
        Dokument och mappar
      </Text>
      {folders.map(folder => (
        <RecursiveFolderView
          key={folder.id}
          folder={folder}
          level={0}
          expandedFolders={expandedFolders}
          onToggle={toggleFolder}
          companyId={companyId}
          projectId={project.id}
          phaseKey={project.phase || DEFAULT_PHASE}
        />
      ))}
    </View>
  );
}
