/**
 * useProjectOrganisation
 *
 * Project-specific organisation model with dynamic groups and members.
 * Stored in Firestore under: foretag/{companyId}/project_organisation/{projectId}
 *
 * Data model:
 * - ProjectOrganisation: { projectId, groups: ProjectOrganisationGroup[] }
 * - Group: { id, title, members: ProjectOrganisationMember[] }
 * - Member: comes from either internal company members directory or contact registry.
 */

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { auth, db } from '../components/firebase';

const COLLECTION = 'project_organisation';

function normalizeGroups(raw) {
  const groups = Array.isArray(raw) ? raw : [];
  return groups
    .map((g) => {
      const id = String(g?.id || '').trim() || uuidv4();
      const title = String(g?.title || '').trim() || 'Grupp';
      const members = Array.isArray(g?.members) ? g.members : [];
      return {
        id,
        title,
        members: members
          .map((m) => {
            const mid = String(m?.id || '').trim() || uuidv4();
            const source = String(m?.source || '').trim() || 'contact';
            const refId = String(m?.refId || '').trim() || null;
            return {
              id: mid,
              source,
              refId,
              name: String(m?.name || '').trim() || '—',
              company: String(m?.company || '').trim() || '',
              email: String(m?.email || '').trim() || '',
              phone: String(m?.phone || '').trim() || '',
              role: String(m?.role || '').trim() || '',
            };
          })
          .filter(Boolean),
      };
    })
    .filter(Boolean);
}

function ensureDocShape(docData, projectId) {
  const pid = String(projectId || '').trim();
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    projectId: String(d.projectId || pid || '').trim() || pid || null,
    groups: normalizeGroups(d.groups),
  };
}

function memberIdentity(m) {
  const source = String(m?.source || '').trim();
  const refId = String(m?.refId || '').trim();
  if (!source || !refId) return null;
  return `${source}:${refId}`;
}

export function useProjectOrganisation({ companyId, projectId }) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [organisation, setOrganisation] = useState(() => ({ projectId: pid || null, groups: [] }));

  const latestRef = useRef(organisation);
  useEffect(() => {
    latestRef.current = organisation;
  }, [organisation]);

  useEffect(() => {
    if (!cid || !pid) {
      setOrganisation({ projectId: pid || null, groups: [] });
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    const ref = doc(db, 'foretag', cid, COLLECTION, pid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next = snap.exists() ? ensureDocShape(snap.data(), pid) : { projectId: pid, groups: [] };
        setOrganisation(next);
        setLoading(false);
      },
      (err) => {
        setError(String(err?.message || err || 'Kunde inte läsa organisation.'));
        setLoading(false);
      }
    );

    return () => {
      try {
        unsub();
      } catch (_e) {}
    };
  }, [cid, pid]);

  const save = useCallback(
    async (nextOrganisation) => {
      if (!cid || !pid) return false;
      const ref = doc(db, 'foretag', cid, COLLECTION, pid);
      const payload = {
        projectId: pid,
        groups: normalizeGroups(nextOrganisation?.groups),
        updatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || null,
      };
      await setDoc(ref, payload, { merge: true });
      return true;
    },
    [cid, pid]
  );

  const addGroup = useCallback(
    async ({ title } = {}) => {
      const t = String(title || '').trim() || 'Ny grupp';
      const newId = uuidv4();
      const current = latestRef.current;
      const next = {
        ...current,
        groups: [...(current.groups || []), { id: newId, title: t, members: [] }],
      };
      await save(next);
      return { ok: true, id: newId };
    },
    [save]
  );

  const removeGroup = useCallback(
    async (groupId) => {
      const gid = String(groupId || '').trim();
      if (!gid) return;
      const current = latestRef.current;
      const next = {
        ...current,
        groups: (current.groups || []).filter((g) => String(g?.id || '') !== gid),
      };
      await save(next);
    },
    [save]
  );

  const updateGroupTitle = useCallback(
    async (groupId, title) => {
      const gid = String(groupId || '').trim();
      if (!gid) return;
      const t = String(title || '').trim();
      const current = latestRef.current;
      const next = {
        ...current,
        groups: (current.groups || []).map((g) =>
          String(g?.id || '') === gid ? { ...g, title: t || 'Grupp' } : g
        ),
      };
      await save(next);
    },
    [save]
  );

  const addMember = useCallback(
    async ({ groupId, candidate, role }) => {
      const gid = String(groupId || '').trim();
      if (!gid) return { ok: false, reason: 'no_group' };

      const c = candidate && typeof candidate === 'object' ? candidate : null;
      if (!c) return { ok: false, reason: 'no_candidate' };

      const source = String(c.source || '').trim();
      const refId = String(c.refId || '').trim();
      if (!source || !refId) return { ok: false, reason: 'bad_candidate' };

      const roleText = String(role || '').trim();
      if (!roleText) return { ok: false, reason: 'no_role' };

      const current = latestRef.current;
      const groups = current.groups || [];
      const group = groups.find((g) => String(g?.id || '') === gid);
      if (!group) return { ok: false, reason: 'no_group' };

      const ident = `${source}:${refId}`;
      const existing = (group.members || []).some((m) => memberIdentity(m) === ident);
      if (existing) return { ok: false, reason: 'duplicate' };

      const nextMember = {
        id: uuidv4(),
        source,
        refId,
        name: String(c.name || '').trim() || '—',
        company: String(c.company || '').trim() || '',
        email: String(c.email || '').trim() || '',
        phone: String(c.phone || '').trim() || '',
        role: roleText,
      };

      const next = {
        ...current,
        groups: groups.map((g) =>
          String(g?.id || '') === gid
            ? { ...g, members: [...(g.members || []), nextMember] }
            : g
        ),
      };

      await save(next);
      return { ok: true, groupId: gid, member: nextMember };
    },
    [save]
  );

  const removeMember = useCallback(
    async ({ groupId, memberId }) => {
      const gid = String(groupId || '').trim();
      const mid = String(memberId || '').trim();
      if (!gid || !mid) return;
      const current = latestRef.current;
      const next = {
        ...current,
        groups: (current.groups || []).map((g) =>
          String(g?.id || '') === gid
            ? { ...g, members: (g.members || []).filter((m) => String(m?.id || '') !== mid) }
            : g
        ),
      };
      await save(next);
    },
    [save]
  );

  const updateMemberRole = useCallback(
    async ({ groupId, memberId, role }) => {
      const gid = String(groupId || '').trim();
      const mid = String(memberId || '').trim();
      if (!gid || !mid) return;
      const r = String(role || '').trim();
      const current = latestRef.current;
      const next = {
        ...current,
        groups: (current.groups || []).map((g) => {
          if (String(g?.id || '') !== gid) return g;
          return {
            ...g,
            members: (g.members || []).map((m) => (String(m?.id || '') === mid ? { ...m, role: r } : m)),
          };
        }),
      };
      await save(next);
    },
    [save]
  );

  const api = useMemo(
    () => ({
      organisation,
      groups: organisation?.groups || [],
      loading,
      error,
      addGroup,
      removeGroup,
      updateGroupTitle,
      addMember,
      removeMember,
      updateMemberRole,
    }),
    [organisation, loading, error, addGroup, removeGroup, updateGroupTitle, addMember, removeMember, updateMemberRole]
  );

  return api;
}

export default useProjectOrganisation;
