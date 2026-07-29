import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateGraceAuthorizationDto, DeclarePatientDeathDto } from './dto/patient-financial-access.dto';
import { PatientFinancialAccessService } from './patient-financial-access.service';

@ApiTags('patient-financial-access')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patient-financial-access')
export class PatientFinancialAccessController {
  constructor(private readonly access: PatientFinancialAccessService) {}

  @Get(':patientId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.CASHIER,
    Role.ACCOUNTANT,
    Role.DOCTOR,
    Role.SURGEON,
    Role.MIDWIFE,
  )
  summary(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.access.summary(patientId);
  }

  @Post(':patientId/file-renewal')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER)
  renewFile(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.access.renewFile(patientId, user.id);
  }

  @Post(':patientId/grace')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  grantGrace(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateGraceAuthorizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.access.grantGrace(patientId, dto, user.id);
  }

  @Patch('grace/:id/revoke')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  revokeGrace(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.access.revokeGrace(id, user.id);
  }

  @Post(':patientId/death')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  declareDeath(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: DeclarePatientDeathDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.access.declareDeath(patientId, dto, user.id);
  }
}
