import { useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import BaseControlForm from '../components/BaseControlForm';
import { auth, fetchCompanyMallar, logCompanyActivity, saveControlToFirestore } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';

function buildChecklistFromLayout(layout) {
  try {
    if (!layout || !Array.isArray(layout.sections)) return [];
    const sections = layout.sections || [];
    const out = sections
      .map((section) => {
        const label = String(section?.title || section?.label || '').trim();
        const fields = Array.isArray(section?.fields) ? section.fields : [];
        const points = fields
          .map((field) => String(field?.label || field?.title || '').trim())
          .filter(Boolean);
        if (!label && points.length === 0) return null;
        return { label, points };
      })
      .filter(Boolean);
    return out;
  } catch (_e) {
    return [];
  }
}

export default function TemplateControlScreen({
  date,
  participants = [],
  project: projectProp,
  initialValues: initialValuesProp,
  controlType: controlTypeProp,
  onExit,
  onFinished,
}) {
  const route = useRoute();
  const routeParams = route?.params || {};
  const project = projectProp ?? routeParams.project;
  const initialValues = (initialValuesProp ?? routeParams.initialValues) || {};

  const [template, setTemplate] = useState(routeParams.template || null);
  const [loading, setLoading] = useState(!routeParams.template && !!routeParams.templateId && !!routeParams.companyId);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (template || !routeParams.templateId || !routeParams.companyId) return;
        setLoading(true);
        const items = await fetchCompanyMallar(routeParams.companyId).catch(() => []);
        if (cancelled) return;
        const found = Array.isArray(items)
          ? items.find((tpl) => String(tpl.id) === String(routeParams.templateId))
          : null;
        if (found) {
          setTemplate(found);
          setError('');
        } else {
          setError('Kunde inte hitta vald mall.');
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e?.message || e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template, routeParams.templateId, routeParams.companyId]);

  const layout = useMemo(() => (template && template.layout ? template.layout : null), [template]);

  const checklistConfig = useMemo(() => buildChecklistFromLayout(layout), [layout]);

  const hideWeather = useMemo(() => {
    try {
      const meta = layout && layout.metaFields ? layout.metaFields : null;
      if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'weather')) return true;
      const w = meta.weather;
      return !(w && typeof w.enabled === 'boolean' ? w.enabled : false);
    } catch (_e) {
      return true;
    }
  }, [layout]);

  const hideProjectHeader = useMemo(() => {
    try {
      const meta = layout && layout.metaFields ? layout.metaFields : null;
      if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'project')) return false;
      const p = meta.project;
      return !(p && typeof p.enabled === 'boolean' ? p.enabled : false);
    } catch (_e) {
      return false;
    }
  }, [layout]);

  const WEATHER_OPTIONS = useMemo(
    () => [
      { key: 'Soligt', icon: 'sunny' },
      { key: 'Delvis molnigt', icon: 'partly-sunny' },
      { key: 'Molnigt', icon: 'cloudy' },
      { key: 'Regn', icon: 'rainy' },
      { key: 'Snö', icon: 'snow' },
      { key: 'Åska', icon: 'thunderstorm' },
    ],
    []
  );

  const controlType = useMemo(() => {
    if (template && template.controlType) return String(template.controlType);
    if (template && template.title) return String(template.title);
    if (controlTypeProp) return String(controlTypeProp);
    if (routeParams && routeParams.controlType) return String(routeParams.controlType);
    return 'Kontroll';
  }, [template, controlTypeProp, routeParams]);

  const LABELS = useMemo(
    () => ({
      title: template?.title || controlType || 'Kontroll',
      saveButton: 'Spara',
      saveDraftButton: 'Spara och slutför senare',
    }),
    [template, controlType]
  );

  const handleSave = async (data) => {
    try {
      const completed = {
        ...data,
        project: data.project || project,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
        type: controlType || 'Kontroll',
        id: data.id || uuidv4(),
        templateId: template?.id || routeParams.templateId || null,
        templateVersion: template?.version || null,
      };

      await saveControlToFirestore(completed);

      try {
        const user = auth?.currentUser;
        const actorName = user ? (user.displayName || formatPersonName(user.email || user)) : null;
        await logCompanyActivity({
          type: completed.type || 'Kontroll',
          kind: 'completed',
          projectId: completed.project?.id || null,
          projectName: completed.project?.name || null,
          actorName: actorName || null,
          actorEmail: user?.email || null,
          uid: user?.uid || null,
          templateId: completed.templateId || null,
          templateVersion: completed.templateVersion || null,
        });
      } catch (_e) {}
    } catch (e) {
      try {
        Alert.alert('Fel', 'Kunde inte spara kontrollen: ' + (e && e.message ? e.message : String(e)));
      } catch (_e) {
        // Fallback för web om Alert inte finns
        // eslint-disable-next-line no-alert
        alert('Kunde inte spara kontrollen: ' + (e && e.message ? e.message : String(e)));
      }
    }
  };

  const handleSaveDraft = async (data) => {
    try {
      const draft = {
        ...data,
        project: data.project || project,
        status: 'UTKAST',
        savedAt: new Date().toISOString(),
        type: controlType || 'Kontroll',
        id: data.id || uuidv4(),
        templateId: template?.id || routeParams.templateId || null,
        templateVersion: template?.version || null,
      };

      try {
        const user = auth?.currentUser;
        const actorName = user ? (user.displayName || formatPersonName(user.email || user)) : null;
        await logCompanyActivity({
          type: draft.type || 'Kontroll',
          kind: 'draft',
          projectId: draft.project?.id || null,
          projectName: draft.project?.name || null,
          actorName: actorName || null,
          actorEmail: user?.email || null,
          uid: user?.uid || null,
          templateId: draft.templateId || null,
          templateVersion: draft.templateVersion || null,
        });
      } catch (_e) {}
    } catch (_e) {}
  };

  if (loading && !template) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ fontSize: 16, color: '#555' }}>Laddar mall...</Text>
      </View>
    );
  }

  if (!template && error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ fontSize: 16, color: '#D32F2F', textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  return (
    <BaseControlForm
      date={date}
      controlType={controlType}
      labels={LABELS}
      participants={participants}
      project={project}
      initialValues={initialValues}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      hideWeather={hideWeather}
      hideProjectHeader={hideProjectHeader}
      weatherOptions={WEATHER_OPTIONS}
      checklistConfig={checklistConfig}
      onExit={onExit}
      onFinished={onFinished}
    />
  );
}
