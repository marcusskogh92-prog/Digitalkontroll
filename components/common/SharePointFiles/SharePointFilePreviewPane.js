import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fileExtFromName, safeText } from './sharePointFileUtils';

function isImageExt(ext) {
  const e = safeText(ext).toLowerCase();
  return e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'webp';
}

function isOfficeExt(ext) {
  const e = safeText(ext).toLowerCase();
  return e === 'doc' || e === 'docx' || e === 'xls' || e === 'xlsx' || e === 'ppt' || e === 'pptx';
}

function buildOfficeViewerUrl(sourceUrl) {
  const src = safeText(sourceUrl);
  if (!src) return '';
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`;
}

export default function SharePointFilePreviewPane({
  item,
  onClose,
  onOpenInNewTab,
}) {
  const name = safeText(item?.name) || '';
  const ext = fileExtFromName(name);

  const webUrl = safeText(item?.webUrl);
  const downloadUrl = safeText(item?.downloadUrl);

  const preferredUrl = useMemo(() => downloadUrl || webUrl, [downloadUrl, webUrl]);
  const externalUrl = useMemo(() => webUrl || preferredUrl, [webUrl, preferredUrl]);

  const kind = useMemo(() => {
    const e = safeText(ext).toLowerCase();
    if (!e) return 'unknown';
    if (e === 'pdf') return 'pdf';
    if (isImageExt(e)) return 'image';
    if (isOfficeExt(e)) return 'office';
    return 'unsupported';
  }, [ext]);

  if (!item) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>Förhandsvisning</Text>
        </View>
        <View style={styles.bodyCentered}>
          <Ionicons name="document-outline" size={22} color="#94A3B8" />
          <Text style={styles.muted}>
            Välj en fil för att förhandsvisa
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{name || 'Förhandsvisning'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {safeText(ext).toUpperCase() || 'FIL'}
          </Text>
        </View>

        <Pressable
          onPress={() => onOpenInNewTab?.(externalUrl)}
          disabled={!safeText(externalUrl)}
          style={({ hovered, pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: safeText(externalUrl) ? 'pointer' : 'default' } : {}),
          })}
        >
          <Ionicons name="open-outline" size={16} color="#1976D2" />
          <Text style={styles.actionText}>Öppna i ny flik</Text>
        </Pressable>

        <Pressable
          onPress={() => onClose?.()}
          style={({ hovered, pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          })}
        >
          <Ionicons name="close" size={18} color="#64748b" />
        </Pressable>
      </View>

      <View style={styles.body}>
        {Platform.OS !== 'web' ? (
          <View style={styles.bodyCentered}>
            <Ionicons name="information-circle-outline" size={22} color="#94A3B8" />
            <Text style={styles.muted}>
              Förhandsvisning stöds i webben i detta steg.
            </Text>
          </View>
        ) : kind === 'pdf' ? (
          safeText(preferredUrl) ? (
            <iframe
              title={name || 'PDF'}
              src={preferredUrl}
              style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
            />
          ) : (
            <View style={styles.bodyCentered}>
              <Text style={styles.muted}>Kunde inte ladda PDF (saknar länk).</Text>
            </View>
          )
        ) : kind === 'image' ? (
          safeText(preferredUrl) ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: preferredUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.bodyCentered}>
              <Text style={styles.muted}>Kunde inte ladda bild (saknar länk).</Text>
            </View>
          )
        ) : kind === 'office' ? (
          safeText(preferredUrl) ? (
            <iframe
              title={name || 'Office'}
              src={buildOfficeViewerUrl(preferredUrl)}
              style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
              allow="fullscreen"
            />
          ) : (
            <View style={styles.bodyCentered}>
              <Text style={styles.muted}>Kunde inte ladda dokument (saknar länk).</Text>
            </View>
          )
        ) : (
          <View style={styles.bodyCentered}>
            <Ionicons name="alert-circle-outline" size={22} color="#94A3B8" />
            <Text style={styles.unsupportedTitle} numberOfLines={2}>
              Förhandsvisning stöds inte ännu
            </Text>
            <Text style={styles.muted} numberOfLines={3}>
              {name}
            </Text>
            <Text style={styles.muted}>
              Filtyp: {safeText(ext).toUpperCase() || 'Okänd'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '400',
    color: '#64748b',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#1976D2',
  },
  body: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#fff',
  },
  bodyCentered: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
    backgroundColor: '#fff',
  },
  muted: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    textAlign: 'center',
  },
  unsupportedTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
    textAlign: 'center',
  },
  imageWrap: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F8FAFC',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
