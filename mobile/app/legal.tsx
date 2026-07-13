import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { AppButton, Card, Screen, SectionTitle } from '@/components/Ui';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/lib/legal';
import { theme } from '@/lib/theme';

type Doc = 'terms' | 'privacy';

export default function LegalScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const initial: Doc = params.doc === 'privacy' ? 'privacy' : 'terms';
  const [doc, setDoc] = useState<Doc>(initial);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Legal' }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <AppButton variant={doc === 'terms' ? 'primary' : 'secondary'} onPress={() => setDoc('terms')}>
          Terms of Service
        </AppButton>
        <AppButton variant={doc === 'privacy' ? 'primary' : 'secondary'} onPress={() => setDoc('privacy')}>
          Privacy Policy
        </AppButton>
      </View>
      <Card>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <SectionTitle title={doc === 'terms' ? 'Terms of Service' : 'Privacy Policy'} />
          <Text style={{ color: theme.ink2, lineHeight: 21 }}>{doc === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}</Text>
        </ScrollView>
      </Card>
    </Screen>
  );
}
