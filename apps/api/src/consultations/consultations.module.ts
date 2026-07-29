import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ConsultationFinalizationService } from './consultation-finalization.service';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { HospitalizationReferralService } from './hospitalization-referral.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [ConsultationsController],
  providers: [
    ConsultationsService,
    HospitalizationReferralService,
    ConsultationFinalizationService,
  ],
})
export class ConsultationsModule {}
