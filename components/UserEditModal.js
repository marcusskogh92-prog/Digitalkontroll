import { useEffect, useState } from 'react';

export default function UserEditModal({ visible, member, companyId, onClose, onSave, saving, isNew, errorMessage }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user'); // 'admin' | 'user'
  const [showPassword, setShowPassword] = useState(false);

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
  }, [visible, member]);

  if (!visible) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: 'calc(100% - 40px)', background: '#fff', borderRadius: 8, padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
        <h4 style={{ margin: '0 0 8px 0' }}>{isNew ? 'Lägg till ny användare' : 'Redigera användare'}</h4>
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
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Lösenord</label>
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
            {!isNew && (
              <button
                type="button"
                onClick={generateTempPassword}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #1976D2', background: '#E3F2FD', cursor: 'pointer', color: '#1976D2', fontSize: 12 }}
              >
                Nytt lösenord
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Behörighet{isNew && <span style={{ color: '#e53935', marginLeft: 6 }}>*</span>}</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            aria-required={isNew}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${roleMissing ? '#e53935' : '#ddd'}` }}
          >
            {isMsBygg && <option value="superadmin">Superadmin</option>}
            <option value="admin">Admin</option>
            <option value="user">Användare</option>
          </select>
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
                await onSave({ firstName, lastName, email, role, password });
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
