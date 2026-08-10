import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import GridLayer from './GridLayer';

interface LayoutCanvasProps {
  widthM: number;
  heightM: number;
  gridSize: number;
  children?: React.ReactNode;
}

const INITIAL_SCALE = 10;

export default function LayoutCanvas({ widthM, heightM, gridSize, children }: LayoutCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stagePos, setStagePos] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const canvasWidth = widthM * INITIAL_SCALE;
  const canvasHeight = heightM * INITIAL_SCALE;

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = zoom;
    const pointer = stage.getPointerPosition()!;
    const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    setZoom(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, [zoom, stagePos]);

  return (
    <div ref={containerRef} style={{ flex: 1, background: '#0d1117', overflow: 'hidden' }}>
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        draggable
        onWheel={handleWheel}
        onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
      >
        <Layer>
          <GridLayer width={canvasWidth} height={canvasHeight} gridSize={gridSize} scale={INITIAL_SCALE} />
        </Layer>
        <Layer>{children}</Layer>
      </Stage>
    </div>
  );
}
