import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { LEFT_NAV } from '../constants/leftNavTheme';

const AVATAR_PRESETS = [
  { key: 'blue_female', label: 'Kvinna (blå)', icon: 'woman', bg: '#1976D2' },
  { key: 'cyan_male', label: 'Man (cyan)', icon: 'man', bg: '#00ACC1' },
  { key: 'teal_person', label: 'Person (turkos)', icon: 'person', bg: '#26A69A' },
  { key: 'orange_person', label: 'Person (orange)', icon: 'person', bg: '#FB8C00' },
  { key: 'red_person', label: 'Person (röd)', icon: 'person', bg: '#E53935' },
  { key: 'green_person', label: 'Person (grön)', icon: 'person', bg: '#43A047' },
];

const FONT_FAMILY = (LEFT_NAV && LEFT_NAV.webFontFamily) || 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const pickRandomAvatarPresetKey = () => {
  try {
    const keys = (AVATAR_PRESETS || []).map(p => p && p.key).filter(Boolean);
    if (!keys.length) return 'blue_female';
    return keys[Math.floor(Math.random() * keys.length)];
  } catch (_e) {
    return 'blue_female';
  }
};

const ADMIN_PERMISSIONS = [
  { key: 'manage_templates', label: 'Hantera mallar' },
  { key: 'manage_categories', label: 'Hantera kategorier' },
  { key: 'manage_chart_of_accounts', label: 'Hantera kontoplan' },
  { key: 'manage_building_parts', label: 'Hantera byggdelar' },
  { key: 'manage_sharepoint', label: 'Hantera SharePoint' },
  { key: 'manage_users', label: 'Hantera användare' },
  { key: 'manage_ai_settings', label: 'Hantera AI-inställningar' },
];

