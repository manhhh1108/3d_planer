import { Layout, Menu } from 'antd';
import {
  ProjectOutlined,
  AppstoreOutlined,
  LayoutOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';

const { Sider, Content, Header } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Extract projectId from current URL
  const match = location.pathname.match(/\/project\/([^/]+)/);
  const currentProjectId = match?.[1];

  const menuItems = [
    { key: '/', icon: <ProjectOutlined />, label: 'Du an' },
    { key: 'products', icon: <AppstoreOutlined />, label: 'San pham' },
    { key: 'layouts', icon: <LayoutOutlined />, label: 'Mat bang' },
    { key: 'reports', icon: <BarChartOutlined />, label: 'Bao cao' },
  ];

  // Determine selected key
  let selectedKey = '/';
  if (location.pathname.includes('/products')) selectedKey = 'products';
  else if (location.pathname.includes('/layout')) selectedKey = 'layouts';
  else if (location.pathname.includes('/reports')) selectedKey = 'reports';
  else if (currentProjectId) selectedKey = 'products';

  const handleMenuClick = (key: string) => {
    if (key === '/') {
      navigate('/');
    } else if (currentProjectId) {
      navigate(`/project/${currentProjectId}/${key}`);
    }
    // If no project selected, do nothing for project-specific items
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', background: '#141414' }}>
        <div
          style={{ color: '#58a6ff', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          Floor Manager
        </div>
      </Header>
      <Layout>
        <Sider width={200} theme="dark">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems.map((item) => ({
              ...item,
              disabled: item.key !== '/' && !currentProjectId,
            }))}
            onClick={({ key }) => handleMenuClick(key)}
          />
        </Sider>
        <Content style={{ padding: 24, background: '#0d1117' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
