import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { fetchCompanyContacts, fetchCompanyMembers } from '../../firebase';
import { useSystemModal } from '../Modals/SystemModalProvider';

import ParticipantPickerModal from '../ParticipantPickerModal';

function mapInternalMembers(membersRes, companyId) {
  const members = Array.isArray(membersRes?.out) ? membersRes.out : (Array.isArray(membersRes) ? membersRes : []);
  return members
    .map((m) => {
      const refId = String(m?.uid || m?.id || '').trim();
      if (!refId) return null;
      return {
        source: 'internal',
        refId,
        name: String(m?.displayName || m?.name || m?.email || '—').trim(),
        company: String(companyId || '').trim(),
        email: String(m?.email || '').trim(),
        phone: '',
        metaRole: String(m?.role || '').trim(),
      };
    })
    .filter(Boolean);
}

function mapExternalContacts(contactsRes, fallbackCompanyId) {
  const contacts = Array.isArray(contactsRes) ? contactsRes : [];
  return contacts
    .map((c) => {
      const refId = String(c?.id || '').trim();
      if (!refId) return null;
      const companyName = String(c?.contactCompanyName || c?.companyName || fallbackCompanyId).trim();
      return {
        source: 'contact',
        refId,
        name: String(c?.name || '—').trim(),
        company: companyName,
        email: String(c?.email || '').trim(),
        phone: String(c?.phone || '').trim(),
        metaRole: String(c?.role || '').trim(),
      };
    })
    .filter(Boolean);
}

