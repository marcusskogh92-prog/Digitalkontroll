import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ArbetsberedningControl,
  EgenkontrollControl,
  FuktmätningControl,
  MottagningskontrollControl,
  RiskbedömningControl,
  SkyddsrondControl,
} from '../features/kma/components/controls';
import ControlDetails from './ControlDetails';

export default function ProjectDetailsInlineControl({
  inlineControl,
  project,
  companyId,
  closeInlineControl,
  loadControls,
}) {
  if (!inlineControl || !inlineControl.type) return null;
  const isInlineFormOpen = !!(inlineControl && inlineControl.type && inlineControl.type !== 'ControlDetails');

  const handleInlineBack = () => {
    if (isInlineFormOpen) {
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('dkInlineAttemptExit', { detail: { reason: 'headerBack' } }));
          return;
        }
      } catch (_e) {}
    }
    closeInlineControl();
  };

  const getInlineHeaderMeta = () => {
    const explicitType = String(inlineControl?.type || '').trim();
    const detailsType = String(inlineControl?.initialValues?.control?.type || '').trim();
    const type = (explicitType === 'ControlDetails' ? detailsType : explicitType) || explicitType;
    const map = {
      Arbetsberedning: { icon: 'construct-outline', color: '#1976D2', label: 'Arbetsberedning' },
      Egenkontroll: { icon: 'checkmark-done-outline', color: '#388E3C', label: 'Egenkontroll' },
      Fuktmätning: { icon: 'water-outline', color: '#0288D1', label: 'Fuktmätning' },
      Mottagningskontroll: { icon: 'checkbox-outline', color: '#7B1FA2', label: 'Mottagningskontroll' },
      Riskbedömning: { icon: 'warning-outline', color: '#FFD600', label: 'Riskbedömning' },
      Skyddsrond: { icon: 'shield-half-outline', color: '#388E3C', label: 'Skyddsrond' },
    };

    const meta = map[type] || null;
    if (meta) return meta;
    if (type) return { icon: null, color: '#1976D2', label: type };
    return { icon: null, color: '#1976D2', label: 'Kontrolldetaljer' };
  };

  const getInlineProjectLabel = () => {
    const effectiveProject = inlineControl?.projectSnapshot || project;
    const id = String(effectiveProject?.id || '').trim();
    const name = String(effectiveProject?.name || '').trim();
    const combined = `${id} ${name}`.trim();
    return combined || name || id || 'Projekt';
  };

  const wrapInlineControlWithBack = (child) => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', alignItems: 'center' }}>
        {(() => {
          const meta = getInlineHeaderMeta();
          const projectLabel = getInlineProjectLabel();
          const linkStyle = { color: '#1976D2', fontWeight: '700' };
          const sepStyle = { color: '#9E9E9E', fontWeight: '600' };
          const currentStyle = { color: '#222', fontWeight: '700' };

          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, height: 32 }}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 14, flexShrink: 1 }}>
                <Text onPress={handleInlineBack} style={linkStyle}>
                  Projekt
                </Text>
                <Text style={sepStyle}> / </Text>
                <Text onPress={handleInlineBack} style={linkStyle}>
                  {projectLabel}
                </Text>
                <Text style={sepStyle}> / </Text>
                <Text style={currentStyle}>{meta?.label || ''}</Text>
              </Text>

              {meta?.icon ? (
                <Ionicons name={meta.icon} size={18} color={meta.color} style={{ marginLeft: 10 }} />
              ) : null}
            </View>
          );
        })()}
      </View>
      {child}
    </View>
  );

  const effectiveProject = inlineControl?.projectSnapshot || project;
  const commonProps = {
    project: effectiveProject,
    initialValues: inlineControl.initialValues,
    onExit: closeInlineControl,
    onFinished: () => {
      closeInlineControl();
      loadControls();
    },
  };

  switch (inlineControl.type) {
    case 'Arbetsberedning':
      return wrapInlineControlWithBack(<ArbetsberedningControl {...commonProps} />);
    case 'Riskbedömning':
      return wrapInlineControlWithBack(<RiskbedömningControl {...commonProps} />);
    case 'Fuktmätning':
      return wrapInlineControlWithBack(<FuktmätningControl {...commonProps} />);
    case 'Egenkontroll':
      return wrapInlineControlWithBack(<EgenkontrollControl {...commonProps} />);
    case 'Mottagningskontroll':
      return wrapInlineControlWithBack(<MottagningskontrollControl {...commonProps} />);
    case 'Skyddsrond':
      return wrapInlineControlWithBack(<SkyddsrondControl {...commonProps} />);
    case 'ControlDetails':
      return wrapInlineControlWithBack(
        <ControlDetails
          route={{
            params: {
              control: inlineControl?.initialValues?.control,
              project: effectiveProject,
              companyId,
            },
          }}
        />
      );
    default:
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, color: '#D32F2F', textAlign: 'center' }}>
            Okänd kontrolltyp: {String(inlineControl.type)}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 16, padding: 12, backgroundColor: '#1976D2', borderRadius: 8 }}
            onPress={closeInlineControl}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Tillbaka</Text>
          </TouchableOpacity>
        </View>
      );
  }
}
