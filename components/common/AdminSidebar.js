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
  const [companiesExpanded, setCompaniesExpanded] = useState(true);
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [hoveredKey, setHoveredKey] = useState(null);

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

  // Function to load companies
  const loadCompanies = useCallback(async () => {
    if (!isSuperadmin || !showCompanySelector) return;
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
  }, [isSuperadmin, showCompanySelector]);

  // Load companies for superadmin
  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Listen for company creation events to refresh the list
  useEffect(() => {
    if (Platform.OS !== 'web' || !isSuperadmin || !showCompanySelector) return;
    
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

  const adminMenuItems = [];

  // Företag - endast superadmin
  if (isSuperadmin) {
    adminMenuItems.push(
      { key: 'manage_company', label: 'Företag', icon: 'business', color: '#2E7D32', screen: 'ManageCompany' },
    );
  }

  // Delade admin-menyer: Användare + Kontrolltyper + övriga adminverktyg
  if (isCompanyAdmin || isSuperadmin) {
    adminMenuItems.push(
      { key: 'manage_users', label: 'Användare', icon: 'person', color: '#1976D2', screen: 'ManageUsers' },
      { key: 'manage_control_types', label: 'Kontrolltyper', icon: 'options-outline', color: '#6A1B9A', screen: 'ManageControlTypes' },
      { key: 'contact_registry', label: 'Kontaktregister', icon: 'book-outline', color: '#1976D2', screen: 'ContactRegistry' },
      { key: 'suppliers', label: 'Leverantörer', icon: 'business-outline', color: '#1976D2', screen: 'Suppliers' },
      { key: 'customers', label: 'Kunder', icon: 'people-outline', color: '#1976D2', screen: 'Customers' },
      { key: 'sharepoint_navigation', label: 'SharePoint Navigation', icon: 'cloud-outline', color: '#1976D2', screen: 'ManageSharePointNavigation' },
    );
  }

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

  const handleMenuClick = async (item) => {
    try {
      const cid = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
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
        await AsyncStorage.setItem('dk_companyId', cid);
        if (Platform.OS === 'web') {
          try { window?.localStorage?.setItem?.('dk_companyId', cid); } catch (_e) {}
        }
        if (onSelectCompany) {
          onSelectCompany(company);
        }
      }
    } catch (error) {
      console.error('[AdminSidebar] Error selecting company:', error);
    }
  };

  const handleGoHome = () => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dkGoHome'));
      }
    } catch (_e) {}
  };

  const handleHardRefresh = async () => {
    // Refresh current admin screen (web) + refresh companies list (superadmin)
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dkRefresh'));
      }
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
          {/* Company Selector for Superadmin - Show first */}
          {isSuperadmin && showCompanySelector && (
            <div style={{ padding: 12, borderBottom: '1px solid #e0e0e0', marginBottom: 8 }}>
              <div
                onClick={() => {
                  // Accordion only needed for superadmin
                  setCompaniesExpanded(v => !v);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '4px 2px',
                  marginBottom: 8,
                }}
                role="button"
                aria-label="Växla Företag"
              >
                <div style={{ fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Företag
                </div>
                <Ionicons name={companiesExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
              </div>

              {companiesExpanded && (
                <>
                  {loadingCompanies ? (
                    <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                      Laddar företag...
                    </div>
                  ) : companies.length === 0 ? (
                    <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                      Inga företag
                    </div>
                  ) : (
                    (() => {
                      const sorted = getSortedCompanies();
                      const pinned = sorted.find(isMsByggsystem);
                      const rest = sorted.filter(c => !isMsByggsystem(c));

                      const renderCompanyRow = (company) => {
                        const isSelected = selectedCompanyId && String(company.id || '').trim() === String(selectedCompanyId || '').trim();
                        const showStar = isMsByggsystem(company);
                        const hoverKey = `company|${String(company.id || '')}`;
                        const isHovered = hoveredKey === hoverKey;
                        return (
                          <div
                            key={company.id}
                            onClick={() => handleCompanySelect(company)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '8px 12px',
                              marginBottom: 4,
                              borderRadius: 6,
                              backgroundColor: isSelected ? LEFT_NAV.activeBg : isHovered ? LEFT_NAV.hoverBg : 'transparent',
                              cursor: 'pointer',
                              borderLeft: isSelected ? `3px solid ${LEFT_NAV.activeBorder}` : '3px solid transparent',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={() => setHoveredKey(hoverKey)}
                            onMouseLeave={() => setHoveredKey(null)}
                          >
                          <Ionicons
                            name="business"
                            size={16}
                            color="#2E7D32"
                            style={{ marginRight: 8 }}
                          />
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: isSelected ? '600' : '400',
                                color: isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault,
                              }}
                            >
                              {company.name || company.id}
                            </span>
                            {showStar && (
                              <Ionicons
                                name="star"
                                size={14}
                                color={isSelected ? LEFT_NAV.activeBorder : '#F59E0B'}
                                style={{ marginLeft: 8 }}
                              />
                            )}
                          </div>
                        );
                      };

                      return (
                        <>
                          {pinned ? renderCompanyRow(pinned) : null}

                          {/* Add company as a row under MS Byggsystem */}
                          <div
                            onClick={() => {
                              navigation.navigate('ManageCompany', { createNew: true });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '8px 12px',
                              marginTop: 2,
                              marginBottom: 12,
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              cursor: 'pointer',
                              border: '1px dashed #CBD5E1',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              setHoveredKey('company|add');
                              try { e.currentTarget.style.backgroundColor = '#fff'; } catch (_e) {}
                            }}
                            onMouseLeave={(e) => {
                              setHoveredKey(null);
                              try { e.currentTarget.style.backgroundColor = '#fff'; } catch (_e) {}
                            }}
                            role="button"
                            aria-label="Lägg till företag"
                          >
                          <Ionicons name="add-circle-outline" size={16} color="#2E7D32" style={{ marginRight: 8 }} />
                          <span style={{ fontSize: 13, fontWeight: '400', color: '#1976D2' }}>
                              Lägg till företag
                            </span>
                          </div>

                          {rest.map(renderCompanyRow)}
                        </>
                      );
                    })()
                  )}
                </>
              )}
            </div>
          )}

          {/* Admin Menu Items - Show after company selector */}
          <div style={{ padding: 12 }}>
            <div
              onClick={() => {
                if (isSuperadmin) setAdminExpanded(v => !v);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: isSuperadmin ? 'pointer' : 'default',
                userSelect: 'none',
                padding: '4px 2px',
                marginBottom: 8,
              }}
              role={isSuperadmin ? 'button' : undefined}
              aria-label="Växla Admin"
            >
              <div style={{ fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Admin
              </div>
              {isSuperadmin ? (
                <Ionicons name={adminExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
              ) : null}
            </div>

            {(adminExpanded || !isSuperadmin) && adminMenuItems.map(item => {
              const isActive = currentScreen === item.key;
              const hoverKey = `admin|${item.key}`;
              const isHovered = hoveredKey === hoverKey;
              return (
                <div
                  key={item.key}
                  onClick={() => handleMenuClick(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 12px',
                    marginBottom: 4,
                    borderRadius: 6,
                    backgroundColor: isActive ? LEFT_NAV.activeBg : isHovered ? LEFT_NAV.hoverBg : 'transparent',
                    cursor: 'pointer',
                    borderLeft: isActive ? `3px solid ${LEFT_NAV.activeBorder}` : '3px solid transparent',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={() => setHoveredKey(hoverKey)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={item.color || (isActive ? LEFT_NAV.iconDefault : isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted)}
                    style={{ marginRight: 10 }}
                  />
                  <span style={{
                    fontSize: 14,
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? LEFT_NAV.textDefault : isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault,
                  }}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
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
        {/* Company Selector for Superadmin - Show first */}
        {isSuperadmin && showCompanySelector && (
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => setCompaniesExpanded(v => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 4,
                paddingHorizontal: 2,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Företag
              </Text>
              <Ionicons name={companiesExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
            </TouchableOpacity>

            {companiesExpanded && (
              <>
                {loadingCompanies ? (
                  <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                    Laddar företag...
                  </Text>
                ) : companies.length === 0 ? (
                  <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                    Inga företag
                  </Text>
                ) : (
                  (() => {
                    const sorted = getSortedCompanies();
                    const pinned = sorted.find(isMsByggsystem);
                    const rest = sorted.filter(c => !isMsByggsystem(c));

                    const renderCompanyRow = (company) => {
                      const isSelected = selectedCompanyId && String(company.id || '').trim() === String(selectedCompanyId || '').trim();
                      const showStar = isMsByggsystem(company);
                      return (
                        <TouchableOpacity
                          key={company.id}
                          onPress={() => handleCompanySelect(company)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 8,
                            marginBottom: 4,
                            borderRadius: 6,
                            backgroundColor: isSelected ? LEFT_NAV.activeBg : 'transparent',
                            borderLeftWidth: 3,
                            borderLeftColor: isSelected ? LEFT_NAV.activeBorder : 'transparent',
                          }}
                        >
                          <Ionicons
                            name="business"
                            size={16}
                            color="#2E7D32"
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isSelected ? '600' : '400',
                              color: LEFT_NAV.textDefault,
                            }}
                          >
                            {company.name || company.id}
                          </Text>
                          {showStar && (
                            <Ionicons name="star" size={14} color="#F59E0B" style={{ marginLeft: 8 }} />
                          )}
                        </TouchableOpacity>
                      );
                    };

                    return (
                      <>
                        {pinned ? renderCompanyRow(pinned) : null}

                        <TouchableOpacity
                          onPress={() => navigation.navigate('ManageCompany', { createNew: true })}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 8,
                            marginTop: 2,
                            marginBottom: 12,
                            borderRadius: 6,
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

                        {rest.map(renderCompanyRow)}
                      </>
                    );
                  })()
                )}
              </>
            )}
          </View>
        )}

        {/* Admin Menu Items - Show after company selector */}
        <View style={{ padding: 12 }}>
          <TouchableOpacity
            onPress={() => {
              if (isSuperadmin) setAdminExpanded(v => !v);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 4,
              paddingHorizontal: 2,
              marginBottom: 8,
            }}
            disabled={!isSuperadmin}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Admin
            </Text>
            {isSuperadmin ? (
              <Ionicons name={adminExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
            ) : null}
          </TouchableOpacity>

          {(adminExpanded || !isSuperadmin) && adminMenuItems.map(item => {
            const isActive = currentScreen === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => handleMenuClick(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 10,
                  marginBottom: 4,
                  borderRadius: 6,
                  backgroundColor: isActive ? LEFT_NAV.activeBg : 'transparent',
                  borderLeftWidth: 3,
                  borderLeftColor: isActive ? LEFT_NAV.activeBorder : 'transparent',
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.color || LEFT_NAV.iconMuted}
                  style={{ marginRight: 10 }}
                />
                <Text style={{
                  fontSize: 14,
                  fontWeight: isActive ? '600' : '400',
                  color: LEFT_NAV.textDefault,
                }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
