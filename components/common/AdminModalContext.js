/**
 * Admin modal context – opens admin sections (Kunder, Kontaktregister, Leverantörer, Byggdelstabell) in a modal
 * instead of navigating away. Used by Administration and Register menus in the top banner.
 */

import React, { useCallback, useState } from 'react';
import AdminContactRegistryModal from './AdminContactRegistryModal';
import AdminCustomersModal from './AdminCustomersModal';
import AdminSuppliersModal from './AdminSuppliersModal';
import AdminByggdelModal from './AdminByggdelModal';
import AdminKontoplanModal from './AdminKontoplanModal';
import MallarModal from './MallarModal';
import AdminAIPromptsModal from './AdminAIPromptsModal';

const defaultContext = {
  openCustomersModal: () => {},
  closeCustomersModal: () => {},
  openContactRegistryModal: () => {},
  closeContactRegistryModal: () => {},
  openSuppliersModal: () => {},
  closeSuppliersModal: () => {},
  openByggdelModal: () => {},
  closeByggdelModal: () => {},
  openKontoplanModal: () => {},
  closeKontoplanModal: () => {},
  openMallarModal: () => {},
  closeMallarModal: () => {},
  openAIPromptsModal: () => {},
  closeAIPromptsModal: () => {},
};

export const AdminModalContext = React.createContext(defaultContext);

export function AdminModalProvider({ children }) {
  const [customersOpen, setCustomersOpen] = useState(false);
  const [customersCompanyId, setCustomersCompanyId] = useState('');
  const [contactRegistryOpen, setContactRegistryOpen] = useState(false);
  const [contactRegistryCompanyId, setContactRegistryCompanyId] = useState('');
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [suppliersCompanyId, setSuppliersCompanyId] = useState('');
  const [byggdelOpen, setByggdelOpen] = useState(false);
  const [byggdelCompanyId, setByggdelCompanyId] = useState('');
  const [kontoplanOpen, setKontoplanOpen] = useState(false);
  const [kontoplanCompanyId, setKontoplanCompanyId] = useState('');
  const [mallarOpen, setMallarOpen] = useState(false);
  const [mallarCompanyId, setMallarCompanyId] = useState('');
  const [aiPromptsOpen, setAiPromptsOpen] = useState(false);
  const [aiPromptsCompanyId, setAiPromptsCompanyId] = useState('');

  const openCustomersModal = useCallback((companyId) => {
    setCustomersCompanyId(String(companyId || '').trim());
    setCustomersOpen(true);
  }, []);

  const closeCustomersModal = useCallback(() => {
    setCustomersOpen(false);
    setCustomersCompanyId('');
  }, []);

  const openContactRegistryModal = useCallback((companyId) => {
    setContactRegistryCompanyId(String(companyId || '').trim());
    setContactRegistryOpen(true);
  }, []);

  const closeContactRegistryModal = useCallback(() => {
    setContactRegistryOpen(false);
    setContactRegistryCompanyId('');
  }, []);

  const openSuppliersModal = useCallback((companyId) => {
    setSuppliersCompanyId(String(companyId || '').trim());
    setSuppliersOpen(true);
  }, []);

  const closeSuppliersModal = useCallback(() => {
    setSuppliersOpen(false);
    setSuppliersCompanyId('');
  }, []);

  const openByggdelModal = useCallback((companyId) => {
    setByggdelCompanyId(String(companyId || '').trim());
    setByggdelOpen(true);
  }, []);

  const closeByggdelModal = useCallback(() => {
    setByggdelOpen(false);
    setByggdelCompanyId('');
  }, []);

  const openKontoplanModal = useCallback((companyId) => {
    setKontoplanCompanyId(String(companyId || '').trim());
    setKontoplanOpen(true);
  }, []);

  const closeKontoplanModal = useCallback(() => {
    setKontoplanOpen(false);
    setKontoplanCompanyId('');
  }, []);

  const openMallarModal = useCallback((companyId) => {
    setMallarCompanyId(String(companyId || '').trim());
    setMallarOpen(true);
  }, []);

  const closeMallarModal = useCallback(() => {
    setMallarOpen(false);
    setMallarCompanyId('');
  }, []);

  const openAIPromptsModal = useCallback((companyId) => {
    setAiPromptsCompanyId(String(companyId || '').trim());
    setAiPromptsOpen(true);
  }, []);

  const closeAIPromptsModal = useCallback(() => {
    setAiPromptsOpen(false);
    setAiPromptsCompanyId('');
  }, []);

  const value = {
    openCustomersModal,
    closeCustomersModal,
    openContactRegistryModal,
    closeContactRegistryModal,
    openSuppliersModal,
    closeSuppliersModal,
    openByggdelModal,
    closeByggdelModal,
    openKontoplanModal,
    closeKontoplanModal,
    openMallarModal,
    closeMallarModal,
    openAIPromptsModal,
    closeAIPromptsModal,
  };

  return (
    <AdminModalContext.Provider value={value}>
      {children}
      <AdminCustomersModal
        visible={customersOpen}
        companyId={customersCompanyId}
        onClose={closeCustomersModal}
      />
      <AdminContactRegistryModal
        visible={contactRegistryOpen}
        companyId={contactRegistryCompanyId}
        onClose={closeContactRegistryModal}
      />
      <AdminSuppliersModal
        visible={suppliersOpen}
        companyId={suppliersCompanyId}
        onClose={closeSuppliersModal}
      />
      <AdminByggdelModal
        visible={byggdelOpen}
        companyId={byggdelCompanyId}
        onClose={closeByggdelModal}
      />
      <AdminKontoplanModal
        visible={kontoplanOpen}
        companyId={kontoplanCompanyId}
        onClose={closeKontoplanModal}
      />
      <MallarModal
        visible={mallarOpen}
        companyId={mallarCompanyId}
        onClose={closeMallarModal}
      />
      <AdminAIPromptsModal
        visible={aiPromptsOpen}
        companyId={aiPromptsCompanyId}
        onClose={closeAIPromptsModal}
      />
    </AdminModalContext.Provider>
  );
}
