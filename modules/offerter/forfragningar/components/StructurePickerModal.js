import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RFQ_STRUCTURE_MODES } from '../forfragningarModuleService';

function safeText(v) {
	if (v === null || v === undefined) return '';
	return String(v).trim();
}

function OptionCard({ title, descriptionLines, active, onPress }) {
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.option,
				active ? styles.optionActive : null,
				pressed ? styles.optionPressed : null,
			]}
			accessibilityRole="button"
		>
			<View style={styles.optionHeader}>
				<View style={[styles.radio, active ? styles.radioActive : null]} />
				<Text style={styles.optionTitle}>{title}</Text>
			</View>
			{(descriptionLines || []).map((line) => (
				<Text key={line} style={styles.optionLine}>
					{line}
				</Text>
			))}
		</Pressable>
	);
}

export default function StructurePickerModal({
	visible,
	value,
	onClose,
	onConfirm,
}) {
	const initial = useMemo(() => {
		return Object.values(RFQ_STRUCTURE_MODES).includes(value) ? value : null;
	}, [value]);

	const [selected, setSelected] = useState(initial);

	useEffect(() => {
		if (!visible) return;
		setSelected(initial);
	}, [visible, initial]);

	const canConfirm = Boolean(selected);

	return (
		<Modal
			visible={!!visible}
			transparent
			animationType={Platform.OS === 'web' ? 'none' : 'fade'}
			onRequestClose={onClose}
		>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<View style={styles.header}>
						<Text style={styles.title}>Välj struktur</Text>
						<Text style={styles.subtitle}>
							Välj hur förfrågningar ska organiseras i projektet.
						</Text>
					</View>

					<View style={styles.options}>
						<OptionCard
							title="Byggdelstabell"
							descriptionLines={[
								'Arbeta byggdel för byggdel i en tabell.',
								'Rader kan expanderas för UE/leverantörer.',
								'SharePoint-mappar skapas automatiskt.',
							]}
							active={selected === RFQ_STRUCTURE_MODES.COMPLETE_TABLE}
							onPress={() => setSelected(RFQ_STRUCTURE_MODES.COMPLETE_TABLE)}
						/>
						<OptionCard
							title="Valfri mappstruktur"
							descriptionLines={[
								'Ingen tabellstyrning i appen.',
								'Organisera endast via SharePoint-mappar.',
								'Du skapar mappar manuellt.',
							]}
							active={selected === RFQ_STRUCTURE_MODES.MANUAL_FOLDERS}
							onPress={() => setSelected(RFQ_STRUCTURE_MODES.MANUAL_FOLDERS)}
						/>
					</View>

					<View style={styles.footer}>
						<Pressable
							onPress={onClose}
							style={({ pressed }) => [styles.ghostBtn, pressed ? styles.btnPressed : null]}
						>
							<Text style={styles.ghostBtnText}>Avbryt</Text>
						</Pressable>

						<Pressable
							onPress={() => onConfirm?.(selected)}
							disabled={!canConfirm}
							style={({ pressed }) => [
								styles.primaryBtn,
								!canConfirm ? styles.btnDisabled : null,
								pressed && canConfirm ? styles.btnPressed : null,
							]}
						>
							<Text style={styles.primaryBtnText}>{safeText(selected) ? 'Spara val' : 'Välj ett alternativ'}</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(15, 23, 42, 0.45)',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 18,
	},
	card: {
		width: '100%',
		maxWidth: 560,
		borderRadius: 14,
		backgroundColor: '#fff',
		borderWidth: 1,
		borderColor: '#E2E8F0',
		padding: 14,
	},
	header: {
		gap: 6,
		marginBottom: 12,
	},
	title: {
		fontSize: 16,
		fontWeight: '500',
		color: '#0f172a',
	},
	subtitle: {
		fontSize: 12,
		fontWeight: '400',
		color: '#475569',
		lineHeight: 18,
	},
	options: {
		gap: 10,
	},
	option: {
		borderWidth: 1,
		borderColor: '#E2E8F0',
		borderRadius: 12,
		padding: 12,
		backgroundColor: '#fff',
		...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
	},
	optionActive: {
		borderColor: '#94A3B8',
		backgroundColor: '#F8FAFC',
	},
	optionPressed: {
		opacity: 0.9,
	},
	optionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 6,
	},
	radio: {
		width: 14,
		height: 14,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: '#CBD5E1',
		backgroundColor: '#fff',
	},
	radioActive: {
		borderColor: '#64748b',
		backgroundColor: '#64748b',
	},
	optionTitle: {
		fontSize: 13,
		fontWeight: '500',
		color: '#0f172a',
	},
	optionLine: {
		fontSize: 12,
		fontWeight: '400',
		color: '#475569',
		lineHeight: 18,
	},
	footer: {
		marginTop: 14,
		flexDirection: 'row',
		justifyContent: 'flex-end',
		gap: 10,
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
		fontSize: 12,
		fontWeight: '500',
		color: '#0f172a',
	},
	btnDisabled: {
		opacity: 0.5,
	},
	btnPressed: {
		opacity: 0.9,
	},
});
