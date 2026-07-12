import { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton, Banner, Card, FieldInput, Screen, SectionTitle } from '@/components/Ui';
import { useAuth } from '@/lib/auth';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitLabel = useMemo(() => (mode === 'login' ? 'Log in' : 'Create account'), [mode]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        await auth.loginWithPassword({
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          password,
        });
      } else {
        await auth.registerAccount({
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          password,
          fullName: fullName || 'Customer',
        });
      }
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Card>
          <SectionTitle title="Customer sign in" subtitle="Email or phone + password." />
          {error ? <Banner tone="error">{error}</Banner> : null}
          <FieldInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
          <FieldInput value={phone} onChangeText={setPhone} placeholder="Phone" autoCapitalize="none" keyboardType="phone-pad" />
          {mode === 'register' ? <FieldInput value={fullName} onChangeText={setFullName} placeholder="Full name" /> : null}
          <FieldInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
          <AppButton onPress={() => void submit()}>{loading ? 'Working…' : submitLabel}</AppButton>
          <AppButton variant="secondary" onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
            Switch to {mode === 'login' ? 'register' : 'login'}
          </AppButton>
          <AppButton
            variant="ghost"
            onPress={() =>
              void (async () => {
                setLoading(true);
                setError(null);
                try {
                  await auth.loginWithSocial();
                  router.replace('/(tabs)');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Social sign in failed');
                } finally {
                  setLoading(false);
                }
              })()
            }
          >
            Continue with social
          </AppButton>
        </Card>

        <Card>
          <SectionTitle title="What happens next" subtitle="This scaffold uses the real backend auth endpoints." />
          <Text style={{ color: '#52617a' }}>
            Successful sign in stores the JWT in secure storage when available, then falls back to AsyncStorage on platforms where secure storage is unavailable.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
