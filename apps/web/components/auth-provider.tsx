'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, otpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const currentUser = await api<User>('/auth/me');
    setUser(currentUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const synchronize = () => {
      void api<User>('/auth/me')
        .then((currentUser) => {
          if (!cancelled) setUser(currentUser);
        })
        .catch(() => undefined);
    };

    api<User>('/auth/me')
      .then((currentUser) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const timer = window.setInterval(synchronize, 15000);
    window.addEventListener('focus', synchronize);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', synchronize);
    };
  }, []);

  const login = useCallback(async (username: string, password: string, otpCode?: string) => {
    const result = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, otpCode: otpCode?.trim() || undefined }),
    });
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return context;
}
