'use client';

import {
  BedDouble,
  FileHeart,
  Gauge,
  HandHeart,
  KeyRound,
  Landmark,
  Pill,
  ShieldAlert,
  TicketCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { canAccessPath } from '@/lib/access-control';
import { useAuth } from './auth-provider';

const supplementalNavigation = [
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/hospitalizations', label: 'Hospitalisations', icon: BedDouble },
  { href: '/doctor-waiting-room', label: 'Salle d’attente médecin', icon: UsersRound },
  { href: '/medication-administration', label: 'Feuille médicaments', icon: Pill },
  { href: '/care-vouchers', label: 'Bons de soins', icon: TicketCheck },
  { href: '/financial-assistance', label: 'Fiche & grâce', icon: HandHeart },
  { href: '/clinical-governance', label: 'Compte & épisodes', icon: Landmark },
  { href: '/clinical-safety', label: 'Sécurité clinique', icon: FileHeart },
  { href: '/emergency-access', label: 'Accès d’urgence', icon: ShieldAlert },
  { href: '/quality-continuity', label: 'Qualité & continuité', icon: Gauge },
  { href: '/security-settings', label: 'Sécurité des comptes', icon: KeyRound },
] as const;

function hasPrimaryLink(navigation: HTMLElement, href: string): boolean {
  return Array.from(navigation.children).some(
    (child) => child.tagName === 'A' && child.getAttribute('href') === href,
  );
}

export function RoleNavigationVisibility() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (loading || !user) {
      setNavigation(null);
      return;
    }

    const synchronize = () => {
      const element = document.querySelector<HTMLElement>('.sidebar-nav');
      if (!element) return;
      element.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((link) => {
        const href = link.getAttribute('href');
        if (href) link.hidden = !canAccessPath(user, href);
      });
      setNavigation((current) => (current === element ? current : element));
    };

    synchronize();
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [loading, user]);

  if (!user || !navigation) return null;

  const missingLinks = supplementalNavigation.filter(
    ({ href }) => canAccessPath(user, href) && !hasPrimaryLink(navigation, href),
  );
  if (missingLinks.length === 0) return null;

  return createPortal(
    <div className="role-nav-extension" aria-label="Espace métier">
      <span className="role-nav-title">Espace métier</span>
      {missingLinks.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link className={active ? 'nav-item active' : 'nav-item'} href={href} key={href}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>,
    navigation,
    'role-navigation-extension',
  );
}
