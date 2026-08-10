import { useRef, useState, useMemo } from 'react';
import { Box } from '@react-three/drei';
import * as THREE from 'three';
import type { Mesh } from 'three';

interface ProductModelProps {
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}

export default function ProductModel({
  name, x, y, width, depth, height, color, selected, onClick,
}: ProductModelProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const edges = useMemo(() => {
    if (!selected) return null;
    const geo = new THREE.BoxGeometry(width, height, depth);
    return new THREE.EdgesGeometry(geo);
  }, [selected, width, height, depth]);

  return (
    <group position={[x, height / 2, y]}>
      <Box
        ref={meshRef}
        args={[width, height, depth]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered || selected ? 0.8 : 0.5}
        />
      </Box>
      {edges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#58a6ff" />
        </lineSegments>
      )}
    </group>
  );
}