export default function UserEditModal({ visible, member, companyId, onClose, onSave, saving, isNew, errorMessage, onDelete, canDelete = true, userLimit = null, usagePercent = 0 }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user'); // 'admin' | 'user' | 'superadmin'
  const [showPassword, setShowPassword] = useState(false);
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [avatarPreset, setAvatarPreset] = useState('blue_female');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [narrowLayout, setNarrowLayout] = useState(false);
  const avatarUploadInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 480px)');
    const fn = () => setNarrowLayout(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const togglePermission = (key) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

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
  const roleMissing = isNew && String(role || '').length === 0;
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
    try {
      const preset = String(member?.avatarPreset || '').trim();
      const match = AVATAR_PRESETS.some(p => p.key === preset);
      if (match) setAvatarPreset(preset);
      else if (isNew) setAvatarPreset(pickRandomAvatarPresetKey());
      else setAvatarPreset('blue_female');
    } catch (_e) {
      setAvatarPreset(isNew ? pickRandomAvatarPresetKey() : 'blue_female');
    }
    setAvatarFile(null);
    setAvatarPreviewUrl('');
    setSendInviteEmail(true);
    const perms = member?.permissions;
    setPermissions(Array.isArray(perms) ? [...perms] : []);
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

  if (!visible) return null;

  const emailReadOnly = !isNew && String(member?.email || '').trim().length > 0;

  const modalContent = (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-edit-modal-title"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 520,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          zIndex: 10001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: FONT_FAMILY,
        }}
      >
        {/* Header: kompakt mörk banner 56–64px */}
        <div style={{ background: '#1e293b', color: '#fff', padding: '14px 20px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontFamily: FONT_FAMILY }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={20} color="#fff" />
            </div>
            <div>
              <h2 id="user-edit-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3, fontFamily: FONT_FAMILY, letterSpacing: '-0.01em' }}>{isNew ? 'Lägg till användare' : 'Redigera användare'}</h2>
              {isNew ? <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 400, fontFamily: FONT_FAMILY }}>Skapa ny admin eller användare</p> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={24} color="currentColor" />
          </button>
        </div>

        <div style={{ padding: '24px 24px 20px', overflow: 'auto', flex: 1, background: '#fff', fontFamily: FONT_FAMILY }}>
          {/* Licens-badge + varning (endast ny användare) */}
          {isNew && userLimit != null ? (
            <div style={{ marginBottom: 24 }}>
              <span style={{ display: 'inline-block', fontSize: 12, color: '#64748b', background: '#F1F5F9', padding: '6px 10px', borderRadius: 8, fontWeight: 500, fontFamily: FONT_FAMILY }}>Påverkar licens: +1 användare</span>
              {licenseWarning ? (
                <div style={{ marginTop: 8, fontSize: 13, color: '#c2410c', background: '#fff7ed', padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT_FAMILY }}>
                  <Ionicons name="warning" size={18} color="#c2410c" />
                  Licensgräns nära att uppnås
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Sektion 1 – Grunduppgifter (2 kolumner desktop) */}
          <section style={{ marginBottom: 28 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_FAMILY }}>Grunduppgifter</h3>
            <div style={{ display: 'grid', gridTemplateColumns: narrowLayout ? '1fr' : '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6, fontFamily: FONT_FAMILY }}>Förnamn{isNew ? <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span> : ''}</label>
                <input
                  value={firstName}
                  onChange={e => setFirstName(normalizeName(e.target.value))}
                  aria-required={isNew}
                  placeholder="T.ex. Anna"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${firstNameMissing ? '#dc2626' : '#E2E8F0'}`, boxSizing: 'border-box', fontSize: 14, color: '#1e293b', fontFamily: FONT_FAMILY }}
                />
                {firstNameMissing ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#dc2626', fontFamily: FONT_FAMILY }}>Fyll i förnamn</p> : null}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6, fontFamily: FONT_FAMILY }}>Efternamn{isNew ? <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span> : ''}</label>
                <input
                  value={lastName}
                  onChange={e => setLastName(normalizeName(e.target.value))}
                  aria-required={isNew}
                  placeholder="T.ex. Andersson"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${lastNameMissing ? '#dc2626' : '#E2E8F0'}`, boxSizing: 'border-box', fontSize: 14, color: '#1e293b', fontFamily: FONT_FAMILY }}
                />
                {lastNameMissing ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#dc2626', fontFamily: FONT_FAMILY }}>Fyll i efternamn</p> : null}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6, fontFamily: FONT_FAMILY }}>E-post{isNew ? <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span> : ''}</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-required={isNew}
                readOnly={emailReadOnly}
                placeholder="namn@foretag.se"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${emailMissing ? '#dc2626' : '#E2E8F0'}`, boxSizing: 'border-box', fontSize: 14, color: '#1e293b', background: emailReadOnly ? '#F8FAFC' : '#fff', fontFamily: FONT_FAMILY }}
              />
              {emailMissing && rawEmail.length > 0 ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#dc2626', fontFamily: FONT_FAMILY }}>Ogiltig e-postadress. Använd formatet namn@foretag.se</p> : null}
              {!isNew && emailReadOnly ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b', fontFamily: FONT_FAMILY }}>E-post kan inte ändras för befintlig användare.</p> : null}
            </div>
          </section>

          {/* Sektion 2 – Åtkomst & Roll (pill-toggle + admin-behörigheter) */}
          <section style={{ marginBottom: 28 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_FAMILY }}>Åtkomst & roll</h3>
            <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 10, padding: 4, gap: 0 }}>
              {isMsBygg ? (
                <button type="button" onClick={() => setRole('superadmin')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: (role === 'superadmin') ? '#1e293b' : 'transparent', color: (role === 'superadmin') ? '#fff' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT_FAMILY }}>Superadmin</button>
              ) : null}
              <button type="button" onClick={() => setRole('admin')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: (role === 'admin') ? '#1e293b' : 'transparent', color: (role === 'admin') ? '#fff' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT_FAMILY }}>Admin</button>
              <button type="button" onClick={() => setRole('user')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: (role === 'user') ? '#1e293b' : 'transparent', color: (role === 'user') ? '#fff' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT_FAMILY }}>Användare</button>
            </div>
            {(role === 'admin' || role === 'superadmin') ? (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 12, fontFamily: FONT_FAMILY }}>Admin-behörigheter</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ADMIN_PERMISSIONS.map((p) => (
                    <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: '#475569', fontFamily: FONT_FAMILY }}>
                      <input type="checkbox" checked={permissions.includes(p.key)} onChange={() => togglePermission(p.key)} style={{ width: 18, height: 18, accentColor: '#1e293b' }} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* Lösenord (ny användare) – smart: valfritt om inbjudningsmail */}
          {isNew ? (
            <section style={{ marginBottom: 28 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_FAMILY }}>Lösenord</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={sendInviteEmail ? 'Valfritt – skicka inbjudan istället' : 'Välj lösenord'}
                  style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: `1px solid ${passwordMissing ? '#dc2626' : '#E2E8F0'}`, boxSizing: 'border-box', fontSize: 14, fontFamily: FONT_FAMILY }}
                />
                <button type="button" onClick={() => setShowPassword(prev => !prev)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontFamily: FONT_FAMILY }}>{showPassword ? 'Dölj' : 'Visa'}</button>
                <button type="button" onClick={generateTempPassword} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #1e293b', background: '#F1F5F9', cursor: 'pointer', color: '#1e293b', fontSize: 13, whiteSpace: 'nowrap', fontFamily: FONT_FAMILY }}>Generera</button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, cursor: 'pointer', fontSize: 14, color: '#334155', fontFamily: FONT_FAMILY }}>
                <input type="checkbox" checked={sendInviteEmail} onChange={e => setSendInviteEmail(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#1e293b' }} />
                Skicka inbjudningsmail till användaren
              </label>
              {passwordMissing && !sendInviteEmail ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#dc2626', fontFamily: FONT_FAMILY }}>Ange lösenord eller bocka i inbjudningsmail</p> : null}
            </section>
          ) : null}

          {/* Sektion 3 – Profil (avatar + drag & drop) */}
          <section style={{ marginBottom: 28 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_FAMILY }}>Profil</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, alignItems: 'center' }}>
              {AVATAR_PRESETS.map(p => {
                const selected = avatarPreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => { setAvatarPreset(p.key); setAvatarFile(null); }}
                    title={p.label}
                    aria-label={p.label}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 999,
                      border: selected ? '2px solid #1e293b' : '1px solid #E2E8F0',
                      background: p.bg,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: selected ? '0 0 0 3px rgba(30,41,59,0.2)' : 'none',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = selected ? '0 0 0 3px rgba(30,41,59,0.25)' : '0 4px 12px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = selected ? '0 0 0 3px rgba(30,41,59,0.2)' : 'none'; }}
                  >
                    <Ionicons name={p.icon} size={22} color="#fff" />
                  </button>
                );
              })}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  border: (avatarFile || avatarPreviewUrl) ? '2px solid #1e293b' : `2px dashed ${dragOver ? '#1e293b' : '#CBD5E1'}`,
                  background: dragOver ? '#F1F5F9' : '#F8FAFC',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onClick={() => { try { avatarUploadInputRef.current?.click?.(); } catch (_e) {} }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer?.files?.[0];
                  if (f && f.type.startsWith('image/')) { setAvatarFile(f); setAvatarPreset(''); }
                }}
              >
                <Ionicons name="image-outline" size={20} color={avatarFile || avatarPreviewUrl ? '#1e293b' : '#64748b'} />
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: FONT_FAMILY }}>Ladda upp</span>
              </div>
            </div>
            <input ref={avatarUploadInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => {
                try {
                  const f = e?.target?.files?.[0] ?? null;
                  setAvatarFile(f);
                  if (f) setAvatarPreset('');
                } finally {
                  try { if (e?.target) e.target.value = ''; } catch (_e2) {}
                }
              }}
            />
            {avatarPreviewUrl ? (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                  <img src={avatarPreviewUrl} alt="Vald bild" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontSize: 13, color: '#64748b', fontFamily: FONT_FAMILY }}>Egen bild vald</span>
                <button type="button" onClick={() => setAvatarFile(null)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569', fontFamily: FONT_FAMILY }}>Ta bort bild</button>
              </div>
            ) : null}
          </section>

          {/* Status (redigera) */}
          {!isNew ? (
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_FAMILY }}>Status</h3>
              <select value={disabled ? 'inactive' : 'active'} onChange={e => setDisabled(e.target.value === 'inactive')} style={{ width: '100%', maxWidth: 200, padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, color: '#1e293b', background: '#fff', fontFamily: FONT_FAMILY }}>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </select>
            </section>
          ) : null}

          {errorMessage ? <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, fontFamily: FONT_FAMILY }}>{errorMessage}</div> : null}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 20, borderTop: '1px solid #E2E8F0', marginTop: 8 }}>
            <div>
              {!isNew && typeof onDelete === 'function' ? (
                <button type="button" disabled={saving || !canDelete} onClick={() => onDelete(member)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: 14, cursor: (saving || !canDelete) ? 'not-allowed' : 'pointer', fontFamily: FONT_FAMILY }}>Ta bort användare</button>
              ) : <span />}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" disabled={saving} onClick={() => onClose && onClose()} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 500, fontSize: 14, color: '#475569', cursor: 'pointer', fontFamily: FONT_FAMILY }}>Avbryt</button>
              <button
                type="button"
                disabled={saving || !requiredFilledForCreate()}
                onClick={async () => {
                  if (typeof onSave === 'function') {
                    await onSave({ firstName, lastName, email, role, password, disabled, avatarPreset, avatarFile, permissions: (role === 'admin' || role === 'superadmin') ? permissions : [], sendInviteEmail: isNew ? sendInviteEmail : undefined });
                  }
                }}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#fff',
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: FONT_FAMILY,
                  opacity: (saving || !requiredFilledForCreate()) ? 0.5 : 1,
                  cursor: (saving || !requiredFilledForCreate()) ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Sparar...' : isNew ? 'Skapa användare' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document !== 'undefined' && document.body) {
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM.createPortal) return ReactDOM.createPortal(modalContent, document.body);
    } catch (_e) {}
  }
  return modalContent;
}