function AddParticipantModalContent({
  requestClose,
  companyId,
  existingMemberKeys,
  onAdd,
  defaultSource = 'internal',
  defaultShowInternal,
  defaultShowExternal,
  allowInternal = true,
  allowExternal = true,
  lazyLoadExternal = false,
  groupLinkedSupplierId,
  groupLinkedCustomerId,
}) {
  const showLockedInfo = useCallback((candidate) => {
    const name = String(candidate?.name || '').trim() || 'Personen';
    const msg = `${name} är redan tillagd i gruppen.\n\nTa bort personen i Organisation & roller (i gruppens lista).`;
    if (Platform.OS === 'web') {
      window.alert(msg);
      return;
    }
    Alert.alert('Redan tillagd', msg, [{ text: 'OK' }]);
  }, []);

  const cid = String(companyId || '').trim();

  const [loadingInternal, setLoadingInternal] = useState(false);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [errorInternal, setErrorInternal] = useState('');
  const [errorExternal, setErrorExternal] = useState('');

  const [internalCandidates, setInternalCandidates] = useState([]);
  const [externalCandidates, setExternalCandidates] = useState([]);
  const [externalLoaded, setExternalLoaded] = useState(false);

  const [externalRequested, setExternalRequested] = useState(false);

  /** När gruppen har företag: false = visa endast företagets kontakter, true = visa hela registret */
  const [showAllContacts, setShowAllContacts] = useState(false);

  const hasGroupCompany = !!(groupLinkedSupplierId || groupLinkedCustomerId);

  const loadExternal = useCallback(async () => {
    if (!allowExternal) return;
    if (!cid) return;
    if (externalLoaded) return;

    setLoadingExternal(true);
    setErrorExternal('');
    try {
      const contactsRes = await fetchCompanyContacts(cid);
      let list = Array.isArray(contactsRes) ? contactsRes : [];
      const supId = groupLinkedSupplierId != null ? String(groupLinkedSupplierId).trim() : null;
      const custId = groupLinkedCustomerId != null ? String(groupLinkedCustomerId).trim() : null;
      const filterByCompany = hasGroupCompany && !showAllContacts && (supId || custId);
      if (filterByCompany) {
        list = list.filter((c) => {
          if (supId && String(c?.linkedSupplierId ?? '').trim() === supId) return true;
          if (custId && String(c?.customerId ?? '').trim() === custId) return true;
          return false;
        });
      }
      const mappedContacts = mapExternalContacts(list, cid);
      setExternalCandidates(mappedContacts);
      setExternalLoaded(true);
    } catch (e) {
      setErrorExternal(String(e?.message || e || 'Kunde inte ladda kontakter.'));
    } finally {
      setLoadingExternal(false);
    }
  }, [allowExternal, cid, externalLoaded, hasGroupCompany, showAllContacts, groupLinkedSupplierId, groupLinkedCustomerId]);

  const handleShowAllContactsChange = useCallback((value) => {
    setShowAllContacts(value);
    setExternalLoaded(false);
    setExternalCandidates([]);
  }, []);

  useEffect(() => {
    setErrorInternal('');
    setErrorExternal('');
    setInternalCandidates([]);
    setExternalCandidates([]);
    setExternalLoaded(false);
    setExternalRequested(false);
    setShowAllContacts(false);

    if (!cid) {
      setErrorInternal('Saknar companyId.');
      return;
    }

    let cancelled = false;
    (async () => {
      if (allowInternal) {
        setLoadingInternal(true);
        setErrorInternal('');
        try {
          const membersRes = await fetchCompanyMembers(cid);
          const mappedMembers = mapInternalMembers(membersRes, cid);
          if (!cancelled) setInternalCandidates(mappedMembers);
        } catch (e) {
          if (!cancelled) setErrorInternal(String(e?.message || e || 'Kunde inte ladda interna användare.'));
        } finally {
          if (!cancelled) setLoadingInternal(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowInternal, cid]);

  useEffect(() => {
    if (!allowExternal) return;
    if (!cid) return;
    if (externalLoaded) return;
    if (lazyLoadExternal && !externalRequested) return;
    loadExternal();
  }, [allowExternal, cid, externalLoaded, externalRequested, lazyLoadExternal, loadExternal]);

  const handleConfirm = useCallback(async (selectedList) => {
    try {
      const batch = (Array.isArray(selectedList) ? selectedList : []).map((c) => {
        const refId = String(c?.refId || '').trim();
        const source = String(c?.source || '').trim();
        return refId && source ? c : null;
      }).filter(Boolean);
      if (batch.length === 0) return;
      await onAdd(batch);
      requestClose();
    } catch (e) {
      const msg = String(e?.message || e || 'Kunde inte lägga till.');
      // Show error in both channels to avoid hiding it if user toggles filters.
      setErrorInternal(msg);
      setErrorExternal(msg);
    }
  }, [onAdd, requestClose]);

  return (
    <ParticipantPickerModal
      requestClose={requestClose}
      title="Lägg till deltagare"
      subtitle="Sök i interna användare och kontaktregister"
      footerTitle="Deltagare i projektet"
      helpTextEmptySelection="Välj en eller flera personer i listan ovan. Roller sätts efteråt."
      allowInternal={!!allowInternal}
      allowExternal={!!allowExternal}
      defaultSource={defaultSource}
      defaultShowInternal={defaultShowInternal}
      defaultShowExternal={defaultShowExternal}
      loadingInternal={!!loadingInternal}
      loadingExternal={!!loadingExternal}
      errorInternal={errorInternal}
      errorExternal={errorExternal}
      internalCandidates={internalCandidates}
      externalCandidates={externalCandidates}
      existingRowKeys={existingMemberKeys}
      onRowLockedPress={showLockedInfo}
      lockedRowHelpText="{name} är redan tillagd i gruppen.\n\nTa bort personen i Organisation & roller (i gruppens lista)."
      onToggleExternal={() => setExternalRequested(true)}
      onConfirm={handleConfirm}
      confirmLabel="Lägg till"
      showAllContactsCheckbox={!!hasGroupCompany}
      showAllContacts={showAllContacts}
      onShowAllContactsChange={handleShowAllContactsChange}
    />
  );
}

export default function AddParticipantModal({
  visible,
  onClose,
  companyId,
  existingMemberKeys,
  onAdd,
  defaultSource = 'internal',
  defaultShowInternal,
  defaultShowExternal,
  allowInternal = true,
  allowExternal = true,
  lazyLoadExternal = false,
  groupLinkedSupplierId,
  groupLinkedCustomerId,
}) {
  const { openSystemModal, closeSystemModal } = useSystemModal();
  const modalIdRef = useRef(null);

  useEffect(() => {
    if (visible && !modalIdRef.current) {
      modalIdRef.current = openSystemModal({
        component: AddParticipantModalContent,
        props: {
          companyId,
          existingMemberKeys,
          onAdd,
          defaultSource,
          defaultShowInternal,
          defaultShowExternal,
          allowInternal,
          allowExternal,
          lazyLoadExternal,
          groupLinkedSupplierId,
          groupLinkedCustomerId,
        },
        onClose,
      });
      return;
    }

    if (!visible && modalIdRef.current) {
      closeSystemModal(modalIdRef.current);
      modalIdRef.current = null;
    }
  }, [visible, openSystemModal, closeSystemModal, onClose, companyId, existingMemberKeys, onAdd, defaultSource, defaultShowInternal, defaultShowExternal, allowInternal, allowExternal, lazyLoadExternal, groupLinkedSupplierId, groupLinkedCustomerId]);

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
