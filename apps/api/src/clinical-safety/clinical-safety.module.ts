import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicalSafetyController } from './clinical-safety.controller';
import { ClinicalSafetyService } from './clinical-safety.service';
import { QualityManagementService } from './quality-management.service';
import { SecurityContinuityService } from './security-continuity.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicalSafetyController],
  providers: [ClinicalSafetyService, QualityManagementService, SecurityContinuityService],
  exports: [ClinicalSafetyService, QualityManagementService, SecurityContinuityService],
})
export class ClinicalSafetyModule {}
