import { useCallback, useMemo, useState } from 'react';
import { Image, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppButton, Banner, Card, Pill, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { listVendors } from '@/lib/api';
import type { VendorListItem } from '@/lib/types';

const CATEGORIES = ['All', 'Sports', 'Dining', 'Entertainment'] as const;

export default function VendorsScreen() {
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listVendors({ category: category === 'All' ? undefined : category });
      setVendors(data);
      setSelectedId((prev) => (prev && data.some((v) => v.id === prev) ? prev : data[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load vendors');
    }
  }, [category]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void load().finally(() => {
        if (active) setLoading(false);
      });
      const interval = setInterval(() => {
        void load();
      }, 20000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [load]),
  );

  const selected = useMemo(() => vendors.find((v) => v.id === selectedId) ?? null, [vendors, selectedId]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openWallet(vendor: VendorListItem) {
    if (!vendor.walletUrl) {
      setError('This vendor has no Apple Wallet pass yet.');
      return;
    }
    try {
      await Linking.openURL(vendor.walletUrl);
    } catch {
      setError('Unable to open Apple Wallet.');
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <Card>
          <SectionTitle title="Deals" subtitle="Pick a vendor to add its discount to Apple Wallet." />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map((value) => (
              <AppButton key={value} variant={category === value ? 'primary' : 'secondary'} onPress={() => setCategory(value)}>
                {value}
              </AppButton>
            ))}
          </View>
        </Card>

        {loading ? <Spinner /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        {!loading && vendors.length === 0 ? <Banner tone="info">No vendors available yet.</Banner> : null}

        {vendors.length > 0 ? (
          <Card>
            <SectionTitle title="Vendors" subtitle="Tap to select" />
            <View style={{ gap: 8 }}>
              {vendors.map((vendor) => {
                const active = vendor.id === selectedId;
                return (
                  <AppButton key={vendor.id} variant={active ? 'primary' : 'secondary'} onPress={() => setSelectedId(vendor.id)}>
                    {vendor.name} · {vendor.discount.label}
                  </AppButton>
                );
              })}
            </View>
          </Card>
        ) : null}

        {selected ? (
          <Card>
            {selected.logoUrl || selected.iconUrl ? (
              <Image
                source={{ uri: selected.logoUrl ?? selected.iconUrl ?? undefined }}
                style={{ width: '100%', height: 140, borderRadius: 16, backgroundColor: '#dfe7f3' }}
                resizeMode="contain"
              />
            ) : null}
            <SectionTitle title={selected.name} subtitle={selected.category ?? undefined} />
            <Pill tone="success">{selected.discount.label}</Pill>
            {selected.address ? <Text style={{ color: '#52617a' }}>{selected.address}</Text> : null}
            {selected.posSystem ? <Text style={{ color: '#52617a' }}>POS: {selected.posSystem}</Text> : null}
            <AppButton onPress={() => void openWallet(selected)}> Add to Apple Wallet</AppButton>
            <Text style={{ color: '#7c8a9d', fontSize: 12 }}>
              The barcode is shown in Apple Wallet. Present it at checkout for your discount.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
