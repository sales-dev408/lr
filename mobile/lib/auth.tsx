import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as loginRequest, register as registerRequest, socialLogin as socialLoginRequest } from './api';
import { getItem, removeItem, setItem } from './storage';
import type { AuthResponse, UserProfile } from './types';

const AUTH_KEY = 'lr.mobile.auth';

type AuthContextValue = {
  loading: boolean;
  token: string | null;
  profile: UserProfile | null;
  loginWithPassword: (body: { email?: string; phone?: string; password: string }) => Promise<void>;
  registerAccount: (body: { email?: string; phone?: string; password: string; fullName: string }) => Promise<void>;
  loginWithSocial: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const raw = await getItem(AUTH_KEY);
      if (!mounted) {
        return;
      }
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as AuthResponse<UserProfile>;
          setToken(parsed.token);
          setProfile(parsed.profile);
        } catch {
          await removeItem(AUTH_KEY);
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function persist(auth: AuthResponse<UserProfile>) {
    setToken(auth.token);
    setProfile(auth.profile);
    await setItem(AUTH_KEY, JSON.stringify(auth));
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      token,
      profile,
      loginWithPassword: async (body) => {
        const auth = await loginRequest(body);
        await persist(auth);
      },
      registerAccount: async (body) => {
        const auth = await registerRequest(body);
        await persist(auth);
      },
      loginWithSocial: async () => {
        const auth = await socialLoginRequest({
          provider: 'stub',
          token: 'placeholder-token',
          fullName: 'Social User',
        });
        await persist(auth);
      },
      logout: async () => {
        setToken(null);
        setProfile(null);
        await removeItem(AUTH_KEY);
      },
    }),
    [loading, profile, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
