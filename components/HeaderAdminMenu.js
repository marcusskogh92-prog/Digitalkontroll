/**
 * HeaderAdminMenu - Admin-funktioner (kugghjul)
 * Separerar admin-funktioner från användar-menyn
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, TouchableOpacity } from 'react-native';
import ContextMenu from './ContextMenu';
import { auth } from './firebase';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch(_e) { createPortal = null; }
}
let portalRootId = 'dk-admin-menu-portal';

export default function HeaderAdminMenu() {
  const navigation = useNavigation();
  const btnRef = useRef(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const chevronSpinAnim = useRef(new Animated.Value(0)).current;
  const chevronDeg = useRef(0);

  const [isOwner, setIsOwner] = useState(false);
  const [isMsAdmin, setIsMsAdmin] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        if (!active) return;
        setIsOwner(email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se');
        
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(true).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const companyId = companyFromClaims || stored || '';
        const adminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        
        if (!active) return;
        setIsMsAdmin(adminClaim && companyId === 'MS Byggsystem');
        setIsCompanyAdmin(adminClaim);

        const emailLower = email;
        const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';
        const superadminFlag = !!(claims.superadmin === true || claims.role === 'superadmin' || isEmailSuperadmin);
        
        if (active) {
          setIsSuperadmin(superadminFlag);
        }
      } catch(_e) {}
    })();
    return () => { active = false; };
  }, []);

  const openMenu = () => {
    try {
      const node = btnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          try { chevronDeg.current = (chevronDeg.current || 0) + 360; Animated.timing(chevronSpinAnim, { toValue: chevronDeg.current, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
          setMenuVisible(true);
        });
        return;
      }
    } catch(_e) {}
    try { chevronDeg.current = (chevronDeg.current || 0) + 360; Animated.timing(chevronSpinAnim, { toValue: chevronDeg.current, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
    setMenuVisible(true);
  };

  const menuItems = [];
  const isSuperOrMsAdmin = isOwner || isMsAdmin;
  
  // Admin-funktioner
  if (isSuperadmin) {
    if (isSuperOrMsAdmin) {
      menuItems.push({ key: 'manage_company', label: 'Företag', icon: <Ionicons name="business" size={16} color="#2E7D32" /> });
    }
    if (isOwner || isCompanyAdmin) {
      menuItems.push({ key: 'manage_users', label: 'Användare', icon: <Ionicons name="person" size={16} color="#1976D2" /> });
      menuItems.push({ key: 'manage_control_types', label: 'Kontrolltyper', icon: <Ionicons name="options-outline" size={16} color="#6A1B9A" /> });
    }
  }

  // Admin + superadmin: kontaktregister
  if (isCompanyAdmin || isSuperadmin) {
    menuItems.push({ key: 'contact_registry', label: 'Kontaktregister', icon: <Ionicons name="book-outline" size={16} color="#1976D2" /> });
    menuItems.push({ key: 'suppliers', label: 'Leverantörer', icon: <Ionicons name="business-outline" size={16} color="#1976D2" /> });
    menuItems.push({ key: 'customers', label: 'Kunder', icon: <Ionicons name="people-outline" size={16} color="#1976D2" /> });
    menuItems.push({ key: 'sharepoint_navigation', label: 'SharePoint Navigation', icon: <Ionicons name="cloud-outline" size={16} color="#1976D2" /> });
  }

  // Om inga admin-funktioner finns, visa inget
  if (menuItems.length === 0) {
    return null;
  }

  const PortalContent = (
    <ContextMenu
      visible={menuVisible}
      x={menuPos.x}
      y={menuPos.y}
      items={menuItems}
      onClose={() => setMenuVisible(false)}
      onSelect={async (it) => {
        try {
          setMenuVisible(false);
          if (!it) return;
          const cid = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
          if (it.key === 'manage_company') return navigation.navigate('ManageCompany');
          if (it.key === 'manage_users') return navigation.navigate('ManageUsers', { companyId: cid });
          if (it.key === 'manage_control_types') return navigation.navigate('ManageControlTypes', { companyId: cid });
          if (it.key === 'contact_registry') {
            return navigation.navigate('ContactRegistry', {
              companyId: cid,
              allCompanies: !!isSuperadmin,
            });
          }
          if (it.key === 'suppliers') {
            return navigation.navigate('Suppliers', {
              companyId: cid,
            });
          }
          if (it.key === 'customers') {
            return navigation.navigate('Customers', {
              companyId: cid,
            });
          }
          if (it.key === 'sharepoint_navigation') {
            return navigation.navigate('ManageSharePointNavigation', {
              companyId: cid,
            });
          }
        } catch(_e) {}
      }}
    />
  );

  return (
    <>
      <TouchableOpacity 
        ref={btnRef} 
        onPress={openMenu} 
        style={{ 
          width: 40, 
          height: 40, 
          borderRadius: 20, 
          backgroundColor: '#f5f5f5',
          alignItems: 'center', 
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#e0e0e0',
        }}
      >
        <Ionicons name="settings-outline" size={20} color="#666" />
      </TouchableOpacity>
      {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' ? (() => {
        try {
          let portalRoot = document.getElementById(portalRootId);
          if (!portalRoot) {
            portalRoot = document.createElement('div');
            portalRoot.id = portalRootId;
            portalRoot.style.position = 'relative';
            document.body.appendChild(portalRoot);
          }
          return createPortal(PortalContent, portalRoot);
        } catch(_e) { return PortalContent; }
      })() : PortalContent}
    </>
  );
}
