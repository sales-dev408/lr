import { formatDay } from '../lib/date';

export function BarChart({ points }: { points: Array<{ day: string; value: number }> }) {
  if (points.length === 0) {
    return <div className="empty-state">No chart data.</div>;
  }

  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="chart">
      <div className="chart-bars">
        {points.map((point) => {
          const height = Math.max(6, (point.value / max) * 100);
          return (
            <div key={point.day} className="chart-bar-group">
              <div className="chart-bar" style={{ height: `${height}%` }} title={`${point.day}: ${point.value}`} />
              <span className="chart-label">{formatDay(point.day)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
