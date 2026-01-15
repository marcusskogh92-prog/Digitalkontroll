import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';

const AVATAR_PRESETS = [
  { key: 'blue_female', label: 'Kvinna (blå)', icon: 'woman', bg: '#1976D2' },
  { key: 'cyan_male', label: 'Man (cyan)', icon: 'man', bg: '#00ACC1' },
  { key: 'teal_person', label: 'Person (turkos)', icon: 'person', bg: '#26A69A' },
  { key: 'orange_person', label: 'Person (orange)', icon: 'person', bg: '#FB8C00' },
  { key: 'red_person', label: 'Person (röd)', icon: 'person', bg: '#E53935' },
  { key: 'green_person', label: 'Person (grön)', icon: 'person', bg: '#43A047' },
];

const pickRandomAvatarPresetKey = () => {
  try {
    const keys = (AVATAR_PRESETS || []).map(p => p && p.key).filter(Boolean);
    if (!keys.length) return 'blue_female';
    return keys[Math.floor(Math.random() * keys.length)];
  } catch (_e) {
    return 'blue_female';
  }
};

export default function UserEditModal({ visible, member, companyId, onClose, onSave, saving, isNew, errorMessage }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user'); // 'admin' | 'user'
  const [showPassword, setShowPassword] = useState(false);
  const [avatarPreset, setAvatarPreset] = useState('blue_female');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');

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
  const requiredFilledForCreate = () => {
    if (!isNew) return true;
    return String(firstName || '').trim().length > 0
      && String(lastName || '').trim().length > 0
      && emailIsValid
      && String(password || '').length > 0
      && String(role || '').length > 0;
  };

  const firstNameMissing = isNew && String(firstName || '').trim().length === 0;
  const lastNameMissing = isNew && String(lastName || '').trim().length === 0;
  const emailMissing = isNew && !emailIsValid;
  const passwordMissing = isNew && String(password || '').length === 0;
  const roleMissing = isNew && String(role || '').length === 0;

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

  return (
    <div onClick={onClose} style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: 'calc(100% - 40px)', background: '#fff', borderRadius: 8, padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px 0' }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#1976D2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={14} color="#fff" />
          </div>
          <h4 style={{ margin: 0 }}>{isNew ? 'Lägg till ny användare' : 'Redigera användare'}</h4>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Förnamn{isNew && <span style={{ color: '#e53935', marginLeft: 6 }}>*</span>}</label>
          <input
            value={firstName}
            onChange={e => setFirstName(normalizeName(e.target.value))}
            aria-required={isNew}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${firstNameMissing ? '#e53935' : '#ddd'}`, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Efternamn{isNew && <span style={{ color: '#e53935', marginLeft: 6 }}>*</span>}</label>
          <input
            value={lastName}
            onChange={e => setLastName(normalizeName(e.target.value))}
            aria-required={isNew}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${lastNameMissing ? '#e53935' : '#ddd'}`, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>E-post{isNew && <span style={{ color: '#e53935', marginLeft: 6 }}>*</span>}</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-required={isNew}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${emailMissing ? '#e53935' : '#ddd'}`, boxSizing: 'border-box' }}
          />
          {emailMissing && rawEmail.length > 0 ? (
            <div style={{ color: '#e53935', fontSize: 12, marginTop: 4 }}>
              Ogiltig e-postadress. Använd formatet namn@foretag.se
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Lösenord{isNew && <span style={{ color: '#e53935', marginLeft: 6 }}>*</span>}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isNew ? 'Välj lösenord' : 'Fyll i för att byta lösenord'}
              aria-required={isNew}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${passwordMissing ? '#e53935' : '#ddd'}`, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
            >
              {showPassword ? 'Dölj' : 'Visa'}
            </button>
            <button
              type="button"
              onClick={generateTempPassword}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #1976D2', background: '#E3F2FD', cursor: 'pointer', color: '#1976D2', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              Generera
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Behörighet{isNew && <span style={{ color: '#e53935', marginLeft: 6 }}>*</span>}</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            aria-required={isNew}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${roleMissing ? '#e53935' : '#ddd'}`, boxSizing: 'border-box', fontSize: 16, lineHeight: '20px', fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', color: '#222', background: '#fff' }}
          >
            {isMsBygg && <option value="superadmin">Superadmin</option>}
            <option value="admin">Administratör</option>
            <option value="user">Användare</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Profilbild</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, alignItems: 'center' }}>
            {AVATAR_PRESETS.map(p => {
              const selected = avatarPreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setAvatarPreset(p.key)}
                  title={p.label}
                  aria-label={p.label}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    border: selected ? '2px solid #1976D2' : '1px solid #E0E0E0',
                    background: p.bg,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: selected ? '0 0 0 3px rgba(25,118,210,0.15)' : 'none',
                  }}
                >
                  <Ionicons name={p.icon} size={20} color="#fff" />
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {avatarPreviewUrl ? (
                <div style={{ width: 44, height: 44, borderRadius: 999, overflow: 'hidden', border: '1px solid #ddd' }} title="Vald bild">
                  <img src={avatarPreviewUrl} alt="Vald bild" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 999, overflow: 'hidden', border: '1px solid #ddd', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Ingen bild vald">
                  <Ionicons name="image" size={18} color="#777" />
                </div>
              )}
              <div style={{ fontSize: 12, color: '#666', lineHeight: '16px' }}>
                Välj en ikon eller ladda upp bild (valfritt).
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  try {
                    const f = e?.target?.files && e.target.files[0] ? e.target.files[0] : null;
                    setAvatarFile(f);
                  } catch (_e) {
                    setAvatarFile(null);
                  }
                }}
                style={{ fontSize: 13 }}
              />
              {avatarFile ? (
                <button
                  type="button"
                  onClick={() => setAvatarFile(null)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  Ta bort bild
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div style={{ color: '#D32F2F', fontSize: 12, marginBottom: 8 }}>
            {errorMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            disabled={saving || !requiredFilledForCreate()}
            onClick={async () => {
              if (typeof onSave === 'function') {
                await onSave({ firstName, lastName, email, role, password, avatarPreset, avatarFile });
              }
            }}
            style={{
              backgroundColor: '#1976D2',
              color: '#fff',
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              opacity: (saving || !requiredFilledForCreate()) ? 0.5 : 1,
              cursor: (saving || !requiredFilledForCreate()) ? 'not-allowed' : 'pointer'
            }}
          >{saving ? 'Sparar...' : 'Spara'}</button>
          <button disabled={saving} onClick={() => onClose && onClose()} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}
