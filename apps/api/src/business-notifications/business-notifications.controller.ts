import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessNotificationsService } from './business-notifications.service';

@ApiTags('business-notifications')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard)
@Controller('business-notifications')
export class BusinessNotificationsController {
  constructor(private readonly notifications: BusinessNotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.notifications.list(user.id, limit);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unread(user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.markRead(id, user.id);
  }
}
