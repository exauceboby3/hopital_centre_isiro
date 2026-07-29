'use client';

import { TicketCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasAnyRole } from '@/lib/roles';
import { useAuth } from './auth-provider';

const voucherRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'CASHIER',
  'ACCOUNTANT',
  'RECEPTIONIST',
  'SECRETARY',
] as const;

export function CareVoucherNavigation() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  const allowed = !loading && Boolean(user) && hasAnyRole(user, voucherRoles);

  useEffect(() => {
    if (!allowed) {
      setNavigation(null);
      return;
    }

    const resolveNavigation = () => {
      const next = document.querySelector<HTMLElement>('.sidebar-nav');
      setNavigation((current) => (current === next ? current : next));
    };

    resolveNavigation();
    const observer = new MutationObserver(resolveNavigation);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [allowed]);

  if (!allowed || !navigation) return null;

  const active = pathname === '/care-vouchers' || pathname.startsWith('/care-vouchers/');
  return createPortal(
    <Link className={active ? 'nav-item active' : 'nav-item'} href="/care-vouchers">
      <TicketCheck size={19} />
      <span>Bons de soins</span>
    </Link>,
    navigation,
  );
}
