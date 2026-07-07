import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getVendorCards, updateVendorDiscount } from '../lib/api';
import type { VendorDiscount } from '../lib/types';
import { Button, ErrorBanner, Input, PageCard, Textarea } from '../components/Ui';
import { parseJsonSafely } from '../lib/date';

export function DiscountEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [discount, setDiscount] = useState<VendorDiscount | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const cards = await getVendorCards();
        const found = cards.find((card) => card.discount?.id === id)?.discount ?? null;
        if (mounted) setDiscount(found);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load discount');
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const title = useMemo(() => discount ? `${discount.type} discount` : 'Discount', [discount]);

  if (!id) {
    return <ErrorBanner message="Discount id is required." />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!discount) return;
    try {
      await updateVendorDiscount(discount.id, {
        value: discount.value,
        minPurchase: discount.min_purchase,
        maxUsesPerCustomer: discount.max_uses_per_customer ?? undefined,
        active: discount.active,
        cityOverrides: discount.city_overrides,
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <PageCard title={title} subtitle="Edit only the allowed vendor-scoped fields.">
      {error ? <ErrorBanner message={error} /> : null}
      {discount ? (
        <form className="form" onSubmit={submit}>
          <Input type="number" step="0.01" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: Number(e.target.value) })} />
          <Input type="number" step="0.01" value={discount.min_purchase} onChange={(e) => setDiscount({ ...discount, min_purchase: Number(e.target.value) })} />
          <Input type="number" value={discount.max_uses_per_customer ?? ''} onChange={(e) => setDiscount({ ...discount, max_uses_per_customer: e.target.value ? Number(e.target.value) : null })} />
          <label className="checkbox">
            <input type="checkbox" checked={discount.active} onChange={(e) => setDiscount({ ...discount, active: e.target.checked })} />
            Active
          </label>
          <Textarea
            value={JSON.stringify(discount.city_overrides, null, 2)}
            onChange={(e) => {
              const parsed = parseJsonSafely(e.target.value);
              setDiscount({ ...discount, city_overrides: (parsed && typeof parsed === 'object' ? parsed : {}) as VendorDiscount['city_overrides'] });
            }}
          />
          <Button type="submit">Save</Button>
        </form>
      ) : (
        <div className="muted">Loading discount…</div>
      )}
    </PageCard>
  );
}
