import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0f8a5f' }}>
      <Tabs.Screen name="vendors" options={{ title: 'Deals' }} />
      <Tabs.Screen name="index" options={{ title: 'Browse' }} />
      <Tabs.Screen name="passes" options={{ title: 'My Passes' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
