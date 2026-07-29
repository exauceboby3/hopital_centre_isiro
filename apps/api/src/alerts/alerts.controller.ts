import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser, effectiveRoles } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AlertsService } from './alerts.service';
import { CreateEmergencyAlertDto } from './dto/create-emergency-alert.dto';

@ApiTags('emergency-alerts')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('active')
  active(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.active(effectiveRoles(user));
  }

  @Get('history')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  history() {
    return this.alerts.history();
  }

  @Post()
  create(@Body() dto: CreateEmergencyAlertDto, @CurrentUser() user: AuthenticatedUser) {
    return this.alerts.create(dto, user.id);
  }

  @Patch(':id/resolve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE)
  resolve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alerts.resolve(id, user.id);
  }
}
