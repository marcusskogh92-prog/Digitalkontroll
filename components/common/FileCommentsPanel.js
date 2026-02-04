import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { useProjectOrganisation } from '../../hooks/useProjectOrganisation';
import { auth, createCommentNotifications, createFileComment, deleteFileComment, subscribeFileComments } from '../firebase';
import MentionInput from './MentionInput';

function safeText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function isPermissionError(err) {
  if (!err) return false;
  const code = (err.code || '').toString().toLowerCase();
  const msg = (err.message || '').toString().toLowerCase();
  return code === 'permission-denied' || code === 'permission_denied' || msg.includes('permission') || msg.includes('insufficient');
}

function getFriendlyLoadError(err) {
  if (isPermissionError(err)) return 'Du saknar behörighet att kommentera denna fil';
  return 'Kunde inte ladda kommentarer';
}

function getFriendlySaveError(err) {
  if (isPermissionError(err)) return 'Du saknar behörighet att kommentera denna fil';
  return 'Kunde inte spara kommentaren';
}

function formatCommentDate(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '—';
    return d.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_e) {
    return '—';
  }
}

/**
 * Split comment text into segments (text | mention) for rendering with pills.
 * Mentions in text are @DisplayName; we match to comment.mentions by displayName/groupName.
 * Uses longest match so "Marcus Skogh" matches even when followed by space or punctuation.
 */
function splitCommentWithMentions(text, mentions) {
  const segments = [];
  const list = Array.isArray(mentions) ? mentions : [];
  let remaining = String(text ?? '');

  while (remaining.length > 0) {
    const atIdx = remaining.indexOf('@');
    if (atIdx === -1) {
      segments.push({ type: 'text', value: remaining });
      break;
    }
    if (atIdx > 0) {
      segments.push({ type: 'text', value: remaining.slice(0, atIdx) });
    }
    remaining = remaining.slice(atIdx + 1);
    const remainingLower = remaining.toLowerCase();
    let bestMatch = null;
    let bestLen = 0;
    for (const m of list) {
      const name = (m?.type === 'all' ? 'Alla' : (m?.displayName || m?.groupName || '')).trim();
      if (!name) continue;
      const nameLower = name.toLowerCase();
      if (!remainingLower.startsWith(nameLower)) continue;
      const len = name.length;
      const nextChar = remaining[len];
      const atWordEnd = len >= remaining.length || /[\s.,;:!?)\]\}]/.test(nextChar);
      if (atWordEnd && len > bestLen) {
        bestLen = len;
        bestMatch = { mention: m, displayName: m?.type === 'all' ? 'Alla' : name };
      }
    }
    if (!bestMatch) {
      const spaceIdx = remaining.search(/\s/);
      const end = spaceIdx === -1 ? remaining.length : spaceIdx;
      const name = remaining.slice(0, end).trim();
      remaining = remaining.slice(end).trimStart();
      segments.push({ type: 'text', value: name ? `@${name}${remaining.length ? ' ' : ''}` : '@' });
    } else {
      const consumed = remaining.slice(0, bestLen);
      remaining = remaining.slice(bestLen).replace(/^\s*/, '');
      segments.push({ type: 'mention', displayName: bestMatch.displayName, mention: bestMatch.mention });
    }
  }
  return segments;
}

function CommentBody({ text, mentions }) {
  const segments = useMemo(() => splitCommentWithMentions(text, mentions), [text, mentions]);
  return (
    <Text style={styles.commentText}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <Text key={i}>{seg.value}</Text>
        ) : (
          <Text key={i} style={styles.mentionPill}>@{seg.displayName} </Text>
        )
      )}
    </Text>
  );
}

function getCommentPage(c) {
  const p = c?.pageNumber ?? c?.anchor?.pageNumber ?? null;
  return p != null && Number.isFinite(Number(p)) ? Number(p) : null;
}

