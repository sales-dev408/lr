import { useEffect, useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { AppButton, Banner, Card, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { loadStoredPasses } from '@/lib/passes';
import type { StoredPass } from '@/lib/types';

export default function PassesScreen() {
  const [passes, setPasses] = useState<StoredPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const stored = await loadStoredPasses();
        if (mounted) {
          setPasses(stored);
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

  async function openPass(pass: StoredPass) {
    const url = pass.walletUrl;
    if (!url) {
      setError('No wallet link for this pass.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        setError('Unable to open this pass on this device.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open failed');
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Card>
          <SectionTitle title="My passes" subtitle="Passes saved from cards or vendors." />
        </Card>

        {loading ? <Spinner /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        {!loading && passes.length === 0 ? <Banner tone="info">No saved passes yet. Add one from a vendor page.</Banner> : null}

        {passes.map((pass) => (
          <Card key={pass.serialNumber}>
            <SectionTitle title={pass.cardName} subtitle={pass.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet'} />
            <AppButton onPress={() => void openPass(pass)}>Open pass</AppButton>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
