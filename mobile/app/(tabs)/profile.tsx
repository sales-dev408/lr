import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton, Banner, Card, Screen, SectionTitle } from '@/components/Ui';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';

function selectedSummary(theme?: string, cardName?: string, vendorName?: string) {
  const parts = [theme, cardName, vendorName].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No onboarding selection yet';
}

export default function ProfileScreen() {
  const router = useRouter();
  const auth = useAuth();
  const onboarding = useOnboarding();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Card>
          <SectionTitle title="Profile" subtitle="Signed-in customer details and app preferences." />
          {auth.profile ? (
            <>
              <Text style={{ fontWeight: '700', color: '#10223d' }}>{auth.profile.fullName}</Text>
              <Text style={{ color: '#52617a' }}>{auth.profile.email ?? auth.profile.phone ?? 'No email/phone on file'}</Text>
              <Text style={{ color: '#52617a' }}>Status: {auth.profile.status}</Text>
            </>
          ) : (
            <Banner tone="info">No customer profile is signed in.</Banner>
          )}
        </Card>

        <Card>
          <SectionTitle title="Onboarding selection" subtitle="What the poster QR pre-selected." />
          <Text style={{ color: '#10223d' }}>{selectedSummary(onboarding.selection.theme, onboarding.selection.cardName, onboarding.selection.vendorName)}</Text>
          <Text style={{ color: '#52617a' }}>App Store: {onboarding.selection.appStoreUrl ?? 'n/a'}</Text>
          <Text style={{ color: '#52617a' }}>Play Store: {onboarding.selection.playStoreUrl ?? 'n/a'}</Text>
          <AppButton variant="secondary" onPress={() => router.push('/onboard')}>
            Re-open onboarding
          </AppButton>
        </Card>

        <Card>
          <SectionTitle title="Session" subtitle="JWT and user profile are stored securely when possible." />
          <AppButton
            variant="danger"
            onPress={() => {
              void auth.logout().then(() => router.replace('/auth'));
            }}
          >
            Log out
          </AppButton>
        </Card>
      </ScrollView>
    </Screen>
  );
}
