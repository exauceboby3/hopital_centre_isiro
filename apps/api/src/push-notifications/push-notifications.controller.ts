import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  SubscribePushNotificationDto,
  UnsubscribePushNotificationDto,
} from './dto/push-subscription.dto';
import { PushNotificationsService } from './push-notifications.service';

@ApiTags('push-notifications')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard)
@Controller('push-notifications')
export class PushNotificationsController {
  constructor(private readonly notifications: PushNotificationsService) {}

  @Get('public-key')
  publicKey() {
    return this.notifications.publicConfiguration();
  }

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.subscriptionStatus(user.id);
  }

  @Post('subscribe')
  subscribe(
    @Body() dto: SubscribePushNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.notifications.subscribe(user.id, dto, request.get('user-agent'));
  }

  @Delete('subscribe')
  unsubscribe(
    @Body() dto: UnsubscribePushNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.unsubscribe(user.id, dto.endpoint);
  }

  @Post('test')
  test(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.sendTest(user.id);
  }
}
