/**
 * Min profil – modal där inloggad användare kan redigera egen profil.
 * Bredare, flikbaserad: Profil (avatar, förnamn, efternamn, mobil) och Säkerhet (mejladress, byt lösenord).
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../../constants/modalDesign2026';
import { LEFT_NAV } from '../../../constants/leftNavTheme';
import { useDraggableResizableModal } from '../../../hooks/useDraggableResizableModal';
import ModalBase from '../ModalBase';
import {
  auth,
  getCompanyMember,
  updateMyProfileRemote,
  changePasswordRemote,
  uploadMyProfileAvatar,
} from '../../firebase';

const FONT_FAMILY = (LEFT_NAV && LEFT_NAV.webFontFamily) || 'Inter, system-ui, sans-serif';

const ADMIN_PERMISSIONS = [
  { key: 'manage_templates', label: 'Hantera mallar' },
  { key: 'manage_categories', label: 'Hantera kategorier' },
  { key: 'manage_chart_of_accounts', label: 'Hantera kontoplan' },
  { key: 'manage_building_parts', label: 'Hantera byggdelar' },
  { key: 'manage_sharepoint', label: 'Hantera SharePoint' },
  { key: 'manage_users', label: 'Hantera användare' },
  { key: 'manage_ai_settings', label: 'Hantera AI-inställningar' },
];

function getInitials(firstName, lastName, email) {
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  if (fn && ln) return `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
  if (fn) return fn.slice(0, 2).toUpperCase();
  const e = String(email || '').trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return '?';
}

/** Formatera mobilnummer för visning: xxx xxx xx xx (max 10 siffror). */
function formatPhoneDisplay(digits) {
  const d = String(digits || '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

/** Generera ett slumpat starkt lösenord (12 tecken: bokstäver, siffror, specialtecken). */
function generateStrongPassword() {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = lower + upper + digits + special;
  let out = '';
  out += lower[Math.floor(Math.random() * lower.length)];
  out += upper[Math.floor(Math.random() * upper.length)];
  out += digits[Math.floor(Math.random() * digits.length)];
  out += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 8; i++) out += all[Math.floor(Math.random() * all.length)];
  return out.split('').sort(() => Math.random() - 0.5).join('');
}

export default function MyProfileModal({ visible, companyId, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('profil');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [photoPreviewDataUrl, setPhotoPreviewDataUrl] = useState('');
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [role, setRole] = useState('');
  const [cropVisible, setCropVisible] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState('');
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [cropImageSize, setCropImageSize] = useState({ w: 320, h: 320 });
  const [cropUploading, setCropUploading] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const avatarFileInputRef = useRef(null);
  const cropImageRef = useRef(null);
  const cropContainerRef = useRef(null);
  const cropSourceUrlRef = useRef('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const handleSaveRef = useRef(() => {});

  const inputStyle = {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
    color: '#1e293b',
    fontFamily: FONT_FAMILY,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };
  const labelStyle = { fontSize: 14, fontWeight: '500', color: '#334155', marginBottom: 6, fontFamily: FONT_FAMILY };

  const MY_PROFILE_MODAL_WIDTH = 720;
  const MY_PROFILE_MODAL_HEIGHT = 560;
  const { boxStyle: dragBoxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: MY_PROFILE_MODAL_WIDTH,
    defaultHeight: MY_PROFILE_MODAL_HEIGHT,
    minWidth: 520,
    minHeight: 420,
  });
  const hasDragPosition = Platform.OS === 'web' && dragBoxStyle && Object.keys(dragBoxStyle).length > 0;
  const defaultBoxStyle = hasDragPosition
    ? {}
    : {
        width: Platform.OS === 'web' ? MY_PROFILE_MODAL_WIDTH : '92%',
        maxWidth: MY_PROFILE_MODAL_WIDTH,
        height: Platform.OS === 'web' ? MY_PROFILE_MODAL_HEIGHT : '75%',
        maxHeight: Platform.OS === 'web' ? MY_PROFILE_MODAL_HEIGHT : '75%',
      };

  cropSourceUrlRef.current = cropSourceUrl;
  useEffect(() => {
    if (!visible) {
      if (cropSourceUrlRef.current) try { URL.revokeObjectURL(cropSourceUrlRef.current); } catch (_e) {}
      cropSourceUrlRef.current = '';
      setCropSourceUrl('');
      setCropVisible(false);
      setPhotoPreviewDataUrl('');
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || !companyId || !auth?.currentUser?.uid) return;
    let mounted = true;
    setError('');
    setSaveSuccess(false);
    setLoading(true);
    (async () => {
      try {
        const member = await getCompanyMember(companyId, auth.currentUser.uid);
        const user = auth.currentUser;
        if (!mounted) return;
        if (member) {
          const fn = (member.firstName ?? '').trim();
          const ln = (member.lastName ?? '').trim();
          setFirstName(fn);
          setLastName(ln);
          setPhone(String(member.phone ?? '').trim());
          setPhotoURL(String(member.photoURL ?? user?.photoURL ?? '').trim());
          setPhotoLoadError(false);
          setPermissions(Array.isArray(member.permissions) ? member.permissions : []);
          setRole(String(member.role ?? '').trim());
        } else {
          const dn = (user.displayName || user.email || '').trim();
          const parts = dn.split(/\s+/).filter(Boolean);
          setFirstName(parts[0] || '');
          setLastName(parts.slice(1).join(' ') || '');
          setPhotoURL(String(user?.photoURL ?? '').trim());
          setPhotoLoadError(false);
          setPermissions([]);
          setRole('');
        }
        setEmail((user?.email ?? '').trim());
      } catch (e) {
        if (mounted) setError(e?.message || 'Kunde inte ladda profil');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [visible, companyId]);

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || email || '';
  const initials = getInitials(firstName, lastName, email);

  const handleSave = async () => {
    setError('');
    setSaveSuccess(false);
    setSaving(true);
    try {
      await updateMyProfileRemote(companyId, {
        displayName: displayName || undefined,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() ? phone.trim().replace(/\D/g, '') : undefined,
      });
      if (typeof onSaved === 'function') onSaved();
      setSaveSuccess(true);
      setTimeout(() => onClose(), 1400);
    } catch (e) {
      setError(e?.message || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  const CROP_SIZE = 240;
  const CROP_CONTAINER = 320;

  const openAvatarFileInput = () => {
    if (Platform.OS === 'web' && avatarFileInputRef.current) {
      avatarFileInputRef.current.value = '';
      avatarFileInputRef.current.click();
    }
  };

  const onAvatarFileSelected = (e) => {
    const file = e?.target?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setCropImageSize({ w: CROP_CONTAINER, h: CROP_CONTAINER });
      setCropSourceUrl(url);
      setCropPosition({ x: 0, y: 0 });
      setCropScale(1);
      setCropVisible(true);
    }
    e.target.value = '';
  };

  const handleCropImageLoad = () => {
    const img = cropImageRef.current;
    if (img && img.naturalWidth) {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setCropImageSize({ w, h });
      const scale = Math.max(CROP_CONTAINER / w, CROP_CONTAINER / h);
      setCropScale(scale);
      setCropPosition({ x: (CROP_CONTAINER - w * scale) / 2, y: (CROP_CONTAINER - h * scale) / 2 });
    }
  };

  const handleCropApply = async () => {
    if (!cropSourceUrl || !companyId || !auth?.currentUser?.uid || !cropImageRef.current) return;
    const img = cropImageRef.current;
    const natW = img.naturalWidth || cropImageSize.w;
    const natH = img.naturalHeight || cropImageSize.h;
    if (!natW || !natH) return;
    const center = CROP_CONTAINER / 2;
    const half = CROP_SIZE / 2;
    const srcX = (center - half - cropPosition.x) / cropScale;
    const srcY = (center - half - cropPosition.y) / cropScale;
    const srcSize = CROP_SIZE / cropScale;
    const x = Math.max(0, Math.min(natW - srcSize, srcX));
    const y = Math.max(0, Math.min(natH - srcSize, srcY));
    const size = Math.min(srcSize, natW - x, natH - y);
    if (size <= 0) return;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) return;
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, x, y, size, size, 0, 0, CROP_SIZE, CROP_SIZE);
    const file = await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(null); return; }
          resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.92
      );
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return { file, dataUrl };
  };

  const handleCropSave = async () => {
    setCropUploading(true);
    setError('');
    try {
      const result = await handleCropApply();
      if (!result?.file) return;
      const { file, dataUrl } = result;
      setPhotoPreviewDataUrl(dataUrl);
      setPhotoLoadError(false);
      const url = await uploadMyProfileAvatar({
        companyId,
        uid: auth.currentUser.uid,
        file,
      });
      await updateMyProfileRemote(companyId, { photoURL: url });
      setPhotoURL(url);
      if (typeof onSaved === 'function') onSaved();
      if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
      setCropSourceUrl('');
      setCropVisible(false);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda upp bild');
      setPhotoPreviewDataUrl('');
    } finally {
      setCropUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setError('');
    setPhotoLoadError(false);
    setPhotoPreviewDataUrl('');
    try {
      await updateMyProfileRemote(companyId, { photoURL: null });
      setPhotoURL('');
      if (typeof onSaved === 'function') onSaved();
    } catch (e) {
      setError(e?.message || 'Kunde inte ta bort bild');
    }
  };

  useEffect(() => {
    handleSaveRef.current = handleSave;
  });
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === 'Enter' && !saving && !saveSuccess) {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [visible, saving, saveSuccess]);

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    const cur = currentPassword.trim();
    const neu = newPassword.trim();
    const conf = confirmPassword.trim();
    if (!cur) {
      setPasswordError('Ange nuvarande lösenord');
      return;
    }
    if (neu.length < 6) {
      setPasswordError('Nytt lösenord måste vara minst 6 tecken');
      return;
    }
    if (neu !== conf) {
      setPasswordError('Nytt lösenord och bekräftelse matchar inte');
      return;
    }
    setChangingPassword(true);
    try {
      await changePasswordRemote(cur, neu);
      setPasswordSuccess('Lösenordet är bytt.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordError(e?.message || 'Kunde inte byta lösenord');
    } finally {
      setChangingPassword(false);
    }
  };

  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
      <TouchableOpacity
        onPress={onClose}
        style={{
          paddingVertical: D.buttonPaddingVertical,
          paddingHorizontal: D.buttonPaddingHorizontal,
          borderRadius: D.buttonRadius,
          backgroundColor: '#fef2f2',
          borderWidth: 1,
          borderColor: '#fecaca',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#b91c1c', fontFamily: FONT_FAMILY }}>Avbryt</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving || saveSuccess}
        style={{
          paddingVertical: D.buttonPaddingVertical,
          paddingHorizontal: D.buttonPaddingHorizontal,
          borderRadius: D.buttonRadius,
          backgroundColor: '#475569',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff', fontFamily: FONT_FAMILY }}>
          {saving ? 'Sparar…' : 'Spara'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const tabBar = (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: D.contentPadding, backgroundColor: '#fff' }}>
      <TouchableOpacity
        onPress={() => setActiveTab('profil')}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          marginBottom: -1,
          borderBottomWidth: 2,
          borderBottomColor: activeTab === 'profil' ? '#1e293b' : 'transparent',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: activeTab === 'profil' ? '#1e293b' : '#64748b', fontFamily: FONT_FAMILY }}>Profil</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setActiveTab('säkerhet')}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          marginBottom: -1,
          borderBottomWidth: 2,
          borderBottomColor: activeTab === 'säkerhet' ? '#1e293b' : 'transparent',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: activeTab === 'säkerhet' ? '#1e293b' : '#64748b', fontFamily: FONT_FAMILY }}>Säkerhet</Text>
      </TouchableOpacity>
    </View>
  );

  const profilContent = (
    <View style={{ padding: D.contentPadding, flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
      {/* Vänster: avatar (initialer eller egen bild) + Byt bild */}
      <View style={{ alignItems: 'center', marginRight: 8 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: photoURL ? '#e2e8f0' : '#94a3b8',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {(photoPreviewDataUrl || (photoURL && !photoLoadError)) ? (
            (() => {
              const displayUrl = photoPreviewDataUrl || photoURL;
              return Platform.OS === 'web' ? (
                <img
                  src={displayUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  onError={() => !photoPreviewDataUrl && setPhotoLoadError(true)}
                  onLoad={() => setPhotoLoadError(false)}
                />
              ) : (
                <Image
                  source={{ uri: displayUrl }}
                  style={{ width: 80, height: 80 }}
                  resizeMode="cover"
                  onError={() => !photoPreviewDataUrl && setPhotoLoadError(true)}
                  onLoad={() => setPhotoLoadError(false)}
                />
              );
            })()
          ) : (
            <Text style={{ fontSize: 24, fontWeight: '600', color: '#fff', fontFamily: FONT_FAMILY }}>{initials}</Text>
          )}
        </View>
        <TouchableOpacity onPress={openAvatarFileInput} style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: '#1976D2', fontWeight: '500', fontFamily: FONT_FAMILY }}>+ Byt bild</Text>
        </TouchableOpacity>
        {(photoPreviewDataUrl || photoURL) ? (
          <TouchableOpacity onPress={handleRemovePhoto} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: '#64748b', fontFamily: FONT_FAMILY }}>Ta bort bild</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {/* Höger: Förnamn, Efternamn, Mobilnummer */}
      <View style={{ flex: 1, minWidth: 220 }}>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Förnamn</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="T.ex. Anna"
              style={inputStyle}
              editable={!saving}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Efternamn</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="T.ex. Andersson"
              style={inputStyle}
              editable={!saving}
            />
          </View>
        </View>
        <View style={{ marginBottom: 16 }}>
          <Text style={labelStyle}>Mobilnummer</Text>
          <TextInput
            value={formatPhoneDisplay(phone)}
            onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))}
            placeholder="070 123 45 67"
            keyboardType="phone-pad"
            style={inputStyle}
            editable={!saving}
          />
        </View>
        <View style={{ marginBottom: 16 }}>
          <Text style={labelStyle}>E-post</Text>
          <TextInput
            value={email}
            editable={false}
            style={[inputStyle, { backgroundColor: '#F8FAFC', color: '#64748b' }]}
          />
          <Text style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontFamily: FONT_FAMILY }}>E-post kan inte ändras här.</Text>
        </View>
        {permissions.length > 0 || role ? (
          <View style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6, fontFamily: FONT_FAMILY }}>Dina behörigheter</Text>
            {permissions.length > 0 ? (
              <View style={{ gap: 4 }}>
                {ADMIN_PERMISSIONS.filter(p => permissions.includes(p.key)).map(p => (
                  <Text key={p.key} style={{ fontSize: 12, color: '#475569', fontFamily: FONT_FAMILY }}>• {p.label}</Text>
                ))}
              </View>
            ) : null}
            {role ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontFamily: FONT_FAMILY }}>Roll: {role === 'admin' || role === 'superadmin' ? role : 'Användare'}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  const säkerhetContent = (
    <View style={{ padding: D.contentPadding, maxWidth: 400 }}>
      <View style={{ marginBottom: 12 }}>
        <Text style={[labelStyle, { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }]}>Byta lösenord</Text>
      </View>
      <View style={{ gap: 12 }}>
        <View>
          <Text style={labelStyle}>Nuvarande lösenord</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              key={`current-pw-${showCurrentPw ? 'visible' : 'hidden'}`}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Nuvarande lösenord"
              secureTextEntry={!showCurrentPw}
              style={[inputStyle, { flex: 1 }]}
              editable={!changingPassword}
            />
            <TouchableOpacity onPress={() => setShowCurrentPw(p => !p)} style={{ padding: 8 }}>
              <Text style={{ fontSize: 13, color: '#475569', fontFamily: FONT_FAMILY }}>{showCurrentPw ? 'Dölj' : 'Visa'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={labelStyle}>Nytt lösenord</Text>
            <TouchableOpacity
              onPress={() => {
                const pwd = generateStrongPassword();
                setNewPassword(pwd);
                setConfirmPassword(pwd);
                setShowNewPw(true);
              }}
              style={{ paddingVertical: 4, paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: 13, color: '#1976D2', fontWeight: '500', fontFamily: FONT_FAMILY }}>Generera nytt lösenord</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              key={`new-pw-${showNewPw ? 'visible' : 'hidden'}`}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Minst 6 tecken"
              secureTextEntry={!showNewPw}
              style={[inputStyle, { flex: 1 }]}
              editable={!changingPassword}
            />
            <TouchableOpacity onPress={() => setShowNewPw(p => !p)} style={{ padding: 8 }}>
              <Text style={{ fontSize: 13, color: '#475569', fontFamily: FONT_FAMILY }}>{showNewPw ? 'Dölj' : 'Visa'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View>
          <Text style={labelStyle}>Bekräfta nytt lösenord</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              key={`confirm-pw-${showConfirmPw ? 'visible' : 'hidden'}`}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Upprepa nytt lösenord"
              secureTextEntry={!showConfirmPw}
              style={[inputStyle, { flex: 1 }]}
              editable={!changingPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPw(p => !p)} style={{ padding: 8 }}>
              <Text style={{ fontSize: 13, color: '#475569', fontFamily: FONT_FAMILY }}>{showConfirmPw ? 'Dölj' : 'Visa'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {passwordError ? <Text style={{ fontSize: 12, color: '#b91c1c', fontFamily: FONT_FAMILY }}>{passwordError}</Text> : null}
        {passwordSuccess ? <Text style={{ fontSize: 12, color: '#15803d', fontFamily: FONT_FAMILY }}>{passwordSuccess}</Text> : null}
        <TouchableOpacity
          onPress={handleChangePassword}
          disabled={changingPassword}
          style={{ alignSelf: 'flex-start', paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#1e293b' }}
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff', fontFamily: FONT_FAMILY }}>
            {changingPassword ? 'Byter…' : 'Byt lösenord'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Min profil"
      headerVariant="neutral"
      titleIcon={<Ionicons name="person" size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />}
      footer={footer}
      boxStyle={[defaultBoxStyle, dragBoxStyle]}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      contentStyle={{ padding: 0, flex: 1, minHeight: 0 }}
    >
      <View style={{ flex: 1, minHeight: 0 }}>
        {(loading || saving || changingPassword || cropUploading) ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
              backgroundColor: 'rgba(255,255,255,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minWidth: 260, maxWidth: 360, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 13, textAlign: 'center', fontFamily: FONT_FAMILY }}>
                {loading ? 'Laddar…' : saving ? 'Sparar…' : changingPassword ? 'Byter lösenord…' : 'Laddar upp profilbild…'}
              </Text>
            </View>
          </View>
        ) : null}
        {tabBar}
        {error ? (
          <View style={{ margin: D.contentPadding, marginBottom: 0, padding: 12, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
            <Text style={{ fontSize: 13, color: '#b91c1c', fontFamily: FONT_FAMILY }}>{error}</Text>
          </View>
        ) : null}
        {saveSuccess ? (
          <View style={{ margin: D.contentPadding, marginBottom: 0, padding: 12, borderRadius: 8, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }}>
            <Text style={{ fontSize: 13, color: '#15803d', fontFamily: FONT_FAMILY }}>Profilen är uppdaterad.</Text>
          </View>
        ) : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: D.contentPadding }} showsVerticalScrollIndicator>
          {loading ? (
            <View style={{ padding: D.contentPadding }}>
              <Text style={{ fontSize: 14, color: '#64748b', fontFamily: FONT_FAMILY }}>Laddar…</Text>
            </View>
          ) : activeTab === 'profil' ? profilContent : säkerhetContent}
        </ScrollView>
      </View>
      {Platform.OS === 'web' ? (
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onAvatarFileSelected}
        />
      ) : null}
      {Platform.OS === 'web' && cropVisible ? (
        <Modal visible transparent animationType="fade">
          {cropUploading ? (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 32, alignItems: 'center', minWidth: 280 }}>
                <ActivityIndicator size="large" color="#1e293b" style={{ marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b', fontFamily: FONT_FAMILY }}>Laddar upp profilbild</Text>
                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 8, fontFamily: FONT_FAMILY }}>Vänta medan bilden laddas upp…</Text>
              </View>
            </View>
          ) : (
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 8, padding: 20, maxWidth: '100%' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 16, fontFamily: FONT_FAMILY }}>Beskär profilbild</Text>
              <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 12, fontFamily: FONT_FAMILY }}>Dra bilden och zooma med scroll. Den synliga rutan blir din runda profilbild.</Text>
              <View
                ref={cropContainerRef}
                style={{
                  width: CROP_CONTAINER,
                  height: CROP_CONTAINER,
                  overflow: 'hidden',
                  position: 'relative',
                  backgroundColor: '#f1f5f9',
                  borderRadius: 8,
                }}
                onMouseDown={(e) => {
                  if (!cropContainerRef.current || !e.target) return;
                  const startX = e.nativeEvent?.clientX ?? e.clientX ?? 0;
                  const startY = e.nativeEvent?.clientY ?? e.clientY ?? 0;
                  const startPos = { ...cropPosition };
                  const onMove = (ev) => {
                    const dx = (ev.clientX ?? 0) - startX;
                    const dy = (ev.clientY ?? 0) - startY;
                    setCropPosition({ x: startPos.x + dx, y: startPos.y + dy });
                  };
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  setCropScale((s) => Math.max(0.3, Math.min(4, s + delta)));
                }}
              >
                <img
                  key={cropSourceUrl}
                  ref={cropImageRef}
                  src={cropSourceUrl}
                  alt=""
                  onLoad={handleCropImageLoad}
                  style={{
                    position: 'absolute',
                    left: cropPosition.x,
                    top: cropPosition.y,
                    width: cropImageSize.w || CROP_CONTAINER,
                    height: cropImageSize.h || CROP_CONTAINER,
                    transform: `scale(${cropScale})`,
                    transformOrigin: '0 0',
                    maxWidth: 'none',
                    pointerEvents: 'none',
                    display: 'block',
                    objectFit: 'cover',
                  }}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: (CROP_CONTAINER - CROP_SIZE) / 2,
                    top: (CROP_CONTAINER - CROP_SIZE) / 2,
                    width: CROP_SIZE,
                    height: CROP_SIZE,
                    borderRadius: CROP_SIZE / 2,
                    borderWidth: 2,
                    borderColor: '#fff',
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
                    setCropSourceUrl('');
                    setCropVisible(false);
                  }}
                  style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#f1f5f9' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569', fontFamily: FONT_FAMILY }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCropSave}
                  disabled={cropUploading}
                  style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#1e293b' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff', fontFamily: FONT_FAMILY }}>Beskär och spara</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          )}
        </Modal>
      ) : null}
    </ModalBase>
  );
}