export default function FileCommentsPanel({
  companyId,
  projectId,
  fileId,
  fileName = null,
  pageNumber = null,
  variant = 'default',
  comments: commentsProp = null,
  showList = true,
  onNavigateToPage = null,
}) {
  const [userId, setUserId] = useState(null);
  const [commentsInternal, setCommentsInternal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newText, setNewText] = useState('');
  const [newMentions, setNewMentions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const isControlled = commentsProp != null && Array.isArray(commentsProp);
  const comments = isControlled ? commentsProp : commentsInternal;
  const loadingEffective = isControlled ? false : loading;

  const cid = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : '';
  const pid = (projectId != null && String(projectId).trim()) ? String(projectId).trim() : '';
  const fid = (fileId != null && String(fileId).trim()) ? String(fileId).trim() : '';

  const { organisation, groups } = useProjectOrganisation({ companyId: cid || undefined, projectId: pid || undefined });

  const currentUserUid = auth?.currentUser?.uid ?? null;
  const currentUserEmail = (auth?.currentUser?.email && String(auth.currentUser.email).trim().toLowerCase()) || '';
  const mentionSuggestions = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const g of groups || []) {
      for (const m of g.members || []) {
        const name = String(m?.name || '').trim() || '—';
        const source = String(m?.source || '').trim() || 'contact';
        const refId = m?.refId ? String(m.refId).trim() : '';
        const mid = m?.id ? String(m.id).trim() : '';
        const key = source === 'user' ? `user:${refId}` : `contact:${refId || mid}`;
        if (!key || key.endsWith(':')) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        if (source === 'user' && refId) {
          out.push({ type: 'user', userId: refId, displayName: name });
        } else {
          const memberEmail = (m?.email && String(m.email).trim().toLowerCase()) || '';
          const isCurrentUser = currentUserUid && (refId === currentUserUid || (currentUserEmail && memberEmail === currentUserEmail));
          out.push({
            type: 'contact',
            contactId: refId || mid,
            displayName: name,
            ...(isCurrentUser && currentUserUid ? { userId: currentUserUid } : {}),
          });
        }
      }
      const gid = String(g?.id || '').trim();
      const gTitle = String(g?.title || '').trim() || 'Grupp';
      if (gid) out.push({ type: 'group', groupId: gid, groupName: gTitle });
    }
    out.push({ type: 'all', displayName: 'Alla' });
    return out;
  }, [groups, currentUserUid, currentUserEmail]);

  const available = Boolean(cid && pid && fid && userId);
  const canSubmit = available && safeText(newText).length > 0;

  useEffect(() => {
    const u = auth?.currentUser?.uid ?? null;
    setUserId(u);
    const unsubscribe = typeof auth?.onAuthStateChanged === 'function'
      ? auth.onAuthStateChanged((user) => {
          setUserId(user?.uid ?? null);
        })
      : null;
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isControlled || !cid || !pid || !fid || !userId) {
      if (!isControlled) setCommentsInternal([]);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    setError('');
    const unsubscribe = subscribeFileComments(cid, pid, fid, {
      onData(list) {
        setCommentsInternal(Array.isArray(list) ? list : []);
        setLoading(false);
      },
      onError(err) {
        setError(getFriendlyLoadError(err));
        setLoading(false);
      },
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [isControlled, cid, pid, fid, userId]);

  const handleAddComment = useCallback(async () => {
    if (!canSubmit || submitting) return;
    const text = safeText(newText);
    if (!text) return;
    setSubmitting(true);
    setError('');
    const mentionsToNotify = newMentions.length > 0 ? [...newMentions] : [];
    const pageNum = pageNumber != null && Number.isFinite(Number(pageNumber)) && Number(pageNumber) > 0 ? Number(pageNumber) : null;
    try {
      const result = await createFileComment(cid, pid, {
        fileId: fid,
        text,
        pageNumber: pageNum,
        anchor: { pageNumber: pageNum, type: 'page' },
        mentions: mentionsToNotify.length > 0 ? mentionsToNotify : null,
      });
      setNewText('');
      setNewMentions([]);

      if (result?.id && mentionsToNotify.length > 0) {
        const user = auth?.currentUser;
        const authorName = (user?.displayName && String(user.displayName).trim()) || (user?.email && String(user.email).trim()) || user?.uid || 'Användare';
        try {
          await createCommentNotifications(cid, pid, {
            commentId: result.id,
            fileId: fid,
            fileName: (fileName != null && String(fileName).trim()) ? String(fileName).trim() : null,
            pageNumber: pageNumber != null && Number.isFinite(Number(pageNumber)) ? Number(pageNumber) : null,
            authorId: user?.uid,
            authorName,
            textPreview: text.slice(0, 200),
            mentions: mentionsToNotify,
          });
        } catch (_notifyErr) {}
      }
    } catch (e) {
      console.error('[FileCommentsPanel] createFileComment failed', {
        code: e?.code,
        message: e?.message,
        companyId: cid,
        projectId: pid,
        fileId: fid,
        err: e,
      });
      setError(getFriendlySaveError(e));
    } finally {
      setSubmitting(false);
    }
  }, [cid, pid, fid, newText, newMentions, pageNumber, fileName, canSubmit, submitting]);

  const handleDeleteComment = useCallback(async (comment) => {
    const id = comment?.id;
    if (!id || !cid || !pid) return;
    let confirmed = false;
    if (Platform.OS === 'web') {
      confirmed = typeof window !== 'undefined' && window.confirm('Vill du radera denna kommentar?');
    } else {
      confirmed = await new Promise((resolve) => {
        Alert.alert('Radera kommentar', 'Vill du radera denna kommentar?', [
          { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
    }
    if (!confirmed) return;
    try {
      await deleteFileComment(cid, pid, id);
    } catch (e) {
      setError(isPermissionError(e) ? 'Du kan bara radera egna kommentarer.' : 'Kunde inte radera kommentaren.');
    }
  }, [cid, pid]);

  const isSidebar = variant === 'sidebar';
  return (
    <View style={[styles.container, isSidebar ? styles.containerSidePanel : styles.containerInline]}>
      {/* 1) Fixed header (never scrolls) */}
      <View style={[styles.header, isSidebar && styles.headerShrink]}>
        <Text style={styles.title}>Kommentarer</Text>
      </View>

      {/* 2) Middle area (only this part scrolls) */}
      <View style={[styles.contentArea, isSidebar && styles.contentAreaSidebar]}>
        {!available ? (
          <View style={styles.unavailableBox}>
            <Text style={styles.unavailableText}>Kommentarer är inte tillgängliga för denna fil</Text>
            <Text style={styles.unavailableHint}>
              Kontrollera att du är inloggad och att projekt och fil är valda.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {available && loadingEffective ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#1976D2" />
            <Text style={styles.loadingText}>Laddar kommentarer…</Text>
          </View>
        ) : null}

        {available && !loadingEffective && showList ? (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {comments.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Inga kommentarer ännu.</Text>
                <Text style={styles.emptyHint}>Lägg till en kommentar nedan.</Text>
              </View>
            ) : (
              (() => {
                const byPage = {};
                comments.forEach((c) => {
                  const p = getCommentPage(c);
                  const key = p != null ? p : 0;
                  if (!byPage[key]) byPage[key] = [];
                  byPage[key].push(c);
                });
                const pages = Object.keys(byPage).map(Number).sort((a, b) => a - b);
                return pages.map((pageNum) => (
                  <View key={`page-${pageNum}`} style={styles.commentGroup}>
                    <Text style={styles.commentGroupTitle}>
                      {pageNum > 0 ? `Sida ${pageNum}` : 'Sida ej angiven'}
                    </Text>
                    {byPage[pageNum].map((c) => {
                      const commentPage = getCommentPage(c);
                      const isOwnComment = !!userId && !!c.authorId && String(c.authorId) === String(userId);
                      const row = (
                        <View style={styles.comment}>
                          <View style={styles.commentMeta}>
                            <Text style={styles.commentAuthor} numberOfLines={1}>
                              {safeText(c.authorName) || safeText(c.createdByDisplayName) || safeText(c.createdBy) || safeText(c.authorId) || 'Användare'}
                            </Text>
                            <View style={styles.commentMetaRight}>
                              <Text style={styles.commentDate}>
                                {commentPage != null && commentPage > 0 ? `Sida ${commentPage} · ` : ''}
                                {formatCommentDate(c.createdAt)}
                              </Text>
                              {isOwnComment ? (
                                <Pressable
                                  onPress={() => handleDeleteComment(c)}
                                  style={({ hovered, pressed }) => [
                                    styles.deleteCommentBtn,
                                    (hovered || pressed) && styles.deleteCommentBtnHover,
                                  ]}
                                  hitSlop={8}
                                >
                                  <Text style={styles.deleteCommentBtnText}>Radera</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                          <CommentBody text={c.text} mentions={c.mentions} />
                        </View>
                      );
                      return typeof onNavigateToPage === 'function' && commentPage != null && commentPage > 0 ? (
                        <Pressable
                          key={c.id || c.createdAt?.toString?.() || Math.random()}
                          onPress={() => onNavigateToPage(commentPage)}
                          style={({ hovered, pressed }) => [
                            styles.commentWrapper,
                            (hovered || pressed) && styles.commentWrapperHover,
                          ]}
                        >
                          {row}
                        </Pressable>
                      ) : (
                        <View key={c.id || c.createdAt?.toString?.() || Math.random()}>{row}</View>
                      );
                    })}
                  </View>
                ));
              })()
            )}
          </ScrollView>
        ) : available && !loadingEffective && !showList ? (
          <View style={styles.collapsedBox}>
            <Text style={styles.collapsedTitle}>Kommentarer är dolda</Text>
            <Text style={styles.collapsedHint}>Använd knappen “Visa kommentarer” i toppbaren för att visa igen.</Text>
          </View>
        ) : null}
      </View>

      {/* 3) Fixed composer (never scrolls) */}
      <View style={[styles.form, !available && styles.formDisabled, isSidebar && styles.formShrink]}>
        {newMentions.length > 0 ? (
          <View style={styles.draftMentionsRow}>
            <Text style={styles.draftMentionsLabel}>Taggade:</Text>
            <View style={styles.draftMentionsPills}>
              {newMentions.map((m, i) => (
                <View key={i} style={styles.draftMentionPill}>
                  <Text style={styles.draftMentionPillText} numberOfLines={1}>
                    @{m.type === 'all' ? 'Alla' : (m.displayName || m.groupName || '—')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <MentionInput
          value={newText}
          onChangeText={setNewText}
          onMentionsChange={setNewMentions}
          mentions={newMentions}
          suggestions={mentionSuggestions}
          placeholder={available ? 'Skriv en kommentar… (skriv @ för att tagga)' : 'Ej tillgängligt'}
          editable={available && !submitting}
          maxLength={2000}
          // Show at least ~3 lines by default for readability.
          numberOfLines={3}
          multiline
          // Extra spacing keeps the composer airy; does not affect the comment list.
          inputStyle={[styles.composerInput, !available && styles.inputDisabled]}
        />
        <Pressable
          onPress={handleAddComment}
          disabled={!canSubmit || submitting}
          style={({ hovered, pressed }) => [
            styles.submitBtn,
            (!canSubmit || submitting) && styles.submitBtnDisabled,
            (hovered || pressed) && canSubmit && !submitting && styles.submitBtnHover,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Lägg till kommentar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Neutral base surface for the whole comments component.
    backgroundColor: '#F1F5F9',
    flexDirection: 'column',
  },
  // Default (non-sidebar) variant is a compact box.
  containerInline: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    minHeight: 180,
    maxHeight: 280,
  },
  containerSidePanel: {
    flex: 1,
    minHeight: 0,
    borderTopWidth: 0,
    // Sidebar variant is a 3-zone layout: header (fixed), list (scroll), composer (fixed).
    // Keep overflow hidden so only the middle list scrolls.
    overflow: 'hidden',
  },
  header: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    flexShrink: 0,
    // White header on a neutral panel background for clear structure.
    backgroundColor: '#fff',
    ...(Platform.OS === 'web'
      ? {
        // Defensive: if any ancestor scrolls, keep the header pinned.
        position: 'sticky',
        top: 0,
        zIndex: 2,
        backgroundColor: '#fff',
        boxShadow: '0 1px 0 rgba(15, 23, 42, 0.06)',
      }
      : null),
  },
  headerShrink: {
    flexShrink: 0,
  },
  contentArea: {
    flexDirection: 'column',
  },
  contentAreaSidebar: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  errorBox: {
    padding: 10,
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
  },
  unavailableBox: {
    padding: 14,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  unavailableText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  unavailableHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  formDisabled: {
    opacity: 0.7,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
  },
  // Composer textarea: taller by default (≈3 lines) + extra separation from the button.
  composerInput: {
    minHeight: 84,
    maxHeight: 180,
    marginBottom: 12,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  list: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F1F5F9',
  },
  listContent: {
    flexGrow: 1,
    padding: 14,
    paddingBottom: 8,
  },
  empty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  commentGroup: {
    marginBottom: 16,
  },
  commentGroupTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  commentWrapper: {
    marginBottom: 0,
  },
  commentWrapperHover: {
    backgroundColor: 'rgba(25, 118, 210, 0.04)',
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  comment: {
    // Comments as white cards on neutral background for long-read comfort.
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 6px rgba(15, 23, 42, 0.06)' } : { elevation: 1 }),
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  commentMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteCommentBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  deleteCommentBtnHover: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteCommentBtnText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  commentDate: {
    fontSize: 11,
    color: '#64748b',
  },
  commentText: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 20,
  },
  mentionPill: {
    color: '#fff',
    fontWeight: '600',
    backgroundColor: '#1976D2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  form: {
    padding: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    // White composer on neutral panel background.
    backgroundColor: '#fff',
    overflow: 'visible',
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? {
        // Defensive: keep composer pinned to the bottom of the panel.
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        boxShadow: '0 -1px 0 rgba(15, 23, 42, 0.06)',
      }
      : null),
  },
  formShrink: {
    flexShrink: 0,
  },

  collapsedBox: {
    padding: 14,
    margin: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  collapsedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  collapsedHint: {
    fontSize: 12,
    color: '#64748b',
  },
  draftMentionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  draftMentionsLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  draftMentionsPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  draftMentionPill: {
    backgroundColor: '#1976D2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    maxWidth: 160,
  },
  draftMentionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#fff',
    minHeight: 56,
    maxHeight: 100,
    marginBottom: 10,
  },
  submitBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    // Keep a bit of breathing room from the input above.
    marginTop: 2,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.8,
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' } : {}),
  },
  submitBtnHover: {
    backgroundColor: '#1565C0',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
