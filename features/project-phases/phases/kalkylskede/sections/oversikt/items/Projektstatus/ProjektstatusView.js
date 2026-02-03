/**
 * Skede View - Project lifecycle is driven only by skede (phase)
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import { patchCompanyProject, patchSharePointProjectMetadata } from '../../../../../../../../components/firebase';
import { getPhaseConfig } from '../../../../../../../projects/constants';

export default function ProjektstatusView({ projectId, companyId, project, hidePageHeader = false }) {
  const [phaseKey, setPhaseKey] = useState(project?.phase || project?.phaseKey || 'kalkylskede');
  const [isSaving, setIsSaving] = useState(false);

  const phaseOptions = [
    { key: 'kalkylskede', label: 'Kalkylskede', color: getPhaseConfig('kalkylskede')?.color || '#1976D2', icon: 'calculator-outline' },
    { key: 'produktion', label: 'Produktion', color: getPhaseConfig('produktion')?.color || '#43A047', icon: 'construct-outline' },
    { key: 'avslut', label: 'Avslut', color: getPhaseConfig('avslut')?.color || '#111', icon: 'checkmark-circle-outline' },
    { key: 'eftermarknad', label: 'Eftermarknad', color: getPhaseConfig('eftermarknad')?.color || '#7B1FA2', icon: 'time-outline' },
  ];

  const handlePhaseChange = async (newPhaseKey) => {
    setPhaseKey(newPhaseKey);
    setIsSaving(true);

    try {
      const cid = String(companyId || '').trim();
      const pid = String(projectId || project?.id || '').trim();
      if (cid && pid) {
        await patchCompanyProject(cid, pid, { phase: newPhaseKey });

        // Best-effort: keep SharePoint metadata in sync so left panel/dots update instantly.
        try {
          const siteId = String(
            project?.siteId ||
            project?.siteID ||
            project?.sharePointSiteId ||
            project?.site?.id ||
            project?.site?.siteId ||
            project?.folder?.siteId ||
            project?.folder?.siteID ||
            ''
          ).trim();
          const projectPath = String(
            project?.projectPath ||
            project?.path ||
            project?.sharePointPath ||
            project?.folder?.path ||
            ''
          ).trim();
          if (siteId && projectPath) {
            await patchSharePointProjectMetadata(cid, {
              companyId: cid,
              siteId,
              projectPath,
              phaseKey: newPhaseKey,
            });
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              try { window.dispatchEvent(new Event('dkSharePointMetaUpdated')); } catch (_e) {}
            }
          }
        } catch (_e) {}
      }
    } catch (error) {
      console.error('[SkedeView] Error updating phase:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const current = phaseOptions.find(s => s.key === phaseKey) || phaseOptions[0];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.mainContent}>
          {!hidePageHeader ? (
            <View style={styles.header}>
              <Text style={PROJECT_TYPOGRAPHY.viewTitle}>Skede</Text>
              <Text style={PROJECT_TYPOGRAPHY.viewSubtitle}>Projektets livscykel styrs av skede</Text>
            </View>
          ) : null}

          <View style={styles.content}>
            <Text style={styles.label}>Nuvarande skede:</Text>
            <View style={[styles.statusBadge, { backgroundColor: current.color + '20' }]}>
              <Ionicons name={current.icon} size={20} color={current.color} />
              <Text style={[styles.statusText, { color: current.color }]}>
                {current.label}
              </Text>
            </View>

            <Text style={[styles.label, { marginTop: 24 }]}>Ändra skede:</Text>
            <View style={styles.optionsContainer}>
              {phaseOptions.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.option,
                    phaseKey === option.key && styles.optionActive,
                    { borderColor: option.color }
                  ]}
                  onPress={() => handlePhaseChange(option.key)}
                  disabled={isSaving}
                >
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={phaseKey === option.key ? option.color : '#666'}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      phaseKey === option.key && { color: option.color, fontWeight: '600' }
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
