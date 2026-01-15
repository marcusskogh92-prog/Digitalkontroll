import ProjectSidebar from './ProjectSidebar';

const MainLayout = ({ children, onSelectProject, rightPanel = null, sidebarTitle, sidebarSearchPlaceholder, sidebarCompaniesMode, sidebarShowMembers = false, topBar = null, sidebarRestrictCompanyId = null, sidebarHideCompanyActions = false, sidebarAutoExpandMembers = false, sidebarSearchMembersOnly = false, sidebarAllowCompanyManagementActions = true, sidebarIconName = null, sidebarIconColor = null, sidebarControlTypesMode = false }) => {
  const topBarHeight = topBar ? 96 : 0;
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fa', fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif' }}>
      {topBar ? <div style={{ width: '100%', borderBottom: '1px solid #e6e6e6', background: '#fff' }}>{topBar}</div> : null}
      <div style={{ display: 'flex', minHeight: `calc(100vh - ${topBarHeight}px)` }}>
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
        />
        <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>
          {children}
        </div>
        {rightPanel ? (
          <div style={{ width: 340, borderLeft: '1px solid #e6e6e6', background: '#f7fafc', padding: 16 }}>{rightPanel}</div>
        ) : null}
      </div>
    </div>
  );
};

export default MainLayout;
