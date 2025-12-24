import ProjectSidebar from './ProjectSidebar';

const MainLayout = ({ children, onSelectProject }) => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f4f6fa' }}>
      <ProjectSidebar onSelectProject={onSelectProject} />
      <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
