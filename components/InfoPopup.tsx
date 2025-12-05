import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type InfoPopupProps = {
  visible: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
  closeLabel?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string; // If provided, used as cancel/secondary alongside primary
};

export default function InfoPopup({ visible, title = '', message = '', onClose, closeLabel = 'Stäng', primaryLabel, onPrimary, secondaryLabel }: InfoPopupProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.actions}>
            {primaryLabel && onPrimary ? (
              <>
                <TouchableOpacity style={styles.primaryBtn} onPress={onPrimary}>
                  <Text style={styles.primaryText}>{primaryLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <Text style={styles.closeText}>{secondaryLabel || closeLabel}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeText}>{closeLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, minWidth: '75%', borderWidth: 1, borderColor: '#E0E0E0', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  title: { fontSize: 18, fontWeight: '700', color: '#263238', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 16, color: '#555', textAlign: 'center', marginTop: 4 },
  actions: { marginTop: 12, flexDirection: 'row', justifyContent: 'center' },
  primaryBtn: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#263238', borderRadius: 8, marginRight: 10 },
  primaryText: { color: '#fff', fontWeight: '700', letterSpacing: 0.4 },
  closeBtn: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#D32F2F', borderRadius: 8, borderWidth: 1, borderColor: '#C62828' },
  closeText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.3 },
});