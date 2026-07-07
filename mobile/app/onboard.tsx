import { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppButton, Banner, Card, FieldInput, Pill, Screen, SectionTitle, Spinner } from '@/components/Ui';
import { getOnboarding } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';
import type { CardTheme, OnboardingResponse } from '@/lib/types';

function themeLabel(theme: CardTheme) {
  return theme.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OnboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const auth = useAuth();
  const onboarding = useOnboarding();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OnboardingResponse | null>(null);

  const summary = useMemo(() => {
    if (!result) {
      return null;
    }
    return `${themeLabel(result.theme)} · ${result.card} · ${result.vendor}`;
  }, [result]);

  async function load(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter an onboarding code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getOnboarding(trimmed);
      setResult(response);
      await onboarding.applyCodeResult(trimmed, response);
      Alert.alert('Onboarding loaded', 'Theme and business pre-selected.');
      if (auth.token) {
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load onboarding code');
    } finally {
      setLoading(false);
    }
  }

  async function continueToApp() {
    if (auth.token) {
      router.replace('/(tabs)');
      return;
    }
    router.replace('/auth');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Card>
          <SectionTitle title="Welcome" subtitle="Scan a poster QR or paste a code to pre-select the right theme and business." />
          <Banner tone="info">Deep links with the lrcard scheme open this screen automatically.</Banner>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {loading ? <Spinner /> : null}
          <FieldInput value={code} onChangeText={setCode} placeholder="Paste onboarding code" autoCapitalize="none" autoCorrect={false} />
          <AppButton onPress={() => void load(code)}>Load code</AppButton>
          <AppButton variant="secondary" onPress={() => void continueToApp()}>
            {auth.token ? 'Continue to cards' : 'Continue to sign in'}
          </AppButton>
        </Card>

        {summary ? (
          <Card>
            <SectionTitle title="Suggested selection" subtitle="Loaded from the backend." />
            <Pill tone="success">{themeLabel(result!.theme)}</Pill>
            <Text>{result!.card}</Text>
            <Text>{result!.vendor}</Text>
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: '700' }}>Store links</Text>
              <Text selectable>{result!.appStoreUrl}</Text>
              <Text selectable>{result!.playStoreUrl}</Text>
            </View>
          </Card>
        ) : null}

        <Card>
          <SectionTitle title="No QR available?" subtitle="Use the manual code fallback while testing the scaffold." />
          <Text style={{ color: '#52617a' }}>
            We do not fake camera scanning in this build. Deep links and code entry are supported so the flow is still testable.
          </Text>
          <AppButton
            variant="secondary"
            onPress={() =>
              Alert.alert(
                'Camera scanner stub',
                'Live camera QR scanning requires a native camera module and permissions. This scaffold keeps it as a clearly marked stub.',
              )
            }
          >
            Camera scan stub
          </AppButton>
          <AppButton
            variant="ghost"
            onPress={async () => {
              const url = await Linking.getInitialURL();
              if (url) {
                setCode(url);
              }
            }}
          >
            Check incoming link
          </AppButton>
        </Card>
      </ScrollView>
    </Screen>
  );
}
