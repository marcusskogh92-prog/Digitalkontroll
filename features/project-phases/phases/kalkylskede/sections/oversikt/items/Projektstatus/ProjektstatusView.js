/**
 * Projektstatus View - Project status component
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';

export default function ProjektstatusView({ projectId, companyId, project, hidePageHeader = false }) {
  const [status, setStatus] = useState(project?.status || 'ongoing');
  const [isSaving, setIsSaving] = useState(false);

  const statusOptions = [
    { key: 'ongoing', label: 'Pågående', color: '#1976D2', icon: 'play-circle-outline' },
    { key: 'on-hold', label: 'Pausad', color: '#FF9800', icon: 'pause-circle-outline' },
    { key: 'completed', label: 'Avslutad', color: '#4CAF50', icon: 'checkmark-circle-outline' },
    { key: 'cancelled', label: 'Inställd', color: '#F44336', icon: 'close-circle-outline' }
  ];

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    setIsSaving(true);

    try {
      // Update in Firestore (you'll need to implement this)
      // await updateProjectStatus(companyId, projectId, newStatus);

      // Digitalkontroll no longer uses completion/progress percentages.
    } catch (error) {
      console.error('[ProjektstatusView] Error updating status:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const currentStatus = statusOptions.find(s => s.key === status) || statusOptions[0];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.mainContent}>
          {!hidePageHeader ? (
            <View style={styles.header}>
              <Text style={PROJECT_TYPOGRAPHY.viewTitle}>Projektstatus</Text>
              <Text style={PROJECT_TYPOGRAPHY.viewSubtitle}>Hantera projektets status och översikt</Text>
            </View>
          ) : null}

          <View style={styles.content}>
            <Text style={styles.label}>Nuvarande status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: currentStatus.color + '20' }]}>
              <Ionicons name={currentStatus.icon} size={20} color={currentStatus.color} />
              <Text style={[styles.statusText, { color: currentStatus.color }]}>
                {currentStatus.label}
              </Text>
            </View>

            <Text style={[styles.label, { marginTop: 24 }]}>Ändra status:</Text>
            <View style={styles.optionsContainer}>
              {statusOptions.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.option,
                    status === option.key && styles.optionActive,
                    { borderColor: option.color }
                  ]}
                  onPress={() => handleStatusChange(option.key)}
                  disabled={isSaving}
                >
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={status === option.key ? option.color : '#666'}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      status === option.key && { color: option.color, fontWeight: '600' }
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Project info */}
            {project && (
              <View style={styles.projectInfo}>
                <Text style={styles.sectionTitle}>Projektinformation</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Projektnummer:</Text>
                  <Text style={styles.infoValue}>{project.id || '-'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Projektnamn:</Text>
                  <Text style={styles.infoValue}>{project.name || '-'}</Text>
                </View>
                {project.ansvarig && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Ansvarig:</Text>
                    <Text style={styles.infoValue}>{project.ansvarig}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
        {/* Right panel removed - no longer showing overview and latest activity */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  contentWrapper: {
    flex: 1,
    flexDirection: 'row',
    maxWidth: '100%'
  },
  mainContent: {
    flex: 1,
    paddingRight: 0
  },
  header: {
    marginBottom: 24
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#666'
  },
  content: {
    flex: 1
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 12
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 12
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600'
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12
  },
  option: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    gap: 12
  },
  optionActive: {
    backgroundColor: '#fff',
    borderWidth: 2
  },
  optionText: {
    fontSize: 14,
    color: '#666'
  },
  projectInfo: {
    marginTop: 32,
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 8
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222',
    marginBottom: 16
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 120
  },
  infoValue: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
    flex: 1
  }
});
