import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import DocumentListSurface from '../components/DocumentListSurface';

import { createCompanyContact, fetchCompanyContacts, fetchCompanySuppliers, getCompanySharePointSiteId } from '../../../components/firebase';
import { getDriveItemByPath } from '../../../services/azure/fileService';

import { listenRfqByggdelar, listenRfqPackages, softDeleteRfqByggdel, updateRfqByggdel, updateRfqPackage } from '../../../features/project-phases/phases/kalkylskede/services/forfragningarService';

import ByggdelRowAccordion from './components/ByggdelRowAccordion';
import StructurePickerModal from './components/StructurePickerModal';
import {
    createByggdelWithBestEffortFolders,
    createPackageWithBestEffortFolders,
    createSupplierInRegistry,
    deleteByggdelFolderInSharePointBestEffort,
    ensureForfragningarRootBestEffort,
    ensurePackageFolderBestEffort,
    getForfragningarRootPath,
    listenRfqForfragningarSettings,
    RFQ_STRUCTURE_MODES,
    seedDefaultByggdelTable,
    setRfqStructureMode,
} from './forfragningarModuleService';
import { linkExistingContactToSupplier } from '../../leverantorer/leverantorerService';

function safeText(v) {
	const s = String(v ?? '').trim();
	return s || '';
}

function normalizePath(path) {
	if (!path || typeof path !== 'string') return '';
	return path
		.trim()
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/\/+/, '/');
}

function safeFolderSegment(value) {
	const s = safeText(value);
	if (!s) return '';
	return s
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.trim();
}

function buildByggdelFolderName(byggdel) {
	const code = safeFolderSegment(byggdel?.code);
	const label = safeFolderSegment(byggdel?.label);
	const group = safeFolderSegment(byggdel?.group);
	const left = [code, label].filter(Boolean).join(' – ');
	if (!left) return '';
	if (!group) return left;
	return `${left} – ${group}`;
}

function formatByggdelTitle(byggdel) {
	const code = safeText(byggdel?.code);
	const label = safeText(byggdel?.label);
	if (code && label) return `${code} – ${label}`;
	if (label) return label;
	return 'Byggdel';
}

function formatStructureLabel(mode) {
	return mode === RFQ_STRUCTURE_MODES.MANUAL_FOLDERS
		? 'Valfri mappstruktur'
		: 'Byggdelstabell';
}

function sortContacts(a, b) {
	const ac = safeText(a?.contactCompanyName || a?.companyName || a?.companyId || '');
	const bc = safeText(b?.contactCompanyName || b?.companyName || b?.companyId || '');
	const cn = ac.localeCompare(bc, 'sv');
	if (cn !== 0) return cn;
	const an = safeText(a?.name);
	const bn = safeText(b?.name);
	return an.localeCompare(bn, 'sv');
}

async function openUrl(url) {
	const u = safeText(url);
	if (!u) return;
	try {
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			window.open(u, '_blank', 'noopener,noreferrer');
			return;
		}
	} catch (_e) {}
}

async function openSharePointFolder({ companyId, folderPath }) {
	const rel = normalizePath(folderPath);
	if (!companyId || !rel) return;

	const siteId = await getCompanySharePointSiteId(companyId);
	if (!siteId) throw new Error('Saknar SharePoint siteId');
	const item = await getDriveItemByPath(rel, siteId);
	const url = safeText(item?.webUrl);
	if (!url) throw new Error('Kunde inte öppna mappen (saknar webUrl)');
	await openUrl(url);
}

