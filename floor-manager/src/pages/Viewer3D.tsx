import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import Scene from '@/components/viewer3d/Scene';
import PropertyPanel from '@/components/panels/PropertyPanel';

export default function Viewer3D() {
  const { layoutId, projectId } = useParams<{ layoutId: string; projectId: string }>();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!layoutId) return;
    api.getLayout(layoutId).then((l) => {
      setLayout(l);
      if (l.snapshots?.[0]) {
        api.getSnapshot(l.snapshots[0].id).then((snap: any) => {
          setBlocks(snap.positions.map((pos: any) => ({
            productId: pos.productId,
            name: pos.product.name,
            x: pos.x,
            y: pos.y,
            areaM2: pos.product.areaM2,
            color: pos.product.color,
            product: pos.product,
            rotation: pos.rotation,
          })));
        });
      }
    });
  }, [layoutId]);

  if (!layout) return <Spin size="large" />;

  const selectedBlock = blocks.find((b) => b.productId === selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
      <div style={{ padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${projectId}/layout/${layoutId}`)}>
            Quay lai 2D
          </Button>
          <span style={{ color: '#58a6ff', fontWeight: 600 }}>{layout.name} - 3D Viewer</span>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ flex: 1 }}>
          <Scene
            blocks={blocks}
            widthM={layout.widthM}
            heightM={layout.heightM}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <PropertyPanel
          product={selectedBlock?.product ?? null}
          position={selectedBlock ? { x: selectedBlock.x, y: selectedBlock.y, rotation: selectedBlock.rotation } : null}
        />
      </div>
    </div>
  );
}
