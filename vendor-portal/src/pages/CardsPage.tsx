import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getVendorCards } from '../lib/api';
import type { VendorCard } from '../lib/types';
import { Badge, EmptyState, ErrorBanner, PageCard } from '../components/Ui';

export function CardsPage() {
  const [cards, setCards] = useState<VendorCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getVendorCards();
        if (mounted) setCards(data);
      } catch (err) {
        if (mounted) setError(err instanceof ApiError ? err.message : 'Unable to load cards');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="stack">
      <PageCard title="My cards" subtitle="Cards this vendor participates in.">
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <div className="muted">Loading…</div> : null}
        {cards.length === 0 ? <EmptyState title="No cards" description="When the backend exposes vendor cards, they will appear here." /> : null}
        <div className="vendor-list">
          {cards.map((card) => (
            <article key={card.id} className="list-row">
              <div>
                <strong>{card.name}</strong>
                <p className="muted">{card.theme} · {card.status}</p>
                <Badge tone={card.discount?.active ? 'success' : 'neutral'}>
                  {card.discount ? `${card.discount.type} · ${card.discount.value}` : 'No discount'}
                </Badge>
              </div>
              <div className="row-actions">
                {card.discount ? (
                  <Link className="btn btn-secondary" to={`/discounts/${card.discount.id}/edit`}>
                    Edit discount
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </PageCard>
    </div>
  );
}
