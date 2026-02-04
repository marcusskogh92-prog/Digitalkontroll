import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useSystemModal } from '../Modals/SystemModalProvider';
import ParticipantPickerModal from '../ParticipantPickerModal';

function parseRefKey(refKey) {
  const raw = String(refKey || '').trim();
  const idx = raw.indexOf(':');
  if (idx <= 0) return { source: '', refId: raw };
  return { source: raw.slice(0, idx), refId: raw.slice(idx + 1) };
}

function isValidEmailish(s) {
  const v = String(s || '').trim();
  return !!v && v.includes('@');
}

function toEmailSet(participants) {
  const set = new Set();
  (Array.isArray(participants) ? participants : []).forEach((p) => {
    const email = String(p?.email || '').trim().toLowerCase();
    if (email) set.add(email);
  });
  return set;
}

function ActivityParticipantPickerModalContent({
  requestClose,
  title,
  subtitle,
  helpTextEmptySelection,
  peopleCandidates,
  peopleLoading,
  peopleError,
  participants,
  onConfirmParticipants,
}) {
  const mapped = useMemo(() => {
    const list = Array.isArray(peopleCandidates) ? peopleCandidates : [];

    const internal = [];
    const external = [];

    for (const c of list) {
      const refKey = String(c?.refKey || '').trim();
      const { source, refId } = parseRefKey(refKey);
      const email = String(c?.email || '').trim();
      if (!refId || !source) continue;
      if (!isValidEmailish(email)) continue;

      const cand = {
        source: source === 'internal' ? 'internal' : 'contact',
        refId,
        name: String(c?.name || email || '—').trim(),
        company: String(c?.company || '').trim(),
        email,
        phone: String(c?.phone || '').trim(),
      };

      if (cand.source === 'internal') internal.push(cand);
      else external.push(cand);
    }

    return { internal, external };
  }, [peopleCandidates]);

  const initialSelectedEmails = useMemo(() => {
    const set = toEmailSet(participants);
    return Array.from(set);
  }, [participants]);

  const onConfirm = useCallback(
    async (selectedCandidates) => {
      const list = Array.isArray(selectedCandidates) ? selectedCandidates : [];
      const next = list
        .map((c) => ({
          name: String(c?.name || '').trim(),
          email: String(c?.email || '').trim(),
        }))
        .filter((p) => isValidEmailish(p.email));

      await onConfirmParticipants?.(next);
      requestClose?.();
    },
    [onConfirmParticipants, requestClose]
  );

  return (
    <ParticipantPickerModal
      requestClose={requestClose}
      title={title}
      subtitle={subtitle}
      footerTitle="Deltagare"
      helpTextEmptySelection={helpTextEmptySelection}
      allowInternal
      allowExternal
      defaultShowInternal
      defaultShowExternal
      loadingInternal={!!peopleLoading}
      loadingExternal={!!peopleLoading}
      errorInternal={peopleError ? String(peopleError) : ''}
      errorExternal={peopleError ? String(peopleError) : ''}
      internalCandidates={mapped.internal}
      externalCandidates={mapped.external}
      initialSelectedEmails={initialSelectedEmails}
      onConfirm={onConfirm}
      confirmLabel="Lägg till"
    />
  );
}

export default function ActivityParticipantPickerModal({
  visible,
  onClose,
  title = 'Lägg till deltagare',
  subtitle = 'Välj deltagare för denna aktivitet.',
  helpTextEmptySelection = 'Välj deltagare för denna aktivitet / detta datum.',
  peopleCandidates,
  peopleLoading,
  peopleError,
  participants,
  onConfirmParticipants,
}) {
  const { openSystemModal, closeSystemModal } = useSystemModal();
  const modalIdRef = useRef(null);

  const safeOnClose = useCallback((...args) => {
    if (typeof onClose === 'function') {
      onClose(...args);
    }
  }, [onClose]);

  useEffect(() => {
    if (visible && !modalIdRef.current) {
      modalIdRef.current = openSystemModal({
        component: ActivityParticipantPickerModalContent,
        props: {
          title,
          subtitle,
          helpTextEmptySelection,
          peopleCandidates,
          peopleLoading,
          peopleError,
          participants,
          onConfirmParticipants,
        },
        onClose: safeOnClose,
      });
      return;
    }

    if (!visible && modalIdRef.current) {
      closeSystemModal(modalIdRef.current);
      modalIdRef.current = null;
    }
  }, [
    visible,
    openSystemModal,
    closeSystemModal,
    safeOnClose,
    title,
    subtitle,
    helpTextEmptySelection,
    peopleCandidates,
    peopleLoading,
    peopleError,
    participants,
    onConfirmParticipants,
  ]);

  useEffect(() => {
    return () => {
      if (modalIdRef.current) {
        closeSystemModal(modalIdRef.current);
        modalIdRef.current = null;
      }
    };
  }, [closeSystemModal]);

  return null;
}
