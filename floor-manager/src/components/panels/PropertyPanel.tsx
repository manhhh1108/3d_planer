interface PropertyPanelProps {
  product: any | null;
  position: { x: number; y: number; rotation: number } | null;
}

export default function PropertyPanel({ product, position }: PropertyPanelProps) {
  if (!product) {
    return (
      <div style={{ width: 260, background: '#161b22', borderLeft: '1px solid #30363d', padding: 16 }}>
        <div style={{ color: '#484f58', fontSize: 13 }}>Chon 1 block de xem thuoc tinh</div>
      </div>
    );
  }

  return (
    <div style={{ width: 260, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto' }}>
      <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', borderBottom: '1px solid #21262d' }}>
        Thuoc tinh
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
        <h4 style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>THONG TIN</h4>
        <Row label="Ten" value={product.name} />
        <Row label="Ma" value={product.code} />
        <Row label="Khoi luong" value={product.weightKg ? `${product.weightKg} kg` : '-'} />
        <Row label="Dien tich" value={product.areaM2 ? `${product.areaM2} m2` : '-'} />
        <Row label="Cong doan" value={product.processStage ?? '-'} />
        <Row label="Loai" value={product.category === 'thiet_bi' ? 'Thiet bi' : 'San pham'} />
      </div>
      {position && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
          <h4 style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>VI TRI</h4>
          <Row label="X" value={`${position.x.toFixed(2)} m`} />
          <Row label="Y" value={`${position.y.toFixed(2)} m`} />
          <Row label="Rotation" value={`${position.rotation.toFixed(1)} deg`} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span style={{ color: '#e1e4e8', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
