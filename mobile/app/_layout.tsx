import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { OnboardingProvider } from '@/lib/onboarding';

export default function RootLayout() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboard" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="card/[id]" />
          <Stack.Screen name="pass/[serial]" />
        </Stack>
      </OnboardingProvider>
    </AuthProvider>
  );
}
