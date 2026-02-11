// Central layout constants for DigitalKontroll.
//
// IMPORTANT LAYOUT RULE:
// Bottom spacing ("bottenluft") in the middle pane should be controlled centrally
// at the ScrollView content-root level. Screens/components should NOT add extra
// paddingBottom/marginBottom "just in case" to help scrolling.
//
// Use these constants everywhere so dashboard and project view feel like one product.

/** Bottom gutter in the middle pane (scroll content) */
export const DK_MIDDLE_PANE_BOTTOM_GUTTER = 16;

// --- Global header (Stack navigator bar: logo, search, company) ---
/** Height of the global app header (App.js Stack). Must match in App.js and MainLayout (top offset). */
export const GLOBAL_HEADER_HEIGHT = 96;

// --- Sub-header / user bar (HomeHeader: user, Nav, Administration, etc.) ---
/** Vertical padding for the user bar (HomeHeader) so its height is consistent. */
export const SUB_HEADER_PADDING_VERTICAL = 16;
/** Horizontal padding for the user bar. */
export const SUB_HEADER_PADDING_HORIZONTAL = 16;
/** Gap between items in the user bar (e.g. between Nav and Administration). */
export const SUB_HEADER_ITEM_GAP = 12;

// --- Header icons (Nav, Administration, Register, Notifications, SharePoint) ---
/** Size of header action icons for consistent look. Use everywhere. */
export const HEADER_ICON_SIZE = 20;

// --- Left sidebar (dashboard + project phase panel) ---
/** Background color for left sidebar. Same on start page and inside project. */
export const SIDEBAR_BG = '#f8fafc';
/** Border color for left sidebar right edge. */
export const SIDEBAR_BORDER_COLOR = '#e2e8f0';
/** Default width for phase left panel (inside project). Aligns with leftNavTheme. */
export const SIDEBAR_PHASE_WIDTH = 280;
