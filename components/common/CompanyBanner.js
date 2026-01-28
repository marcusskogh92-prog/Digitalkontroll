/**
 * CompanyBanner - Shows company information banner in admin views
 * Displays company logo, name, ID, users, licenses, created date, and last active
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import { fetchAdminAuditForCompany, fetchCompanyMembers, fetchCompanyProfile, resolveCompanyLogoUrl } from '../firebase';

const InfoItem = ({ label, value }) => (
  <View style={{ minWidth: 120 }}>
    <Text style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: '600', color: '#222' }}>{value}</Text>
  </View>
);

export default function CompanyBanner({ companyId, onEdit }) {
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [userLimit, setUserLimit] = useState(null);
  const [companyMemberCount, setCompanyMemberCount] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [lastActive, setLastActive] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) {
          setCompanyName('');
          setLogoUrl('');
          setUserLimit(null);
          setCompanyMemberCount(null);
          setCreatedAt(null);
          setLastActive(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        // Fetch company profile
        const profile = await fetchCompanyProfile(companyId);
        if (!mounted) return;

        if (profile) {
          setCompanyName(profile.companyName || profile.name || companyId);
          setUserLimit(profile.userLimit || null);
          
          // Resolve logo URL
          const logo = await resolveCompanyLogoUrl(companyId);
          if (mounted) setLogoUrl(logo || '');

          // Get created date from profile
          if (profile.createdAt) {
            try {
              const created = profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt);
              setCreatedAt(created.toLocaleDateString('sv-SE'));
            } catch (_e) {
              setCreatedAt(null);
            }
          }
        }

        // Fetch member count
        try {
          const members = await fetchCompanyMembers(companyId);
          if (mounted) {
            setCompanyMemberCount(Array.isArray(members) ? members.length : 0);
          }
        } catch (_e) {
          if (mounted) setCompanyMemberCount(null);
        }

        // Get last active from audit log
        try {
          const auditEvents = await fetchAdminAuditForCompany(companyId, 1);
          if (mounted && Array.isArray(auditEvents) && auditEvents.length > 0) {
            const firstEvent = auditEvents[0];
            if (firstEvent?.ts) {
              try {
                const ts = firstEvent.ts.toDate ? firstEvent.ts.toDate() : new Date(firstEvent.ts);
                setLastActive(ts.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
              } catch (_e) {
                setLastActive(null);
              }
            }
          }
        } catch (_e) {
          if (mounted) setLastActive(null);
        }
      } catch (error) {
        console.error('[CompanyBanner] Error loading company data:', error);
        if (mounted) {
          setCompanyName(companyId);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  if (!companyId || loading) {
    return null;
  }

  const seatsLeft = (typeof companyMemberCount === 'number' && typeof userLimit === 'number') 
    ? (userLimit - companyMemberCount) 
    : null;

  if (Platform.OS === 'web') {
    return (
      <div style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 24, alignItems: 'center' }}>
          {/* Logo Section */}
          <div style={{ flex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 200 }}>
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={companyName}
                style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="business" size={48} color="#ccc" />
              </div>
            )}
          </div>

          {/* Info Section */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ fontSize: 24, fontWeight: 600, color: '#222', margin: 0, flex: 1, minWidth: 200 }}>
                {companyName || companyId}
              </h2>
              {onEdit && (
                <button
                  onClick={onEdit}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#222',
                  }}
                >
                  Ändra
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Företags-ID</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{companyId || '—'}</div>
              </div>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Användare</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
                  {typeof companyMemberCount === 'number' ? `${companyMemberCount} st` : '—'}
                </div>
              </div>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Licenser</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
                  {seatsLeft !== null ? `${seatsLeft} kvar` : (userLimit ? `${userLimit} totalt` : '—')}
                </div>
              </div>
              {createdAt && (
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Skapad</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{createdAt}</div>
                </div>
              )}
              {lastActive && (
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Senast aktiv</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{lastActive}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      marginBottom: 24,
    }}>
      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
        {/* Logo Section */}
        <View style={{ flex: 0, alignItems: 'center', justifyContent: 'center', minWidth: 200 }}>
          {logoUrl ? (
            <Image 
              source={{ uri: logoUrl }} 
              style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0' }} 
              resizeMode="contain"
            />
          ) : (
            <View style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="business" size={48} color="#ccc" />
            </View>
          )}
        </View>

        {/* Info Section */}
        <View style={{ flex: 1, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Text style={{ fontSize: 24, fontWeight: '600', color: '#222', flex: 1, minWidth: 200 }}>
              {companyName || companyId}
            </Text>
            {onEdit && (
              <TouchableOpacity
                onPress={onEdit}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>
                  Ändra
                </Text>
                <Ionicons name="chevron-down" size={14} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <InfoItem label="Företags-ID" value={companyId || '—'} />
            <InfoItem 
              label="Användare" 
              value={typeof companyMemberCount === 'number' ? `${companyMemberCount} st` : '—'} 
            />
            <InfoItem 
              label="Licenser" 
              value={seatsLeft !== null ? `${seatsLeft} kvar` : (userLimit ? `${userLimit} totalt` : '—')} 
            />
            {createdAt && <InfoItem label="Skapad" value={createdAt} />}
            {lastActive && <InfoItem label="Senast aktiv" value={lastActive} />}
          </View>
        </View>
      </View>
    </View>
  );
}
