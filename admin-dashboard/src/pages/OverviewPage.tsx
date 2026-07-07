import { useEffect, useMemo, useState } from 'react';
import { getAdminAnalytics, listAdminCards, listAdminVendors } from '../lib/api';
import { Button, EmptyState, ErrorBanner, InfoCard, PageCard, Spinner } from '../components/Ui';
import { BarChart } from '../components/Chart';
import type { AdminAnalyticsResponse, CardSummary, VendorRecord } from '../lib/types';

export function OverviewPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [analyticsData, cardsData, vendorsData] = await Promise.all([
          getAdminAnalytics({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(city ? { city } : {}) }),
          listAdminCards(),
          listAdminVendors({ status: 'approved' }),
        ]);
        if (!active) return;
        setAnalytics(analyticsData);
        setCards(cardsData);
        setVendors(vendorsData);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load analytics');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [from, to, city]);

  const activeCards = useMemo(() => cards.filter((card) => card.status === 'active').length, [cards]);
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.status === 'approved').length, [vendors]);

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p className="muted">Redemptions, customer usage, and top businesses.</p>
        </div>
        <div className="filters">
          <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <input className="input" placeholder="City" value={city} onChange={(event) => setCity(event.target.value)} />
          <Button variant="secondary" onClick={() => {
            setFrom('');
            setTo('');
            setCity('');
          }}>
            Reset
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <Spinner /> : null}

      {analytics ? (
        <>
          <div className="stats-grid">
            <InfoCard label="Total redemptions" value={analytics.totals.redemptions} />
            <InfoCard label="Unique customers" value={analytics.totals.uniqueCustomers} />
            <InfoCard label="Active cards" value={activeCards} />
            <InfoCard label="Active vendors" value={activeVendors} />
          </div>

          <PageCard title="30-day redemptions">
            <BarChart points={analytics.timeSeries.map((point) => ({ day: point.day, value: point.redemptions }))} />
          </PageCard>

          <div className="grid-2">
            <PageCard title="Top performers">
              {analytics.topPerformers.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th>Redemptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topPerformers.map((row) => (
                      <tr key={row.vendorId}>
                        <td>{row.vendorName}</td>
                        <td>{row.redemptions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No data yet" description="Redemption activity will appear here once the card system is used." />
              )}
            </PageCard>

            <PageCard title="By card">
              {analytics.usageByCard.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Card</th>
                      <th>Redemptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.usageByCard.map((row) => (
                      <tr key={row.cardId}>
                        <td>{row.cardName}</td>
                        <td>{row.redemptions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No card data" description="Create redemptions to populate this table." />
              )}
            </PageCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
