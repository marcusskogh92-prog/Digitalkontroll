import ProjectSidebar from './ProjectSidebar';
import AdminSidebar from './common/AdminSidebar';
import CompanyBanner from './common/CompanyBanner';

const MainLayout = ({ children, onSelectProject, rightPanel = null, sidebarTitle, sidebarSearchPlaceholder, sidebarCompaniesMode, sidebarShowMembers = false, topBar = null, sidebarRestrictCompanyId = null, sidebarHideCompanyActions = false, sidebarAutoExpandMembers = false, sidebarSearchMembersOnly = false, sidebarAllowCompanyManagementActions = true, sidebarIconName = null, sidebarIconColor = null, sidebarControlTypesMode = false, sidebarSelectedCompanyId = null, sidebarOnAddMainFolder = null, adminMode = false, adminCurrentScreen = null, adminOnSelectCompany = null, adminShowCompanySelector = true, adminCompanyBannerOnEdit = null, adminHideCompanyBanner = false }) => {
  const topBarHeight = topBar ? 96 : 0;
  const showCompanyBanner = adminMode && sidebarSelectedCompanyId && !adminHideCompanyBanner;
  
  return (
    <div style={{ height: '100vh', maxHeight: '100vh', background: '#f4f6fa', fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', overflow: 'hidden' }}>
      {topBar ? <div style={{ width: '100%', borderBottom: '1px solid #e6e6e6', background: '#fff' }}>{topBar}</div> : null}
      <div style={{ display: 'flex', height: `calc(100vh - ${topBarHeight}px)`, maxHeight: `calc(100vh - ${topBarHeight}px)`, overflow: 'hidden' }}>
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
        <div style={{ flex: 1, padding: 32, paddingBottom: 80, overflowY: 'auto', overflowX: 'hidden', height: `calc(100vh - ${topBarHeight}px)`, maxHeight: `calc(100vh - ${topBarHeight}px)`, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minHeight: 'calc(100% - 32px)', paddingBottom: 60, width: '100%', maxWidth: 1200, margin: '0 auto' }}>
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
