import { useEffect, useMemo, useState } from 'react';
import { getVendorAnalytics } from '../lib/api';
import type { VendorAnalyticsResponse } from '../lib/types';
import { Button, EmptyState, ErrorBanner, PageCard } from '../components/Ui';
import { BarChart } from '../components/Chart';

function group(points: Array<{ day: string; redemptions: number }>, period: 'daily' | 'weekly' | 'monthly') {
  if (period === 'daily') return points;
  if (period === 'monthly') {
    const totals = new Map<string, number>();
    for (const point of points) {
      const key = point.day.slice(0, 7);
      totals.set(key, (totals.get(key) ?? 0) + point.redemptions);
    }
    return Array.from(totals, ([day, redemptions]) => ({ day, redemptions }));
  }
  const totals = new Map<string, number>();
  for (const point of points) {
    const date = new Date(point.day);
    const year = date.getFullYear();
    const week = Math.ceil((((date.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
    const key = `${year}-W${String(week).padStart(2, '0')}`;
    totals.set(key, (totals.get(key) ?? 0) + point.redemptions);
  }
  return Array.from(totals, ([day, redemptions]) => ({ day, redemptions }));
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [analytics, setAnalytics] = useState<VendorAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getVendorAnalytics(period);
        if (mounted) setAnalytics(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load analytics');
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [period]);

  const chartPoints = useMemo(() => group(analytics?.daily ?? [], period).map((point) => ({ day: point.day, value: point.redemptions })), [analytics, period]);

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Anonymous customer counts and redemption trends.</p>
        </div>
        <div className="filters">
          <Button variant={period === 'daily' ? 'primary' : 'secondary'} onClick={() => setPeriod('daily')}>Daily</Button>
          <Button variant={period === 'weekly' ? 'primary' : 'secondary'} onClick={() => setPeriod('weekly')}>Weekly</Button>
          <Button variant={period === 'monthly' ? 'primary' : 'secondary'} onClick={() => setPeriod('monthly')}>Monthly</Button>
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {analytics ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Total redemptions</span>
              <strong className="stat-value">{analytics.totals.redemptions}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Unique customers</span>
              <strong className="stat-value">{analytics.totals.uniqueCustomers}</strong>
            </div>
          </div>
          <PageCard title="Redemption trend">
            <BarChart points={chartPoints} />
          </PageCard>
          <PageCard title="By card">
            {analytics.byCard.length === 0 ? <EmptyState title="No data" description="Card breakdown appears here after redemptions." /> : (
              <table className="table">
                <thead>
                  <tr><th>Card</th><th>Redemptions</th><th>Unique customers</th></tr>
                </thead>
                <tbody>
                  {analytics.byCard.map((row) => (
                    <tr key={row.cardId}>
                      <td>{row.cardName}</td>
                      <td>{row.redemptions}</td>
                      <td>{row.uniqueCustomers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PageCard>
        </>
      ) : null}
    </div>
  );
}
