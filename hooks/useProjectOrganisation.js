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
  if (raw == null || (typeof raw !== 'object' && !Array.isArray(raw))) {
    return [];
  }
  const groups = Array.isArray(raw)
    ? raw
    : Object.keys(raw)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => raw[k]);
  return groups
    .filter((g) => g != null && typeof g === 'object')
    .map((g) => {
      const id = String(g?.id || '').trim() || uuidv4();
      const description = String(g?.description ?? g?.title ?? '').trim();
      const linkedSupplierId = g?.linkedSupplierId != null ? String(g.linkedSupplierId).trim() || null : null;
      const linkedCustomerId = g?.linkedCustomerId != null ? String(g.linkedCustomerId).trim() || null : null;
      const linkedCompanyName = String(g?.linkedCompanyName ?? '').trim() || null;
      const title =
        linkedCompanyName && description
          ? `${linkedCompanyName} - ${description}`
          : String(g?.title ?? '').trim() || description || 'Grupp';
      const groupType = String(g?.groupType || g?.type || '').trim() || null;
      const isInternalMainGroup = !!g?.isInternalMainGroup;
      const locked = g?.locked === true || g?.isLocked === true;
      const members = Array.isArray(g?.members) ? g.members : [];
      return {
        id,
        title,
        description: description || null,
        linkedSupplierId,
        linkedCustomerId,
        linkedCompanyName,
        groupType,
        isInternalMainGroup,
        locked,
        members: members
          .map((m) => {
            const mid = String(m?.id || '').trim() || uuidv4();
            const source = String(m?.source || '').trim() || 'contact';
            const refId = String(m?.refId || '').trim() || null;
            const roles = Array.isArray(m?.roles)
              ? m.roles.map((r) => String(r || '').trim()).filter(Boolean)
              : (m?.role ? [String(m.role).trim()].filter(Boolean) : []);
            return {
              id: mid,
              source,
              refId,
              name: String(m?.name || '').trim() || '—',
              company: String(m?.company || '').trim() || '',
              email: String(m?.email || '').trim() || '',
              phone: String(m?.phone || '').trim() || '',
              roles,
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

    let unsub;
    try {
      if (!db) {
        setError('Databas ej tillgänglig.');
        setLoading(false);
        return;
      }
      const ref = doc(db, 'foretag', cid, COLLECTION, pid);
      unsub = onSnapshot(
        ref,
        (snap) => {
          try {
            const next = snap.exists() ? ensureDocShape(snap.data(), pid) : { projectId: pid, groups: [] };
            setOrganisation(next);
          } catch (e) {
            setError(String(e?.message || e || 'Kunde inte tolka organisationsdata.'));
            setOrganisation({ projectId: pid, groups: [] });
          }
          setLoading(false);
        },
        (err) => {
          setError(String(err?.message || err || 'Kunde inte läsa organisation.'));
          setLoading(false);
        }
      );
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte ansluta till organisation.'));
      setLoading(false);
    }

    return () => {
      try {
        if (unsub && typeof unsub === 'function') unsub();
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
    async ({ title, description, linkedSupplierId, linkedCustomerId, linkedCompanyName } = {}) => {
      const desc = String(description ?? title ?? '').trim() || 'Ny grupp';
      const supId = linkedSupplierId != null ? String(linkedSupplierId).trim() || null : null;
      const custId = linkedCustomerId != null ? String(linkedCustomerId).trim() || null : null;
      const companyName = String(linkedCompanyName ?? '').trim() || null;
      const displayTitle =
        companyName && desc ? `${companyName} - ${desc}` : (title && String(title).trim()) || desc;
      const newId = uuidv4();
      const current = latestRef.current;
      const newGroup = {
        id: newId,
        title: displayTitle,
        description: desc || null,
        linkedSupplierId: supId || null,
        linkedCustomerId: custId || null,
        linkedCompanyName: companyName || null,
        members: [],
      };
      const next = {
        ...current,
        groups: [...(current.groups || []), newGroup],
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

      const hit = (current.groups || []).find((g) => String(g?.id || '') === gid) || null;
      if (hit && (hit.locked === true || hit.isInternalMainGroup === true)) {
        return;
      }

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

      const hit = (current.groups || []).find((g) => String(g?.id || '') === gid) || null;
      if (hit && (hit.locked === true || hit.isInternalMainGroup === true)) {
        return { ok: false, reason: 'locked' };
      }

      const next = {
        ...current,
        groups: (current.groups || []).map((g) =>
          String(g?.id || '') === gid ? { ...g, title: t || 'Grupp' } : g
        ),
      };
      await save(next);
      return { ok: true };
    },
    [save]
  );

  const updateGroup = useCallback(
    async (groupId, { description, linkedSupplierId, linkedCustomerId, linkedCompanyName } = {}) => {
      const gid = String(groupId || '').trim();
      if (!gid) return { ok: false, reason: 'no_group' };
      const current = latestRef.current;

      const hit = (current.groups || []).find((g) => String(g?.id || '') === gid) || null;
      if (hit && (hit.locked === true || hit.isInternalMainGroup === true)) {
        return { ok: false, reason: 'locked' };
      }

      const desc = description != null ? String(description).trim() || null : (hit?.description ?? hit?.title ?? 'Grupp');
      const supId = linkedSupplierId === undefined ? (hit?.linkedSupplierId ?? null) : (linkedSupplierId != null ? String(linkedSupplierId).trim() || null : null);
      const custId = linkedCustomerId === undefined ? (hit?.linkedCustomerId ?? null) : (linkedCustomerId != null ? String(linkedCustomerId).trim() || null : null);
      const companyName = linkedCompanyName === undefined ? (hit?.linkedCompanyName ?? null) : (linkedCompanyName != null ? String(linkedCompanyName).trim() || null : null);
      const displayTitle =
        companyName && desc ? `${companyName} - ${desc}` : (desc || 'Grupp');

      const next = {
        ...current,
        groups: (current.groups || []).map((g) =>
          String(g?.id || '') === gid
            ? {
                ...g,
                title: displayTitle,
                description: desc || null,
                linkedSupplierId: supId,
                linkedCustomerId: custId,
                linkedCompanyName: companyName,
              }
            : g
        ),
      };
      await save(next);
      return { ok: true };
    },
    [save]
  );

  const addMember = useCallback(
    async ({ groupId, candidate, role, roles: rolesParam }) => {
      const gid = String(groupId || '').trim();
      if (!gid) return { ok: false, reason: 'no_group' };

      const c = candidate && typeof candidate === 'object' ? candidate : null;
      if (!c) return { ok: false, reason: 'no_candidate' };

      const source = String(c.source || '').trim();
      const refId = String(c.refId || '').trim();
      if (!source || !refId) return { ok: false, reason: 'bad_candidate' };

      const roles = Array.isArray(rolesParam)
        ? rolesParam.map((r) => String(r || '').trim()).filter(Boolean)
        : (role ? [String(role).trim()].filter(Boolean) : []);

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
        roles,
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

  const updateMemberRoles = useCallback(
    async ({ groupId, memberId, roles: rolesParam }) => {
      const gid = String(groupId || '').trim();
      const mid = String(memberId || '').trim();
      if (!gid || !mid) return;
      const roles = Array.isArray(rolesParam)
        ? rolesParam.map((r) => String(r || '').trim()).filter(Boolean)
        : [];
      const current = latestRef.current;
      const next = {
        ...current,
        groups: (current.groups || []).map((g) => {
          if (String(g?.id || '') !== gid) return g;
          return {
            ...g,
            members: (g.members || []).map((m) =>
              String(m?.id || '') === mid ? { ...m, roles } : m
            ),
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
      updateGroup,
      addMember,
      removeMember,
      updateMemberRoles,
    }),
    [organisation, loading, error, addGroup, removeGroup, updateGroupTitle, updateGroup, addMember, removeMember, updateMemberRoles]
  );

  return api;
}

export default useProjectOrganisation;
