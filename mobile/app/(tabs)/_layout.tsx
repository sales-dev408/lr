import { Tabs } from 'expo-router';
import { theme } from '@/lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.subtle,
        tabBarStyle: {
          backgroundColor: theme.panel,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="vendors" options={{ title: 'Deals' }} />
      <Tabs.Screen name="index" options={{ title: 'Browse' }} />
      <Tabs.Screen name="website" options={{ title: 'Website' }} />
      <Tabs.Screen name="passes" options={{ title: 'My Passes' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
