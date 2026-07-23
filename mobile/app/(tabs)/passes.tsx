import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { AppButton, AppleTrademark, Banner, BrandHeader, Card, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { getMyPass } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CreatePassResponse } from '@/lib/types';

export default function PassesScreen() {
  const { token } = useAuth();
  const [pass, setPass] = useState<CreatePassResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!token) {
        setPass(null);
        setLoading(false);
        return () => {
          active = false;
        };
      }
      setLoading(true);
      setError(null);
      getMyPass()
        .then((data) => {
          if (active) setPass(data);
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : 'Unable to load your membership pass');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [token]),
  );

  async function addToWallet() {
    const url = pass?.walletUrl ?? pass?.passUrl;
    if (!url) {
      setError('Your wallet pass is still being generated. Please try again shortly.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setError('Unable to open Apple Wallet.');
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <BrandHeader subtitle="My membership card" />

        {!token ? (
          <Card>
            <SectionTitle title="Your membership card" subtitle="Sign in to get your all-in-one pass." />
            <Banner tone="info">Create an account or sign in and your membership pass is generated automatically.</Banner>
            <Link href="/auth" asChild>
              <AppButton>Sign in</AppButton>
            </Link>
          </Card>
        ) : null}

        {loading ? <Spinner /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        {token && pass ? (
          <Card>
            <SectionTitle title="Light Rail Membership" subtitle="One card, every participating business." />
            <View style={{ backgroundColor: '#0B1F3A', borderRadius: 16, padding: 20, gap: 6 }}>
              <Text style={{ color: '#8FB2D9', fontSize: 12, letterSpacing: 1 }}>MEMBER BARCODE</Text>
              <Text selectable style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
                {pass.pass.barcodeValue}
              </Text>
            </View>
            <Text style={{ color: '#52617a' }}>
              Show this pass at any participating business. Staff scan the barcode and your member discount is applied.
            </Text>
            <AppButton onPress={() => void addToWallet()}>Add to Apple Wallet</AppButton>
            {pass.androidUrl ? (
              <AppButton variant="secondary" onPress={() => void Linking.openURL(pass.androidUrl as string)}>
                Add to Google Wallet
              </AppButton>
            ) : null}
            <Link href="/vendors" asChild>
              <AppButton variant="secondary">See participating businesses</AppButton>
            </Link>
            <AppleTrademark />
          </Card>
        ) : null}

        {token && !loading && !pass && !error ? (
          <Banner tone="info">Your membership pass is being set up. Pull to refresh in a moment.</Banner>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
