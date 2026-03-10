/**
 * Admin modal context – opens admin sections (Kunder, Kontaktregister, Leverantörer, Byggdelstabell) in a modal
 * instead of navigating away. Used by Administration and Register menus in the top banner.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AdminAIPromptsModal from './AdminAIPromptsModal';
import AdminByggdelModal from './AdminByggdelModal';
import AdminCompanyModal from './AdminCompanyModal';
import AdminContactRegistryModal from './AdminContactRegistryModal';
import AdminCreateCompanyModal from './AdminCreateCompanyModal';
import AdminCustomersModal from './AdminCustomersModal';
import AdminKategoriModal from './AdminKategoriModal';
import AdminKontoplanModal from './AdminKontoplanModal';
import AdminSuppliersModal from './AdminSuppliersModal';
import MallarModal from './MallarModal';

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
  openCompanyModal: () => {},
  closeCompanyModal: () => {},
  openCreateCompanyModal: () => {},
  closeCreateCompanyModal: () => {},
  navigationRef: null,
  registerSelectionSavedListener: () => {},
  isSubModalOpen: false,
  isAnyModalOpen: false,
};

export const AdminModalContext = React.createContext(defaultContext);

export function AdminModalProvider({ children, navigationRef: navigationRefProp }) {
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
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companyModalCompanyId, setCompanyModalCompanyId] = useState('');
  const [companyModalInitialTab, setCompanyModalInitialTab] = useState(null);
  const [createCompanyModalOpen, setCreateCompanyModalOpen] = useState(false);
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

  const openCompanyModal = useCallback((companyId, initialTab = null) => {
    setCompanyModalCompanyId(String(companyId || '').trim());
    setCompanyModalInitialTab(initialTab || null);
    setCompanyModalOpen(true);
  }, []);

  // Efter återkomst från tenant-inloggning (SharePoint-synk): trigga exchange om URL har code+state=tenant_, öppna sedan Företagsinställningar → SharePoint så att pickern visas
  const PENDING_SYNC_PICKER_KEY = 'azure_pending_sync_picker';
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const hash = (window.location.hash || '').slice(1);
    const search = (window.location.search || '').slice(1);
    const params = new URLSearchParams(hash || search);
    const code = params.get('code');
    const state = params.get('state');
    const isTenantReturn = code && state && String(state).startsWith('tenant_');
    if (!isTenantReturn) {
      try {
        const raw = window.sessionStorage && window.sessionStorage.getItem(PENDING_SYNC_PICKER_KEY);
        if (raw) {
          const { companyId } = JSON.parse(raw);
          if (companyId) openCompanyModal(companyId, 'sharepoint');
        }
      } catch (_e) {}
      return;
    }
    import('../../services/azure/authService').then(({ processTenantReturnFromUrl }) => {
      processTenantReturnFromUrl().then(() => {}).catch(() => {}).finally(() => {
        setTimeout(() => {
          try {
            const raw = window.sessionStorage && window.sessionStorage.getItem(PENDING_SYNC_PICKER_KEY);
            if (raw) {
              const { companyId } = JSON.parse(raw);
              if (companyId) openCompanyModal(companyId, 'sharepoint');
            }
          } catch (_e) {}
        }, 300);
      });
    });
  }, [openCompanyModal]);

  const closeCompanyModal = useCallback(() => {
    setCompanyModalOpen(false);
    setCompanyModalCompanyId('');
    setCompanyModalInitialTab(null);
    // Rensa tenant-synk-nyckel så att huvudappens getAccessToken() inte fastnar i "return null"
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('azure_pending_sync_picker');
      }
    } catch (_e) {}
  }, []);

  const openCreateCompanyModal = useCallback(() => {
    setCreateCompanyModalOpen(true);
  }, []);

  const closeCreateCompanyModal = useCallback(() => {
    setCreateCompanyModalOpen(false);
  }, []);

  const registerSelectionSavedListener = useCallback((fn) => {
    selectionSavedListenerRef.current = fn;
  }, []);

  const notifySelectionSaved = useCallback((...args) => {
    if (typeof selectionSavedListenerRef.current === 'function') {
      selectionSavedListenerRef.current(...args);
    }
  }, []);

  const isSubModalOpen = byggdelOpen || kontoplanOpen || kategoriOpen || mallarOpen || aiPromptsOpen;

  const isAnyModalOpen =
    customersOpen ||
    contactRegistryOpen ||
    suppliersOpen ||
    byggdelOpen ||
    kontoplanOpen ||
    mallarOpen ||
    aiPromptsOpen ||
    kategoriOpen ||
    companyModalOpen ||
    createCompanyModalOpen;

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
    openCompanyModal,
    closeCompanyModal,
    openCreateCompanyModal,
    closeCreateCompanyModal,
    navigationRef: navigationRefProp ?? null,
    registerSelectionSavedListener,
    isSubModalOpen,
    isAnyModalOpen,
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
      <AdminCompanyModal
        key={companyModalOpen ? `company-${companyModalCompanyId}-${companyModalInitialTab || 'oversikt'}` : 'company-closed'}
        visible={companyModalOpen}
        companyId={companyModalCompanyId}
        initialTab={companyModalInitialTab}
        onClose={closeCompanyModal}
      />
      <AdminCreateCompanyModal
        visible={createCompanyModalOpen}
        onClose={closeCreateCompanyModal}
        onSuccess={(newCompanyId) => {
          closeCreateCompanyModal();
          openCompanyModal(newCompanyId);
        }}
      />
    </AdminModalContext.Provider>
  );
}
