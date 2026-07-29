import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PatientAccessService } from './patient-access.service';
import { PatientHistoryService } from './patient-history.service';
import { PatientHistoryWithDeathService } from './patient-history-with-death.service';
import { PatientTrashService } from './patient-trash.service';
import { PatientVitalSignService } from './patient-vital-sign.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [AuthModule, BillingModule, ConfigurationModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    PatientTrashService,
    { provide: PatientHistoryService, useClass: PatientHistoryWithDeathService },
    PatientAccessService,
    PatientVitalSignService,
  ],
  exports: [PatientsService, PatientAccessService],
})
export class PatientsModule {}
