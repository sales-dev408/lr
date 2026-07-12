import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Banner, Card, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { getPass } from '@/lib/api';
import { lookupQrUrl } from '@/lib/passes';
import type { PassDetail } from '@/lib/types';

export default function PassScreen() {
  const params = useLocalSearchParams<{ serial?: string }>();
  const [pass, setPass] = useState<PassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasSerial = Boolean(params.serial);

  useEffect(() => {
    if (!hasSerial) {
      return;
    }

    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPass(params.serial!);
        if (mounted) {
          setPass(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load pass');
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
  }, [hasSerial, params.serial]);

  if (loading) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  if (!hasSerial) {
    return (
      <Screen>
        <Banner tone="error">Serial number missing.</Banner>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Card>
          <SectionTitle title="In-store use" subtitle="Show the QR code at the register." />
          {error ? <Banner tone="error">{error}</Banner> : null}
          {pass ? (
            <>
              <Image source={{ uri: lookupQrUrl(pass.lookup_token) }} style={{ width: '100%', height: 300, borderRadius: 18, backgroundColor: '#fff' }} />
              <Text style={{ fontWeight: '700', color: '#10223d' }}>{pass.card_name ?? 'Master card'}</Text>
              <View style={{ gap: 8 }}>
                <Text style={{ color: '#10223d', fontWeight: '700' }}>Wallet note</Text>
                <Text style={{ color: '#52617a' }}>
                  Use this QR at the register. The cashier scans the barcode to apply your discount.
                </Text>
              </View>
            </>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}
