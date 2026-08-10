import { Line, Text } from 'react-konva';

interface GridLayerProps {
  width: number;
  height: number;
  gridSize: number;
  scale: number;
}

export default function GridLayer({ width, height, gridSize, scale }: GridLayerProps) {
  const lines = [];
  const labels = [];
  const step = gridSize * scale;
  const majorEvery = 5;

  for (let i = 0; i <= width / step; i++) {
    const x = i * step;
    const isMajor = i % majorEvery === 0;
    lines.push(
      <Line key={`v-${i}`} points={[x, 0, x, height]} stroke={isMajor ? '#30363d' : '#21262d'} strokeWidth={isMajor ? 1 : 0.5} />
    );
    if (isMajor) {
      labels.push(
        <Text key={`vl-${i}`} x={x + 2} y={2} text={`${(i * gridSize).toFixed(0)}m`} fill="#484f58" fontSize={10} />
      );
    }
  }

  for (let i = 0; i <= height / step; i++) {
    const y = i * step;
    const isMajor = i % majorEvery === 0;
    lines.push(
      <Line key={`h-${i}`} points={[0, y, width, y]} stroke={isMajor ? '#30363d' : '#21262d'} strokeWidth={isMajor ? 1 : 0.5} />
    );
    if (isMajor) {
      labels.push(
        <Text key={`hl-${i}`} x={2} y={y + 2} text={`${(i * gridSize).toFixed(0)}m`} fill="#484f58" fontSize={10} />
      );
    }
  }

  return <>{lines}{labels}</>;
}
