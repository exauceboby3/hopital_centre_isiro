import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClinicalGovernanceService } from './clinical-governance.service';
import {
  AllocatePatientAdvanceDto,
  CreateBreakGlassAccessDto,
  CreateDeathCaseDto,
  CreatePatientAdvanceDto,
  CreatePatientEpisodeDto,
  CreatePaymentPlanDto,
  DecideAdditionalExamDto,
  UpdateDeathCaseDto,
} from './dto/clinical-governance.dto';
import { EmergencyPatientLookupService } from './emergency-patient-lookup.service';

const clinicalRoles = [Role.DOCTOR, Role.NURSE, Role.SURGEON, Role.MIDWIFE] as const;
const accountRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.RECEPTIONIST,
  Role.SECRETARY,
  Role.CASHIER,
  Role.ACCOUNTANT,
] as const;

@ApiTags('clinical-governance')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clinical-governance')
export class ClinicalGovernanceController {
  constructor(
    private readonly governance: ClinicalGovernanceService,
    private readonly emergencyLookup: EmergencyPatientLookupService,
  ) {}

  @Get('emergency-patient-lookup')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles)
  emergencyPatientLookup(@Query('search') search?: string) {
    return this.emergencyLookup.search(search);
  }

  @Get('patients/:patientId/command-center')
  @Roles(...accountRoles, ...clinicalRoles, Role.MEDICAL_BIOLOGIST, Role.LAB_TECHNICIAN)
  commandCenter(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.governance.commandCenter(patientId, user);
  }

  @Get('patients/:patientId/financial-account')
  @Roles(...accountRoles, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  financialAccount(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.governance.financialAccount(patientId);
  }

  @Post('patients/:patientId/advances')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  createAdvance(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePatientAdvanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.createAdvance(patientId, dto, user.id);
  }

  @Post('patients/:patientId/advances/allocate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  allocateAdvance(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: AllocatePatientAdvanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.allocateAdvance(patientId, dto, user.id);
  }

  @Post('patients/:patientId/payment-plans')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  createPaymentPlan(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePaymentPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.createPaymentPlan(patientId, dto, user.id);
  }

  @Get('patients/:patientId/episodes')
  @Roles(...accountRoles, ...clinicalRoles, Role.MEDICAL_BIOLOGIST, Role.LAB_TECHNICIAN, Role.RADIOLOGIST)
  episodes(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.governance.episodes(patientId);
  }

  @Post('patients/:patientId/episodes')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  createEpisode(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePatientEpisodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.createEpisode(patientId, dto, user.id);
  }

  @Patch('episodes/:id/close')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  closeEpisode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.governance.closeEpisode(id, user.id);
  }

  @Post('patients/:patientId/break-glass')
  @Roles(...clinicalRoles)
  grantBreakGlass(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateBreakGlassAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.governance.grantBreakGlass(patientId, dto, user);
  }

  @Patch('break-glass/:id/revoke')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles)
  revokeBreakGlass(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.revokeBreakGlass(id, user);
  }

  @Get('graces/report')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  graceReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.governance.graceReport(from, to);
  }

  @Get('graces/alerts')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  graceAlerts() {
    return this.governance.graceAlerts();
  }

  @Get('laboratory/additional-exams/pending')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  pendingAdditionalExams(@CurrentUser() user: AuthenticatedUser) {
    return this.governance.pendingAdditionalExams(user);
  }

  @Patch('laboratory/additional-exams/:id/decision')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  decideAdditionalExam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAdditionalExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.decideAdditionalExam(id, dto, user);
  }

  @Post('patients/:patientId/death-case')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  createDeathCase(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateDeathCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.governance.createDeathCase(patientId, dto, user);
  }

  @Patch('death-cases/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE, Role.ACCOUNTANT)
  updateDeathCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeathCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.governance.updateDeathCase(id, dto, user);
  }

  @Get('patients/:patientId/death-document')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE, Role.ACCOUNTANT)
  deathDocument(@Param('patientId', ParseUUIDPipe) patientId: string): Promise<unknown> {
    return this.governance.deathDocument(patientId, true);
  }

  @Get('doctor-waiting-room')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  doctorWaitingRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.governance.doctorWaitingRoom(user, doctorId);
  }
}
