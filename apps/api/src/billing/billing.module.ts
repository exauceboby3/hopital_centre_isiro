import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportingModule } from '../reporting/reporting.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CareVouchersController } from './care-vouchers.controller';
import { CareVouchersService } from './care-vouchers.service';
import { CashClosureService } from './cash-closure.service';
import { FinancialAuthorizationController } from './financial-authorization.controller';
import { FinancialAuthorizationService } from './financial-authorization.service';
import { PatientFinancialAccessController } from './patient-financial-access.controller';
import { PatientFinancialAccessService } from './patient-financial-access.service';

@Module({
  imports: [AuthModule, ReportingModule],
  controllers: [
    BillingController,
    FinancialAuthorizationController,
    CareVouchersController,
    PatientFinancialAccessController,
  ],
  providers: [
    BillingService,
    FinancialAuthorizationService,
    PatientFinancialAccessService,
    CareVouchersService,
    CashClosureService,
  ],
  exports: [FinancialAuthorizationService, PatientFinancialAccessService],
})
export class BillingModule {}
