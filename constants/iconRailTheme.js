/**
 * Theme för Icon Rail och Global Side Panel.
 * 8px grid, mörk neutral bakgrund.
 * 2026: Rail solid navy; Left/Center/Right med transparens + blur.
 */

/** 2026 panel-layout: bakgrund syns genom panelerna, rail solid, tydliga dividers */
export const LAYOUT_2026 = {
  /** Rail: helt solid, ingen transparens */
  railBg: '#1E2A38',
  /** Side panels (vänster + höger): tydligare än center, blur 12px – lägre opacity så bakgrunden syns */
  sidePanelBg: 'rgba(246, 248, 251, 0.78)',
  sidePanelBlurPx: 12,
  /** Center panel: svagare, blur 6px – mer transparent så bakgrunden syns tydligt */
  mainPanelBg: 'rgba(255, 255, 255, 0.72)',
  mainPanelBlurPx: 6,
  /** Divider mellan panelerna – subtil, premium */
  dividerColor: 'rgba(15, 23, 42, 0.08)',
  /** Native fallback (inga blur) – lätt grå så ingen helvit panel */
  mainPanelBgNative: '#fafbfc',
  sidePanelBgNative: '#f6f8fb',
};

export const ICON_RAIL = {
  /** Bredd i px (64–72 för 2026 SaaS) */
  width: 68,
  /** Bakgrund – solid mörk navy (Global Background System 2026) */
  bg: '#0f1b2d',
  /** Ikonstorlek 20–22px */
  iconSize: 21,
  /** Aktiv ikon: subtil bakgrund, radie i px */
  activeBgRadius: 8,
  /** Aktiv bakgrundsfärg */
  activeBg: 'rgba(255, 255, 255, 0.12)',
  /** Vänsterindikator för aktiv – samma som LEFT_NAV.rowBorderLeftWidth för consistency */
  activeLeftIndicatorWidth: 4,
  activeLeftIndicatorColor: '#2563EB',
  /** Hover bakgrundsfärg */
  hoverBg: 'rgba(255, 255, 255, 0.08)',
  /** Ikonfärg inaktiv */
  iconColor: 'rgba(255, 255, 255, 0.7)',
  /** Ikonfärg aktiv */
  iconColorActive: '#fff',
  /** Vertikal padding för ikonknapp (8px grid) */
  itemPaddingVertical: 8,
  itemPaddingHorizontal: 8,
  /** Transition för aktiv state (ms) */
  activeTransitionMs: 150,
  /** Transition för hover */
  hoverTransitionMs: 120,
};

/** Färger för progressbar (licensutnyttjande m.m.) */
export const PROGRESS_THEME = {
  /** 0–69%: neutral blå (primär) */
  low: '#2563EB',
  /** 70–89%: orange/gul varning */
  medium: '#f59e0b',
  /** 90%+: röd ton */
  high: '#dc2626',
  /** 90% varningsnotis bakgrund */
  warningBg: '#fffbeb',
  warningBorder: '#fcd34d',
};

export const GLOBAL_SIDE_PANEL = {
  /** Bredd i px (260–300) */
  width: 280,
  widthMin: 260,
  widthMax: 300,
  /** Bakgrund – 2026: translucent + blur (synkad med LAYOUT_2026.sidePanelBg) */
  bg: 'rgba(246, 248, 251, 0.78)',
  borderColor: 'rgba(15, 23, 42, 0.08)',
  /** Slide-in duration (ms) */
  slideDurationMs: 180,
  /** Easing för slide */
  slideEasing: 'ease',
};

/** 8px grid */
export const GRID = 8;
