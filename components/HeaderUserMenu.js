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

  const openMenu = () => {
    try {
      const node = btnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          setMenuVisible(true);
        });
        return;
      }
    } catch(_e) {}
    setMenuVisible(true);
  };

  const displayName = (auth && auth.currentUser) ? formatPersonName(auth.currentUser.displayName || auth.currentUser.email || '') : 'Användare';
  const [isOwner, setIsOwner] = useState(false);
  const [isMsAdmin, setIsMsAdmin] = useState(false);
  const [cid, setCid] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        if (!active) return;
        setIsOwner(email === 'marcus.skogh@msbyggsystem.se');
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
        setIsMsAdmin(adminClaim && companyId === 'MS Byggsystem');
      } catch(_e) {}
    })();
    return () => { active = false; };
  }, []);

  const menuItems = [];
  if (isOwner || isMsAdmin) menuItems.push({ key: 'manage_company', label: 'Hantera företag', icon: <Ionicons name="business" size={16} color="#2E7D32" /> });
  if (isOwner || isMsAdmin) menuItems.push({ key: 'manage_users', label: 'Hantera användare', icon: <Ionicons name="person" size={16} color="#1976D2" /> });

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
        <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
        <Ionicons name="chevron-down" size={14} color="#666" style={{ marginLeft: 6, transform: [{ rotate: (menuVisible ? '180deg' : '0deg') }] }} />
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
