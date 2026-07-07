import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearStoredAuth, getStoredProfile, getStoredToken, setStoredAuth } from './api';
import type { AuthResponse, VendorProfile } from './types';

interface AuthContextValue {
  token: string | null;
  profile: VendorProfile | null;
  isAuthenticated: boolean;
  login: (auth: AuthResponse<VendorProfile>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<VendorProfile | null>(null);

  useEffect(() => {
    setToken(getStoredToken());
    setProfile(getStoredProfile());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      profile,
      isAuthenticated: Boolean(token && profile),
      login(auth) {
        setStoredAuth(auth);
        setToken(auth.token);
        setProfile(auth.profile);
      },
      logout() {
        clearStoredAuth();
        setToken(null);
        setProfile(null);
      },
    }),
    [token, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
