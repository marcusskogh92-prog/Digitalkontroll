/**
 * Återanvändbar användarhantering för ett företag.
 * Används i Företagsinställningar → Användare och på skärmen ManageUsers.
 * Innehåller sökning, tabell (UsersTable) och UserEditModal.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  adminFetchCompanyMembers,
  auth,
  createUserRemote,
  deleteUserRemote,
  fetchCompanyMembers,
  updateUserRemote,
  uploadUserAvatar,
} from './firebase';
import UserEditModal from './UserEditModal';
import UsersTable from './UsersTable';

const isEmailSuperadmin = (email) => {
  const e = String(email || '').toLowerCase();
  return e === 'marcus@msbyggsystem.se' || e === 'marcus.skogh@msbyggsystem.se'
    || e === 'marcus.skogh@msbyggsystem.com' || e === 'marcus.skogh@msbyggsystem';
};

export default function CompanyUsersContent({ companyId, companyName: companyNameProp, embedded, onMembersLoaded, userLimit: userLimitProp }) {
  const cid = String(companyId || '').trim();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [memberSearch, setMemberSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalIsNew, setModalIsNew] = useState(false);
  const [modalMember, setModalMember] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [currentClaims, setCurrentClaims] = useState({ admin: false, superadmin: false, role: '' });

  const currentUid = String(auth?.currentUser?.uid || '').trim();
  const currentEmail = String(auth?.currentUser?.email || '').toLowerCase();
  const isSuperAdmin = !!(currentClaims?.superadmin || currentClaims?.role === 'superadmin' || isEmailSuperadmin(currentEmail));
  const isCompanyAdmin = !!(currentClaims?.admin || currentClaims?.role === 'admin' || isSuperAdmin);

  const companyName = companyNameProp || cid;
  const userLimit = typeof userLimitProp === 'number' && userLimitProp >= 0 ? userLimitProp : null;

  const kpiStats = useMemo(() => {
    const arr = Array.isArray(members) ? members : [];
    const admins = arr.filter((m) => m?.role === 'admin' || m?.role === 'superadmin');
    return {
      total: arr.length,
      adminCount: admins.length,
      userCount: arr.length - admins.length,
      usagePercent: userLimit != null && userLimit > 0 ? Math.round((arr.length / userLimit) * 100) : 0,
    };
  }, [members, userLimit]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let mounted = true;
    (async () => {
      try {
        const tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null);
        const claims = tokenRes?.claims || {};
        const isSuperClaim = !!(claims?.superadmin === true || claims?.role === 'superadmin');
        const isAdminClaim = !!(claims?.admin === true || claims?.role === 'admin');
        const canSeeAll = isSuperClaim || isEmailSuperadmin(currentEmail);
        if (!mounted) return;
        setCurrentClaims({
          admin: isAdminClaim,
          superadmin: isSuperClaim,
          role: String(claims?.role || (isSuperClaim ? 'superadmin' : (isAdminClaim ? 'admin' : ''))),
        });
        setCanSeeAllCompanies(!!canSeeAll);
      } catch (_e) {
        if (!mounted) return;
        setCanSeeAllCompanies(false);
      }
    })();
    return () => { mounted = false; };
  }, [currentEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cid) {
        setMembers([]);
        setError('');
        return;
      }
      setLoading(true);
      setError('');
      try {
        let mems = [];
        let loaded = false;
        if (canSeeAllCompanies) {
          try {
            const r = await adminFetchCompanyMembers(cid);
            const arr = r?.members ?? r?.data?.members ?? [];
            if (Array.isArray(arr)) {
              mems = arr;
              loaded = true;
            }
          } catch (_e) {}
        }
        if (!loaded) {
          mems = await fetchCompanyMembers(cid).catch(() => []);
        }
        if (!cancelled) {
          const list = Array.isArray(mems) ? mems : [];
          setMembers(list);
          if (typeof onMembersLoaded === 'function') onMembersLoaded(list);
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e || 'Kunde inte ladda användare.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cid, reloadNonce, canSeeAllCompanies, onMembersLoaded]);

  const canEditUser = (member) => {
    if (!member || !isCompanyAdmin) return false;
    const targetRole = String(member?.role || '').trim();
    if (!isSuperAdmin && targetRole === 'superadmin') return false;
    return true;
  };

  const canDeleteUser = (member) => {
    if (!member || !isCompanyAdmin) return false;
    const uid = String(member?.uid || member?.id || '').trim();
    const targetRole = String(member?.role || '').trim();
    if (uid && currentUid && uid === currentUid) return false;
    if (!isSuperAdmin && targetRole === 'superadmin') return false;
    const emailLower = String(member?.email || '').trim().toLowerCase();
    if (emailLower === 'marcus@msbyggsystem.se') return false;
    return true;
  };

  const handleRefresh = () => setReloadNonce((n) => n + 1);

  const openAddModal = () => {
    setModalError('');
    setModalIsNew(true);
    setModalMember(null);
    setModalOpen(true);
  };

  const openEditModal = (member) => {
    setModalError('');
    setModalIsNew(false);
    setModalMember(member || null);
    setModalOpen(true);
  };

  const handleToggleDisabled = async (member) => {
    if (!member || !canEditUser(member)) return;
    const uid = String(member?.uid || member?.id || '').trim();
    if (!uid || (uid === currentUid)) {
      if (uid === currentUid) Alert.alert('Inte tillåtet', 'Du kan inte inaktivera ditt eget konto.');
      return;
    }
    const currentlyDisabled = !!(member.disabled === true || String(member.status || '').toLowerCase() === 'disabled');
    const targetDisabled = !currentlyDisabled;
    try {
      await updateUserRemote({ companyId: cid, uid, disabled: targetDisabled });
      setMembers((prev) => (Array.isArray(prev) ? prev.map((m) => {
        const mmuid = String(m?.uid || m?.id || '').trim();
        if (mmuid !== uid) return m;
        return { ...m, disabled: targetDisabled };
      }) : prev));
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const handleDelete = async (member) => {
    if (!member || !canDeleteUser(member)) {
      Alert.alert('Inte tillåtet', 'Du kan inte ta bort denna användare.');
      return;
    }
    const uid = String(member?.uid || member?.id || '').trim();
    if (!uid) return;
    const label = String(member?.displayName || member?.email || 'användaren');
    const conf = (typeof window !== 'undefined')
      ? window.confirm(`Ta bort ${label}?\n\nDetta drar tillbaka åtkomst (soft delete).`)
      : true;
    if (!conf) return;
    try {
      await deleteUserRemote({ companyId: cid, uid });
      setReloadNonce((n) => n + 1);
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const handleSave = async (payload) => {
    if (!cid) return;
    setModalSaving(true);
    setModalError('');
    try {
      const firstName = String(payload?.firstName || '').trim();
      const lastName = String(payload?.lastName || '').trim();
      const displayName = String(`${firstName} ${lastName}`.trim());
      const email = String(payload?.email || '').trim().toLowerCase();
      const role = String(payload?.role || 'user').trim() || 'user';
      const disabled = !!payload?.disabled;
      const avatarPreset = String(payload?.avatarPreset || '').trim();
      const avatarFile = payload?.avatarFile || null;
      const password = String(payload?.password || '');
      const permissions = Array.isArray(payload?.permissions) ? payload.permissions : [];

      if (!modalIsNew) {
        const uid = String(modalMember?.uid || modalMember?.id || '').trim();
        if (!uid) throw new Error('Saknar uid för användaren');
        if (!canEditUser(modalMember)) throw new Error('Inte tillåtet');
        const patch = { displayName, role, disabled, permissions };
        if (avatarFile) {
          const photoURL = await uploadUserAvatar({ companyId: cid, uid, file: avatarFile });
          patch.photoURL = photoURL || '';
          patch.avatarPreset = '';
        } else if (avatarPreset) {
          patch.avatarPreset = avatarPreset;
          patch.photoURL = '';
        }
        await updateUserRemote({ companyId: cid, uid, ...patch });
      } else {
        const res = await createUserRemote({
          companyId: cid,
          email,
          displayName,
          role,
          password,
          firstName,
          lastName,
          avatarPreset: avatarPreset || undefined,
          permissions,
        });
        const createdUid = String(res?.uid || res?.data?.uid || '').trim();
        const tempPw = String(res?.tempPassword || res?.data?.tempPassword || '').trim();
        if (createdUid && avatarFile) {
          const photoURL = await uploadUserAvatar({ companyId: cid, uid: createdUid, file: avatarFile });
          await updateUserRemote({ companyId: cid, uid: createdUid, photoURL: photoURL || '', avatarPreset: '' });
        }
        if (tempPw && typeof window !== 'undefined') {
          try { window.alert(`Användare skapad. Lösenord: ${tempPw}`); } catch (_e) {}
        }
      }
      setModalOpen(false);
      setReloadNonce((n) => n + 1);
    } catch (e) {
      setModalError(String(e?.message || e));
    } finally {
      setModalSaving(false);
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={{ padding: 16 }}>
        <UsersTable
          companyName={companyName}
          hasSelectedCompany={!!cid}
          users={members}
          loading={loading}
          error={error}
          search={memberSearch}
          setSearch={setMemberSearch}
          onRefresh={handleRefresh}
          onAdd={openAddModal}
          onEdit={openEditModal}
          onToggleDisabled={handleToggleDisabled}
          onDelete={handleDelete}
          canEditUser={canEditUser}
          canDeleteUser={canDeleteUser}
        />
      </View>
    );
  }

  if (!isCompanyAdmin) {
    return (
      <View style={{ padding: 20 }}>
        <UsersTable
          companyName={companyName}
          hasSelectedCompany={!!cid}
          users={[]}
          loading={false}
          error="Du behöver vara Admin eller Superadmin för att hantera användare."
          search={memberSearch}
          setSearch={setMemberSearch}
          onRefresh={handleRefresh}
          onAdd={() => {}}
          onEdit={() => {}}
          onToggleDisabled={() => {}}
          onDelete={() => {}}
          canEditUser={() => false}
          canDeleteUser={() => false}
        />
      </View>
    );
  }

  const progressColor = kpiStats.usagePercent >= 90 ? '#DC2626' : kpiStats.usagePercent >= 70 ? '#D97706' : '#1976D2';
  const showLicenseWarning = kpiStats.usagePercent >= 90 && userLimit != null;

  return (
    <>
      {embedded && (
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E8EC', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 }}>Totalt antal användare</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#111' }}>{kpiStats.total} {userLimit != null ? `/ ${userLimit}` : ''}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E8EC', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 }}>Admin</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#1e293b' }}>{kpiStats.adminCount} st</Text>
            </View>
            <View style={{ flex: 1, minWidth: 120, borderRadius: 12, padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E8EC', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4 }}>Användare</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#334155' }}>{kpiStats.userCount} st</Text>
            </View>
            <View style={{ flex: 1, minWidth: 160, borderRadius: 12, padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6E8EC', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8 }}>Licensutnyttjande</Text>
              <View style={{ height: 8, borderRadius: 6, backgroundColor: '#E2E8F0', overflow: 'hidden', marginBottom: showLicenseWarning ? 8 : 0 }}>
                <View style={{ height: '100%', width: `${Math.min(100, kpiStats.usagePercent)}%`, backgroundColor: progressColor, borderRadius: 6, ...(Platform.OS === 'web' ? { transition: 'width 0.2s ease' } : {}) }} />
              </View>
              {showLicenseWarning ? (
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>⚠ Licensutnyttjandet är över 90%</Text>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>{kpiStats.usagePercent}%</Text>
              )}
            </View>
          </View>
        </View>
      )}
      <View style={embedded ? { flex: 1, minHeight: 0 } : undefined}>
        <UsersTable
          companyName={embedded ? undefined : companyName}
          showRoleFilter={embedded}
          hasSelectedCompany={!!cid}
          users={members}
          loading={loading}
          error={error}
          search={memberSearch}
          setSearch={setMemberSearch}
          onRefresh={handleRefresh}
          onAdd={openAddModal}
          onEdit={openEditModal}
          onToggleDisabled={handleToggleDisabled}
          onDelete={handleDelete}
          canEditUser={canEditUser}
          canDeleteUser={canDeleteUser}
        />
      </View>
      <UserEditModal
        visible={modalOpen}
        member={modalMember}
        companyId={cid}
        isNew={modalIsNew}
        saving={modalSaving}
        errorMessage={modalError}
        userLimit={userLimit}
        usagePercent={kpiStats.usagePercent}
        canDelete={!modalIsNew && canDeleteUser(modalMember)}
        onDelete={() => {
          setModalOpen(false);
          handleDelete(modalMember);
        }}
        onClose={() => {
          if (modalSaving) return;
          setModalOpen(false);
          setModalError('');
        }}
        onSave={handleSave}
      />
    </>
  );
}
