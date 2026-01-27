import ProjectSidebar from './ProjectSidebar';
import AdminSidebar from './common/AdminSidebar';
import CompanyBanner from './common/CompanyBanner';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from './common/layoutConstants';

const MainLayout = ({ children, onSelectProject, rightPanel = null, sidebarTitle, sidebarSearchPlaceholder, sidebarCompaniesMode, sidebarShowMembers = false, topBar = null, sidebarRestrictCompanyId = null, sidebarHideCompanyActions = false, sidebarAutoExpandMembers = false, sidebarSearchMembersOnly = false, sidebarAllowCompanyManagementActions = true, sidebarIconName = null, sidebarIconColor = null, sidebarControlTypesMode = false, sidebarSelectedCompanyId = null, sidebarOnAddMainFolder = null, adminMode = false, adminCurrentScreen = null, adminOnSelectCompany = null, adminShowCompanySelector = true, adminCompanyBannerOnEdit = null, adminHideCompanyBanner = false }) => {
  const showCompanyBanner = adminMode && sidebarSelectedCompanyId && !adminHideCompanyBanner;

  let backgroundImageUrl = null;
  try {
    // Match dashboard background image (used in HomeScreen)
    const mod = require('../assets/images/inlogg.webb.png');
    backgroundImageUrl = (mod && (mod.default || mod)) || null;
  } catch (_e) {
    backgroundImageUrl = null;
  }

  return (
	<div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: backgroundImageUrl ? `url(${backgroundImageUrl}) center / cover no-repeat` : '#f4f6fa',
        fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.12)', zIndex: 0 }} />

      {topBar ? (
        <div
          style={{
            width: '100%',
            borderBottom: '1px solid rgba(25, 118, 210, 0.3)',
            background: 'transparent',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {topBar}
        </div>
      ) : null}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        {adminMode ? (
          <AdminSidebar
            currentScreen={adminCurrentScreen}
            selectedCompanyId={sidebarSelectedCompanyId}
            onSelectCompany={adminOnSelectCompany || onSelectProject}
            showCompanySelector={adminShowCompanySelector}
          />
        ) : (
          <ProjectSidebar
            onSelectProject={onSelectProject}
            title={sidebarTitle}
            iconName={sidebarIconName}
            iconColor={sidebarIconColor}
            searchPlaceholder={sidebarSearchPlaceholder}
            companiesMode={sidebarCompaniesMode}
            showMembers={sidebarShowMembers}
            restrictCompanyId={sidebarRestrictCompanyId}
            hideCompanyActions={sidebarHideCompanyActions}
            autoExpandMembers={sidebarAutoExpandMembers}
            memberSearchMode={sidebarSearchMembersOnly}
            allowCompanyManagementActions={sidebarAllowCompanyManagementActions}
            controlTypesMode={sidebarControlTypesMode}
            selectedCompanyId={sidebarSelectedCompanyId}
            onAddMainFolder={sidebarOnAddMainFolder}
          />
        )}
        <div style={{ flex: 1, paddingTop: 32, paddingLeft: 32, paddingRight: 32, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
            {showCompanyBanner && (
              <CompanyBanner 
                companyId={sidebarSelectedCompanyId} 
                onEdit={adminCompanyBannerOnEdit}
              />
            )}
            {children}
          </div>
        </div>
        {rightPanel ? (
          <div style={{ width: 340, borderLeft: '1px solid #e6e6e6', background: '#f7fafc', padding: 16 }}>{rightPanel}</div>
        ) : null}
      </div>
    </div>
  );
};

export default MainLayout;
