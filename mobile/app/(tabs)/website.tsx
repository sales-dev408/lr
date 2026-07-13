import { useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Banner, Screen } from '@/components/Ui';
import { theme, WEBSITE_URL } from '@/lib/theme';

export default function WebsiteScreen() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  function onNav(state: WebViewNavigation) {
    setCanGoBack(state.canGoBack);
  }

  if (error) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{ gap: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => setError(null)} />}
        >
          <Banner tone="error">{error}</Banner>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE_URL }}
        onNavigationStateChange={onNav}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError('Unable to load lightraildeals.com. Pull to retry.');
        }}
        allowsBackForwardNavigationGestures={canGoBack}
        startInLoadingState
        style={styles.web}
      />
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color={theme.brand} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  web: { flex: 1 },
  loader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
