import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ReportingModule } from '../reporting/reporting.module';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';
import { GraceAwareEnterpriseService } from './grace-aware-enterprise.service';

@Module({
  imports: [BillingModule, ReportingModule],
  controllers: [EnterpriseController],
  providers: [{ provide: EnterpriseService, useClass: GraceAwareEnterpriseService }],
})
export class EnterpriseModule {}
