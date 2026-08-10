import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme, Spin } from 'antd';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Products from './pages/Products';
import Layouts from './pages/Layouts';
import Reports from './pages/Reports';

const LayoutEditor = lazy(() => import('./pages/LayoutEditor'));
const Viewer3D = lazy(() => import('./pages/Viewer3D'));

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <BrowserRouter>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0d1117' }}><Spin size="large" /></div>}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/project/:projectId/layout/:layoutId" element={<LayoutEditor />} />
              <Route path="/project/:projectId/layout/:layoutId/3d" element={<Viewer3D />} />
              <Route path="/project/:projectId" element={<ProjectDetail />}>
                <Route index element={<Navigate to="products" replace />} />
                <Route path="products" element={<Products />} />
                <Route path="layouts" element={<Layouts />} />
                <Route path="reports" element={<Reports />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
