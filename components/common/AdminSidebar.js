/**
 * AdminSidebar - Sidebar for admin screens with navigation and company selector
 * Shows all admin menu items and allows navigation between admin screens
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [spinHome, setSpinHome] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);

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
      { key: 'contact_registry', label: 'Kontaktregister', icon: 'book-outline', color: '#0f172a', screen: 'ContactRegistry' },
      { key: 'suppliers', label: 'Leverantörer', icon: 'business-outline', color: '#43A047', screen: 'Suppliers' },
      { key: 'customers', label: 'Kunder', icon: 'people-outline', color: '#FB8C00', screen: 'Customers' },
      { key: 'sharepoint_navigation', label: 'SharePoint Navigation', icon: 'folder-outline', color: '#7B1FA2', screen: 'ManageSharePointNavigation' },
    );
  }

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
    // Refresh companies list
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
              color="#1976D2"
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
              color="#1976D2"
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
              <div style={{ fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Företag
              </div>
              {loadingCompanies ? (
                <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                  Laddar företag...
                </div>
              ) : companies.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                  Inga företag
                </div>
              ) : (
                companies.map(company => {
                  const isSelected = selectedCompanyId && String(company.id || '').trim() === String(selectedCompanyId || '').trim();
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
                        backgroundColor: isSelected ? '#DBEAFE' : 'transparent',
                        cursor: 'pointer',
                        borderLeft: isSelected ? '3px solid #1D4ED8' : '3px solid transparent',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#EFF6FF';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Ionicons 
                        name="business" 
                        size={16} 
                        color={isSelected ? '#1D4ED8' : '#666'} 
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ 
                        fontSize: 13, 
                        fontWeight: isSelected ? '600' : '400',
                        color: isSelected ? '#1D4ED8' : '#222',
                      }}>
                        {company.name || company.id}
                      </span>
                    </div>
                  );
                })
              )}
              
              {/* Add New Company Button */}
              {isSuperadmin && (
                <div
                  onClick={() => {
                    // Navigate to ManageCompany screen with createNew param
                    navigation.navigate('ManageCompany', { createNew: true });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 12px',
                    marginTop: 8,
                    borderRadius: 8,
                    backgroundColor: '#1976D2',
                    cursor: 'pointer',
                    border: '1px solid #1565C0',
                    transition: 'background-color 0.15s, box-shadow 0.15s, transform 0.05s',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.15)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1565C0';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(15, 23, 42, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1976D2';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.15)';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(1px)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Ionicons 
                    name="add" 
                    size={16} 
                    color="#fff" 
                    style={{ marginRight: 6 }}
                  />
                  <span style={{ 
                    fontSize: 13, 
                    fontWeight: '600',
                    color: '#fff',
                  }}>
                    Lägg till nytt företag
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Admin Menu Items - Show after company selector */}
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Admin
            </div>
            {adminMenuItems.map(item => {
              const isActive = currentScreen === item.key;
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
                    backgroundColor: isActive ? '#e3f2fd' : 'transparent',
                    cursor: 'pointer',
                    borderLeft: isActive ? `3px solid ${item.color}` : '3px solid transparent',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#f0f0f0';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Ionicons 
                    name={item.icon} 
                    size={18} 
                    color={isActive ? item.color : '#666'} 
                    style={{ marginRight: 10 }}
                  />
                  <span style={{ 
                    fontSize: 14, 
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? item.color : '#222',
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
            color="#1976D2"
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
            color="#1976D2"
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
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Företag
            </Text>
            {loadingCompanies ? (
              <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                Laddar företag...
              </Text>
            ) : companies.length === 0 ? (
              <Text style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 13 }}>
                Inga företag
              </Text>
            ) : (
              companies.map(company => {
                const isSelected = selectedCompanyId && String(company.id || '').trim() === String(selectedCompanyId || '').trim();
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
                        backgroundColor: isSelected ? '#DBEAFE' : 'transparent',
                        borderLeftWidth: 3,
                        borderLeftColor: isSelected ? '#1D4ED8' : 'transparent',
                      }}
                  >
                    <Ionicons 
                      name="business" 
                        size={16} 
                        color={isSelected ? '#1D4ED8' : '#666'} 
                      style={{ marginRight: 8 }}
                    />
                    <Text style={{ 
                      fontSize: 13, 
                        fontWeight: isSelected ? '600' : '400',
                        color: isSelected ? '#1D4ED8' : '#222',
                    }}>
                      {company.name || company.id}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
            
            {/* Add New Company Button */}
            {isSuperadmin && (
              <TouchableOpacity
                onPress={() => {
                  // Navigate to ManageCompany screen with createNew param
                  navigation.navigate('ManageCompany', { createNew: true });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                  marginTop: 8,
                  borderRadius: 8,
                  backgroundColor: '#1976D2',
                  borderWidth: 1,
                  borderColor: '#1565C0',
                }}
              >
                <Ionicons 
                  name="add" 
                  size={16} 
                  color="#fff" 
                  style={{ marginRight: 6 }}
                />
                <Text style={{ 
                  fontSize: 13, 
                  fontWeight: '600',
                  color: '#fff',
                }}>
                  Lägg till nytt företag
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Admin Menu Items - Show after company selector */}
        <View style={{ padding: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Admin
          </Text>
          {adminMenuItems.map(item => {
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
                  backgroundColor: isActive ? '#e3f2fd' : 'transparent',
                  borderLeftWidth: 3,
                  borderLeftColor: isActive ? item.color : 'transparent',
                }}
              >
                <Ionicons 
                  name={item.icon} 
                  size={18} 
                  color={isActive ? item.color : '#666'} 
                  style={{ marginRight: 10 }}
                />
                <Text style={{ 
                  fontSize: 14, 
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? item.color : '#222',
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
