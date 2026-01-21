import React from 'react';
import { DEFAULT_CONTROL_TYPES, fetchCompanyControlTypes, fetchCompanyProfile } from '../components/firebase';

/**
 * Hanterar company profile + control types för en given companyId
 * och exponerar färdiga controlTypeOptions för Home-screenen.
 */
export function useCompanyControlTypes({ companyId }) {
  const [companyProfile, setCompanyProfile] = React.useState(null);
  const [controlTypes, setControlTypes] = React.useState(DEFAULT_CONTROL_TYPES);

  // Ladda full lista med kontrolltyper (default + företagsspecifika)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
        if (mounted && Array.isArray(list) && list.length > 0) {
          setControlTypes(list);
        } else if (mounted) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const controlTypeOptions = React.useMemo(() => {
    const baseList = Array.isArray(controlTypes) && controlTypes.length > 0
      ? controlTypes
      : DEFAULT_CONTROL_TYPES;

    // Om vi har några custom-typer behandlas listan som sanningskälla
    // och vi ignorerar enabledControlTypes från company profile.
    const hasCustomTypes = baseList.some(ct => ct && ct.builtin === false);

    let visible = baseList.filter(ct => ct && ct.hidden !== true);

    const enabled = companyProfile?.enabledControlTypes;
    if (!hasCustomTypes && Array.isArray(enabled) && enabled.length > 0) {
      const enabledSet = new Set(enabled.map(v => String(v || '').trim()).filter(Boolean));
      visible = visible.filter((ct) => {
        const name = String(ct.name || '').trim();
        const key = String(ct.key || '').trim();
        if (!enabledSet.size) return true;
        return (name && enabledSet.has(name)) || (key && enabledSet.has(key));
      });
    }

    return visible.map((ct) => ({
      type: ct.name || ct.key || '',
      icon: ct.icon || 'document-text-outline',
      color: ct.color || '#455A64',
    })).filter(o => o.type);
  }, [controlTypes, companyProfile]);

  // Ladda company profile när companyId ändras
  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setCompanyProfile(null);
      return () => { active = false; };
    }
    fetchCompanyProfile(companyId)
      .then((p) => { if (active) setCompanyProfile(p || null); })
      .catch(() => { /* ignore */ });
    return () => { active = false; };
  }, [companyId]);

  return {
    companyProfile,
    controlTypes,
    controlTypeOptions,
  };
}
