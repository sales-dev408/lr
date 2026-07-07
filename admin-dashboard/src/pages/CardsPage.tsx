import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  addCardVendor,
  createCard,
  createDiscount,
  deleteDiscount,
  getCard,
  listAdminCards,
  removeCardVendor,
  updateCard,
  updateDiscount,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import type { CardDetailResponse, CardSummary, DiscountSummary } from '../lib/types';
import { Button, EmptyState, ErrorBanner, Input, Modal, PageCard, Select, Textarea, Badge } from '../components/Ui';
import { parseJsonSafely } from '../lib/date';

const blankCard = {
  name: '',
  theme: 'sports',
  description: '',
  imageUrl: '',
  expirationDate: '',
  maxUses: '',
  status: 'draft',
};

function normalizeCityOverrides(value: unknown): Record<string, { type?: DiscountSummary['type']; value?: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.reduce<Record<string, { type?: DiscountSummary['type']; value?: number }>>((acc, [key, item]) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return acc;
    }
    const row = item as Record<string, unknown>;
    const result: { type?: DiscountSummary['type']; value?: number } = {};
    if (row.type === 'fixed' || row.type === 'percent' || row.type === 'bogo') {
      result.type = row.type;
    }
    if (typeof row.value === 'number') {
      result.value = row.value;
    }
    acc[key] = result;
    return acc;
  }, {});
}

