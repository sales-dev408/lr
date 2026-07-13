import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { AppButton, Banner, BrandHeader, Card, FieldInput, Pill, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { listCards } from '@/lib/api';
import { useOnboarding } from '@/lib/onboarding';
import type { CardSummary, CardTheme } from '@/lib/types';

const THEMES: CardTheme[] = ['sports', 'entertainment', 'shops_restaurants'];

function prettyTheme(theme: CardTheme) {
  return theme.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function BrowseScreen() {
  const onboarding = useOnboarding();
  const [theme, setTheme] = useState<CardTheme>(onboarding.selection.theme ?? 'shops_restaurants');
  const [city, setCity] = useState(onboarding.selection.city ?? '');
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listCards({ theme, city: city.trim() || undefined });
        if (mounted) {
          setCards(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load cards');
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
  }, [theme, city]);

  useEffect(() => {
    void onboarding.updateSelection({ theme, city: city.trim() || undefined });
  }, [city, onboarding, theme]);

  const featured = useMemo(() => cards[0] ?? null, [cards]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <BrandHeader subtitle="Browse cards" />
        <Card>
          <SectionTitle title="Browse cards" subtitle="Active cards and participating businesses." />
          {onboarding.selection.code ? (
            <Banner tone="success">
              Loaded from onboarding code: {onboarding.selection.cardName} · {onboarding.selection.vendorName}
            </Banner>
          ) : null}
          <FieldInput value={city} onChangeText={setCity} placeholder="City (optional)" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {THEMES.map((value) => (
              <AppButton key={value} variant={theme === value ? 'primary' : 'secondary'} onPress={() => setTheme(value)}>
                {prettyTheme(value)}
              </AppButton>
            ))}
          </View>
        </Card>

        {loading ? <Spinner /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        {featured ? (
          <Card>
            <SectionTitle title="Featured card" subtitle={featured.name} />
            {featured.image_url ? (
              <Image source={{ uri: featured.image_url }} style={{ width: '100%', height: 180, borderRadius: 16, backgroundColor: '#dfe7f3' }} />
            ) : null}
            <Text style={{ color: '#52617a' }}>{featured.description ?? 'No description yet.'}</Text>
            <Pill tone="success">{prettyTheme(featured.theme)}</Pill>
            <Link href={`/card/${featured.id}`} asChild>
              <AppButton>Open card</AppButton>
            </Link>
          </Card>
        ) : null}

        {cards.map((card) => (
          <Card key={card.id}>
            <SectionTitle title={card.name} subtitle={prettyTheme(card.theme)} />
            <Text style={{ color: '#52617a' }}>{card.description ?? 'No description available.'}</Text>
            <View style={{ gap: 8 }}>
              {card.participatingBusinesses.map((business) => (
                <View key={business.id} style={{ borderWidth: 1, borderColor: '#e5ebf3', borderRadius: 14, padding: 12, gap: 6 }}>
                  <Text style={{ fontWeight: '700' }}>{business.name}</Text>
                  <Text style={{ color: '#52617a' }}>{business.city ?? 'City not listed'}</Text>
                  {business.discount ? (
                    <Text style={{ color: '#10223d' }}>
                      {business.discount.type} · {business.discount.value}
                      {business.discount.type === 'percent' ? '%' : '$'}
                    </Text>
                  ) : (
                    <Text style={{ color: '#52617a' }}>No discount configured</Text>
                  )}
                </View>
              ))}
            </View>
            <Link href={`/card/${card.id}`} asChild>
              <AppButton variant="secondary">View details</AppButton>
            </Link>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
