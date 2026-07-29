'use client';

import { Activity } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { canAccessPath, defaultRouteForUser } from '@/lib/access-control';
import { useAuth } from './auth-provider';

export function RoleRouteGuard({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = Boolean(user) && canAccessPath(user, pathname);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user && !allowed) {
      router.replace(defaultRouteForUser(user));
    }
  }, [allowed, loading, router, user]);

  if (loading || !user || !allowed) {
    return (
      <main className="loading-screen" aria-live="polite">
        <Activity className="spin" size={32} />
        <p>{user && !allowed ? 'Ouverture de votre espace métier…' : 'Chargement sécurisé…'}</p>
      </main>
    );
  }

  return children;
}
