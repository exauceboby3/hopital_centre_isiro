'use client';

import Link from 'next/link';
import { UserRoundCog } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { hasAnyRole, hasRole } from '@/lib/roles';
import { useAuth } from './auth-provider';
import { LabCatalogEditor } from './lab-catalog-editor';

export function LaboratoryPatientAccess() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname !== '/laboratory') return null;

  const canConfigureCatalog = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'MEDICAL_BIOLOGIST']);
  const canCorrectPatient = hasRole(user, 'MEDICAL_BIOLOGIST');
  if (!canConfigureCatalog && !canCorrectPatient) return null;

  return (
    <div className="laboratory-patient-access">
      {canCorrectPatient && (
        <Link className="secondary-button" href="/patients">
          <UserRoundCog size={17} /> Corriger les informations d’un patient
        </Link>
      )}
      {canConfigureCatalog && <LabCatalogEditor />}
    </div>
  );
}
