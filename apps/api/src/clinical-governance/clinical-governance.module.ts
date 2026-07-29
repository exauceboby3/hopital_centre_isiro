import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalGovernanceController } from './clinical-governance.controller';
import { ClinicalGovernanceService } from './clinical-governance.service';
import { EmergencyPatientLookupService } from './emergency-patient-lookup.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [ClinicalGovernanceController],
  providers: [ClinicalGovernanceService, EmergencyPatientLookupService],
  exports: [ClinicalGovernanceService],
})
export class ClinicalGovernanceModule {}
