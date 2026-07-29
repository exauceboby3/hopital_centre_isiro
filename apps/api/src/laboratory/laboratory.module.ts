import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalGovernanceModule } from '../clinical-governance/clinical-governance.module';
import { BiologistAdditionalExamService } from './biologist-additional-exam.service';
import { LaboratoryBatchValidationService } from './laboratory-batch-validation.service';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryProfileService } from './laboratory-profile.service';
import { LaboratoryRequestPrintController } from './laboratory-request-print.controller';
import { LaboratoryService } from './laboratory.service';

@Module({
  imports: [AuthModule, BillingModule, ClinicalGovernanceModule],
  controllers: [LaboratoryController, LaboratoryRequestPrintController],
  providers: [
    LaboratoryService,
    LaboratoryProfileService,
    LaboratoryBatchValidationService,
    BiologistAdditionalExamService,
  ],
})
export class LaboratoryModule {}
