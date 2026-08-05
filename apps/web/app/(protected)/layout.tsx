import './professional-workflows.css';
import './laboratory-overrides.css';
import './laboratory-workflow.css';
import './consultation-focus.css';
import './print-date-separators.css';
import './archive-professional.css';
import './interaction-fixes.css';
import './patient-subfolders.css';
import './financial-access.css';
import './nursing-workflow.css';
import './clinical-governance.css';
import './clinical-safety.css';
import './quality-continuity.css';
import './idle-session.css';
import './security-settings.css';
import './role-navigation.css';
import './push-notifications.css';
import './final-ui-polish.css';
import './final-visibility.css';
import { AppointmentDoctorRequirement } from '@/components/appointment-doctor-requirement';
import { AppointmentFileAccessPresentation } from '@/components/appointment-file-access-presentation';
import { AppointmentVitalsVisibility } from '@/components/appointment-vitals-visibility';
import { BiologistAdditionalExamPanel } from '@/components/biologist-additional-exam-panel';
import { DataExchangeLauncher } from '@/components/data-exchange-launcher';
import { GraceExpiryNotifications } from '@/components/grace-expiry-notifications';
import { IdleSessionGuard } from '@/components/idle-session-guard';
import { LaboratoryBatchValidationPanel } from '@/components/laboratory-batch-validation-panel';
import { LaboratoryGroupPrintAction } from '@/components/laboratory-group-print-action';
import { LaboratoryPatientAccess } from '@/components/laboratory-patient-access';
import { NotificationCenter } from '@/components/notification-center';
import { PatientHistorySubfolders } from '@/components/patient-history-subfolders';
import { PrintDateSeparators } from '@/components/print-date-separators';
import { PrintModeLayout } from '@/components/print-mode-layout';
import { ProfilePhotoManager } from '@/components/profile-photo-manager';
import { ProtectedShell } from '@/components/protected-shell';
import { PushNotificationManager } from '@/components/push-notification-manager';
import { RoleNavigationVisibility } from '@/components/role-navigation-visibility';
import { RoleRouteGuard } from '@/components/role-route-guard';

export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RoleRouteGuard>
      <ProtectedShell>
        <IdleSessionGuard />
        <NotificationCenter />
        <PushNotificationManager />
        <PrintModeLayout />
        <RoleNavigationVisibility />
        <GraceExpiryNotifications />
        <AppointmentDoctorRequirement />
        <AppointmentFileAccessPresentation />
        <LaboratoryBatchValidationPanel />
        <BiologistAdditionalExamPanel />
        <AppointmentVitalsVisibility />
        <PatientHistorySubfolders />
        <PrintDateSeparators />
        <LaboratoryGroupPrintAction />
        <LaboratoryPatientAccess />
        <ProfilePhotoManager />
        <DataExchangeLauncher />
        {children}
      </ProtectedShell>
    </RoleRouteGuard>
  );
}
