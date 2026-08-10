import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import ProductModel from './ProductModel';

interface SceneBlock {
  productId: string;
  name: string;
  x: number;
  y: number;
  areaM2: number;
  color: string;
}

interface SceneProps {
  blocks: SceneBlock[];
  widthM: number;
  heightM: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function Scene({ blocks, widthM, heightM, selectedId, onSelect }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [widthM / 2, widthM * 0.6, heightM], fov: 50 }}
      style={{ background: '#0a0e14' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[50, 80, 50]} intensity={1} />

      <Grid
        args={[widthM, heightM]}
        position={[widthM / 2, 0, heightM / 2]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#21262d"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#30363d"
        fadeDistance={200}
        infiniteGrid={false}
      />

      {blocks.map((b) => {
        const side = Math.sqrt(b.areaM2 || 4);
        return (
          <ProductModel
            key={b.productId}
            name={b.name}
            x={b.x}
            y={b.y}
            width={side}
            depth={side}
            height={side * 0.5}
            color={b.color}
            selected={selectedId === b.productId}
            onClick={() => onSelect(b.productId)}
          />
        );
      })}

      <OrbitControls target={[widthM / 2, 0, heightM / 2]} />

      <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.8} />
      </GizmoHelper>
    </Canvas>
  );
}
