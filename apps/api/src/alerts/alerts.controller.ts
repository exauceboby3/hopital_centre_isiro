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
import { PatientAccessService } from '../patients/patient-access.service';
import { AlertsService } from './alerts.service';
import {
  CreateEmergencyAlertCommentDto,
  CreateEmergencyAlertDto,
} from './dto/create-emergency-alert.dto';

@ApiTags('emergency-alerts')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly patientAccess: PatientAccessService,
  ) {}

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
  async create(@Body() dto: CreateEmergencyAlertDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.patientId) await this.patientAccess.assertCanAccess(dto.patientId, user);
    return this.alerts.create(dto, user.id);
  }

  @Get('patient/:patientId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE, Role.NURSE)
  async patientAlerts(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.patientAccess.assertCanAccess(patientId, user);
    return this.alerts.patientAlerts(patientId);
  }

  @Post(':id/comments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE, Role.NURSE)
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEmergencyAlertCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const patientId = await this.alerts.patientIdForAlert(id);
    if (patientId) await this.patientAccess.assertCanAccess(patientId, user);
    return this.alerts.addComment(id, dto.comment, user.id);
  }

  @Patch(':id/resolve')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.DOCTOR,
    Role.NURSE,
    Role.SURGEON,
    Role.MIDWIFE,
    Role.RADIOLOGIST,
  )
  resolve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.alerts.resolve(id, user.id);
  }
}
