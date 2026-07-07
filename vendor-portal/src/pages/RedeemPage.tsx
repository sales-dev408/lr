import { useState, type FormEvent } from 'react';
import { lookupByCard, lookupByToken, redeem } from '../lib/api';
import type { LookupResponse, RedeemResponse } from '../lib/types';
import { Button, ErrorBanner, Input, PageCard, Select } from '../components/Ui';
import { useAuth } from '../lib/auth';

export function RedeemPage() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'token' | 'card'>('token');
  const [lookupToken, setLookupToken] = useState('');
  const [cardId, setCardId] = useState('');
  const [city, setCity] = useState('');
  const [vendorId, setVendorId] = useState(profile?.id ?? '');
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [result, setResult] = useState<RedeemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    try {
      const data = mode === 'token'
        ? await lookupByToken(lookupToken, vendorId || undefined, city || undefined)
        : await lookupByCard(cardId, vendorId || undefined, city || undefined);
      setLookup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    }
  }

  async function submitRedeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookup) return;
    setError(null);
    try {
      const response = await redeem({
        lookupToken: mode === 'token' ? lookupToken : undefined,
        cardId: mode === 'card' ? cardId : undefined,
        vendorId,
        city: city || undefined,
        purchaseAmount: purchaseAmount ? Number(purchaseAmount) : undefined,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redeem failed');
    }
  }

  return (
    <div className="stack">
      <PageCard title="Redeem console" subtitle="Scan a token or enter a card id, then confirm the discount.">
        {error ? <ErrorBanner message={error} /> : null}
        <form className="form" onSubmit={submitLookup}>
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'token' | 'card')}>
            <option value="token">Lookup token</option>
            <option value="card">Card id</option>
          </Select>
          {mode === 'token' ? (
            <Input placeholder="Lookup token" value={lookupToken} onChange={(e) => setLookupToken(e.target.value)} required />
          ) : (
            <Input placeholder="Card id" value={cardId} onChange={(e) => setCardId(e.target.value)} required />
          )}
          <Input placeholder="Vendor id" value={vendorId} onChange={(e) => setVendorId(e.target.value)} required />
          <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Button type="submit">Lookup</Button>
        </form>
      </PageCard>

      {lookup ? (
        <PageCard title="Lookup result">
          <pre className="code-block">{JSON.stringify(lookup, null, 2)}</pre>
          <form className="form" onSubmit={submitRedeem}>
            <Input placeholder="Purchase amount" type="number" step="0.01" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} />
            <Button type="submit">Redeem</Button>
          </form>
        </PageCard>
      ) : null}

      {result ? (
        <PageCard title={result.valid ? 'Redemption approved' : 'Redemption denied'}>
          {result.valid ? (
            <>
              <p><strong>Amount applied:</strong> {result.amountApplied ?? 0}</p>
              {result.instruction ? <p><strong>Instruction:</strong> {result.instruction}</p> : null}
              {result.discount ? <p><strong>Discount:</strong> {result.discount.description}</p> : null}
            </>
          ) : (
            <p>{result.reason}</p>
          )}
        </PageCard>
      ) : null}
    </div>
  );
}
