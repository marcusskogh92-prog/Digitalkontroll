/**
 * Tema och konstanter för AI Prompt Manager (drawer + list + editor).
 * Synkad med systemets modal/rail-tema.
 */

import { ICON_RAIL } from '../../constants/iconRailTheme';
import { MODAL_THEME } from '../../constants/modalTheme';

export const DRAWER_WIDTH = 820;
export const DRAWER_WIDTH_MIN = 720;
export const DRAWER_WIDTH_MAX = 900;

export const BANNER = {
  backgroundColor: ICON_RAIL.bg,
  borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  paddingVertical: 10,
  paddingHorizontal: 14,
  titleColor: MODAL_THEME.banner.titleColor,
  iconBg: MODAL_THEME.banner.iconBg,
  iconBgRadius: MODAL_THEME.banner.iconBgRadius,
  closeIconSize: 20,
};

export const PRIMARY = '#1e293b';
export const BORDER = '#E2E8F0';
export const BG_SUBTLE = '#F8FAFC';
export const TEXT_MUTED = '#64748b';
export const TEXT_BODY = '#334155';
export const TEXT_HEADING = '#0f172a';
export const RADIUS = 8;
export const RADIUS_CARD = 12;
export const GRID = 8;
