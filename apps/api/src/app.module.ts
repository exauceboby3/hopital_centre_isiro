import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { LaboratoryModule } from './laboratory/laboratory.module';
import { HospitalizationsModule } from './hospitalizations/hospitalizations.module';
import { BillingModule } from './billing/billing.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { MessagesModule } from './messages/messages.module';
import { StaffModule } from './staff/staff.module';
import { ServiceReportsModule } from './service-reports/service-reports.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { validateEnvironment } from './config/env.validation';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { ConfigurationModule } from './configuration/configuration.module';
import { OperationsModule } from './operations/operations.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { NursingModule } from './nursing/nursing.module';
import { ArchivesModule } from './archives/archives.module';
import { ClinicalGovernanceModule } from './clinical-governance/clinical-governance.module';
import { ClinicalSafetyModule } from './clinical-safety/clinical-safety.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { BusinessNotificationsModule } from './business-notifications/business-notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    PushNotificationsModule,
    BusinessNotificationsModule,
    ConfigurationModule,
    OperationsModule,
    EnterpriseModule,
    AdminModule,
    AlertsModule,
    UsersModule,
    AuthModule,
    PatientsModule,
    DashboardModule,
    StaffModule,
    ServiceReportsModule,
    ClinicalGovernanceModule,
    ClinicalSafetyModule,
    AppointmentsModule,
    ConsultationsModule,
    LaboratoryModule,
    HospitalizationsModule,
    BillingModule,
    PharmacyModule,
    MessagesModule,
    NursingModule,
    ArchivesModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
