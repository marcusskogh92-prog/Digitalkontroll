/**
 * Modal för att skapa eller redigera användare.
 * Följer samma golden rules och layout som Min profil: ModalBase, mörk header, avatar vänster, formulär höger.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../constants/modalDesign2026';
import { LEFT_NAV } from '../constants/leftNavTheme';
import { useDraggableResizableModal } from '../hooks/useDraggableResizableModal';
import ModalBase from './common/ModalBase';

const FONT_FAMILY = (LEFT_NAV && LEFT_NAV.webFontFamily) || 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Som Min profil: initialer från namn/email, annars "?". */
function getInitials(firstName, lastName, email) {
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  if (fn && ln) return `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
  if (fn) return fn.slice(0, 2).toUpperCase();
  const e = String(email || '').trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return '?';
}

const ADMIN_PERMISSIONS = [
  { key: 'manage_templates', label: 'Hantera mallar' },
  { key: 'manage_categories', label: 'Hantera kategorier' },
  { key: 'manage_chart_of_accounts', label: 'Hantera kontoplan' },
  { key: 'manage_building_parts', label: 'Hantera byggdelar' },
  { key: 'manage_sharepoint', label: 'Hantera SharePoint' },
  { key: 'manage_users', label: 'Hantera användare' },
  { key: 'manage_ai_settings', label: 'Hantera AI-inställningar' },
];

/** Register = Struktur under Register (Mallar, Kategorier, Kontoplan, Byggdelar). */
const REGISTER_PERMISSION_KEYS = ['manage_templates', 'manage_categories', 'manage_chart_of_accounts', 'manage_building_parts'];
/** Administration = Användare, SharePoint, AI m.m. */
const ADMINISTRATION_PERMISSION_KEYS = ['manage_sharepoint', 'manage_users', 'manage_ai_settings'];

const PERMISSION_GROUPS = [
  { title: 'Register', keys: REGISTER_PERMISSION_KEYS },
  { title: 'Administration', keys: ADMINISTRATION_PERMISSION_KEYS },
];

/** Alla behörighetsnycklar – används för att bocka i allt när man väljer Admin/Superadmin. */
const ALL_PERMISSION_KEYS = [...REGISTER_PERMISSION_KEYS, ...ADMINISTRATION_PERMISSION_KEYS];

const USER_EDIT_MODAL_WIDTH = 680;
const USER_EDIT_MODAL_HEIGHT = 560;

export default function UserEditModal({
  visible,
  member,
  companyId,
  onClose,
  onSave,
  saving,
  saveSuccess,
  isNew,
  errorMessage,
  onDelete,
  canDelete = true,
  userLimit = null,
  usagePercent = 0,
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [showPassword, setShowPassword] = useState(false);
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const avatarUploadInputRef = useRef(null);

  const { boxStyle: dragBoxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: USER_EDIT_MODAL_WIDTH,
    defaultHeight: USER_EDIT_MODAL_HEIGHT,
    minWidth: 480,
    minHeight: 420,
  });
  const hasDragPosition = Platform.OS === 'web' && dragBoxStyle && Object.keys(dragBoxStyle).length > 0;
  const defaultBoxStyle = hasDragPosition
    ? {}
    : {
        width: Platform.OS === 'web' ? USER_EDIT_MODAL_WIDTH : '92%',
        maxWidth: USER_EDIT_MODAL_WIDTH,
        height: Platform.OS === 'web' ? USER_EDIT_MODAL_HEIGHT : '75%',
        maxHeight: Platform.OS === 'web' ? USER_EDIT_MODAL_HEIGHT : '75%',
      };

  const inputStyle = {
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: D.inputRadius,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 13,
    color: '#1e293b',
    fontFamily: FONT_FAMILY,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };
  const labelStyle = { fontSize: 13, fontWeight: '500', color: '#334155', marginBottom: 4, fontFamily: FONT_FAMILY };

  const togglePermission = (key) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const getPermissionLabel = (key) => ADMIN_PERMISSIONS.find((p) => p.key === key)?.label ?? key;

  const toggleGroup = (groupKeys) => {
    const allChecked = groupKeys.every((k) => permissions.includes(k));
    setPermissions((prev) => {
      if (allChecked) return prev.filter((k) => !groupKeys.includes(k));
      const added = groupKeys.filter((k) => !prev.includes(k));
      return [...prev, ...added];
    });
  };

  const isGroupAllChecked = (groupKeys) => groupKeys.length > 0 && groupKeys.every((k) => permissions.includes(k));

  const normalizeName = (value) => {
    if (!value) return '';
    const trimmed = String(value).replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';
    return trimmed
      .split(' ')
      .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '')
      .join(' ');
  };

  const isMsBygg = String(companyId || '').trim() === 'MS Byggsystem';
  const rawEmail = String(email || '').trim();
  const emailIsValid = rawEmail.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
  const passwordOptional = isNew && sendInviteEmail;
  const requiredFilledForCreate = () => {
    if (!isNew) return true;
    const base = String(firstName || '').trim().length > 0
      && String(lastName || '').trim().length > 0
      && emailIsValid
      && String(role || '').length > 0;
    if (passwordOptional) return base;
    return base && String(password || '').length > 0;
  };

  const firstNameMissing = isNew && String(firstName || '').trim().length === 0;
  const lastNameMissing = isNew && String(lastName || '').trim().length === 0;
  const emailMissing = isNew && !emailIsValid;
  const passwordMissing = isNew && !passwordOptional && String(password || '').length === 0;
  const licenseWarning = isNew && typeof usagePercent === 'number' && usagePercent >= 90;

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let out = '';
    for (let i = 0; i < 12; i += 1) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(out);
    setShowPassword(true);
  };

  useEffect(() => {
    if (!visible) return;
    const dn = String(member?.displayName || '').trim();
    const parts = dn ? dn.split(' ') : [];
    setFirstName(parts.slice(0, parts.length - 1).join(' ') || (member?.firstName || ''));
    setLastName(parts.length > 1 ? parts.slice(-1).join(' ') : (member?.lastName || ''));
    setEmail(isNew ? '' : (member?.email || ''));
    const isSuperMember = !!(member && (member.role === 'superadmin' || member.superadmin));
    const adminGuess = !!(member && (member.isAdmin || member.admin || member.role === 'admin' || member.access === 'admin' || isSuperMember));
    if (isSuperMember && isMsBygg) setRole('superadmin');
    else setRole(adminGuess ? 'admin' : 'user');
    setPassword('');
    setDisabled(!!(member?.disabled === true || String(member?.status || '').toLowerCase() === 'disabled'));
    setAvatarFile(null);
    setAvatarPreviewUrl('');
    setSendInviteEmail(true);
    const perms = member?.permissions;
    const isAdminRole = isSuperMember || adminGuess;
    const defaultAdminPerms = Array.isArray(perms) && perms.length > 0 ? [...perms] : (isAdminRole ? [...ALL_PERMISSION_KEYS] : []);
    setPermissions(defaultAdminPerms);
  }, [visible, member, isNew, isMsBygg]);

  useEffect(() => {
    if (!visible) return;
    if (!avatarFile) {
      setAvatarPreviewUrl('');
      return;
    }
    try {
      const url = URL.createObjectURL(avatarFile);
      setAvatarPreviewUrl(url);
      return () => {
        try { URL.revokeObjectURL(url); } catch (_e) {}
      };
    } catch (_e) {
      setAvatarPreviewUrl('');
      return undefined;
    }
  }, [visible, avatarFile]);

  const emailReadOnly = !isNew && String(member?.email || '').trim().length > 0;

  const openAvatarUpload = () => {
    if (Platform.OS === 'web' && avatarUploadInputRef.current) {
      avatarUploadInputRef.current.value = '';
      avatarUploadInputRef.current.click();
    }
  };

  const onAvatarFileSelected = (e) => {
    const f = e?.target?.files?.[0] ?? null;
    setAvatarFile(f);
    try { if (e?.target) e.target.value = ''; } catch (_e2) {}
  };

  if (!visible) return null;

  const initials = getInitials(firstName, lastName, email);
  const existingPhotoUrl = !isNew && member?.photoURL ? String(member.photoURL).trim() : '';
  const showPhoto = avatarPreviewUrl || existingPhotoUrl;

  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
      <View>
        {!isNew && typeof onDelete === 'function' ? (
          <TouchableOpacity
            disabled={saving || !canDelete}
            onPress={() => onDelete(member)}
            style={{
              paddingVertical: D.buttonPaddingVertical,
              paddingHorizontal: D.buttonPaddingHorizontal,
              borderRadius: D.buttonRadius,
              borderWidth: 1,
              borderColor: '#fecaca',
              backgroundColor: '#fef2f2',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#b91c1c', fontFamily: FONT_FAMILY }}>Ta bort användare</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={onClose}
          disabled={saving}
          style={{
            paddingVertical: D.buttonPaddingVertical,
            paddingHorizontal: D.buttonPaddingHorizontal,
            borderRadius: D.buttonRadius,
            backgroundColor: '#fef2f2',
            borderWidth: 1,
            borderColor: '#fecaca',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#b91c1c', fontFamily: FONT_FAMILY }}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={saving || (isNew && !requiredFilledForCreate())}
          onPress={async () => {
            if (typeof onSave === 'function') {
              await onSave({
                firstName,
                lastName,
                email,
                role,
                password,
                disabled,
                avatarFile,
                permissions: (role === 'admin' || role === 'superadmin') ? permissions : [],
                sendInviteEmail: isNew ? sendInviteEmail : undefined,
              });
            }
          }}
          style={{
            paddingVertical: D.buttonPaddingVertical,
            paddingHorizontal: D.buttonPaddingHorizontal,
            borderRadius: D.buttonRadius,
            backgroundColor: D.buttonPrimaryBg ?? '#2D3A4B',
            opacity: (saving || (isNew && !requiredFilledForCreate())) ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: D.buttonPrimaryFontWeight ?? '500', color: D.buttonPrimaryColor ?? '#fff', fontFamily: FONT_FAMILY }}>
            {saving ? 'Sparar...' : isNew ? 'Skapa användare' : 'Spara'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title={isNew ? 'Lägg till användare' : 'Redigera användare'}
      subtitle={isNew ? 'Skapa ny admin eller användare' : undefined}
      headerVariant="neutralCompact"
      titleIcon={<Ionicons name="person" size={D.headerNeutralCompactIconPx ?? 14} color={D.headerNeutralTextColor} />}
      footer={footer}
      boxStyle={[defaultBoxStyle, dragBoxStyle]}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      contentStyle={{ padding: 0, flex: 1, minHeight: 0 }}
    >
      <View style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: D.contentPadding, paddingBottom: 16 }} showsVerticalScrollIndicator>
        {/* Licens (endast ny användare) – golden rule: info-banner enligt MODAL_DESIGN_2026 */}
        {isNew && userLimit != null ? (
          <View style={{ marginBottom: D.sectionGap ?? 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: D.buttonPaddingVertical,
              paddingHorizontal: 12,
              borderRadius: D.inputRadius,
              backgroundColor: D.tableHeaderBackgroundColor ?? '#f1f5f9',
              borderWidth: 1,
              borderColor: D.tableHeaderBorderColor ?? '#e2e8f0',
            }}>
              <Ionicons name="information-circle-outline" size={16} color={D.tableHeaderColor ?? '#475569'} style={{ marginRight: 8 }} />
              <Text style={{
                fontSize: 12,
                fontWeight: '500',
                color: D.tableHeaderColor ?? '#475569',
                fontFamily: FONT_FAMILY,
              }}>
                Påverkar licens: +1 användare
              </Text>
            </View>
            {licenseWarning ? (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff7ed', paddingVertical: D.buttonPaddingVertical, paddingHorizontal: 12, borderRadius: D.inputRadius, borderWidth: 1, borderColor: '#fed7aa' }}>
                <Ionicons name="warning" size={16} color="#c2410c" />
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#c2410c', fontFamily: FONT_FAMILY }}>Licensgräns nära att uppnås</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Layout som Min profil: vänster avatar, höger formulär */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 14 }}>
          {/* Vänster: avatar som Min profil – uppladdad bild eller initialer/grå ikon, "+ Byt bild" / "Ta bort bild" */}
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: showPhoto ? '#e2e8f0' : '#94a3b8',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {avatarPreviewUrl ? (
                Platform.OS === 'web' ? (
                  <img src={avatarPreviewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <Image source={{ uri: avatarPreviewUrl }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                )
              ) : existingPhotoUrl ? (
                Platform.OS === 'web' ? (
                  <img src={existingPhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <Image source={{ uri: existingPhotoUrl }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                )
              ) : (
                <Text style={{ fontSize: 20, fontWeight: '600', color: '#fff', fontFamily: FONT_FAMILY }}>{initials}</Text>
              )}
            </View>
            <TouchableOpacity onPress={openAvatarUpload} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: '#1976D2', fontWeight: '500', fontFamily: FONT_FAMILY }}>+ Byt bild</Text>
            </TouchableOpacity>
            {(avatarFile || avatarPreviewUrl) ? (
              <TouchableOpacity onPress={() => { setAvatarFile(null); setAvatarPreviewUrl(''); }} style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 11, color: '#64748b', fontFamily: FONT_FAMILY }}>Ta bort bild</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Höger: formulär */}
          <View style={{ flex: 1, minWidth: 220 }}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Förnamn{isNew ? <Text style={{ color: '#dc2626', marginLeft: 4 }}> *</Text> : null}</Text>
                <TextInput
                  value={firstName}
                  onChangeText={(v) => setFirstName(normalizeName(v))}
                  placeholder="T.ex. Anna"
                  style={[inputStyle, firstNameMissing && { borderColor: '#dc2626' }]}
                  editable={!saving}
                />
                {firstNameMissing ? <Text style={{ marginTop: 2, fontSize: 11, color: '#dc2626', fontFamily: FONT_FAMILY }}>Fyll i förnamn</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Efternamn{isNew ? <Text style={{ color: '#dc2626', marginLeft: 4 }}> *</Text> : null}</Text>
                <TextInput
                  value={lastName}
                  onChangeText={(v) => setLastName(normalizeName(v))}
                  placeholder="T.ex. Andersson"
                  style={[inputStyle, lastNameMissing && { borderColor: '#dc2626' }]}
                  editable={!saving}
                />
                {lastNameMissing ? <Text style={{ marginTop: 2, fontSize: 11, color: '#dc2626', fontFamily: FONT_FAMILY }}>Fyll i efternamn</Text> : null}
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={labelStyle}>E-post{isNew ? <Text style={{ color: '#dc2626', marginLeft: 4 }}> *</Text> : null}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="namn@foretag.se"
                editable={!emailReadOnly}
                style={[
                  inputStyle,
                  emailMissing && { borderColor: '#dc2626' },
                  emailReadOnly && { backgroundColor: '#F8FAFC', color: '#64748b' },
                ]}
              />
              {emailMissing && rawEmail.length > 0 ? (
                <Text style={{ marginTop: 2, fontSize: 11, color: '#dc2626', fontFamily: FONT_FAMILY }}>Ogiltig e-postadress. Använd formatet namn@foretag.se</Text>
              ) : null}
              {!isNew && emailReadOnly ? (
                <Text style={{ marginTop: 2, fontSize: 11, color: '#64748b', fontFamily: FONT_FAMILY }}>E-post kan inte ändras för befintlig användare.</Text>
              ) : null}
            </View>

            {/* Åtkomst & roll */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[labelStyle, { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }]}>Åtkomst & roll</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F1F5F9', borderRadius: D.buttonRadius, padding: 3, alignSelf: 'flex-start' }}>
                {isMsBygg ? (
                  <TouchableOpacity
                    onPress={() => {
                      setRole('superadmin');
                      if (role !== 'superadmin') setPermissions([...ALL_PERMISSION_KEYS]);
                    }}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: D.buttonRadius,
                      backgroundColor: role === 'superadmin' ? '#1e293b' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: role === 'superadmin' ? '#fff' : '#475569', fontFamily: FONT_FAMILY }}>Superadmin</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    setRole('admin');
                    if (role !== 'admin') setPermissions([...ALL_PERMISSION_KEYS]);
                  }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: D.buttonRadius,
                    backgroundColor: role === 'admin' ? '#1e293b' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: role === 'admin' ? '#fff' : '#475569', fontFamily: FONT_FAMILY }}>Admin</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setRole('user')}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: D.buttonRadius,
                    backgroundColor: role === 'user' ? '#1e293b' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: role === 'user' ? '#fff' : '#475569', fontFamily: FONT_FAMILY }}>Användare</Text>
                </TouchableOpacity>
              </View>
              {(role === 'admin' || role === 'superadmin') ? (
                <View style={{ marginTop: 8, padding: 12, borderRadius: D.inputRadius, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 10, fontFamily: FONT_FAMILY }}>Admin-behörigheter</Text>
                  <View style={{ flexDirection: 'row', gap: 20 }}>
                    {PERMISSION_GROUPS.map((group) => (
                      <View key={group.title} style={{ flex: 1, minWidth: 0 }}>
                        <TouchableOpacity
                          onPress={() => toggleGroup(group.keys)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}
                        >
                          <View style={{
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            borderWidth: 1,
                            borderColor: '#64748b',
                            backgroundColor: isGroupAllChecked(group.keys) ? '#1e293b' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {isGroupAllChecked(group.keys) ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#1e293b', fontFamily: FONT_FAMILY }}>{group.title}</Text>
                        </TouchableOpacity>
                        {group.keys.map((key) => (
                          <TouchableOpacity
                            key={key}
                            onPress={() => togglePermission(key)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginLeft: 24 }}
                          >
                            <View style={{
                              width: 16,
                              height: 16,
                              borderRadius: 3,
                              borderWidth: 1,
                              borderColor: '#94a3b8',
                              backgroundColor: permissions.includes(key) ? '#1e293b' : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              {permissions.includes(key) ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
                            </View>
                            <Text style={{ fontSize: 13, color: '#475569', fontFamily: FONT_FAMILY }}>{getPermissionLabel(key)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Lösenord (endast ny användare) */}
            {isNew ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={[labelStyle, { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }]}>Lösenord</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <TextInput
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={sendInviteEmail ? 'Valfritt – skicka inbjudan istället' : 'Välj lösenord'}
                    style={[inputStyle, { flex: 1, minWidth: 160 }, passwordMissing && !sendInviteEmail && { borderColor: '#dc2626' }]}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((p) => !p)}
                    style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: 12, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' }}
                  >
                    <Text style={{ fontSize: 12, color: '#475569', fontFamily: FONT_FAMILY }}>{showPassword ? 'Dölj' : 'Visa'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={generateTempPassword}
                    style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: 12, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#1e293b', backgroundColor: '#F1F5F9' }}
                  >
                    <Text style={{ fontSize: 12, color: '#1e293b', fontWeight: '500', fontFamily: FONT_FAMILY }}>Generera</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setSendInviteEmail((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
                >
                  <View style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderColor: '#94a3b8',
                    backgroundColor: sendInviteEmail ? '#1e293b' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {sendInviteEmail ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
                  </View>
                  <Text style={{ fontSize: 13, color: '#334155', fontFamily: FONT_FAMILY }}>Skicka inbjudningsmail till användaren</Text>
                </TouchableOpacity>
                {passwordMissing && !sendInviteEmail ? (
                  <Text style={{ marginTop: 2, fontSize: 11, color: '#dc2626', fontFamily: FONT_FAMILY }}>Ange lösenord eller bocka i inbjudningsmail</Text>
                ) : null}
              </View>
            ) : null}

            {/* Status (endast redigera) */}
            {!isNew ? (
              <View style={{ marginBottom: 4 }}>
                <Text style={[labelStyle, { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }]}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setDisabled(false)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: D.buttonRadius,
                      borderWidth: 1,
                      borderColor: !disabled ? '#1e293b' : '#E2E8F0',
                      backgroundColor: !disabled ? '#F1F5F9' : '#fff',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: !disabled ? '#1e293b' : '#64748b', fontFamily: FONT_FAMILY }}>Aktiv</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDisabled(true)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: D.buttonRadius,
                      borderWidth: 1,
                      borderColor: disabled ? '#1e293b' : '#E2E8F0',
                      backgroundColor: disabled ? '#F1F5F9' : '#fff',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: disabled ? '#1e293b' : '#64748b', fontFamily: FONT_FAMILY }}>Inaktiv</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {errorMessage ? (
          <View style={{ marginTop: 6, padding: 8, borderRadius: D.inputRadius, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
            <Text style={{ fontSize: 12, color: '#b91c1c', fontFamily: FONT_FAMILY }}>{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>

      {(saving || saveSuccess) && (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.92)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
            borderRadius: 0,
          }}
        >
          {saving ? (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 24,
              borderRadius: 12,
              backgroundColor: D.buttonPrimaryBg ?? '#2D3A4B',
              ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }),
            }}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: FONT_FAMILY }}>Sparar...</Text>
            </View>
          ) : saveSuccess ? (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 24,
              borderRadius: 12,
              backgroundColor: '#166534',
              ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }),
            }}>
              <Ionicons name="checkmark-circle" size={28} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: FONT_FAMILY }}>
                {isNew ? 'Användaren skapad' : 'Användaren uppdaterad'}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {Platform.OS === 'web' ? (
        <input
          ref={avatarUploadInputRef}
          type="file"
          accept="image/*"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          onChange={onAvatarFileSelected}
        />
      ) : null}
      </View>
    </ModalBase>
  );
}
