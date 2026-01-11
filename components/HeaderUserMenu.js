import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import ContextMenu from './ContextMenu';
import { auth } from './firebase';
import { formatPersonName } from './formatPersonName';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch(_e) { createPortal = null; }
}
let portalRootId = 'dk-header-portal';

export default function HeaderUserMenu() {
  const navigation = useNavigation();
  const btnRef = useRef(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const [roleLabel, setRoleLabel] = useState('');
  const [spinChevron, setSpinChevron] = useState(0);

  const openMenu = () => {
    try {
      const node = btnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          setSpinChevron((n) => n + 1);
          setMenuVisible(true);
        });
        return;
      }
    } catch(_e) {}
    setSpinChevron((n) => n + 1);
    setMenuVisible(true);
  };

  const displayName = (auth && auth.currentUser) ? formatPersonName(auth.currentUser.displayName || auth.currentUser.email || '') : 'Användare';
  const [isOwner, setIsOwner] = useState(false);
  const [isMsAdmin, setIsMsAdmin] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [cid, setCid] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        if (!active) return;
        setIsOwner(email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se');
        // Try to read claims and local fallback for companyId
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(true).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const companyId = companyFromClaims || stored || '';
        setCid(companyId);
        const adminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        if (!active) return;
        // MS Byggsystem-admin (behörighet till globala företagsverktyg)
        setIsMsAdmin(adminClaim && companyId === 'MS Byggsystem');
        // Admin i valfritt företag (ska kunna hantera sina egna användare)
        setIsCompanyAdmin(adminClaim);

        // Beräkna rolltext för headern
        const emailLower = email;
        const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';
        const isSuperadmin = !!(claims.superadmin === true || claims.role === 'superadmin' || isEmailSuperadmin);
        const isAdmin = !!(claims.admin === true || claims.role === 'admin');
        let label = '';
        if (isSuperadmin) label = 'Superadmin';
        else if (isAdmin) label = 'Admin';
        else label = 'Användare';
        if (active) setRoleLabel(label);
      } catch(_e) {}
    })();
    return () => { active = false; };
  }, []);

  const menuItems = [];
  const isSuperOrMsAdmin = isOwner || isMsAdmin;
  // Företag: endast för superadmin / MS Byggsystem-admin
  if (isSuperOrMsAdmin) {
    menuItems.push({ key: 'manage_company', label: 'Företag', icon: <Ionicons name="business" size={16} color="#2E7D32" /> });
  }
  // Användare / Kontrolltyper / Mallar: alla admin-användare (oavsett företag)
  if (isOwner || isCompanyAdmin) {
    menuItems.push({ key: 'manage_users', label: 'Användare', icon: <Ionicons name="person" size={16} color="#1976D2" /> });
    menuItems.push({ key: 'manage_control_types', label: 'Kontrolltyper', icon: <Ionicons name="options-outline" size={16} color="#6A1B9A" /> });
    menuItems.push({ key: 'manage_templates', label: 'Mallar', icon: <Ionicons name="copy-outline" size={16} color="#00897B" /> });
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
          if (it.key === 'manage_templates') return navigation.navigate('ManageTemplates', { companyId: cid });
        } catch(_e) {}
      }}
    />
  );

  return (
    <>
      <TouchableOpacity ref={btnRef} onPress={openMenu} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#4caf50', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={16} color="#fff" />
        </View>
        <View style={{ flexDirection: 'column' }}>
          <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
          {!!roleLabel && (
            <Text style={{ fontSize: 12, color: '#607D8B', marginTop: 2 }}>{roleLabel}</Text>
          )}
        </View>
        <Ionicons
          name="chevron-down"
          size={14}
          color="#666"
          style={{
            marginLeft: 6,
            transform: [{ rotate: `${spinChevron * 360 + (menuVisible ? 180 : 0)}deg` }],
            transitionProperty: 'transform',
            transitionDuration: '0.35s',
            transitionTimingFunction: 'ease',
          }}
        />
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
