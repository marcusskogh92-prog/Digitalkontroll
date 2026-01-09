import { useEffect, useState } from 'react';
import { subscribeCompanyActivity } from './firebase';

function _toDisplayDate(ts) {
  try {
    if (ts === null || ts === undefined) return '';
    if (typeof ts === 'number') return new Date(ts).toLocaleString();
    if (typeof ts === 'string') return new Date(ts).toLocaleString();
    if (typeof ts?.toDate === 'function') return new Date(ts.toDate().getTime()).toLocaleString();
    if (typeof ts?.seconds === 'number') {
      const ms = (Number(ts.seconds) * 1000) + (typeof ts.nanoseconds === 'number' ? Math.floor(ts.nanoseconds / 1e6) : 0);
      return new Date(ms).toLocaleString();
    }
    return new Date(ts).toLocaleString();
  } catch (e) {
    return '';
  }
}

function _resolveWebCompanyId() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = String(window.localStorage.getItem('dk_companyId') || '').trim();
      if (v) return v;
    }
  } catch (e) {}
  return null;
}

export default function ActivityPanel() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const cid = _resolveWebCompanyId();
    const unsub = subscribeCompanyActivity(cid || null, {
      onData: (data) => {
        setItems(Array.isArray(data) ? data.slice(0, 12) : []);
      },
      onError: () => {},
      limitCount: 25,
    });
    return () => { try { unsub(); } catch(e) {} };
  }, []);

  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #eee' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#222', marginBottom: 8 }}>Senaste aktivitet</div>
        {items.length === 0 ? (
          <div style={{ color: '#888' }}>Inga händelser än.</div>
        ) : (
          items.map(it => (
            <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f3f3' }}>
              <div style={{ fontSize: 13, color: '#222' }}>{it?.label || it?.message || (it?.eventType || 'Händelse')}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{_toDisplayDate(it?.ts || it?.createdAt || it?.updatedAt)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
