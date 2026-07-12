import { useEffect, useState, useCallback } from 'react';
import { Image, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AppButton, Banner, Card, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { listVendors } from '@/lib/api';
import type { Vendor } from '@/lib/types';

const CATEGORIES = ['All', 'Sports', 'Dining', 'Entertainment'];

export default function VendorsScreen() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listVendors(category === 'All' ? undefined : { category });
      setVendors(data);
      setSelected((prev) => (prev ? data.find((v) => v.id === prev.id) ?? null : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load vendors');
    }
  }, [category]);

  useEffect(() => {
    let mounted = true;
    async function firstLoad() {
      setLoading(true);
      try {
        const data = await listVendors(category === 'All' ? undefined : { category });
        if (mounted) {
          setVendors(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load vendors');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void firstLoad();
    return () => {
      mounted = false;
    };
  }, [category]);

  useEffect(() => {
    const interval = setInterval(() => {
      void load();
    }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function discountLabel(vendor: Vendor) {
    if (!vendor.discount_type || vendor.discount_amount === null) {
      return 'Discount configured';
    }
    const symbol = vendor.discount_type === 'percent' ? '%' : '$';
    return `${vendor.discount_type === 'percent' ? '' : symbol}${vendor.discount_amount}${vendor.discount_type === 'percent' ? symbol : ''} off`;
  }

  async function openPass(vendor: Vendor) {
    const url = vendor.passUrl;
    if (!url) {
      setError('No pass available for this vendor yet.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        setError('Unable to open the pass on this device.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open pass');
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card>
          <SectionTitle title="Vendors" subtitle="Select a vendor and add its pass to Apple Wallet." />
          <Image source={require('@/assets/images/logo.png')} style={{ width: 120, height: 40, resizeMode: 'contain', alignSelf: 'center' }} />
          {error ? <Banner tone="error">{error}</Banner> : null}
        </Card>

        <Card>
          <SectionTitle title="Category" subtitle="Filter the vendor list" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map((c) => (
              <AppButton key={c} variant={category === c ? 'primary' : 'secondary'} onPress={() => setCategory(c)}>
                {c}
              </AppButton>
            ))}
          </View>
        </Card>

        {loading ? <Spinner /> : null}

        {!loading && vendors.length === 0 ? <Banner tone="info">No vendors found. New vendors will appear automatically.</Banner> : null}

        {vendors.map((vendor) => {
          const isSelected = selected?.id === vendor.id;
          return (
            <Card key={vendor.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: '700', color: '#10223d', fontSize: 16 }}>{vendor.name}</Text>
                  <Text style={{ color: '#52617a' }}>{vendor.location ?? vendor.city ?? 'Location not listed'}</Text>
                  <Text style={{ color: '#2563eb', fontWeight: '600' }}>{vendor.category ?? 'Vendor'} · {discountLabel(vendor)}</Text>
                </View>
                <AppButton variant={isSelected ? 'primary' : 'secondary'} onPress={() => setSelected(isSelected ? null : vendor)}>
                  {isSelected ? 'Selected' : 'Select'}
                </AppButton>
              </View>
              {isSelected ? (
                <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: '#e5ebf3', paddingTop: 12, marginTop: 8 }}>
                  <SectionTitle title={vendor.name} subtitle={vendor.pos_type ? `POS: ${vendor.pos_type}` : 'Vendor info'} />
                  <Text style={{ color: '#52617a' }}>Show this pass at the register. The barcode is displayed inside Apple Wallet—no discount code is shown in the app.</Text>
                  <AppButton onPress={() => void openPass(vendor)}>Add to Apple Wallet</AppButton>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
