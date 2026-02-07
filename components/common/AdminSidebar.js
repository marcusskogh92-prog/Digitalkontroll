/**
 * AdminSidebar - Sidebar for admin screens with navigation and company selector
 * Shows all admin menu items and allows navigation between admin screens
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LEFT_NAV } from '../../constants/leftNavTheme';
import { auth, fetchCompanies } from '../firebase';

const dispatchWindowEvent = (name, detail) => {
  try {
    if (typeof window === 'undefined') return;
    const evt = (typeof CustomEvent === 'function')
      ? new CustomEvent(name, { detail })
      : (() => {
        const e = document.createEvent('Event');
        e.initEvent(name, true, true);
        e.detail = detail;
        return e;
      })();
    window.dispatchEvent(evt);
  } catch (_e) {}
};

export default function AdminSidebar({ 
  currentScreen = null, // 'manage_company', 'manage_users', etc.
  selectedCompanyId = null,
  onSelectCompany = null,
  showCompanySelector = true,
}) {
  const navigation = useNavigation();
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [spinHome, setSpinHome] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);
  const [spinAdminIcons, setSpinAdminIcons] = useState({});
  const [hoveredKey, setHoveredKey] = useState(null);
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [spinCompanyChevrons, setSpinCompanyChevrons] = useState({});
  const [storedCompanyId, setStoredCompanyId] = useState('');

  // Load admin status
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        
        let tokenRes = null;
        try { 
          tokenRes = await auth.currentUser?.getIdTokenResult(true).catch(() => null); 
        } catch(_e) { 
          tokenRes = null; 
        }
        const claims = tokenRes?.claims || {};
        const superadminFlag = !!(claims.superadmin === true || claims.role === 'superadmin' || isEmailSuperadmin);
        const adminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        
        if (mounted) {
          setIsSuperadmin(superadminFlag);
          setIsCompanyAdmin(adminClaim);
        }
      } catch (_e) {}
    })();
    return () => { mounted = false; };
  }, []);

  // Load last selected company id (for company-admins who don't see all companies)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        if (!active) return;
        if (stored) setStoredCompanyId(stored);
      } catch (_e) {}

      if (Platform.OS === 'web') {
        try {
          const ls = String(window?.localStorage?.getItem?.('dk_companyId') || '').trim();
          if (!active) return;
          if (ls) setStoredCompanyId(ls);
        } catch (_e) {}
      }
    })();
    return () => { active = false; };
  }, []);

  // Function to load companies
  const loadCompanies = useCallback(async () => {
    // Superadmin should always see the full company list in the sidebar.
    if (!isSuperadmin) return;
    setLoadingCompanies(true);
    try {
      const companiesList = await fetchCompanies();
      if (Array.isArray(companiesList)) {
        setCompanies(companiesList);
      }
    } catch (error) {
      console.error('[AdminSidebar] Error loading companies:', error);
    } finally {
      setLoadingCompanies(false);
    }
  }, [isSuperadmin]);

  // Load companies for superadmin
  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Listen for company creation events to refresh the list
  useEffect(() => {
    if (Platform.OS !== 'web' || !isSuperadmin) return;
    
    const handleCompanyCreated = () => {
      // Refresh companies list when a new company is created
      loadCompanies();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('dkCompanyCreated', handleCompanyCreated);
      return () => {
        window.removeEventListener('dkCompanyCreated', handleCompanyCreated);
      };
    }
  }, [isSuperadmin, showCompanySelector, loadCompanies]);

  const getCompanyMenuItems = () => {
    const items = [];

    // Översikt = ManageCompany (superadmin-only as before)
    if (isSuperadmin) {
      items.push({ key: 'manage_company', label: 'Översikt', icon: 'grid-outline', color: '#2E7D32', screen: 'ManageCompany' });
    }

    // Delade admin-menyer: Användare + övriga adminverktyg
    if (isCompanyAdmin || isSuperadmin) {
      items.push(
        { key: 'manage_users', label: 'Användare', icon: 'person', color: '#1976D2', screen: 'ManageUsers' },
        { key: 'contact_registry', label: 'Kontaktregister', icon: 'book-outline', color: '#1976D2', screen: 'ContactRegistry' },
        { key: 'suppliers', label: 'Leverantörer', icon: 'business-outline', color: '#1976D2', screen: 'Suppliers' },
        { key: 'customers', label: 'Kunder', icon: 'people-outline', color: '#1976D2', screen: 'Customers' },
        { key: 'sharepoint_navigation', label: 'SharePoint Navigation', icon: 'cloud-outline', color: '#1976D2', screen: 'ManageSharePointNavigation' },
      );
    }

    return items;
  };

  const normalizeCompanyLabel = (company) => String(company?.name || company?.id || '').trim();
  const isMsByggsystem = (company) => {
    const label = normalizeCompanyLabel(company);
    return label === 'MS Byggsystem' || String(company?.id || '').trim() === 'MS Byggsystem';
  };

  const getSortedCompanies = () => {
    const list = Array.isArray(companies) ? [...companies] : [];
    const pinned = list.filter(isMsByggsystem);
    const rest = list.filter(c => !isMsByggsystem(c));
    rest.sort((a, b) => normalizeCompanyLabel(a).localeCompare(normalizeCompanyLabel(b), 'sv'));
    // If there are multiple MS Byggsystem entries for some reason, keep their relative order.
    return [...pinned, ...rest];
  };

  const persistCompanySelection = async (cid, companyObj) => {
    try {
      const id = String(cid || '').trim();
      if (!id) return;
      await AsyncStorage.setItem('dk_companyId', id);
      if (Platform.OS === 'web') {
        try { window?.localStorage?.setItem?.('dk_companyId', id); } catch (_e) {}
      }
      if (onSelectCompany && companyObj) {
        try { onSelectCompany(companyObj); } catch (_e) {}
      }
    } catch (error) {
      console.error('[AdminSidebar] Error persisting company:', error);
    }
  };

  const handleCompanyMenuClick = async (company, item) => {
    try {
      setSpinAdminIcons((prev) => ({
        ...prev,
        [item.key]: (prev[item.key] || 0) + 1,
      }));

      const cid = String(company?.id || '').trim();
      if (cid) {
        await persistCompanySelection(cid, company);
      }

      if (item.screen === 'ManageCompany') {
        navigation.navigate('ManageCompany');
      } else if (item.screen === 'ManageUsers') {
        navigation.navigate('ManageUsers', { companyId: cid });
      } else if (item.screen === 'ManageControlTypes') {
        navigation.navigate('ManageControlTypes', { companyId: cid });
      } else if (item.screen === 'ContactRegistry') {
        navigation.navigate('ContactRegistry', {
          companyId: cid,
          allCompanies: !!isSuperadmin,
        });
      } else if (item.screen === 'Suppliers') {
        navigation.navigate('Suppliers', { companyId: cid });
      } else if (item.screen === 'Customers') {
        navigation.navigate('Customers', { companyId: cid });
      } else if (item.screen === 'ManageSharePointNavigation') {
        navigation.navigate('ManageSharePointNavigation', { companyId: cid });
      }
    } catch (error) {
      console.error('[AdminSidebar] Error navigating:', error);
    }
  };

  const handleCompanySelect = async (company) => {
    try {
      const cid = String(company.id || '').trim();
      if (cid) {
        await persistCompanySelection(cid, company);
      }
    } catch (error) {
      console.error('[AdminSidebar] Error selecting company:', error);
    }
  };

  const toggleCompany = async (company) => {
    const cid = String(company?.id || '').trim();
    if (!cid) return;
    setSpinCompanyChevrons((prev) => ({
      ...prev,
      [cid]: (prev[cid] || 0) + 1,
    }));

    setExpandedCompanies((prev) => {
      const isOpen = !!prev[cid];
      // Keep UI compact: allow only one expanded company at a time.
      if (isOpen) return {};
      return { [cid]: true };
    });

    await handleCompanySelect(company);
  };

  const handleGoHome = () => {
    try {
      dispatchWindowEvent('dkGoHome');
    } catch (_e) {}
  };

  const handleHardRefresh = async () => {
    // Refresh current admin screen (web) + refresh companies list (superadmin)
    try {
      if (Platform.OS === 'web') dispatchWindowEvent('dkRefresh');
    } catch (_e) {}

    await loadCompanies();
  };

  if (Platform.OS === 'web') {
    return (
      <div style={{ 
        width: 280, 
        backgroundColor: '#f5f6f7', 
        borderRight: '1px solid #e6e6e6',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
      }}>
        {/* Home and Refresh buttons - Always visible */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          alignItems: 'center', 
          justifyContent: 'flex-end',
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#fff',
        }}>
          <div
            onClick={() => {
              setSpinHome(n => n + 1);
              handleGoHome();
            }}
            onMouseEnter={() => setHoveredKey('top|home')}
            onMouseLeave={() => setHoveredKey(null)}
            style={{ 
              padding: 6, 
              borderRadius: 8, 
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
            role="button"
            aria-label="Hem"
          >
            <Ionicons
              name="home-outline"
              size={18}
              color={hoveredKey === 'top|home' ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted}
              style={{
                transform: `rotate(${spinHome * 360}deg)`,
                transition: 'transform 0.4s ease'
              }}
            />
          </div>

          <div
            onClick={() => {
              setSpinRefresh(n => n + 1);
              handleHardRefresh();
            }}
            onMouseEnter={() => setHoveredKey('top|refresh')}
            onMouseLeave={() => setHoveredKey(null)}
            style={{ 
              padding: 6, 
              borderRadius: 8, 
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
            role="button"
            aria-label="Uppdatera"
          >
            <Ionicons
              name="refresh"
              size={18}
              color={hoveredKey === 'top|refresh' ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted}
              style={{
                transform: `rotate(${spinRefresh * 360}deg)`,
                transition: 'transform 0.4s ease'
              }}
            />
          </div>
        </div>

        <ScrollView style={{ flex: 1 }}>
          {/* Fixed header + always-visible company list */}
          {(isSuperadmin || isCompanyAdmin) ? (
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: '800', color: '#374151', letterSpacing: 0.2, marginBottom: 10 }}>
                Företagslista
              </div>

              {isSuperadmin && loadingCompanies ? (
                <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                  Laddar företag...
                </div>
              ) : (isSuperadmin && companies.length === 0) ? (
                <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                  Inga företag
                </div>
              ) : (
                (() => {
                  const list = (() => {
                    if (isSuperadmin) {
                      const sorted = getSortedCompanies();
                      const pinned = sorted.find(isMsByggsystem);
                      const rest = sorted.filter((c) => !isMsByggsystem(c));
                      return [ ...(pinned ? [pinned] : []), ...rest ];
                    }

                    const cid = String(selectedCompanyId || storedCompanyId || '').trim();
                    if (!cid) return [];
                    return [{ id: cid, name: cid }];
                  })();

                  if (!list || list.length === 0) {
                    return (
                      <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                        Inga företag
                      </div>
                    );
                  }

                  const companyMenuItems = getCompanyMenuItems();

                  const renderCompanyNode = (company) => {
                    const cid = String(company?.id || '').trim();
                    const isSelected = selectedCompanyId && cid && cid === String(selectedCompanyId || '').trim();
                    const hoverKey = `company|${cid}`;
                    const isHovered = hoveredKey === hoverKey;
                    const isOpen = !!expandedCompanies[cid];
                    const spin = spinCompanyChevrons[cid] || 0;

                    return (
                      <div key={cid} style={{ marginBottom: 6 }}>
                        <div
                          onClick={() => toggleCompany(company)}
                          onMouseEnter={() => setHoveredKey(hoverKey)}
                          onMouseLeave={() => setHoveredKey(null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            userSelect: 'none',
                            backgroundColor: isSelected ? LEFT_NAV.activeBg : (isHovered ? LEFT_NAV.hoverBg : 'transparent'),
                            border: `1px solid ${isSelected ? 'rgba(25,118,210,0.35)' : 'transparent'}`,
                            transition: 'background-color 0.15s, border-color 0.15s',
                          }}
                          role="button"
                          aria-label={company?.name || cid}
                        >
                          <Ionicons name="chevron-forward" size={16} color={isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted} style={{
                            marginRight: 8,
                            transform: isOpen ? `rotate(${spin * 360 + 90}deg)` : `rotate(${spin * 360}deg)`,
                            transition: 'transform 0.35s ease',
                          }} />
                          <Ionicons name="business" size={16} color="#2E7D32" style={{ marginRight: 8 }} />
                          <span style={{
                            fontSize: 14,
                            fontWeight: isSelected ? '700' : '600',
                            color: isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault,
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {company?.name || cid}
                          </span>
                          {isMsByggsystem(company) ? (
                            <Ionicons name="star" size={14} color={isSelected ? LEFT_NAV.activeBorder : '#F59E0B'} />
                          ) : null}
                        </div>

                        {isOpen && companyMenuItems.length > 0 ? (
                          <div style={{ paddingLeft: 28, marginTop: 4 }}>
                            {companyMenuItems.map((item) => {
                              const isActive = isSelected && currentScreen === item.key;
                              const subHoverKey = `company|${cid}|item|${item.key}`;
                              const isHoveredSub = hoveredKey === subHoverKey;
                              const spinCount = spinAdminIcons[item.key] || 0;

                              return (
                                <div
                                  key={item.key}
                                  onClick={(e) => {
                                    try { e.stopPropagation(); } catch (_e) {}
                                    handleCompanyMenuClick(company, item);
                                  }}
                                  onMouseEnter={() => setHoveredKey(subHoverKey)}
                                  onMouseLeave={() => setHoveredKey(null)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '8px 10px',
                                    marginBottom: 4,
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    backgroundColor: isActive ? LEFT_NAV.activeBg : (isHoveredSub ? LEFT_NAV.hoverBg : 'transparent'),
                                    borderLeft: isActive ? `3px solid ${LEFT_NAV.activeBorder}` : '3px solid transparent',
                                    transition: 'background-color 0.15s',
                                  }}
                                  role="button"
                                  aria-label={item.label}
                                >
                                  <Ionicons
                                    name={item.icon}
                                    size={16}
                                    color={item.color || (isActive ? LEFT_NAV.iconDefault : isHoveredSub ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted)}
                                    style={{
                                      marginRight: 10,
                                      transform: `rotate(${spinCount * 360}deg)`,
                                      transition: 'transform 0.35s ease',
                                    }}
                                  />
                                  <span style={{
                                    fontSize: 14,
                                    fontWeight: isActive ? '700' : '400',
                                    color: isHoveredSub ? LEFT_NAV.hoverText : LEFT_NAV.textDefault,
                                  }}>
                                    {item.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  };

                  return (
                    <>
                      {list.map(renderCompanyNode)}

                      {/* Keep create-company action accessible for superadmin */}
                      {isSuperadmin ? (
                        <div
                          onClick={() => navigation.navigate('ManageCompany', { createNew: true })}
                          onMouseEnter={() => setHoveredKey('company|add')}
                          onMouseLeave={() => setHoveredKey(null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 10px',
                            marginTop: 10,
                            borderRadius: 8,
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            border: '1px dashed #CBD5E1',
                          }}
                          role="button"
                          aria-label="Lägg till företag"
                        >
                          <Ionicons name="add-circle-outline" size={16} color="#2E7D32" style={{ marginRight: 8 }} />
                          <span style={{ fontSize: 13, fontWeight: '400', color: '#1976D2' }}>Lägg till företag</span>
                        </div>
                      ) : null}
                    </>
                  );
                })()
              )}
            </div>
          ) : null}
        </ScrollView>
      </div>
    );
  }

  // Native version
  return (
    <View style={{ width: 280, backgroundColor: '#f5f6f7', borderRightWidth: 1, borderRightColor: '#e6e6e6' }}>
      {/* Home and Refresh buttons - Always visible */}
      <View style={{ 
        flexDirection: 'row', 
        gap: 8, 
        alignItems: 'center', 
        justifyContent: 'flex-end',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        backgroundColor: '#fff',
      }}>
        <TouchableOpacity
          style={{ padding: 6, borderRadius: 8, backgroundColor: 'transparent' }}
          onPress={() => {
            setSpinHome(n => n + 1);
            handleGoHome();
          }}
        >
          <Ionicons
            name="home-outline"
            size={18}
            color={LEFT_NAV.iconMuted}
            style={{
              transform: [{ rotate: `${spinHome * 360}deg` }],
            }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ padding: 6, borderRadius: 8, backgroundColor: 'transparent' }}
          onPress={() => {
            setSpinRefresh(n => n + 1);
            handleHardRefresh();
          }}
        >
          <Ionicons
            name="refresh"
            size={18}
            color={LEFT_NAV.iconMuted}
            style={{
              transform: [{ rotate: `${spinRefresh * 360}deg` }],
            }}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {(isSuperadmin || isCompanyAdmin) ? (
          <View style={{ padding: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#374151', marginBottom: 10 }}>
              Företagslista
            </Text>

            {isSuperadmin && loadingCompanies ? (
              <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                Laddar företag...
              </Text>
            ) : (isSuperadmin && companies.length === 0) ? (
              <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                Inga företag
              </Text>
            ) : (
              (() => {
                const list = (() => {
                  if (isSuperadmin) {
                    const sorted = getSortedCompanies();
                    const pinned = sorted.find(isMsByggsystem);
                    const rest = sorted.filter((c) => !isMsByggsystem(c));
                    return [ ...(pinned ? [pinned] : []), ...rest ];
                  }
                  const cid = String(selectedCompanyId || storedCompanyId || '').trim();
                  if (!cid) return [];
                  return [{ id: cid, name: cid }];
                })();

                if (!list || list.length === 0) {
                  return (
                    <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                      Inga företag
                    </Text>
                  );
                }
                const companyMenuItems = getCompanyMenuItems();

                return (
                  <>
                    {list.map((company) => {
                      const cid = String(company?.id || '').trim();
                      const isSelected = selectedCompanyId && cid && cid === String(selectedCompanyId || '').trim();
                      const isOpen = !!expandedCompanies[cid];

                      return (
                        <View key={cid} style={{ marginBottom: 6 }}>
                          <TouchableOpacity
                            onPress={() => toggleCompany(company)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: 10,
                              borderRadius: 8,
                              backgroundColor: isSelected ? LEFT_NAV.activeBg : 'transparent',
                              borderWidth: 1,
                              borderColor: isSelected ? 'rgba(25,118,210,0.35)' : 'transparent',
                            }}
                          >
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color={LEFT_NAV.iconMuted}
                              style={{
                                marginRight: 8,
                                transform: [{ rotate: isOpen ? '90deg' : '0deg' }],
                              }}
                            />
                            <Ionicons name="business" size={16} color="#2E7D32" style={{ marginRight: 8 }} />
                            <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '600', color: LEFT_NAV.textDefault, flex: 1 }} numberOfLines={1}>
                              {company?.name || cid}
                            </Text>
                            {isMsByggsystem(company) ? (
                              <Ionicons name="star" size={14} color={isSelected ? LEFT_NAV.activeBorder : '#F59E0B'} />
                            ) : null}
                          </TouchableOpacity>

                          {isOpen && companyMenuItems.length > 0 ? (
                            <View style={{ paddingLeft: 28, marginTop: 4 }}>
                              {companyMenuItems.map((item) => {
                                const isActive = isSelected && currentScreen === item.key;
                                const spinCount = spinAdminIcons[item.key] || 0;
                                return (
                                  <TouchableOpacity
                                    key={item.key}
                                    onPress={() => handleCompanyMenuClick(company, item)}
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      padding: 10,
                                      marginBottom: 4,
                                      borderRadius: 8,
                                      backgroundColor: isActive ? LEFT_NAV.activeBg : 'transparent',
                                      borderLeftWidth: 3,
                                      borderLeftColor: isActive ? LEFT_NAV.activeBorder : 'transparent',
                                    }}
                                  >
                                    <Ionicons
                                      name={item.icon}
                                      size={16}
                                      color={item.color || LEFT_NAV.iconMuted}
                                      style={{ marginRight: 10, transform: [{ rotate: `${spinCount * 360}deg` }] }}
                                    />
                                    <Text style={{ fontSize: 14, fontWeight: isActive ? '700' : '400', color: LEFT_NAV.textDefault }}>
                                      {item.label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}

                    {isSuperadmin ? (
                      <TouchableOpacity
                        onPress={() => navigation.navigate('ManageCompany', { createNew: true })}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 10,
                          marginTop: 10,
                          borderRadius: 8,
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: '#CBD5E1',
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#2E7D32" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 13, fontWeight: '400', color: '#1976D2' }}>
                          Lägg till företag
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                );
              })()
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