export default function ForfragningarView({ companyId, projectId, project, activeItem, sectionNavigation }) {
	const [byggdelar, setByggdelar] = useState([]);
	const [packages, setPackages] = useState([]);
	const [loading, setLoading] = useState(true);
	const [suppliers, setSuppliers] = useState([]);
	const [suppliersLoading, setSuppliersLoading] = useState(false);
	const [contacts, setContacts] = useState([]);

	const [structureMode, setStructureMode] = useState(null);
	const [structurePickerOpen, setStructurePickerOpen] = useState(false);

	const [expandedById, setExpandedById] = useState({});

	const [newByggdelCode, setNewByggdelCode] = useState('');
	const [newByggdelLabel, setNewByggdelLabel] = useState('');
	const [newByggdelGroup, setNewByggdelGroup] = useState('');
	const [editingByggdelId, setEditingByggdelId] = useState('');
	const [creatingByggdel, setCreatingByggdel] = useState(false);
	const [seeding, setSeeding] = useState(false);

	const forfragningarRootPath = useMemo(() => getForfragningarRootPath(project), [project]);

	useEffect(() => {
		if (!companyId || !projectId) return () => {};
		setLoading(true);

		const unsubByggdel = listenRfqByggdelar(
			companyId,
			projectId,
			(list) => {
				setByggdelar(Array.isArray(list) ? list : []);
				setLoading(false);
			},
			() => setLoading(false),
		);

		const unsubPackages = listenRfqPackages(
			companyId,
			projectId,
			(list) => {
				setPackages(Array.isArray(list) ? list : []);
			},
			() => {},
		);

		return () => {
			try {
				unsubByggdel?.();
			} catch (_e) {}
			try {
				unsubPackages?.();
			} catch (_e) {}
		};
	}, [companyId, projectId]);

	useEffect(() => {
		if (!companyId || !projectId) return () => {};
		const unsub = listenRfqForfragningarSettings(
			companyId,
			projectId,
			(settings) => {
				const mode = settings?.structureMode;
				if (Object.values(RFQ_STRUCTURE_MODES).includes(mode)) setStructureMode(mode);
				else setStructureMode(null);
			},
			() => {},
		);

		return () => {
			try {
				unsub?.();
			} catch (_e) {}
		};
	}, [companyId, projectId]);

	const hasStructure = Object.values(RFQ_STRUCTURE_MODES).includes(structureMode);
	const tableEnabled = hasStructure && structureMode === RFQ_STRUCTURE_MODES.COMPLETE_TABLE;
	const showTable = !hasStructure || structureMode === RFQ_STRUCTURE_MODES.COMPLETE_TABLE;

	useEffect(() => {
		let alive = true;
		const cid = safeText(companyId);
		if (!cid) return () => {};

		setSuppliersLoading(true);
		fetchCompanySuppliers(cid)
			.then((list) => {
				if (!alive) return;
				setSuppliers(Array.isArray(list) ? list : []);
			})
			.finally(() => {
				if (!alive) return;
				setSuppliersLoading(false);
			});

		return () => {
			alive = false;
		};
	}, [companyId]);

	const supplierMap = useMemo(() => {
		const map = new Map();
		(Array.isArray(suppliers) ? suppliers : []).forEach((s) => {
			const id = safeText(s?.id);
			if (id) map.set(id, s);
			const name = safeText(s?.companyName).toLowerCase();
			if (name) map.set(`name:${name}`, s);
		});
		return map;
	}, [suppliers]);

	const resolveSupplierForPackage = (pkg) => {
		const sid = safeText(pkg?.supplierId);
		if (sid && supplierMap.has(sid)) return supplierMap.get(sid);
		const name = safeText(pkg?.supplierName).toLowerCase();
		if (name && supplierMap.has(`name:${name}`)) return supplierMap.get(`name:${name}`);
		return null;
	};

	useEffect(() => {
		let alive = true;
		const cid = safeText(companyId);
		if (!cid) return () => {};

		fetchCompanyContacts(cid)
			.then((list) => {
				if (!alive) return;
				setContacts(Array.isArray(list) ? list : []);
			})
			.catch(() => {
				if (!alive) return;
				setContacts([]);
			});

		return () => {
			alive = false;
		};
	}, [companyId]);

	const byggdelSorted = useMemo(() => {
		const list = Array.isArray(byggdelar) ? [...byggdelar] : [];
		list.sort((a, b) => {
			const ac = safeText(a?.code);
			const bc = safeText(b?.code);
			const an = Number.parseInt(ac, 10);
			const bn = Number.parseInt(bc, 10);
			const aHas = Number.isFinite(an);
			const bHas = Number.isFinite(bn);
			if (aHas && bHas && an !== bn) return an - bn;
			if (aHas && !bHas) return -1;
			if (!aHas && bHas) return 1;
			return formatByggdelTitle(a).localeCompare(formatByggdelTitle(b), 'sv');
		});
		return list;
	}, [byggdelar]);

	useEffect(() => {
		if (!companyId || !projectId) return;
		if (!tableEnabled) return;
		if (seeding) return;
		if (byggdelSorted.length > 0) return;
		setSeeding(true);
		seedDefaultByggdelTable({ companyId, projectId, existingByggdelCount: byggdelSorted.length })
			.catch((e) => {
				Alert.alert('Kunde inte skapa tabell', e?.message || 'Saknar behörighet eller okänt fel');
			})
			.finally(() => setSeeding(false));
	}, [companyId, projectId, tableEnabled, byggdelSorted.length, seeding]);

	const packagesByByggdel = useMemo(() => {
		const map = {};
		(Array.isArray(packages) ? packages : []).forEach((p) => {
			const bid = safeText(p?.byggdelId);
			if (!bid) return;
			if (!map[bid]) map[bid] = [];
			map[bid].push(p);
		});
		Object.values(map).forEach((arr) => {
			arr.sort((a, b) => safeText(a?.supplierName).localeCompare(safeText(b?.supplierName), 'sv'));
		});
		return map;
	}, [packages]);

	const toggleByggdel = (byggdelId) => {
		const bid = safeText(byggdelId);
		if (!bid) return;
		setExpandedById((prev) => ({ ...(prev || {}), [bid]: !prev?.[bid] }));
	};

	const setMode = async (nextMode) => {
		const mode = nextMode === RFQ_STRUCTURE_MODES.MANUAL_FOLDERS ? RFQ_STRUCTURE_MODES.MANUAL_FOLDERS : RFQ_STRUCTURE_MODES.COMPLETE_TABLE;
		setStructureMode(mode);
		try {
			await setRfqStructureMode(companyId, projectId, mode);
		} catch (_e) {}
	};

	const handleAddByggdel = async () => {
		if (!companyId || !projectId) return;
		if (!tableEnabled) return;
		const code = safeText(newByggdelCode);
		const label = safeText(newByggdelLabel);
		const group = safeText(newByggdelGroup);
		if (!label) return;
		if (creatingByggdel) return;

		setCreatingByggdel(true);
		try {
			if (safeText(editingByggdelId)) {
				await updateRfqByggdel(companyId, projectId, editingByggdelId, {
					label,
					code: code || null,
					group: group || null,
				});
			} else {
				await createByggdelWithBestEffortFolders({
					companyId,
					projectId,
					project,
					byggdel: {
						label,
						code: code || null,
						group: group || null,
						moment: null,
					},
				});
			}
			setNewByggdelCode('');
			setNewByggdelLabel('');
			setNewByggdelGroup('');
			setEditingByggdelId('');
		} catch (e) {
			Alert.alert('Kunde inte lägga till byggdel', e?.message || 'Okänt fel');
		} finally {
			setCreatingByggdel(false);
		}
	};

	const startEditByggdel = (byggdel) => {
		const bid = safeText(byggdel?.id);
		if (!bid) return;
		setEditingByggdelId(bid);
		setNewByggdelCode(safeText(byggdel?.code));
		setNewByggdelLabel(safeText(byggdel?.label));
		setNewByggdelGroup(safeText(byggdel?.group));
	};

	const cancelEditByggdel = () => {
		setEditingByggdelId('');
		setNewByggdelCode('');
		setNewByggdelLabel('');
		setNewByggdelGroup('');
	};

	const removeByggdel = async (byggdel) => {
		if (!companyId || !projectId) return;
		const bid = safeText(byggdel?.id);
		if (!bid) return;
		if (!tableEnabled) return;
		Alert.alert('Ta bort byggdel?', 'Byggdelen döljs från listan. Mappen i SharePoint flyttas till papperskorgen.', [
			{ text: 'Avbryt', style: 'cancel' },
			{
				text: 'Ta bort',
				style: 'destructive',
				onPress: async () => {
					try {
						await softDeleteRfqByggdel(companyId, projectId, bid);
						void deleteByggdelFolderInSharePointBestEffort({ companyId, byggdel });
					} catch (e) {
						Alert.alert('Kunde inte ta bort', e?.message || 'Okänt fel');
					}
				},
			},
		]);
	};

	const addSupplierFromRegistry = async (byggdel, supplier) => {
		if (!companyId || !projectId) return;
		if (!tableEnabled) return;
		const bid = safeText(byggdel?.id);
		const sname = safeText(supplier?.companyName);
		if (!bid || !sname) return;

		const existing = (packagesByByggdel?.[bid] || []).some(
			(p) => safeText(p?.supplierName).toLowerCase() === sname.toLowerCase(),
		);
		if (existing) throw new Error('Denna leverantör finns redan på byggdelen.');

		await createPackageWithBestEffortFolders({
			companyId,
			projectId,
			project,
			byggdel,
			supplier,
		});
	};

	const createAndAddSupplier = async (byggdel, name) => {
		if (!companyId || !projectId) return;
		if (!tableEnabled) return;
		const n = safeText(name);
		if (!n) return;

		const created = await createSupplierInRegistry({ companyId, supplierName: n, category: '' });
		setSuppliers((prev) => {
			const arr = Array.isArray(prev) ? prev : [];
			return [...arr, created].sort((a, b) => safeText(a?.companyName).localeCompare(safeText(b?.companyName), 'sv'));
		});
		await addSupplierFromRegistry(byggdel, created);
	};

	const setPackageStatus = async (pkg, status) => {
		if (!companyId || !projectId || !pkg?.id) return;
		if (!tableEnabled) return;
		await updateRfqPackage(companyId, projectId, pkg.id, { status });
	};

	const updatePackage = async (pkg, patch) => {
		if (!companyId || !projectId || !pkg?.id) return;
		if (!tableEnabled) return;
		await updateRfqPackage(companyId, projectId, pkg.id, patch);
	};

	const pickContactForPackage = async (pkg, contact) => {
		if (!companyId || !projectId || !pkg?.id) return;
		if (!tableEnabled) return;
		const contactId = safeText(contact?.id);
		if (!contactId) return;
		const contactName = safeText(contact?.name);
		const supplier = resolveSupplierForPackage(pkg);
		const supplierId = safeText(supplier?.id || pkg?.supplierId);
		const supplierName = safeText(supplier?.companyName || pkg?.supplierName);

		if (supplierId) {
			try {
				await linkExistingContactToSupplier(companyId, supplierId, contactId, {
					contactCompanyName: supplierName || safeText(contact?.contactCompanyName),
				});
			} catch (_e) {}
		}

		await updateRfqPackage(companyId, projectId, pkg.id, {
			contactId,
			contactName: contactName || null,
		});
	};

	const createContactForPackage = async (pkg, name) => {
		if (!companyId || !projectId || !pkg?.id) return;
		if (!tableEnabled) return;
		const contactName = safeText(name);
		if (!contactName) return;

		const supplier = resolveSupplierForPackage(pkg);
		const supplierId = safeText(supplier?.id || pkg?.supplierId);
		const supplierName = safeText(supplier?.companyName || pkg?.supplierName);

		const newId = await createCompanyContact(
			{
				name: contactName,
				contactCompanyName: supplierName,
				companyId: null,
				customerId: null,
				companyType: null,
			},
			companyId,
		);

		if (supplierId) {
			try {
				await linkExistingContactToSupplier(companyId, supplierId, newId, {
					contactCompanyName: supplierName,
				});
			} catch (_e) {}
		}

		setContacts((prev) => {
			const arr = Array.isArray(prev) ? prev : [];
			if (arr.some((c) => safeText(c?.id) === newId)) return arr;
			const next = [
				...arr,
				{
					id: newId,
					name: contactName,
					contactCompanyName: supplierName,
					linkedSupplierId: supplierId || null,
				},
			];
			next.sort(sortContacts);
			return next;
		});

		await updateRfqPackage(companyId, projectId, pkg.id, {
			contactId: newId,
			contactName,
		});
	};

	const canOpenFolder = (pkg) => Boolean(companyId && safeText(pkg?.sharePointFolderPath));

	const openFolder = async (pkg) => {
		try {
			const folderPath = safeText(pkg?.sharePointFolderPath);
			if (folderPath) {
				await openSharePointFolder({ companyId, folderPath });
				return;
			}

			const byggdel = byggdelSorted.find((b) => safeText(b?.id) === safeText(pkg?.byggdelId)) || null;
			const expectedRoot = forfragningarRootPath;
			const expectedByggdel = byggdel ? buildByggdelFolderName(byggdel) : safeFolderSegment(pkg?.byggdelLabel);
			const expectedSupplier = safeFolderSegment(pkg?.supplierName);
			const expected = expectedRoot && expectedByggdel && expectedSupplier
				? normalizePath(`${expectedRoot}/${expectedByggdel}/${expectedSupplier}`)
				: '';

			if (byggdel && expected) {
				void ensurePackageFolderBestEffort({ companyId, projectId, project, byggdel, packageId: pkg?.id, supplierName: safeText(pkg?.supplierName) });
			}

			Alert.alert('Mapp skapas i bakgrunden', expected ? `Förväntad mappväg:\n${expected}` : 'Saknar tillräcklig info för att bygga en mappväg.');
		} catch (e) {
			Alert.alert('Kunde inte öppna mapp', e?.message || 'Okänt fel');
		}
	};

	const removePackage = async (pkg) => {
		if (!companyId || !projectId || !pkg?.id) return;
		if (!tableEnabled) return;
		Alert.alert('Ta bort leverantör?', 'Leverantören döljs från listan. Du kan återställa genom att ändra i databasen vid behov.', [
			{ text: 'Avbryt', style: 'cancel' },
			{
				text: 'Ta bort',
				style: 'destructive',
				onPress: async () => {
					try {
						await updateRfqPackage(companyId, projectId, pkg.id, { deleted: true });
					} catch (e) {
						Alert.alert('Kunde inte ta bort', e?.message || 'Okänt fel');
					}
				},
			},
		]);
	};

	const structureStatusLine = !hasStructure
		? 'Ingen struktur vald. Välj hur förfrågningar ska organiseras.'
		: `Struktur: ${formatStructureLabel(structureMode)}`;

	const openForfragningarRootFolder = async () => {
		try {
			const ensured = await ensureForfragningarRootBestEffort({ companyId, project });
			const folderPath = safeText(ensured || forfragningarRootPath);
			if (!folderPath) throw new Error('Saknar projektets SharePoint-basväg');
			await openSharePointFolder({ companyId, folderPath });
		} catch (e) {
			Alert.alert('Kunde inte öppna SharePoint', e?.message || 'Okänt fel');
		}
	};

	const rightActions = (
		<View style={styles.actionsRow}>
			{!hasStructure ? (
				<Pressable
					onPress={() => setStructurePickerOpen(true)}
					style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
				>
					<Text style={styles.primaryBtnText}>Välj struktur</Text>
				</Pressable>
			) : (
				<Pressable
					onPress={() => setStructurePickerOpen(true)}
					style={({ pressed }) => [styles.ghostBtn, pressed && styles.btnPressed]}
				>
					<Text style={styles.ghostBtnText}>Ändra struktur</Text>
				</Pressable>
			)}

		</View>
	);

	return (
		<DocumentListSurface
			title="Inköp och offerter"
			subtitle="Byggdelar och förfrågningar"
			statusLine={structureStatusLine}
			rightActions={rightActions}
		>
			<StructurePickerModal
				visible={structurePickerOpen}
				value={structureMode}
				onClose={() => setStructurePickerOpen(false)}
				onConfirm={async (mode) => {
					try {
						await setMode(mode);
					} finally {
						setStructurePickerOpen(false);
					}
				}}
			/>

			{hasStructure && structureMode === RFQ_STRUCTURE_MODES.MANUAL_FOLDERS ? (
				<View style={styles.manualWrap}>
					<Text style={styles.manualTitle}>Du använder valfri mappstruktur</Text>
					<Text style={styles.manualHint}>
						I detta läge används ingen byggdelstabell. Organisera förfrågningar direkt i SharePoint.
					</Text>
					<Pressable
						onPress={openForfragningarRootFolder}
						style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
					>
						<Text style={styles.primaryBtnText}>Öppna SharePoint-mapp</Text>
					</Pressable>
					{forfragningarRootPath ? (
						<Text style={styles.manualPath} numberOfLines={2}>{`/${forfragningarRootPath}`}</Text>
					) : null}
				</View>
			) : null}

			{showTable ? (
				<View style={styles.table}>
					<View
						style={[styles.tableInnerWrap, !tableEnabled ? styles.tableInnerWrapDisabled : null]}
						pointerEvents={tableEnabled ? 'auto' : 'none'}
					>
						<View style={styles.tableHeader}>
							<Text style={[styles.th, styles.colNr]} numberOfLines={1}>Nr</Text>
							<Text style={[styles.th, styles.colDesc]} numberOfLines={1}>Beskrivning</Text>
							<Text style={[styles.th, styles.colGroup]} numberOfLines={1}>Kategori/disciplin</Text>
							<Text style={[styles.th, styles.colCount]} numberOfLines={1}>Leverantörer</Text>
							<Text style={[styles.th, styles.colStatus]} numberOfLines={1}>Status</Text>
							<View style={[styles.colChevron]} />
						</View>

						<View style={styles.tableHelpRow}>
							<View style={styles.helpInputs}>
								<TextInput
									placeholder="Nr"
									value={newByggdelCode}
									onChangeText={setNewByggdelCode}
									editable={tableEnabled}
									style={[styles.input, styles.inputNr, !tableEnabled && styles.inputDisabled]}
								/>
								<TextInput
									placeholder="Beskrivning"
									value={newByggdelLabel}
									onChangeText={setNewByggdelLabel}
									editable={tableEnabled}
									style={[styles.input, styles.inputDesc, !tableEnabled && styles.inputDisabled]}
								/>
								<TextInput
									placeholder="Kategori/disciplin"
									value={newByggdelGroup}
									onChangeText={setNewByggdelGroup}
									editable={tableEnabled}
									style={[styles.input, styles.inputGroup, !tableEnabled && styles.inputDisabled]}
								/>
							</View>
							<View style={styles.helpActions}>
								{safeText(editingByggdelId) ? (
									<Pressable
										onPress={cancelEditByggdel}
										style={({ pressed }) => [styles.ghostBtnSmall, pressed && styles.btnPressed]}
									>
										<Text style={styles.ghostBtnSmallText}>Avbryt</Text>
									</Pressable>
								) : null}
								<Pressable
									onPress={handleAddByggdel}
									disabled={!tableEnabled || creatingByggdel || !safeText(newByggdelLabel)}
									style={({ pressed }) => [styles.secondaryBtn, (!tableEnabled || creatingByggdel || !safeText(newByggdelLabel)) && styles.btnDisabled, pressed && styles.btnPressed]}
								>
									<Text style={styles.secondaryBtnText}>
										{creatingByggdel ? 'Sparar…' : safeText(editingByggdelId) ? 'Spara' : 'Lägg till'}
									</Text>
								</Pressable>
							</View>
						</View>

						{loading ? (
							<View style={styles.loadingBox}>
								<ActivityIndicator />
								<Text style={styles.loadingText}>Laddar byggdelar…</Text>
							</View>
						) : (
							<ScrollView style={styles.tableScrollWrap} contentContainerStyle={styles.tableInner}>
								{byggdelSorted.length === 0 ? (
									<View style={styles.emptyRow}>
										<Text style={styles.emptyTitle}>Inga discipliner</Text>
										<Text style={styles.emptyHint}>Skapa en disciplin och koppla UE/leverantörer.</Text>
									</View>
								) : null}

								{byggdelSorted.map((bd) => {
									const bid = safeText(bd?.id);
									const expanded = Boolean(expandedById?.[bid]);
									return (
										<ByggdelRowAccordion
											key={bid}
											byggdel={bd}
											expanded={expanded}
											onToggle={() => toggleByggdel(bid)}
											packages={(packagesByByggdel?.[bid] || []).filter((p) => !p?.deleted)}
											suppliers={suppliers}
											contacts={contacts}
											project={project}
											onPickSupplier={async (s) => {
												try {
													await addSupplierFromRegistry(bd, s);
												} catch (e) {
													Alert.alert('Kunde inte lägga till', e?.message || 'Okänt fel');
												}
											}}
											onCreateSupplier={async (name) => {
												try {
													await createAndAddSupplier(bd, name);
												} catch (e) {
													Alert.alert('Kunde inte skapa', e?.message || 'Okänt fel');
												}
											}}
											onPickContact={async (pkg, contact) => {
												try {
													await pickContactForPackage(pkg, contact);
												} catch (e) {
													Alert.alert('Kunde inte koppla kontakt', e?.message || 'Okänt fel');
												}
											}}
											onCreateContact={async (pkg, name) => {
												try {
													await createContactForPackage(pkg, name);
												} catch (e) {
													Alert.alert('Kunde inte skapa kontakt', e?.message || 'Okänt fel');
												}
											}}
											onEditByggdel={startEditByggdel}
											onRemoveByggdel={removeByggdel}
											onSetStatus={setPackageStatus}
											onUpdatePackage={updatePackage}
											onOpenFolder={openFolder}
											onRemove={removePackage}
											canOpenFolder={canOpenFolder}
										/>
									);
								})}
							</ScrollView>
						)}
					</View>

					{!tableEnabled ? (
						<View pointerEvents="none" style={styles.tableOverlay}>
							<Text style={styles.overlayText}>Välj struktur för att börja arbeta med förfrågningar</Text>
						</View>
					) : null}
				</View>
			) : null}

			{suppliersLoading ? (
				<Text style={styles.footerHint}>Laddar leverantörsregister…</Text>
			) : null}
			{forfragningarRootPath ? (
				<Text style={styles.footerHint} numberOfLines={1}>{`SharePoint: /${forfragningarRootPath}`}</Text>
			) : (
				<Text style={styles.footerHint}>SharePoint: saknar projektets basväg.</Text>
			)}
		</DocumentListSurface>
	);
}

