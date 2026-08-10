interface TimelineBarProps {
  snapshots: Array<{ id: string; date: string }>;
  activeSnapshotId: string | null;
  onSelect: (snapshotId: string) => void;
}

export default function TimelineBar({ snapshots, activeSnapshotId, onSelect }: TimelineBarProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{
      padding: '8px 16px', background: '#161b22', borderTop: '1px solid #30363d',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 12, color: '#8b949e', whiteSpace: 'nowrap' }}>Snapshot:</span>
      <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
        {snapshots.map((s) => {
          const dateStr = new Date(s.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          const isToday = s.date.startsWith(today);
          const isActive = s.id === activeSnapshotId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: isToday ? '#238636' : isActive ? '#1f3a5f' : '#21262d',
                color: isToday ? '#fff' : isActive ? '#58a6ff' : '#8b949e',
                border: isActive ? '1px solid #58a6ff' : '1px solid transparent',
              }}
            >
              {dateStr}{isToday ? ' (Hom nay)' : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
