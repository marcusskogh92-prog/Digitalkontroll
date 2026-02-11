import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * SharePointSiteIcon
 *
 * Moln-ikon för att representera en SharePoint-site.
 * status: 'ok' = grön indikator (synkar/live), 'error' = röd (fel/inte synkar), 'syncing' = synkar
 */
export default function SharePointSiteIcon({ size = 22, color = '#2563EB', status = null, style }) {
  const iconSize = size;
  const dotSize = Math.max(8, iconSize * 0.48);

  const statusColor =
    status === 'ok' ? '#22C55E' : status === 'error' ? '#DC2626' : status === 'syncing' ? '#2563EB' : null;

  return (
    <View style={[{ position: 'relative', width: iconSize, height: iconSize }, style]}>
      <Svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
      >
        <Path
          d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
      {statusColor ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: statusColor,
            borderWidth: 1.2,
            borderColor: '#fff',
          }}
        />
      ) : null}
    </View>
  );
}
