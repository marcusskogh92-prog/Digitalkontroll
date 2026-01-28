/**
 * ProjectTreeFile - Renders a file in the tree
 * Files are opened via SharePoint webUrl
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Platform, Text, TouchableOpacity } from 'react-native';

export default function ProjectTreeFile({
  file,
  level = 0,
  isSelected = false,
  compact = false,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handlePress = async () => {
    if (!file.webUrl) {
      console.warn('[ProjectTreeFile] No webUrl available for file:', file.name);
      return;
    }

    try {
      // Open file in SharePoint (opens in Office Online or downloads)
      const canOpen = await Linking.canOpenURL(file.webUrl);
      if (canOpen) {
        await Linking.openURL(file.webUrl);
      } else {
        console.warn('[ProjectTreeFile] Cannot open URL:', file.webUrl);
      }
    } catch (error) {
      console.error('[ProjectTreeFile] Error opening file:', error);
    }
  };

  // Get file icon based on mime type
  const getFileIcon = () => {
    if (!file.mimeType) {
      return 'document-outline';
    }

    const mime = file.mimeType.toLowerCase();
    
    if (mime.includes('pdf')) return 'document-text-outline';
    if (mime.includes('word') || mime.includes('document')) return 'document-text-outline';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return 'grid-outline';
    if (mime.includes('powerpoint') || mime.includes('presentation')) return 'easel-outline';
    if (mime.includes('image')) return 'image-outline';
    if (mime.includes('video')) return 'videocam-outline';
    if (mime.includes('audio')) return 'musical-notes-outline';
    
    return 'document-outline';
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileRowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: compact ? 4 : 6,
    paddingHorizontal: compact ? 8 : 10,
    borderRadius: 6,
    marginVertical: 1,
    marginLeft: level * 12,
    backgroundColor: isSelected 
      ? '#E8F5E9' 
      : isHovered 
        ? '#E3F2FD' 
        : 'transparent',
    borderWidth: isSelected ? 1 : 0,
    borderColor: isSelected ? '#1976D2' : 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
    } : {}),
  };

  const fileRowContent = (
    <>
      <Ionicons
        name={getFileIcon()}
        size={compact ? 16 : 18}
        color="#666"
        style={{ marginRight: compact ? 6 : 8 }}
      />
      <Text
        style={{
          fontSize: compact ? 12 : 14,
          color: '#222',
          fontWeight: isSelected ? '600' : '400',
          flex: 1,
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {file.name}
      </Text>
      {file.size && (
        <Text
          style={{
            fontSize: compact ? 11 : 12,
            color: '#666',
            marginLeft: 8,
          }}
        >
          {formatFileSize(file.size)}
        </Text>
      )}
      {file.webUrl && (
        <Ionicons
          name="open-outline"
          size={compact ? 14 : 16}
          color="#1976D2"
          style={{ marginLeft: 8 }}
        />
      )}
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <div
        style={fileRowStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handlePress}
        title={`Öppna ${file.name} i SharePoint`}
      >
        {fileRowContent}
      </div>
    );
  }

  return (
    <TouchableOpacity
      style={fileRowStyle}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {fileRowContent}
    </TouchableOpacity>
  );
}
