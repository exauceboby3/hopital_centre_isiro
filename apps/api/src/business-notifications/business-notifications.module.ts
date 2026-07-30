import { Module } from '@nestjs/common';
import { BusinessNotificationsController } from './business-notifications.controller';
import { BusinessNotificationsService } from './business-notifications.service';

@Module({
  controllers: [BusinessNotificationsController],
  providers: [BusinessNotificationsService],
  exports: [BusinessNotificationsService],
})
export class BusinessNotificationsModule {}
