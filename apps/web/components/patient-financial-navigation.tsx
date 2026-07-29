'use client';

import {
  Gauge,
  HandHeart,
  HeartPulse,
  KeyRound,
  Landmark,
  Pill,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasAnyRole } from '@/lib/roles';
import { useAuth } from './auth-provider';

const financialRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTIONIST',
  'SECRETARY',
  'CASHIER',
  'ACCOUNTANT',
  'DOCTOR',
  'SURGEON',
  'MIDWIFE',
] as const;
const waitingRoomRoles = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE'] as const;
const medicationRoles = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE', 'NURSE'] as const;
const breakGlassRoles = ['DOCTOR', 'NURSE', 'SURGEON', 'MIDWIFE'] as const;
const clinicalSafetyRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTIONIST',
  'SECRETARY',
  'DOCTOR',
  'SURGEON',
  'MIDWIFE',
  'NURSE',
  'LAB_TECHNICIAN',
  'MEDICAL_BIOLOGIST',
  'RADIOLOGIST',
  'PHARMACIST',
] as const;
const qualityRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'LAB_TECHNICIAN',
  'MEDICAL_BIOLOGIST',
  'RADIOLOGIST',
  'PHARMACIST',
  'ACCOUNTANT',
] as const;

export function PatientFinancialNavigation() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  const showFinancial = !loading && Boolean(user) && hasAnyRole(user, financialRoles);
  const showWaitingRoom = !loading && Boolean(user) && hasAnyRole(user, waitingRoomRoles);
  const showMedication = !loading && Boolean(user) && hasAnyRole(user, medicationRoles);
  const showBreakGlass = !loading && Boolean(user) && hasAnyRole(user, breakGlassRoles);
  const showClinicalSafety = !loading && Boolean(user) && hasAnyRole(user, clinicalSafetyRoles);
  const showQuality = !loading && Boolean(user) && hasAnyRole(user, qualityRoles);
  const showSecuritySettings = !loading && Boolean(user);
  const allowed =
    showFinancial ||
    showWaitingRoom ||
    showMedication ||
    showBreakGlass ||
    showClinicalSafety ||
    showQuality ||
    showSecuritySettings;

  useEffect(() => {
    if (!allowed) {
      setNavigation(null);
      return;
    }
    const resolve = () => {
      const next = document.querySelector<HTMLElement>('.sidebar-nav');
      setNavigation((current) => (current === next ? current : next));
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [allowed]);

  if (!allowed || !navigation) return null;
  return createPortal(
    <>
      {showFinancial && (
        <Link
          className={pathname.startsWith('/financial-assistance') ? 'nav-item active' : 'nav-item'}
          href="/financial-assistance"
        >
          <HandHeart size={19} />
          <span>Fiche & grâce</span>
        </Link>
      )}
      {showFinancial && (
        <Link
          className={pathname.startsWith('/clinical-governance') ? 'nav-item active' : 'nav-item'}
          href="/clinical-governance"
        >
          <Landmark size={19} />
          <span>Compte & épisodes</span>
        </Link>
      )}
      {showClinicalSafety && (
        <Link
          className={pathname.startsWith('/clinical-safety') ? 'nav-item active' : 'nav-item'}
          href="/clinical-safety"
        >
          <HeartPulse size={19} />
          <span>Sécurité clinique</span>
        </Link>
      )}
      {showQuality && (
        <Link
          className={pathname.startsWith('/quality-continuity') ? 'nav-item active' : 'nav-item'}
          href="/quality-continuity"
        >
          <Gauge size={19} />
          <span>Qualité & continuité</span>
        </Link>
      )}
      {showWaitingRoom && (
        <Link
          className={pathname.startsWith('/doctor-waiting-room') ? 'nav-item active' : 'nav-item'}
          href="/doctor-waiting-room"
        >
          <UsersRound size={19} />
          <span>Salle d’attente médecin</span>
        </Link>
      )}
      {showMedication && (
        <Link
          className={pathname.startsWith('/medication-administration') ? 'nav-item active' : 'nav-item'}
          href="/medication-administration"
        >
          <Pill size={19} />
          <span>Feuille médicaments</span>
        </Link>
      )}
      {showBreakGlass && (
        <Link
          className={pathname.startsWith('/emergency-access') ? 'nav-item active' : 'nav-item'}
          href="/emergency-access"
        >
          <ShieldAlert size={19} />
          <span>Accès d’urgence</span>
        </Link>
      )}
      {showSecuritySettings && (
        <Link
          className={pathname.startsWith('/security-settings') ? 'nav-item active' : 'nav-item'}
          href="/security-settings"
        >
          <KeyRound size={19} />
          <span>Sécurité du compte</span>
        </Link>
      )}
    </>,
    navigation,
  );
}
