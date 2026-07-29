import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalGovernanceModule } from '../clinical-governance/clinical-governance.module';
import { MedicationAdministrationLedgerService } from './medication-administration-ledger.service';
import { NursingController } from './nursing.controller';
import { NursingService } from './nursing.service';

@Module({
  imports: [AuthModule, BillingModule, ClinicalGovernanceModule],
  controllers: [NursingController],
  providers: [NursingService, MedicationAdministrationLedgerService],
})
export class NursingModule {}
