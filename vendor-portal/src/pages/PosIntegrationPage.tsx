import { useCallback, useEffect, useMemo, useState } from 'react';
import { connectPosProvider, disconnectPosProvider, getPosConnections, syncPosProvider } from '../lib/api';
import type { PosConnectionStatus, PosConnectionView, PosProvider } from '../lib/types';
import { Badge, Button, EmptyState, ErrorBanner, PageCard } from '../components/Ui';

const PROVIDERS: Array<{ id: PosProvider; name: string; blurb: string }> = [
  { id: 'square', name: 'Square', blurb: 'Sync discounts into your Square catalog.' },
  { id: 'clover', name: 'Clover', blurb: 'Push discounts to your Clover merchant account.' },
  { id: 'toast', name: 'Toast', blurb: 'Keep Toast discounts in sync automatically.' },
  { id: 'stripe', name: 'Stripe', blurb: 'Mirror discounts as Stripe coupons.' },
];

function statusTone(status: PosConnectionStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'pending':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function PosIntegrationPage() {
  const [connections, setConnections] = useState<PosConnectionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<PosProvider | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPosConnections();
      setConnections(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load POS connections');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pos = params.get('pos');
    if (pos === 'connected') {
      setNotice(`Connected ${params.get('provider') ?? 'POS'}${params.get('mode') === 'simulated' ? ' (simulated)' : ''}.`);
    } else if (pos === 'error') {
      setError(params.get('message') ?? 'POS connection failed');
    }
    void load();
  }, [load]);

  const byProvider = useMemo(() => {
    const map = new Map<PosProvider, PosConnectionView>();
    for (const conn of connections) map.set(conn.provider, conn);
    return map;
  }, [connections]);

  async function handleConnect(provider: PosProvider) {
    setBusy(provider);
    setError(null);
    setNotice(null);
    try {
      const result = await connectPosProvider(provider);
      if (result.authorizeUrl) {
        window.location.href = result.authorizeUrl;
        return;
      }
      setNotice(result.message || `Connected ${provider}${result.mode === 'simulated' ? ' (simulated)' : ''}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to connect ${provider}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(provider: PosProvider) {
    setBusy(provider);
    setError(null);
    setNotice(null);
    try {
      await disconnectPosProvider(provider);
      setNotice(`Disconnected ${provider}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to disconnect ${provider}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleSync(provider: PosProvider) {
    setBusy(provider);
    setError(null);
    setNotice(null);
    try {
      const result = await syncPosProvider(provider);
      const failed = result.results.filter((r) => r.status === 'error').length;
      setNotice(`Synced ${result.synced} discount(s) to ${provider}${failed ? `, ${failed} failed` : ''}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to sync ${provider}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>POS Integration</h1>
          <p className="muted">
            Connect your point-of-sale once. Your discounts then sync automatically as native POS
            discounts — cashiers apply them through your POS, so no scanning is needed in this portal.
          </p>
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <div className="banner banner-success">{notice}</div> : null}

      <div className="stats-grid">
        {PROVIDERS.map((provider) => {
          const conn = byProvider.get(provider.id);
          const connected = conn?.status === 'connected';
          const working = busy === provider.id;
          return (
            <PageCard key={provider.id} title={provider.name} subtitle={provider.blurb}>
              <div className="stack">
                <div>
                  <Badge tone={statusTone(conn?.status ?? 'disconnected')}>
                    {conn ? conn.status : 'not connected'}
                  </Badge>{' '}
                  {conn?.mode === 'simulated' ? <Badge tone="warning">simulated</Badge> : null}
                </div>
                {conn ? (
                  <dl className="muted" style={{ margin: 0 }}>
                    <div>Merchant: {conn.merchantId ?? '—'}</div>
                    <div>Last synced: {formatDate(conn.lastSyncedAt)}</div>
                    {conn.lastErrorMessage ? <div>Last error: {conn.lastErrorMessage}</div> : null}
                  </dl>
                ) : null}
                <div className="filters">
                  {connected ? (
                    <>
                      <Button variant="secondary" disabled={working} onClick={() => handleSync(provider.id)}>
                        {working ? 'Working…' : 'Sync now'}
                      </Button>
                      <Button variant="danger" disabled={working} onClick={() => handleDisconnect(provider.id)}>
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" disabled={working} onClick={() => handleConnect(provider.id)}>
                      {working ? 'Connecting…' : `Connect ${provider.name}`}
                    </Button>
                  )}
                </div>
              </div>
            </PageCard>
          );
        })}
      </div>

      {connections.length === 0 && !error ? (
        <EmptyState
          title="No POS connected yet"
          description="Connect a provider above to start syncing your discounts automatically."
        />
      ) : null}
    </div>
  );
}
