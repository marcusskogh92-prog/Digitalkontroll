import { Platform, StyleSheet, Text, View } from 'react-native';

function safeText(v) {
	if (v === null || v === undefined) return '';
	return String(v).trim();
}

export default function DocumentListSurface({
	title,
	subtitle,
	statusLine,
	rightActions,
	children,
	backgroundTransparent = false,
}) {
	return (
		<View style={[styles.container, backgroundTransparent ? styles.containerOverBackground : null]}>
			<View style={styles.contentCard}>
				<View style={styles.headerRow}>
					<View style={{ flex: 1, minWidth: 0 }}>
						{safeText(title) ? <Text style={styles.title}>{safeText(title)}</Text> : null}
						{safeText(subtitle) ? <Text style={styles.subtitle}>{safeText(subtitle)}</Text> : null}
						{safeText(statusLine) ? <Text style={styles.statusLine}>{safeText(statusLine)}</Text> : null}
					</View>
					{rightActions ? <View style={styles.rightActions}>{rightActions}</View> : null}
				</View>
				{children}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		padding: 18,
		backgroundColor: '#fff',
	},
	containerOverBackground: {
		backgroundColor: 'transparent',
	},
	contentCard: {
		flex: 1,
		minHeight: 0,
		borderRadius: 16,
		backgroundColor: 'rgba(255,255,255,0.92)',
		borderWidth: 1,
		borderColor: 'rgba(226,232,240,0.9)',
		padding: 16,
	},
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		marginBottom: 12,
	},
	title: {
		fontSize: 18,
		fontWeight: '500',
		color: '#0f172a',
	},
	subtitle: {
		marginTop: 4,
		fontSize: 12,
		fontWeight: '500',
		color: '#64748b',
	},
	statusLine: {
		marginTop: 6,
		fontSize: 12,
		fontWeight: '400',
		color: '#475569',
	},
	rightActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		...(Platform.OS === 'web' ? { flexWrap: 'wrap', justifyContent: 'flex-end' } : {}),
	},
});
