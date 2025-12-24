


import { useEffect, useState } from 'react';
import { fetchHierarchy } from './firebase';





function ProjectSidebar({ onSelectProject }) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);

  // Ange ditt företags-ID här (eller hämta dynamiskt från inloggning)
  const companyId = 'testdemo';

  useEffect(() => {
    setLoading(true);
    fetchHierarchy(companyId).then(items => {
      setHierarchy(items || []);
      setLoading(false);
    });
  }, []);

  // Filtrera projekt baserat på söksträng (namn eller "nummer")
  const filterTree = (tree) => tree
    .map(group => {
      const filteredSubs = (group.children || []).map(sub => {
        const filteredProjects = (sub.children || []).filter(project =>
          project.name.toLowerCase().includes(search.toLowerCase()) ||
          String(project.id).toLowerCase().includes(search.toLowerCase())
        );
        return { ...sub, children: filteredProjects };
      }).filter(sub => sub.children.length > 0 || sub.name.toLowerCase().includes(search.toLowerCase()));
      return { ...group, children: filteredSubs };
    })
    .filter(group => group.children.length > 0 || group.name.toLowerCase().includes(search.toLowerCase()));

  const filteredGroups = filterTree(hierarchy);

  const toggleGroup = (id) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSub = (id) => setExpandedSubs(prev => ({ ...prev, [id]: !prev[id] }));

  if (loading) {
    return (
      <div style={{ width: 280, padding: 16, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', color: '#888' }}>
        Laddar projektlista...
      </div>
    );
  }

  return (
    <div style={{ width: 280, background: '#f7f7f7', height: '100vh', overflowY: 'auto', borderRight: '1px solid #ddd', padding: 16, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif' }}>
      <h3 style={{ marginTop: 0, fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', fontWeight: 700, letterSpacing: 0.2 }}>Projektlista</h3>
      <input
        type="text"
        placeholder="Sök projektnamn eller nr..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          margin: '8px 0 8px 0',
          borderRadius: 8,
          border: '1px solid #bbb',
          fontSize: 15,
          fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <hr style={{ border: 0, borderTop: '1px solid #e0e0e0', margin: '12px 0 16px 0' }} />
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {filteredGroups.length === 0 && (
          <li style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 24 }}>Inga projekt hittades.</li>
        )}
        {filteredGroups.map(group => (
          <li key={group.id}>
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleGroup(group.id)}>
              <span style={{ color: '#1976d2', fontSize: 18, fontWeight: 700, marginRight: 6, display: 'inline-block', transform: expandedGroups[group.id] ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&gt;</span>
              <span style={{ fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: 0.1 }}>{group.name}</span>
            </div>
            {expandedGroups[group.id] && group.children.length > 0 && (
              <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 4 }}>
                {group.children.map(sub => (
                  <li key={sub.id}>
                    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSub(sub.id)}>
                      <span style={{ color: '#1976d2', fontSize: 15, fontWeight: 600, marginRight: 6, display: 'inline-block', transform: expandedSubs[sub.id] ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&gt;</span>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{sub.name}</span>
                    </div>
                    {expandedSubs[sub.id] && sub.children.length > 0 && (
                      <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 2 }}>
                        {sub.children.map(project => (
                          <li key={project.id}>
                            <button
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                color: '#1976d2',
                                fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                                fontSize: 15,
                                letterSpacing: 0.1,
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                justifyContent: 'space-between',
                              }}
                              onClick={() => onSelectProject && onSelectProject(project)}
                            >
                              <span>{project.name}</span>
                              <span style={{ color: '#1976d2', fontSize: 18, marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}>&gt;</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ProjectSidebar;