export function CardsPage() {
  const { profile } = useAuth();
  const readOnly = profile?.role === 'analyst';
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState(blankCard);
  const [vendorId, setVendorId] = useState('');
  const [discountForm, setDiscountForm] = useState({
    vendorId: '',
    type: 'fixed',
    value: '0',
    minPurchase: '0',
    maxUsesTotal: '',
    maxUsesPerCustomer: '',
    active: true,
    cityOverrides: '{}',
  });
  const [editingDiscount, setEditingDiscount] = useState<DiscountSummary | null>(null);

  useEffect(() => {
    if (!selectedCard) return;
    setCardForm({
      name: selectedCard.name,
      theme: selectedCard.theme,
      description: selectedCard.description ?? '',
      imageUrl: selectedCard.image_url ?? '',
      expirationDate: selectedCard.expiration_date ? selectedCard.expiration_date.slice(0, 16) : '',
      maxUses: selectedCard.max_uses?.toString() ?? '',
      status: selectedCard.status,
    });
  }, [selectedCard]);

  async function refresh() {
    try {
      const list = await listAdminCards();
      setCards(list);
      const nextId = selectedId ?? list[0]?.id ?? null;
      if (nextId) {
        setSelectedId(nextId);
        setSelectedCard(await getCard(nextId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cards');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void getCard(selectedId)
      .then(setSelectedCard)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load card'));
  }, [selectedId]);

  const currentBusinesses = useMemo(() => selectedCard?.participatingBusinesses ?? [], [selectedCard]);

  async function submitCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    try {
      const payload = {
        name: cardForm.name,
        theme: cardForm.theme,
        description: cardForm.description || undefined,
        imageUrl: cardForm.imageUrl || undefined,
        expirationDate: cardForm.expirationDate || undefined,
        maxUses: cardForm.maxUses ? Number(cardForm.maxUses) : undefined,
        status: cardForm.status,
      };
      if (selectedId) {
        await updateCard(selectedId, payload);
      } else {
        const result = await createCard(payload);
        setSelectedId(result.id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleAddVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !selectedId) return;
    try {
      await addCardVendor(selectedId, vendorId);
      setVendorId('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add vendor failed');
    }
  }

  async function handleRemoveVendor(vendorIdToRemove: string) {
    if (readOnly || !selectedId) return;
    try {
      await removeCardVendor(selectedId, vendorIdToRemove);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove vendor failed');
    }
  }

  async function submitDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !selectedId) return;
    try {
      await createDiscount({
        cardId: selectedId,
        vendorId: discountForm.vendorId,
        type: discountForm.type,
        value: Number(discountForm.value),
        minPurchase: Number(discountForm.minPurchase || 0),
        maxUsesTotal: discountForm.maxUsesTotal ? Number(discountForm.maxUsesTotal) : undefined,
        maxUsesPerCustomer: discountForm.maxUsesPerCustomer ? Number(discountForm.maxUsesPerCustomer) : undefined,
        active: discountForm.active,
        cityOverrides: normalizeCityOverrides(parseJsonSafely(discountForm.cityOverrides)),
      });
      setDiscountForm({ ...discountForm, vendorId: '', value: '0', minPurchase: '0', maxUsesTotal: '', maxUsesPerCustomer: '', cityOverrides: '{}' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create discount failed');
    }
  }

  async function submitDiscountEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !editingDiscount) return;
    try {
      await updateDiscount(editingDiscount.id, {
        value: editingDiscount.value,
        minPurchase: editingDiscount.min_purchase,
        maxUsesPerCustomer: editingDiscount.max_uses_per_customer,
        active: editingDiscount.active,
        cityOverrides: editingDiscount.city_overrides,
      });
      setEditingDiscount(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update discount failed');
    }
  }

  async function handleDeleteDiscount(discountId: string) {
    if (readOnly) return;
    try {
      await deleteDiscount(discountId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete discount failed');
    }
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Cards</h1>
          <p className="muted">Manage master cards, participating businesses, and discounts.</p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid-2">
        <PageCard title="Create / edit card" subtitle={readOnly ? 'Analyst mode is read-only.' : 'Create or update a master card.'}>
          <form className="form" onSubmit={submitCard}>
            <Input placeholder="Card name" value={cardForm.name} onChange={(e) => setCardForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <Select value={cardForm.theme} onChange={(e) => setCardForm((prev) => ({ ...prev, theme: e.target.value }))}>
              <option value="sports">Sports</option>
              <option value="entertainment">Entertainment</option>
              <option value="shops_restaurants">Shops & restaurants</option>
            </Select>
            <Textarea placeholder="Description" value={cardForm.description} onChange={(e) => setCardForm((prev) => ({ ...prev, description: e.target.value }))} />
            <Input placeholder="Image URL" value={cardForm.imageUrl} onChange={(e) => setCardForm((prev) => ({ ...prev, imageUrl: e.target.value }))} />
            <Input type="datetime-local" value={cardForm.expirationDate} onChange={(e) => setCardForm((prev) => ({ ...prev, expirationDate: e.target.value }))} />
            <Input placeholder="Max uses" type="number" value={cardForm.maxUses} onChange={(e) => setCardForm((prev) => ({ ...prev, maxUses: e.target.value }))} />
            <Select value={cardForm.status} onChange={(e) => setCardForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            <Button type="submit" disabled={readOnly}>{selectedId ? 'Save selected card' : 'Create card'}</Button>
          </form>
        </PageCard>

        <PageCard title="Master cards">
          {cards.length === 0 ? <EmptyState title="No cards" description="Create a card to populate this list." /> : null}
          <div className="vendor-list">
            {cards.map((card) => (
              <article key={card.id} className={`list-row ${selectedId === card.id ? 'selected' : ''}`}>
                <div>
                  <strong>{card.name}</strong>
                  <p className="muted">{card.theme} · {card.status}</p>
                  <Badge tone={card.status === 'active' ? 'success' : card.status === 'draft' ? 'warning' : 'neutral'}>{card.status}</Badge>
                </div>
                <Button variant="secondary" onClick={() => setSelectedId(card.id)}>Open</Button>
              </article>
            ))}
          </div>
        </PageCard>
      </div>

      <div className="grid-2">
        <PageCard title="Participating businesses" subtitle={selectedCard?.name ?? 'Select a card'}>
          <form className="form inline-form" onSubmit={handleAddVendor}>
            <Input placeholder="Vendor ID" value={vendorId} onChange={(e) => setVendorId(e.target.value)} />
            <Button type="submit" disabled={readOnly || !selectedId}>Add vendor</Button>
          </form>
          {currentBusinesses.length === 0 ? <EmptyState title="No businesses" description="Add vendors to this card." /> : null}
          <div className="vendor-list">
            {currentBusinesses.map((business) => (
              <article key={business.id} className="list-row">
                <div>
                  <strong>{business.name}</strong>
                  <p className="muted">{business.city ?? '—'}</p>
                  <Badge tone={business.discount?.active ? 'success' : 'neutral'}>
                    {business.discount ? `${business.discount.type} · ${business.discount.value}` : 'No discount'}
                  </Badge>
                </div>
                <div className="row-actions">
                  {business.discount ? (
                    <>
                      <Button variant="secondary" onClick={() => setEditingDiscount(business.discount)}>Edit discount</Button>
                      <Button variant="secondary" onClick={() => handleDeleteDiscount(business.discount!.id)}>Delete discount</Button>
                    </>
                  ) : null}
                  <Button variant="secondary" onClick={() => handleRemoveVendor(business.id)}>Remove vendor</Button>
                </div>
              </article>
            ))}
          </div>
        </PageCard>

        <PageCard title="Discounts">
          <form className="form" onSubmit={submitDiscount}>
            <Input placeholder="Vendor ID" value={discountForm.vendorId} onChange={(e) => setDiscountForm((prev) => ({ ...prev, vendorId: e.target.value }))} required />
            <Select value={discountForm.type} onChange={(e) => setDiscountForm((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="fixed">Fixed</option>
              <option value="percent">Percent</option>
              <option value="bogo">BOGO</option>
            </Select>
            <Input type="number" step="0.01" placeholder="Value" value={discountForm.value} onChange={(e) => setDiscountForm((prev) => ({ ...prev, value: e.target.value }))} />
            <Input type="number" step="0.01" placeholder="Min purchase" value={discountForm.minPurchase} onChange={(e) => setDiscountForm((prev) => ({ ...prev, minPurchase: e.target.value }))} />
            <Input type="number" placeholder="Max uses total" value={discountForm.maxUsesTotal} onChange={(e) => setDiscountForm((prev) => ({ ...prev, maxUsesTotal: e.target.value }))} />
            <Input type="number" placeholder="Max uses/customer" value={discountForm.maxUsesPerCustomer} onChange={(e) => setDiscountForm((prev) => ({ ...prev, maxUsesPerCustomer: e.target.value }))} />
            <label className="checkbox">
              <input type="checkbox" checked={discountForm.active} onChange={(e) => setDiscountForm((prev) => ({ ...prev, active: e.target.checked }))} />
              Active
            </label>
            <Textarea
              placeholder='{"Phoenix":{"type":"percent","value":20}}'
              value={discountForm.cityOverrides}
              onChange={(e) => setDiscountForm((prev) => ({ ...prev, cityOverrides: e.target.value }))}
            />
            <Button type="submit" disabled={readOnly || !selectedId}>Create discount</Button>
          </form>
        </PageCard>
      </div>

      <Modal open={Boolean(editingDiscount)} title="Edit discount" onClose={() => setEditingDiscount(null)}>
        {editingDiscount ? (
          <form className="form" onSubmit={submitDiscountEdit}>
            <Input type="number" step="0.01" value={editingDiscount.value} onChange={(e) => setEditingDiscount({ ...editingDiscount, value: Number(e.target.value) })} />
            <Input type="number" step="0.01" value={editingDiscount.min_purchase} onChange={(e) => setEditingDiscount({ ...editingDiscount, min_purchase: Number(e.target.value) })} />
            <Input type="number" value={editingDiscount.max_uses_per_customer ?? ''} onChange={(e) => setEditingDiscount({ ...editingDiscount, max_uses_per_customer: e.target.value ? Number(e.target.value) : null })} />
            <label className="checkbox">
              <input type="checkbox" checked={editingDiscount.active} onChange={(e) => setEditingDiscount({ ...editingDiscount, active: e.target.checked })} />
              Active
            </label>
            <Textarea value={JSON.stringify(editingDiscount.city_overrides, null, 2)} onChange={(e) => {
              const parsed = parseJsonSafely(e.target.value);
              setEditingDiscount({ ...editingDiscount, city_overrides: normalizeCityOverrides(parsed) });
            }} />
            <Button type="submit" disabled={readOnly}>Save discount</Button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
