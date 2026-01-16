import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, TouchableOpacity, View } from 'react-native';
import ContextMenu from './ContextMenu';
import { auth } from './firebase';
import { formatPersonName } from './formatPersonName';
import { PROJECT_PHASES, DEFAULT_PHASE } from '../features/projects/constants';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch(_e) { createPortal = null; }
}
let portalRootId = 'dk-header-portal';

export default function HeaderUserMenu({ selectedPhase, onPhaseChange }) {
  const navigation = useNavigation();
  const btnRef = useRef(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const [roleLabel, setRoleLabel] = useState('');
  const chevronSpinAnim = useRef(new Animated.Value(0)).current;
  const chevronDeg = useRef(0);
  const [currentPhase, setCurrentPhase] = useState(selectedPhase || DEFAULT_PHASE);
  
  // Synka med prop när den ändras
  useEffect(() => {
    if (selectedPhase) {
      setCurrentPhase(selectedPhase);
    }
  }, [selectedPhase]);

  const openMenu = () => {
    try {
      const node = btnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          // spin chevron and open menu
          try { chevronDeg.current = (chevronDeg.current || 0) + 360; Animated.timing(chevronSpinAnim, { toValue: chevronDeg.current, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
          setMenuVisible(true);
        });
        return;
      }
    } catch(_e) {}
    try { chevronDeg.current = (chevronDeg.current || 0) + 360; Animated.timing(chevronSpinAnim, { toValue: chevronDeg.current, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
    setMenuVisible(true);
  };

  const displayName = (auth && auth.currentUser) ? formatPersonName(auth.currentUser.displayName || auth.currentUser.email || '') : 'Användare';
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
        // Try to read claims and local fallback for companyId
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(true).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const companyId = companyFromClaims || stored || '';
        const adminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        if (!active) return;
        // MS Byggsystem-admin (behörighet till globala företagsverktyg)
        setIsMsAdmin(adminClaim && companyId === 'MS Byggsystem');
        // Admin i valfritt företag (ska kunna hantera sina egna användare)
        setIsCompanyAdmin(adminClaim);

        // Beräkna rolltext och superadmin-flagga för headern
        const emailLower = email;
        const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';
        const superadminFlag = !!(claims.superadmin === true || claims.role === 'superadmin' || isEmailSuperadmin);
        const isAdmin = !!(claims.admin === true || claims.role === 'admin');
        let label = '';
        if (superadminFlag) label = 'Superadmin';
        else if (isAdmin) label = 'Admin';
        else label = 'Användare';
        if (active) {
          setRoleLabel(label);
          setIsSuperadmin(superadminFlag);
        }
      } catch(_e) {}
    })();
    return () => { active = false; };
  }, []);

  const menuItems = [];
  
  // Lägg till fas-väljare först
  menuItems.push({ key: 'phase_separator', label: 'Projektskede', isSeparator: true });
  PROJECT_PHASES.forEach(phase => {
    const isSelected = currentPhase === phase.key;
    menuItems.push({ 
      key: `phase_${phase.key}`, 
      label: phase.name, 
      icon: <Ionicons name={phase.icon} size={16} color={phase.color} />,
      isSelected: isSelected,
      phaseColor: phase.color
    });
  });
  
  menuItems.push({ key: 'menu_separator', label: '', isSeparator: true });

  // Alla roller (superadmin, admin, användare) ska kunna logga ut här
  menuItems.push({ key: 'logout', label: 'Logga ut', icon: <Ionicons name="log-out-outline" size={16} color="#D32F2F" /> });

  const PortalContent = (
    <ContextMenu
      visible={menuVisible}
      x={menuPos.x}
      y={menuPos.y}
      items={menuItems}
      onClose={() => setMenuVisible(false)}
      onSelect={async (it) => {
        try {
          if (!it) return;
          
          // Hantera fas-väljare (stäng inte menyn direkt)
          if (it.key && it.key.startsWith('phase_')) {
            const phaseKey = it.key.replace('phase_', '');
            setCurrentPhase(phaseKey);
            if (onPhaseChange) {
              onPhaseChange(phaseKey);
            }
            // Uppdatera menyn men stäng inte
            return;
          }
          
          // För andra val, stäng menyn
          setMenuVisible(false);
          
          if (it.key === 'logout') {
            try { await AsyncStorage.removeItem('dk_companyId'); } catch(_e) {}
            try { await auth.signOut(); } catch(_e) {}
            try {
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            } catch(_e) {
              try { navigation.navigate('Login'); } catch(__e) {}
            }
            return;
          }
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
        <Animated.View style={{ marginLeft: 6, transform: [
          { rotate: chevronSpinAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) },
          { rotate: menuVisible ? '180deg' : '0deg' }
        ] }}>
          <Ionicons name="chevron-down" size={14} color="#666" />
        </Animated.View>
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
