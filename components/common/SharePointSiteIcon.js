import Svg, { Rect } from 'react-native-svg';

/**
 * SharePointSiteIcon
 *
 * Byggnadsikon för att representera en SharePoint-site.
 * Implementerar den givna SVG:n via react-native-svg.
 */
export default function SharePointSiteIcon({ size = 22, color = '#2563EB', style }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* Building body */}
      <Rect x={4} y={3} width={16} height={18} rx={2} stroke={color} strokeWidth={2} fill="none" />

      {/* Windows */}
      <Rect x={7} y={7} width={2} height={2} fill={color} />
      <Rect x={11} y={7} width={2} height={2} fill={color} />
      <Rect x={15} y={7} width={2} height={2} fill={color} />

      <Rect x={7} y={11} width={2} height={2} fill={color} />
      <Rect x={11} y={11} width={2} height={2} fill={color} />
      <Rect x={15} y={11} width={2} height={2} fill={color} />

      {/* Door */}
      <Rect x={10} y={15} width={4} height={6} fill={color} />
    </Svg>
  );
}
