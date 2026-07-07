import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getItem, removeItem, setItem } from './storage';
import type { CardTheme, OnboardingResponse } from './types';

const ONBOARDING_KEY = 'lr.mobile.onboarding';

export type OnboardingSelection = {
  code?: string;
  theme?: CardTheme;
  cardName?: string;
  vendorName?: string;
  city?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
};

type OnboardingContextValue = {
  loading: boolean;
  selection: OnboardingSelection;
  applyCodeResult: (code: string, result: OnboardingResponse) => Promise<void>;
  updateSelection: (selection: Partial<OnboardingSelection>) => Promise<void>;
  clearSelection: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<OnboardingSelection>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      const raw = await getItem(ONBOARDING_KEY);
      if (!mounted) {
        return;
      }
      if (raw) {
        try {
          setSelection(JSON.parse(raw) as OnboardingSelection);
        } catch {
          await removeItem(ONBOARDING_KEY);
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function persist(next: OnboardingSelection) {
    setSelection(next);
    await setItem(ONBOARDING_KEY, JSON.stringify(next));
  }

  const value = useMemo<OnboardingContextValue>(
    () => ({
      loading,
      selection,
      applyCodeResult: async (code, result) => {
        await persist({
          code,
          theme: result.theme,
          cardName: result.card,
          vendorName: result.vendor,
          appStoreUrl: result.appStoreUrl,
          playStoreUrl: result.playStoreUrl,
        });
      },
      updateSelection: async (patch) => {
        await persist({ ...selection, ...patch });
      },
      clearSelection: async () => {
        setSelection({});
        await removeItem(ONBOARDING_KEY);
      },
    }),
    [loading, selection],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return value;
}