const styles = StyleSheet.create({
	actionsRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	primaryBtn: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 10,
		backgroundColor: '#0f172a',
		...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
	},
	primaryBtnText: {
		color: '#fff',
		fontSize: 12,
		fontWeight: '500',
	},
	ghostBtn: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#E2E8F0',
		backgroundColor: '#fff',
		...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
	},
	ghostBtnText: {
		color: '#0f172a',
		fontSize: 12,
		fontWeight: '500',
	},
	secondaryBtn: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 10,
		backgroundColor: '#334155',
		...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
	},
	secondaryBtnText: {
		color: '#fff',
		fontSize: 12,
		fontWeight: '500',
	},
	btnDisabled: {
		opacity: 0.5,
	},
	btnPressed: {
		opacity: 0.9,
	},
	table: {
		flex: 1,
		minHeight: 0,
		borderWidth: 1,
		borderColor: '#E6E8EC',
		borderRadius: 12,
		overflow: 'hidden',
		position: 'relative',
	},
	tableInnerWrap: {
		flex: 1,
		minHeight: 0,
	},
	tableInnerWrapDisabled: {
		opacity: 0.5,
	},
	tableOverlay: {
		position: 'absolute',
		left: 12,
		right: 12,
		top: 56,
		bottom: 12,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 18,
	},
	overlayText: {
		fontSize: 12,
		fontWeight: '400',
		color: '#475569',
		textAlign: 'center',
		lineHeight: 18,
	},
	tableHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		paddingVertical: 6,
		paddingHorizontal: 12,
		backgroundColor: '#F1F5F9',
		borderBottomWidth: 2,
		borderBottomColor: '#E2E8F0',
	},
	th: {
		fontSize: 12,
		fontWeight: '500',
		color: '#334155',
	},
	colNr: {
		width: 70,
	},
	colDesc: {
		flexGrow: 2,
		flexShrink: 1,
		flexBasis: 0,
		minWidth: 0,
	},
	colGroup: {
		width: 220,
		minWidth: 0,
	},
	colCount: {
		width: 140,
	},
	colStatus: {
		width: 110,
	},
	colChevron: {
		width: 28,
	},
	tableHelpRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#EEF2F7',
		backgroundColor: '#fff',
	},
	helpInputs: {
		flex: 1,
		minWidth: 0,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	helpActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	ghostBtnSmall: {
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#E2E8F0',
		backgroundColor: '#fff',
		...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
	},
	ghostBtnSmallText: {
		fontSize: 12,
		fontWeight: '500',
		color: '#64748b',
	},
	input: {
		borderWidth: 1,
		borderColor: '#E2E8F0',
		backgroundColor: '#fff',
		borderRadius: 10,
		paddingVertical: 8,
		paddingHorizontal: 10,
		fontSize: 13,
		color: '#0f172a',
	},
	inputDisabled: {
		opacity: 0.7,
	},
	inputNr: {
		width: 70,
	},
	inputDesc: {
		flex: 1,
		minWidth: 140,
	},
	inputGroup: {
		width: 200,
	},
	tableScrollWrap: {
		flex: 1,
		minHeight: 0,
	},
	tableInner: {
		paddingBottom: 10,
	},
	loadingBox: {
		padding: 18,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 10,
	},
	loadingText: {
		fontSize: 12,
		fontWeight: '500',
		color: '#64748b',
	},
	emptyRow: {
		paddingVertical: 18,
		paddingHorizontal: 12,
		gap: 6,
	},
	emptyTitle: {
		fontSize: 13,
		fontWeight: '500',
		color: '#0f172a',
	},
	emptyHint: {
		fontSize: 12,
		color: '#64748b',
		lineHeight: 18,
	},
	footerHint: {
		marginTop: 10,
		fontSize: 11,
		color: '#94A3B8',
	},
	manualWrap: {
		borderWidth: 1,
		borderColor: '#E6E8EC',
		borderRadius: 12,
		backgroundColor: '#fff',
		padding: 14,
		gap: 10,
		marginBottom: 12,
	},
	manualTitle: {
		fontSize: 13,
		fontWeight: '500',
		color: '#0f172a',
	},
	manualHint: {
		fontSize: 12,
		fontWeight: '400',
		color: '#475569',
		lineHeight: 18,
	},
	manualPath: {
		fontSize: 11,
		color: '#64748b',
	},
});
