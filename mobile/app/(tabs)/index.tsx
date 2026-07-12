import { Image, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton, Card, Screen, SectionTitle } from '@/components/Ui';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24, alignItems: 'center' }}>
        <Image source={require('@/assets/images/logo.png')} style={{ width: 220, height: 80, resizeMode: 'contain', marginTop: 24 }} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#10223d', textAlign: 'center' }}>Light Rail Deals</Text>
        <Text style={{ color: '#52617a', textAlign: 'center', maxWidth: 320 }}>
          Show your phone, save money. Select a vendor, add the pass to Apple Wallet, and scan at the register.
        </Text>

        <Card>
          <SectionTitle title="How it works" subtitle="Three simple steps" />
          <View style={{ gap: 10 }}>
            <Text style={{ color: '#10223d' }}>1. Browse vendors in the Vendors tab.</Text>
            <Text style={{ color: '#10223d' }}>2. Select a vendor and tap Add to Apple Wallet.</Text>
            <Text style={{ color: '#10223d' }}>3. Use the barcode in Apple Wallet at the POS.</Text>
          </View>
        </Card>

        <Card>
          <SectionTitle title="Get started" subtitle="Choose a vendor" />
          <AppButton onPress={() => router.push('/vendors')}>View vendors</AppButton>
          <AppButton variant="secondary" onPress={() => router.push('/passes')}>My passes</AppButton>
        </Card>
      </ScrollView>
    </Screen>
  );
}
