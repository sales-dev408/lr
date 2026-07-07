import { Redirect } from 'expo-router';
import { Screen, Spinner } from '@/components/Ui';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';

export default function IndexScreen() {
  const auth = useAuth();
  const onboarding = useOnboarding();

  if (auth.loading || onboarding.loading) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  if (!onboarding.selection.code) {
    return <Redirect href="/onboard" />;
  }

  if (!auth.token) {
    return <Redirect href="/auth" />;
  }

  return <Redirect href="/(tabs)" />;
}
