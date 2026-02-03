/**
 * ProjectTreeFile - Renders a file in the tree
 * Files are opened via SharePoint webUrl
 */

import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Text, View } from 'react-native';
import { LEFT_NAV } from '../../../constants/leftNavTheme';
import SidebarItem from '../SidebarItem';

export default function ProjectTreeFile({
  file,
  level = 0,
  isSelected = false,
  compact = false,
  edgeToEdge = false,
}) {
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

  return (
    <SidebarItem
      fullWidth
      squareCorners={Boolean(edgeToEdge && Platform.OS === 'web')}
      indentMode={edgeToEdge ? 'padding' : 'margin'}
      indent={level * 12}
      active={Boolean(isSelected)}
      onPress={handlePress}
      left={(state) => (
        <Ionicons
          name={getFileIcon()}
          size={compact ? 16 : 18}
          color={state.active || state.hovered ? LEFT_NAV.accent : LEFT_NAV.iconMuted}
        />
      )}
      label={file.name}
      labelWeight={isSelected ? '600' : '500'}
      right={() => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {file.size ? (
            <Text
              style={{
                fontSize: compact ? 11 : 12,
                color: LEFT_NAV.textMuted,
                marginLeft: 8,
              }}
            >
              {formatFileSize(file.size)}
            </Text>
          ) : null}
          {file.webUrl ? (
            <Ionicons
              name="open-outline"
              size={compact ? 14 : 16}
              color={LEFT_NAV.accent}
              style={{ marginLeft: 8 }}
            />
          ) : null}
        </View>
      )}
    />
  );
}
