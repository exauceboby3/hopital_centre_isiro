import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AppointmentStatus, BillableServiceType, Role } from '@prisma/client';
import { PatientFinancialAccessService } from '../billing/patient-financial-access.service';
import { ClinicalGovernanceService } from '../clinical-governance/clinical-governance.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateVitalSignDto } from '../consultations/dto/create-vital-sign.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentAcknowledgementService } from './appointment-acknowledgement.service';
import { AppointmentsService } from './appointments.service';
import { DoctorAvailabilityService } from './doctor-availability.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { TransferAppointmentDto } from './dto/transfer-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

const clinicianRoles = [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE] as const;

@ApiTags('appointments')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly availability: DoctorAvailabilityService,
    private readonly acknowledgement: AppointmentAcknowledgementService,
    private readonly financialAccess: PatientFinancialAccessService,
    private readonly governance: ClinicalGovernanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status', new ParseEnumPipe(AppointmentStatus, { optional: true }))
    status?: AppointmentStatus,
    @Query('scope') scope?: 'active' | 'history',
  ) {
    return this.appointments.list(from, to, status, scope === 'history' ? 'history' : 'active');
  }

  @Post('maintenance/mark-no-shows')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY)
  markNoShows() {
    return this.appointments.markPastScheduledAsNoShow();
  }

  @Get('doctors/availability')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    ...clinicianRoles,
  )
  doctorAvailability() {
    return this.availability.list();
  }

  @Get('waiting-room')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicianRoles)
  waitingRoom(@CurrentUser() user: AuthenticatedUser) {
    if (!hasAnyRole(user, clinicianRoles)) return [];
    return this.governance.doctorWaitingRoom(user);
  }

  @Post()
  async create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    await this.financialAccess.assertCareAccess(
      dto.patientId,
      BillableServiceType.CONSULTATION,
    );
    const appointment = await this.appointments.create(dto, user.id);
    await this.governance.ensureEpisodeForAppointment(appointment.id, user.id);
    return appointment;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.status === AppointmentStatus.CHECKED_IN) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id },
        select: { patientId: true },
      });
      if (appointment) {
        await this.financialAccess.assertCareAccess(
          appointment.patientId,
          BillableServiceType.CONSULTATION,
        );
      }
    }
    return this.appointments.update(id, dto, user.id);
  }

  @Post(':id/vitals')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.NURSE,
  )
  recordVitals(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVitalSignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointments.recordVitals(id, dto, user.id);
  }

  @Patch(':id/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicianRoles)
  acknowledge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.acknowledgement.acknowledge(id, user);
  }

  @Patch(':id/transfer')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicianRoles)
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointments.transfer(
      id,
      dto.doctorId,
      dto.reason?.trim() || 'Transfert rapide depuis la salle d’attente médicale',
      user,
    );
  }
}
