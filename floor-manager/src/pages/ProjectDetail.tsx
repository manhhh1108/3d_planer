import { useEffect, useState } from 'react';
import { useParams, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Tabs, Spin } from 'antd';
import { api } from '@/api/client';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (projectId) api.getProject(projectId).then(setProject);
  }, [projectId]);

  if (!project) return <Spin size="large" />;

  const activeTab = location.pathname.includes('/products') ? 'products'
    : location.pathname.includes('/layouts') ? 'layouts'
    : location.pathname.includes('/reports') ? 'reports'
    : 'products';

  return (
    <div>
      <h2 style={{ color: '#f0f6fc', marginBottom: 16 }}>{project.name}</h2>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => navigate(`/project/${projectId}/${key}`)}
        items={[
          { key: 'products', label: 'San pham' },
          { key: 'layouts', label: 'Mat bang' },
          { key: 'reports', label: 'Bao cao' },
        ]}
      />
      <Outlet context={{ project, projectId }} />
    </div>
  );
}
