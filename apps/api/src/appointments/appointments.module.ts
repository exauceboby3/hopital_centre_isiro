import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalGovernanceModule } from '../clinical-governance/clinical-governance.module';
import { AppointmentAcknowledgementService } from './appointment-acknowledgement.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DoctorAvailabilityService } from './doctor-availability.service';

@Module({
  imports: [AuthModule, BillingModule, ClinicalGovernanceModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, DoctorAvailabilityService, AppointmentAcknowledgementService],
})
export class AppointmentsModule {}
