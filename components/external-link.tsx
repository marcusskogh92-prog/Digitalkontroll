import { openBrowserAsync } from 'expo-web-browser';
import { Linking, Platform, Text, TouchableOpacity } from 'react-native';

type Props = { href: string; children?: any; style?: any };

export function ExternalLink({ href, children, style }: Props) {
  const handlePress = async () => {
    try {
      if (Platform.OS === 'web') {
        window.open(href, '_blank');
      } else {
        // prefer in-app browser when available
        try {
          await openBrowserAsync(href);
        } catch (e) {
          await Linking.openURL(href);
        }
      }
    } catch {
      try { await Linking.openURL(href); } catch {}
    }
  };
  return (
    <TouchableOpacity onPress={handlePress} style={style} accessibilityRole="link">
      {children ? children : <Text style={{ color: '#1976D2' }}>{href}</Text>}
    </TouchableOpacity>
  );
}
