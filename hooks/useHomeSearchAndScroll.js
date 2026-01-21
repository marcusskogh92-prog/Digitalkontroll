import React from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Samlar app-specifik sökpopup + scroll-konfiguration för HomeScreen.
 * - Hanterar SearchProjectModal-state (visible, text, keyboardHeight)
 * - Ger ett scrollEnabled-värde (true på native, false på web)
 */
export function useHomeSearchAndScroll() {
  const [searchModalVisible, setSearchModalVisible] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  const openSearchModal = React.useCallback(() => {
    setKeyboardHeight(0);
    setSearchModalVisible(true);
  }, []);

  const closeSearchModal = React.useCallback(() => {
    setSearchModalVisible(false);
    setSearchText('');
    setKeyboardHeight(0);
  }, []);

  // Native: håll sök-popupen ovanför tangentbordet
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const subs = [];
    const onShow = (e) => setKeyboardHeight(e?.endCoordinates?.height || 0);
    const onHide = () => setKeyboardHeight(0);

    subs.push(Keyboard.addListener('keyboardWillShow', onShow));
    subs.push(Keyboard.addListener('keyboardWillHide', onHide));
    subs.push(Keyboard.addListener('keyboardDidShow', onShow));
    subs.push(Keyboard.addListener('keyboardDidHide', onHide));

    return () => {
      for (const s of subs) {
        try { s.remove(); } catch(_e) {}
      }
    };
  }, []);

  const scrollEnabled = Platform.OS !== 'web';

  return {
    searchModalVisible,
    setSearchModalVisible,
    searchText,
    setSearchText,
    keyboardHeight,
    openSearchModal,
    closeSearchModal,
    scrollEnabled,
  };
}
