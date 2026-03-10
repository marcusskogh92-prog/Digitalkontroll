import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listenInkopsplanRows } from '../inkopsplan/inkopsplanService';
import { addInkopDokument, deleteInkopDokument, listenInkopDokument } from './dokumentService';

const isWeb = Platform.OS === 'web';

function safeText(v) {
  return String(v ?? '').trim();
}

function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DropZone({ rowId, supplierKey, companyId, projectId, dokument, onDocumentsChanged }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const supplierDocs = useMemo(
    () => (dokument || []).filter((d) => d.rowId === rowId && d.supplierKey === supplierKey),
    [dokument, rowId, supplierKey],
  );

  const handleFiles = useCallback(
    async (files) => {
      if (!files?.length || !companyId || !projectId || !rowId || !supplierKey) return;
      setUploading(true);
      try {
        for (const file of files) {
          await addInkopDokument({
            companyId,
            projectId,
            rowId,
            supplierKey,
            fileName: file.name || 'Okänd fil',
            fileSize: file.size || null,
            fileType: file.type || '',
            downloadUrl: '',
          });
        }
      } catch (e) {
        const msg = e?.message || 'Kunde inte ladda upp fil.';
        if (isWeb && typeof window?.alert === 'function') window.alert(msg);
        else Alert.alert('Fel', msg);
      } finally {
        setUploading(false);
      }
    },
    [companyId, projectId, rowId, supplierKey],
  );

  useEffect(() => {
    if (!isWeb || !dropRef.current) return;
    const el = dropRef.current;
    const onDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    };
    const onDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
    };
    const onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = e.dataTransfer?.files;
      if (files?.length) handleFiles(Array.from(files));
    };
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  const handleDelete = useCallback(
    async (docId) => {
      if (!companyId || !projectId || !docId) return;
      const doDelete = async () => {
        try {
          await deleteInkopDokument(companyId, projectId, docId);
        } catch (e) {
          const msg = e?.message || 'Kunde inte radera dokumentet.';
          if (isWeb && typeof window?.alert === 'function') window.alert(msg);
          else Alert.alert('Fel', msg);
        }
      };
      if (isWeb && typeof window?.confirm === 'function') {
        if (window.confirm('Vill du radera detta dokument?')) await doDelete();
      } else {
        Alert.alert('Radera dokument', 'Vill du radera detta dokument?', [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Radera', style: 'destructive', onPress: doDelete },
        ]);
      }
    },
    [companyId, projectId],
  );

  return (
    <View ref={dropRef} style={[styles.dropZone, dragOver && styles.dropZoneActive]}>
      {supplierDocs.length > 0 ? (
        <View style={styles.fileList}>
          {supplierDocs.map((d) => (
            <View key={d.id} style={styles.fileRow}>
              <Ionicons name="document-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <Text style={styles.fileName} numberOfLines={1}>
                {d.fileName || 'Okänd fil'}
              </Text>
              {d.fileSize ? <Text style={styles.fileSize}>{formatFileSize(d.fileSize)}</Text> : null}
              <Pressable
                onPress={() => handleDelete(d.id)}
                style={({ hovered }) => [styles.fileDeleteBtn, hovered && styles.fileDeleteBtnHover]}
              >
                <Ionicons name="close-circle-outline" size={16} color="#94A3B8" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          if (isWeb && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        style={({ hovered, pressed }) => [
          styles.uploadArea,
          (hovered || pressed) && styles.uploadAreaHover,
          dragOver && styles.uploadAreaDragOver,
        ]}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#2563EB" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={22} color={dragOver ? '#2563EB' : '#94A3B8'} />
            <Text style={[styles.uploadText, dragOver && styles.uploadTextActive]}>
              {dragOver ? 'Släpp filer här' : 'Dra och släpp filer eller klicka för att ladda upp'}
            </Text>
          </>
        )}
      </Pressable>

      {isWeb ? (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = e.target?.files;
            if (files?.length) handleFiles(Array.from(files));
            if (e.target) e.target.value = '';
          }}
        />
      ) : null}
    </View>
  );
}

function SupplierRow({ supplier, rowId, companyId, projectId, dokument }) {
  const [expanded, setExpanded] = useState(false);
  const key = safeText(supplier?.key);
  const name = safeText(supplier?.companyName) || 'Leverantör';

  const docCount = useMemo(
    () => (dokument || []).filter((d) => d.rowId === rowId && d.supplierKey === key).length,
    [dokument, rowId, key],
  );

  return (
    <View style={styles.supplierContainer}>
      <Pressable
        onPress={() => setExpanded((p) => !p)}
        style={({ hovered }) => [styles.supplierHeader, hovered && styles.supplierHeaderHover]}
      >
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color="#64748B"
          style={{ marginRight: 8 }}
        />
        <Ionicons name="business-outline" size={14} color="#64748B" style={{ marginRight: 8 }} />
        <Text style={styles.supplierName} numberOfLines={1}>{name}</Text>
        {docCount > 0 ? (
          <View style={styles.docCountBadge}>
            <Text style={styles.docCountText}>{docCount}</Text>
          </View>
        ) : null}
      </Pressable>
      {expanded ? (
        <View style={styles.supplierContent}>
          <DropZone
            rowId={rowId}
            supplierKey={key}
            companyId={companyId}
            projectId={projectId}
            dokument={dokument}
          />
        </View>
      ) : null}
    </View>
  );
}

function CategoryRow({ row, companyId, projectId, dokument }) {
  const [expanded, setExpanded] = useState(false);
  const rowId = safeText(row?.id);
  const nr = safeText(row?.nr);
  const name = safeText(row?.name);
  const suppliers = useMemo(() => (Array.isArray(row?.suppliers) ? row.suppliers : []), [row?.suppliers]);

  const totalDocs = useMemo(
    () =>
      (dokument || []).filter(
        (d) => d.rowId === rowId && suppliers.some((s) => safeText(s?.key) === d.supplierKey),
      ).length,
    [dokument, rowId, suppliers],
  );

  if (suppliers.length === 0) return null;

  return (
    <View style={styles.categoryContainer}>
      <Pressable
        onPress={() => setExpanded((p) => !p)}
        style={({ hovered }) => [styles.categoryHeader, hovered && styles.categoryHeaderHover]}
      >
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color="#334155"
          style={{ marginRight: 8 }}
        />
        <View style={styles.categoryNrBox}>
          <Text style={styles.categoryNr}>{nr || '—'}</Text>
        </View>
        <Text style={styles.categoryName} numberOfLines={1}>{name || 'Okänd'}</Text>
        <Text style={styles.supplierCount}>
          {suppliers.length} leverantör{suppliers.length !== 1 ? 'er' : ''}
        </Text>
        {totalDocs > 0 ? (
          <View style={styles.totalDocsBadge}>
            <Ionicons name="document-outline" size={12} color="#2563EB" style={{ marginRight: 3 }} />
            <Text style={styles.totalDocsText}>{totalDocs}</Text>
          </View>
        ) : null}
      </Pressable>
      {expanded ? (
        <View style={styles.categoryContent}>
          {suppliers.map((s) => (
            <SupplierRow
              key={safeText(s?.key) || Math.random()}
              supplier={s}
              rowId={rowId}
              companyId={companyId}
              projectId={projectId}
              dokument={dokument}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function DokumentView({ companyId, projectId }) {
  const [rows, setRows] = useState([]);
  const [dokument, setDokument] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    if (!cid || !pid) return;

    setLoading(true);
    let loadedRows = false;
    let loadedDocs = false;

    const checkDone = () => {
      if (loadedRows && loadedDocs) setLoading(false);
    };

    const unsubRows = listenInkopsplanRows(
      cid,
      pid,
      (items) => {
        setRows(Array.isArray(items) ? items : []);
        loadedRows = true;
        checkDone();
      },
      () => {
        loadedRows = true;
        checkDone();
      },
    );

    const unsubDocs = listenInkopDokument(
      cid,
      pid,
      (items) => {
        setDokument(Array.isArray(items) ? items : []);
        loadedDocs = true;
        checkDone();
      },
      () => {
        loadedDocs = true;
        checkDone();
      },
    );

    return () => {
      try { unsubRows?.(); } catch (_e) {}
      try { unsubDocs?.(); } catch (_e) {}
    };
  }, [companyId, projectId]);

  const rowsWithSuppliers = useMemo(
    () =>
      (rows || [])
        .filter((r) => Array.isArray(r?.suppliers) && r.suppliers.length > 0)
        .sort((a, b) => {
          const an = Number(a?.nrNumeric);
          const bn = Number(b?.nrNumeric);
          if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
          if (Number.isFinite(an)) return -1;
          if (Number.isFinite(bn)) return 1;
          return safeText(a?.name).localeCompare(safeText(b?.name), 'sv');
        }),
    [rows],
  );

  const totalDocs = dokument.length;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Laddar dokument...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dokument</Text>
          <Text style={styles.subtitle}>
            Offertdokument och filer från leverantörer, organiserat efter inköpskategorier.
          </Text>
        </View>
        {totalDocs > 0 ? (
          <View style={styles.totalBadge}>
            <Ionicons name="document-outline" size={14} color="#2563EB" style={{ marginRight: 4 }} />
            <Text style={styles.totalBadgeText}>{totalDocs} dokument</Text>
          </View>
        ) : null}
      </View>

      {rowsWithSuppliers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="folder-open-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Inga kategorier med leverantörer ännu</Text>
          <Text style={styles.emptyHint}>
            Lägg till leverantörer under Inköp-fliken så visas de här med möjlighet att ladda upp dokument.
          </Text>
        </View>
      ) : isWeb ? (
        <View style={styles.scrollWeb}>
          {rowsWithSuppliers.map((row) => (
            <CategoryRow
              key={row.id}
              row={row}
              companyId={companyId}
              projectId={projectId}
              dokument={dokument}
            />
          ))}
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {rowsWithSuppliers.map((row) => (
            <CategoryRow
              key={row.id}
              row={row}
              companyId={companyId}
              projectId={projectId}
              dokument={dokument}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    backgroundColor: isWeb ? 'transparent' : '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748B',
    fontWeight: '400',
  },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  totalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
    marginTop: 6,
  },
  emptyHint: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 360,
  },
  scrollWeb: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  categoryContainer: {
    marginBottom: 2,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    ...(isWeb ? { cursor: 'pointer', transition: 'background-color 0.15s ease' } : {}),
  },
  categoryHeaderHover: {
    backgroundColor: '#F1F5F9',
  },
  categoryNrBox: {
    width: 36,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  categoryNr: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  supplierCount: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 8,
  },
  totalDocsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  totalDocsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  categoryContent: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingBottom: 8,
    paddingTop: 4,
    backgroundColor: '#fff',
  },

  supplierContainer: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  supplierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FAFBFC',
    ...(isWeb ? { cursor: 'pointer', transition: 'background-color 0.15s ease' } : {}),
  },
  supplierHeaderHover: {
    backgroundColor: '#F1F5F9',
  },
  supplierName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  docCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  docCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  supplierContent: {
    padding: 10,
    backgroundColor: '#fff',
  },

  dropZone: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  dropZoneActive: {
    borderColor: '#2563EB',
  },
  fileList: {
    marginBottom: 8,
    gap: 4,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 8,
    marginRight: 8,
  },
  fileDeleteBtn: {
    padding: 4,
    borderRadius: 12,
    ...(isWeb ? { cursor: 'pointer' } : {}),
  },
  fileDeleteBtnHover: {
    backgroundColor: '#FEE2E2',
  },

  uploadArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    backgroundColor: '#FAFBFC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...(isWeb ? { cursor: 'pointer', transition: 'all 0.15s ease' } : {}),
  },
  uploadAreaHover: {
    borderColor: '#94A3B8',
    backgroundColor: '#F1F5F9',
  },
  uploadAreaDragOver: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  uploadText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  uploadTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
});
