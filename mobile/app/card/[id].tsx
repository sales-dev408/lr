import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppButton, AppleTrademark, Banner, Card, FieldInput, Pill, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { createPass, getCard } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';
import type { CardDetail, WalletPlatform } from '@/lib/types';

function themeLabel(theme: string) {
  return theme.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CardDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const auth = useAuth();
  const onboarding = useOnboarding();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [city, setCity] = useState(onboarding.selection.city ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<WalletPlatform | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof createPass>> | null>(null);

  const title = useMemo(() => card?.name ?? 'Card details', [card]);
  const hasId = Boolean(params.id);

  useEffect(() => {
    if (!hasId) {
      return;
    }

    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getCard(params.id!, city.trim() || undefined);
        if (mounted) {
          setCard(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load card');
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
  }, [city, hasId, params.id]);

  async function addToWallet(platform: WalletPlatform) {
    if (!params.id) {
      return;
    }
    if (!auth.token) {
      router.push('/auth');
      return;
    }
    setSaving(platform);
    setError(null);
    try {
      const response = await createPass({ platform });
      setResult(response);
      const url = platform === 'google' ? response.androidUrl ?? response.walletUrl : response.walletUrl ?? response.passUrl;
      if (url) {
        try {
          await Linking.openURL(url);
        } catch {
          // fall through to the membership tab
        }
      }
      router.push('/passes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add pass');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  if (!hasId) {
    return (
      <Screen>
        <Banner tone="error">Card id is required.</Banner>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Card>
          <SectionTitle title={title} subtitle={card ? themeLabel(card.theme) : undefined} />
          {error ? <Banner tone="error">{error}</Banner> : null}
          {card ? (
            <>
              {card.image_url ? <Image source={{ uri: card.image_url }} style={{ width: '100%', height: 180, borderRadius: 16, backgroundColor: '#dfe7f3' }} /> : null}
              <Text style={{ color: '#52617a' }}>{card.description ?? 'No description available.'}</Text>
              <Pill tone="success">{card.status}</Pill>
              <FieldInput value={city} onChangeText={setCity} placeholder="City for override preview (optional)" />
              <AppButton variant="secondary" onPress={() => router.replace({ pathname: '/card/[id]', params: { id: card.id } })}>
                Refresh with city overrides
              </AppButton>
            </>
          ) : null}
        </Card>

        {card ? (
          <Card>
            <SectionTitle title="Participating businesses" subtitle="Discounts are loaded from GET /cards/:id." />
            {card.participatingBusinesses.map((business) => (
              <View key={business.id} style={{ borderWidth: 1, borderColor: '#e5ebf3', borderRadius: 14, padding: 12, gap: 6 }}>
                <Text style={{ fontWeight: '700' }}>{business.name}</Text>
                <Text style={{ color: '#52617a' }}>{business.city ?? 'City not listed'}</Text>
                {business.discount ? (
                  <Text style={{ color: '#10223d' }}>
                    {business.discount.type} · {business.discount.value}
                    {business.discount.type === 'percent' ? '%' : '$'} · active {business.discount.active ? 'yes' : 'no'}
                  </Text>
                ) : (
                  <Text style={{ color: '#52617a' }}>No discount configured</Text>
                )}
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionTitle title="Your membership pass" subtitle="One all-in-one pass unlocks every participating business." />
          {saving ? <Spinner /> : null}
          <AppButton onPress={() => void addToWallet('apple')}>Add to Apple Wallet</AppButton>
          <AppButton variant="secondary" onPress={() => void addToWallet('google')}>
            Add to Google Wallet
          </AppButton>
          <AppleTrademark />
          {result ? (
            <>
              <Banner tone="info">Your membership pass is ready. Show its barcode at checkout.</Banner>
              <Text selectable style={{ color: '#52617a' }}>
                Member barcode: {result.pass.barcodeValue}
              </Text>
            </>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}
