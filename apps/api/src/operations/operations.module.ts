import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [BillingModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
