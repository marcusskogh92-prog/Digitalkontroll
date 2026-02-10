/**
 * Admin modal context – opens admin sections (Kunder, Kontaktregister, Leverantörer, Byggdelstabell) in a modal
 * instead of navigating away. Used by Administration and Register menus in the top banner.
 */

import React, { useCallback, useRef, useState } from 'react';
import AdminContactRegistryModal from './AdminContactRegistryModal';
import AdminCustomersModal from './AdminCustomersModal';
import AdminSuppliersModal from './AdminSuppliersModal';
import AdminByggdelModal from './AdminByggdelModal';
import AdminKontoplanModal from './AdminKontoplanModal';
import MallarModal from './MallarModal';
import AdminAIPromptsModal from './AdminAIPromptsModal';
import AdminKategoriModal from './AdminKategoriModal';

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
  openKategoriModal: () => {},
  closeKategoriModal: () => {},
  registerSelectionSavedListener: () => {},
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
  /** När öppnad från leverantör/kund: { entityType, entityId, entityName, selectedCodes } */
  const [byggdelSelectionContext, setByggdelSelectionContext] = useState(null);
  const [kontoplanOpen, setKontoplanOpen] = useState(false);
  const [kontoplanCompanyId, setKontoplanCompanyId] = useState('');
  const [kontoplanSelectionContext, setKontoplanSelectionContext] = useState(null);
  const [mallarOpen, setMallarOpen] = useState(false);
  const [mallarCompanyId, setMallarCompanyId] = useState('');
  const [aiPromptsOpen, setAiPromptsOpen] = useState(false);
  const [aiPromptsCompanyId, setAiPromptsCompanyId] = useState('');
  const [kategoriOpen, setKategoriOpen] = useState(false);
  const [kategoriCompanyId, setKategoriCompanyId] = useState('');
  const [kategoriSelectionContext, setKategoriSelectionContext] = useState(null);
  const selectionSavedListenerRef = useRef(null);

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

  const openByggdelModal = useCallback((companyId, selectionContext = null) => {
    setByggdelCompanyId(String(companyId || '').trim());
    setByggdelSelectionContext(selectionContext ?? null);
    setByggdelOpen(true);
  }, []);

  const closeByggdelModal = useCallback(() => {
    setByggdelOpen(false);
    setByggdelCompanyId('');
    setByggdelSelectionContext(null);
  }, []);

  const openKontoplanModal = useCallback((companyId, selectionContext = null) => {
    setKontoplanCompanyId(String(companyId || '').trim());
    setKontoplanSelectionContext(selectionContext ?? null);
    setKontoplanOpen(true);
  }, []);

  const closeKontoplanModal = useCallback(() => {
    setKontoplanOpen(false);
    setKontoplanCompanyId('');
    setKontoplanSelectionContext(null);
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

  const openKategoriModal = useCallback((companyId, selectionContext = null) => {
    setKategoriCompanyId(String(companyId || '').trim());
    setKategoriSelectionContext(selectionContext ?? null);
    setKategoriOpen(true);
  }, []);

  const closeKategoriModal = useCallback(() => {
    setKategoriOpen(false);
    setKategoriCompanyId('');
    setKategoriSelectionContext(null);
  }, []);

  const registerSelectionSavedListener = useCallback((fn) => {
    selectionSavedListenerRef.current = fn;
  }, []);

  const notifySelectionSaved = useCallback((...args) => {
    if (typeof selectionSavedListenerRef.current === 'function') {
      selectionSavedListenerRef.current(...args);
    }
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
  openKategoriModal,
  closeKategoriModal,
  registerSelectionSavedListener,
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
        selectionContext={byggdelSelectionContext}
        onClose={closeByggdelModal}
        onSelectionSaved={notifySelectionSaved}
      />
      <AdminKontoplanModal
        visible={kontoplanOpen}
        companyId={kontoplanCompanyId}
        selectionContext={kontoplanSelectionContext}
        onClose={closeKontoplanModal}
        onSelectionSaved={notifySelectionSaved}
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
      <AdminKategoriModal
        visible={kategoriOpen}
        companyId={kategoriCompanyId}
        selectionContext={kategoriSelectionContext}
        onClose={closeKategoriModal}
        onSelectionSaved={notifySelectionSaved}
      />
    </AdminModalContext.Provider>
  );
}
