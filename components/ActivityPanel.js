import { useEffect, useRef, useState } from 'react';
import { fetchUserProfile, subscribeCompanyActivity } from './firebase';

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
  } catch (_e) {
    return '';
  }
}

function _resolveWebCompanyId() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = String(window.localStorage.getItem('dk_companyId') || '').trim();
      if (v) return v;
    }
  } catch (_e) {}
  return null;
}

export default function ActivityPanel() {
  const [items, setItems] = useState([]);
  const [nameMap, setNameMap] = useState({});
  const pendingRef = useRef({});

  useEffect(() => {
    const cid = _resolveWebCompanyId();
    const unsub = subscribeCompanyActivity(cid || null, {
      onData: (data) => {
        try {
          if (typeof window !== 'undefined' && window.console && window.console.debug) {
            try {
              const sample = Array.isArray(data) ? data.slice(0, 12) : data;
              console.debug('subscribeCompanyActivity: raw items (sample):', sample);
            } catch (_e) {}
          }
        } catch (_e) {}
        const arr = Array.isArray(data) ? data.slice(0, 12) : [];
        setItems(arr);
      },
      onError: () => {},
      limitCount: 25,
    });
    return () => { try { unsub(); } catch (_e) {} };
  }, []);

  // Resolve display names for any uid present in items
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uids = Array.from(new Set(items.map(it => it && (it.uid || it.userId)).filter(Boolean)));
        const toFetch = uids.filter(u => !nameMap[u] && !pendingRef.current[u]);
        if (toFetch.length === 0) return;
        for (const uid of toFetch) pendingRef.current[uid] = true;
        await Promise.all(toFetch.map(async (uid) => {
          try {
            const profile = await fetchUserProfile(uid);
            if (!mounted) return;
            setNameMap(prev => ({ ...prev, [uid]: (profile && (profile.displayName || (profile.name || '')) ) || null }));
          } catch(_e) {
            // ignore
          } finally {
            try { delete pendingRef.current[uid]; } catch(_e) {}
          }
        }));
      } catch(_e) {}
    })();
    return () => { mounted = false; };
  }, [items]);

  return (
    <div style={{ width: 260, padding: 8, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 10, border: '1px solid #eee' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 6 }}>Senaste aktivitet</div>
        {items.length === 0 ? (
          <div style={{ color: '#888', fontSize: 13 }}>Inga händelser än.</div>
        ) : (
          items.map(it => {
            const uid = it?.uid || it?.userId || it?.createdBy || null;
            const actorDisplay = it?.actorName || nameMap[uid] || it?.actorEmail || it?.displayName || '';
            const baseLabel = (it?.label || it?.message || (it?.eventType || 'Händelse')) || '';
            const labelText = actorDisplay ? `${baseLabel} — av ${actorDisplay}` : baseLabel;
            return (
              <div key={it.id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f3f3' }}>
                <div style={{ fontSize: 13, color: '#222', marginBottom: 4 }}>{labelText}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#888' }}>{_toDisplayDate(it?.ts || it?.createdAt || it?.updatedAt)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
