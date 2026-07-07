import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

export function Screen({ children, ...props }: ViewProps) {
  return (
    <View style={styles.screen} {...props}>
      {children}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function AppButton({ children, variant = 'primary', ...props }: PressableProps & { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.button_primary,
        variant === 'secondary' && styles.button_secondary,
        variant === 'ghost' && styles.button_ghost,
        variant === 'danger' && styles.button_danger,
        pressed && styles.buttonPressed,
      ]}
      {...props}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' || variant === 'ghost' ? styles.buttonTextDark : null,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function FieldInput(props: TextInputProps) {
  return <TextInput placeholderTextColor="#7c8a9d" style={styles.input} {...props} />;
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' }) {
  return (
    <View style={[styles.banner, tone === 'info' && styles.banner_info, tone === 'error' && styles.banner_error, tone === 'success' && styles.banner_success]}>
      <Text style={styles.bannerText}>{children}</Text>
    </View>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' }) {
  return (
    <View style={[styles.pill, tone === 'neutral' && styles.pill_neutral, tone === 'success' && styles.pill_success, tone === 'warning' && styles.pill_warning]}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

export function Spinner() {
  return <ActivityIndicator color="#2563eb" />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f9fc',
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5ebf3',
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10223d',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#52617a',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button_primary: { backgroundColor: '#2563eb' },
  button_secondary: { backgroundColor: '#e5eefb' },
  button_ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#c9d5e6' },
  button_danger: { backgroundColor: '#dc2626' },
  buttonPressed: { opacity: 0.86 },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonTextDark: { color: '#10223d' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d7dfeb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#10223d',
  },
  banner: {
    borderRadius: 14,
    padding: 12,
  },
  banner_info: { backgroundColor: '#e7f1ff' },
  banner_error: { backgroundColor: '#fde8e8' },
  banner_success: { backgroundColor: '#e6f8ef' },
  bannerText: {
    color: '#10223d',
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  pill_neutral: { backgroundColor: '#eef3f9' },
  pill_success: { backgroundColor: '#def7e9' },
  pill_warning: { backgroundColor: '#fff1d9' },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10223d',
  },
});
