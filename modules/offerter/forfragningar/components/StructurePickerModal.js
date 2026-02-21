import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import StandardModal from '../../../../components/common/StandardModal';
import { MODAL_THEME } from '../../../../constants/modalTheme';
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
		<StandardModal
			visible={!!visible}
			onClose={onClose}
			title="Välj struktur"
			subtitle="Förfrågningar"
			iconName="list-outline"
			saveLabel="Spara val"
			onSave={() => {
				if (!canConfirm) return;
				onConfirm?.(selected);
			}}
			saveDisabled={!canConfirm}
			defaultWidth={620}
			defaultHeight={420}
			minWidth={520}
			minHeight={340}
		>
			<View style={styles.body}>
				<Text style={styles.bodyIntro}>
					Välj hur förfrågningar ska organiseras i projektet.
				</Text>
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
			</View>
		</StandardModal>
	);
}

const styles = StyleSheet.create({
	body: {
		flex: 1,
		minHeight: 0,
		padding: 18,
	},
	bodyIntro: {
		fontSize: MODAL_THEME.body.labelFontSize,
		color: MODAL_THEME.body.labelColor,
		lineHeight: 18,
		marginBottom: 12,
	},
	options: {
		gap: 10,
	},
	option: {
		borderWidth: 1,
		borderColor: 'rgba(15, 23, 42, 0.14)',
		borderRadius: 12,
		padding: 12,
		backgroundColor: '#fff',
		...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
	},
	optionActive: {
		borderColor: 'rgba(15, 27, 45, 0.55)',
		backgroundColor: 'rgba(15, 27, 45, 0.04)',
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
		borderColor: 'rgba(15, 23, 42, 0.25)',
		backgroundColor: '#fff',
	},
	radioActive: {
		borderColor: MODAL_THEME.banner.backgroundColor,
		backgroundColor: MODAL_THEME.banner.backgroundColor,
	},
	optionTitle: {
		fontSize: MODAL_THEME.body.sectionTitleFontSize,
		fontWeight: '600',
		color: MODAL_THEME.body.valueColor,
	},
	optionLine: {
		fontSize: MODAL_THEME.body.labelFontSize,
		fontWeight: '400',
		color: MODAL_THEME.body.labelColor,
		lineHeight: 18,
	},
});
