import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message } from 'antd';
import { SaveOutlined, FilePdfOutlined } from '@ant-design/icons';
import { api } from '@/api/client';
import LayoutCanvas from '@/components/canvas/LayoutCanvas';
import ProductBlock from '@/components/canvas/ProductBlock';
import ProductPanel from '@/components/panels/ProductPanel';
import PropertyPanel from '@/components/panels/PropertyPanel';
import TimelineBar from '@/components/panels/TimelineBar';
import { exportLayoutPDF } from '@/utils/pdf-export';

interface BlockState {
  productId: string;
  product: any;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const SCALE = 10;

export default function LayoutEditor() {
  const { layoutId, projectId } = useParams<{ layoutId: string; projectId: string }>();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<BlockState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    if (!layoutId || !projectId) return;
    Promise.all([
      api.getLayout(layoutId),
      api.getProducts(projectId),
    ]).then(([l, p]) => {
      setLayout(l);
      setProducts(p);
      api.getSnapshots(layoutId).then((snaps) => {
        setSnapshots(snaps);
        if (snaps.length > 0) {
          setActiveSnapshotId(snaps[0].id);
        }
      });
      if (l.snapshots?.[0]) {
        api.getSnapshot(l.snapshots[0].id).then((snap: any) => {
          setBlocks(snap.positions.map((pos: any) => ({
            productId: pos.productId,
            product: pos.product,
            x: pos.x,
            y: pos.y,
            rotation: pos.rotation,
            scale: pos.scale,
          })));
        });
      }
    });
  }, [layoutId, projectId]);

  const handleAddToCanvas = useCallback((product: any) => {
    setBlocks((prev) => [...prev, {
      productId: product.id,
      product,
      x: 5,
      y: 5,
      rotation: 0,
      scale: 1,
    }]);
  }, []);

  const handleDragEnd = useCallback((productId: string, x: number, y: number) => {
    setBlocks((prev) => prev.map((b) => (b.productId === productId ? { ...b, x, y } : b)));
  }, []);

  const handleSaveSnapshot = async () => {
    if (!layoutId) return;
    const today = new Date().toISOString().split('T')[0];
    await api.saveSnapshot({
      layoutId,
      date: today,
      positions: blocks.map((b) => ({
        productId: b.productId,
        x: b.x,
        y: b.y,
        rotation: b.rotation,
        scale: b.scale,
      })),
    });
    message.success(`Da luu snapshot ngay ${today}`);
    const updatedSnaps = await api.getSnapshots(layoutId);
    setSnapshots(updatedSnaps);
    setActiveSnapshotId(updatedSnaps[0]?.id ?? null);
  };

  const handleSelectSnapshot = async (snapshotId: string) => {
    const snap = await api.getSnapshot(snapshotId);
    setBlocks(snap.positions.map((pos: any) => ({
      productId: pos.productId,
      product: pos.product,
      x: pos.x,
      y: pos.y,
      rotation: pos.rotation,
      scale: pos.scale,
    })));
    setActiveSnapshotId(snapshotId);
    setSelectedId(null);
  };

  const handleExportPDF = () => {
    const stage = document.querySelector('canvas') as HTMLCanvasElement;
    const canvasImage = stage ? stage.toDataURL('image/png') : '';
    const totalArea = blocks.reduce((s, b) => s + (b.product.areaM2 ?? 0), 0);
    const layoutArea = layout.widthM * layout.heightM;

    exportLayoutPDF({
      projectName: layout.name,
      layoutName: layout.name,
      date: new Date().toISOString().split('T')[0],
      canvasImage,
      positions: blocks.map((b) => ({
        name: b.product.name,
        code: b.product.code,
        x: b.x,
        y: b.y,
        areaM2: b.product.areaM2 ?? 0,
        weightKg: b.product.weightKg ?? 0,
        processStage: b.product.processStage ?? '',
      })),
      totalArea,
      layoutArea,
      usageRate: layoutArea > 0 ? (totalArea / layoutArea) * 100 : 0,
    });
    message.success('Da xuat PDF');
  };

  if (!layout) return <Spin size="large" />;

  const selectedBlock = blocks.find((b) => b.productId === selectedId);
  const placedIds = new Set(blocks.map((b) => b.productId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: '#58a6ff', fontWeight: 600 }}>{layout.name} ({layout.widthM}m x {layout.heightM}m)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveSnapshot}>Save Snapshot</Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPDF}>Export PDF</Button>
          <Button onClick={() => navigate(`/project/${projectId}/layout/${layoutId}/3d`)}>View 3D</Button>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProductPanel products={products} placedIds={placedIds} onAddToCanvas={handleAddToCanvas} />
        <LayoutCanvas widthM={layout.widthM} heightM={layout.heightM} gridSize={layout.gridSize}>
          {blocks.map((b) => (
            <ProductBlock
              key={b.productId}
              id={b.productId}
              name={b.product.name}
              code={b.product.code}
              x={b.x}
              y={b.y}
              width={Math.sqrt(b.product.areaM2 ?? 4)}
              height={Math.sqrt(b.product.areaM2 ?? 4)}
              color={b.product.color}
              rotation={b.rotation}
              selected={selectedId === b.productId}
              gridSize={layout.gridSize}
              scale={SCALE}
              onSelect={setSelectedId}
              onDragEnd={handleDragEnd}
            />
          ))}
        </LayoutCanvas>
        <PropertyPanel
          product={selectedBlock?.product ?? null}
          position={selectedBlock ? { x: selectedBlock.x, y: selectedBlock.y, rotation: selectedBlock.rotation } : null}
        />
      </div>
      <TimelineBar
        snapshots={snapshots}
        activeSnapshotId={activeSnapshotId}
        onSelect={handleSelectSnapshot}
      />
    </div>
  );
}
