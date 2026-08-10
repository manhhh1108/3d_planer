import { Rect, Text, Group } from 'react-konva';
import type Konva from 'konva';

interface ProductBlockProps {
  id: string;
  name: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation: number;
  selected: boolean;
  gridSize: number;
  scale: number;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}

export default function ProductBlock({
  id, name, x, y, width, height, color, rotation,
  selected, gridSize, scale, onSelect, onDragEnd,
}: ProductBlockProps) {
  const pxW = width * scale;
  const pxH = height * scale;
  const pxX = x * scale;
  const pxY = y * scale;
  const snapStep = gridSize * scale;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const snappedX = Math.round(e.target.x() / snapStep) * snapStep;
    const snappedY = Math.round(e.target.y() / snapStep) * snapStep;
    e.target.x(snappedX);
    e.target.y(snappedY);
    onDragEnd(id, snappedX / scale, snappedY / scale);
  };

  return (
    <Group
      x={pxX}
      y={pxY}
      rotation={rotation}
      draggable
      onClick={() => onSelect(id)}
      onTap={() => onSelect(id)}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={pxW}
        height={pxH}
        fill={color + '25'}
        stroke={selected ? '#58a6ff' : color}
        strokeWidth={selected ? 2 : 1.5}
        cornerRadius={2}
      />
      <Text
        text={name}
        width={pxW}
        height={pxH}
        align="center"
        verticalAlign="middle"
        fill={color}
        fontSize={11}
        fontStyle="bold"
      />
    </Group>
  );
}
