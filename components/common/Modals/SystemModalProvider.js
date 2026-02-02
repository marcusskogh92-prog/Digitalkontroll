import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

const SystemModalContext = React.createContext(null);

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function SystemModalHost({ modalState, requestClose }) {
  if (!modalState) return null;

  const POS = Platform.OS === 'web' ? 'fixed' : 'absolute';
  const Content = modalState.component;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={requestClose}
    >
      <View style={[styles.overlay, { position: POS }]}>
        <Pressable onPress={requestClose} style={styles.dismiss} />
        <View style={styles.outer}>
          {Content ? (
            <Content {...(modalState.props || {})} requestClose={requestClose} />
          ) : (
            modalState.node || null
          )}
        </View>
      </View>
    </Modal>
  );
}

export function SystemModalProvider({ children }) {
  const [modalState, setModalState] = React.useState(null);

  const openSystemModal = React.useCallback((spec) => {
    const id = String(spec?.id || '').trim() || makeId();
    setModalState({
      id,
      component: spec?.component || null,
      props: spec?.props || null,
      node: spec?.node || null,
      onClose: typeof spec?.onClose === 'function' ? spec.onClose : null,
    });
    return id;
  }, []);

  const closeSystemModal = React.useCallback((id) => {
    setModalState((cur) => {
      if (!cur) return null;
      if (id && cur.id !== id) return cur;
      return null;
    });
  }, []);

  const requestClose = React.useCallback(() => {
    setModalState((cur) => {
      if (!cur) return null;
      try {
        cur.onClose?.();
      } catch (_e) {}
      return null;
    });
  }, []);

  const value = React.useMemo(
    () => ({
      openSystemModal,
      closeSystemModal,
      requestCloseSystemModal: requestClose,
      activeModalId: modalState?.id || null,
    }),
    [openSystemModal, closeSystemModal, requestClose, modalState?.id]
  );

  return (
    <SystemModalContext.Provider value={value}>
      {children}
      <SystemModalHost modalState={modalState} requestClose={requestClose} />
    </SystemModalContext.Provider>
  );
}

export function useSystemModal() {
  const ctx = React.useContext(SystemModalContext);
  if (!ctx) {
    throw new Error('useSystemModal must be used within a SystemModalProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  outer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
