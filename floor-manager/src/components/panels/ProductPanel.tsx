interface ProductPanelProps {
  products: any[];
  placedIds: Set<string>;
  onAddToCanvas: (product: any) => void;
}

export default function ProductPanel({ products, placedIds, onAddToCanvas }: ProductPanelProps) {
  return (
    <div style={{ width: 220, background: '#161b22', borderRight: '1px solid #30363d', overflowY: 'auto' }}>
      <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', borderBottom: '1px solid #21262d' }}>
        San pham (keo tha)
      </div>
      {products.map((p) => (
        <div
          key={p.id}
          onClick={() => !placedIds.has(p.id) && onAddToCanvas(p)}
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: placedIds.has(p.id) ? 'default' : 'pointer',
            opacity: placedIds.has(p.id) ? 0.4 : 1,
            borderBottom: '1px solid #21262d',
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#e1e4e8' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>
              {p.code} | {p.areaM2 ?? '?'}m2 | {p.processStage ?? '-'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
