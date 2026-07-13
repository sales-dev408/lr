import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Link } from 'expo-router';
import { AppButton, Banner, BrandHeader, Card, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { getPass } from '@/lib/api';
import { loadStoredPasses } from '@/lib/passes';
import type { PassDetail, StoredPass } from '@/lib/types';

export default function PassesScreen() {
  const [passes, setPasses] = useState<StoredPass[]>([]);
  const [details, setDetails] = useState<Record<string, PassDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const stored = await loadStoredPasses();
        if (!mounted) {
          return;
        }
        setPasses(stored);
        const fresh: Record<string, PassDetail> = {};
        for (const item of stored) {
          try {
            fresh[item.serialNumber] = await getPass(item.serialNumber);
          } catch {
            fresh[item.serialNumber] = {
              id: item.passId,
              user_id: '',
              card_id: '',
              platform: item.platform,
              serial_number: item.serialNumber,
              auth_token: item.authToken,
              lookup_token: item.lookupToken,
              device_library_id: null,
              push_token: null,
              created_at: item.addedAt,
              updated_at: item.addedAt,
              card_name: item.cardName,
              card_description: item.description,
            };
          }
        }
        if (mounted) {
          setDetails(fresh);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load passes');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <BrandHeader subtitle="My passes" />
        <Card>
          <SectionTitle title="My passes" subtitle="Local pass list backed by the real pass detail endpoint where available." />
          <Banner tone="info">
            This scaffold does not have a backend list endpoint for customer passes, so newly created passes are saved locally and refreshed with GET /passes/:serial when available.
          </Banner>
        </Card>

        {loading ? <Spinner /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        {!loading && passes.length === 0 ? <Banner tone="info">No saved passes yet. Add one from a card detail page.</Banner> : null}

        {passes.map((pass) => {
          const detail = details[pass.serialNumber];
          return (
            <Card key={pass.serialNumber}>
              <SectionTitle title={pass.cardName} subtitle={pass.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet'} />
              <Text style={{ color: '#52617a' }}>Serial: {pass.serialNumber}</Text>
              <Text style={{ color: '#52617a' }}>Lookup token: {pass.lookupToken}</Text>
              {detail?.card_name ? <Text style={{ color: '#10223d' }}>{detail.card_name}</Text> : null}
              <Link href={`/pass/${pass.serialNumber}`} asChild>
                <AppButton>Open pass</AppButton>
              </Link>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
