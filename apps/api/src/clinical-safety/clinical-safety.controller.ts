import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
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
import { ClinicalSafetyService } from './clinical-safety.service';
import {
  CreateAmendmentDto,
  CreateBackupRunDto,
  CreateClinicalAlertDto,
  CreateConsentDto,
  CreateDischargeSummaryDto,
  CreateEquipmentDto,
  CreateFollowUpDto,
  CreateIncidentDto,
  CreateMaintenanceDto,
  CreateNursingHandoffDto,
  CreateOfflineConflictDto,
  CreateSpecimenDto,
  CreateTriageDto,
  DecideAmendmentDto,
  ResolveOfflineConflictDto,
  UpdateBedTurnoverDto,
  UpdateIncidentDto,
  UpdateMaintenanceDto,
  UpdateSpecimenDto,
  VerifyIdentityDto,
} from './dto/clinical-safety.dto';
import { QualityManagementService } from './quality-management.service';
import { SecurityContinuityService } from './security-continuity.service';

const clinicalRoles = [Role.DOCTOR, Role.NURSE, Role.SURGEON, Role.MIDWIFE] as const;
const laboratoryRoles = [Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST] as const;
const administrativeRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.RECEPTIONIST,
  Role.SECRETARY,
  Role.CASHIER,
  Role.ACCOUNTANT,
] as const;

@ApiTags('clinical-safety')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clinical-safety')
export class ClinicalSafetyController {
  constructor(
    private readonly safety: ClinicalSafetyService,
    private readonly quality: QualityManagementService,
    private readonly continuity: SecurityContinuityService,
  ) {}

  @Post('patients/:patientId/triage')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.NURSE, Role.DOCTOR)
  createTriage(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateTriageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createTriage(patientId, dto, user);
  }

  @Get('patients/:patientId/triage')
  @Roles(...administrativeRoles, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST)
  triageHistory(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.safety.triageHistory(patientId);
  }

  @Get('doctor-queue')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  doctorQueue(@CurrentUser() user: AuthenticatedUser, @Query('doctorId') doctorId?: string) {
    return this.safety.doctorQueue(user, doctorId);
  }

  @Post('patients/:patientId/alerts')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles, Role.PHARMACIST, Role.MEDICAL_BIOLOGIST)
  createAlert(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateClinicalAlertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createAlert(patientId, dto, user);
  }

  @Get('patients/:patientId/alerts')
  @Roles(...administrativeRoles, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST, Role.PHARMACIST)
  alerts(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('includeResolved', new ParseBoolPipe({ optional: true })) includeResolved?: boolean,
  ) {
    return this.safety.alerts(patientId, includeResolved);
  }

  @Patch('alerts/:id/resolve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles)
  resolveAlert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.safety.resolveAlert(id, user);
  }

  @Post('patients/:patientId/identity-verifications')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles, ...laboratoryRoles, Role.PHARMACIST, Role.RADIOLOGIST)
  verifyIdentity(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: VerifyIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.verifyIdentity(patientId, dto, user);
  }

  @Post('specimens')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE, ...laboratoryRoles)
  createSpecimen(@Body() dto: CreateSpecimenDto, @CurrentUser() user: AuthenticatedUser) {
    return this.safety.createSpecimen(dto, user);
  }

  @Get('specimens')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE, Role.DOCTOR, ...laboratoryRoles)
  specimens(@Query('status') status?: string, @Query('patientId') patientId?: string) {
    return this.safety.specimens(status, patientId);
  }

  @Patch('specimens/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE, ...laboratoryRoles)
  updateSpecimen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.updateSpecimen(id, dto, user);
  }

  @Post('patients/:patientId/discharge-summaries')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  createDischargeSummary(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateDischargeSummaryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createDischargeSummary(patientId, dto, user);
  }

  @Get('patients/:patientId/discharge-summaries')
  @Roles(...administrativeRoles, ...clinicalRoles)
  dischargeSummaries(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.safety.dischargeSummaries(patientId);
  }

  @Get('discharge-summaries/:id/document')
  @Roles(...administrativeRoles, ...clinicalRoles)
  dischargeDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.safety.dischargeDocument(id);
  }

  @Get('bed-board')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.NURSE, Role.DOCTOR)
  bedBoard() {
    return this.safety.bedBoard();
  }

  @Patch('bed-turnovers/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE, Role.RECEPTIONIST, Role.SECRETARY)
  updateBedTurnover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBedTurnoverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.updateBedTurnover(id, dto, user);
  }

  @Post('patients/:patientId/handoffs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE)
  createHandoff(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateNursingHandoffDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createHandoff(patientId, dto, user);
  }

  @Get('handoffs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE, Role.DOCTOR)
  handoffs(@CurrentUser() user: AuthenticatedUser, @Query('patientId') patientId?: string) {
    return this.safety.handoffs(user, patientId);
  }

  @Patch('handoffs/:id/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE)
  acknowledgeHandoff(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.safety.acknowledgeHandoff(id, user);
  }

  @Get('medication-alerts')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE, Role.DOCTOR)
  medicationAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.safety.medicationAlerts(user);
  }

  @Post('patients/:patientId/follow-ups')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  createFollowUp(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createFollowUp(patientId, dto, user);
  }

  @Get('follow-ups')
  @Roles(...administrativeRoles, ...clinicalRoles)
  followUps(
    @Query('patientId') patientId?: string,
    @Query('upcomingOnly', new ParseBoolPipe({ optional: true })) upcomingOnly?: boolean,
  ) {
    return this.safety.followUps(patientId, upcomingOnly);
  }

  @Patch('follow-ups/:id/complete')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE)
  completeFollowUp(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.safety.completeFollowUp(id, user);
  }

  @Post('patients/:patientId/consents')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles)
  createConsent(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateConsentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createConsent(patientId, dto, user);
  }

  @Get('patients/:patientId/consents')
  @Roles(...administrativeRoles, ...clinicalRoles)
  consents(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.safety.consents(patientId);
  }

  @Patch('consents/:id/revoke')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  revokeConsent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.safety.revokeConsent(id, user);
  }

  @Post('patients/:patientId/amendments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST, Role.PHARMACIST)
  createAmendment(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateAmendmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.createAmendment(patientId, dto, user);
  }

  @Get('amendments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST, Role.PHARMACIST)
  amendments(@Query('patientId') patientId?: string, @Query('status') status?: string) {
    return this.safety.amendments(patientId, status);
  }

  @Patch('amendments/:id/decision')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  decideAmendment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAmendmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.safety.decideAmendment(id, dto, user);
  }

  @Get('patients/:patientId/summary')
  @Roles(...administrativeRoles, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST, Role.PHARMACIST)
  patientSafetySummary(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.safety.patientSafetySummary(patientId);
  }

  @Get('quality/dashboard')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.DOCTOR, Role.NURSE)
  qualityDashboard() {
    return this.quality.dashboard();
  }

  @Post('incidents')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST, Role.PHARMACIST, Role.CASHIER)
  createIncident(@Body() dto: CreateIncidentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quality.createIncident(dto, user.id);
  }

  @Get('incidents')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.ACCOUNTANT)
  incidents(@Query('status') status?: string, @Query('severity') severity?: string) {
    return this.quality.incidents(status, severity);
  }

  @Patch('incidents/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quality.updateIncident(id, dto, user.id);
  }

  @Post('equipment')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createEquipment(@Body() dto: CreateEquipmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quality.createEquipment(dto, user.id);
  }

  @Get('equipment')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST, Role.RADIOLOGIST)
  equipment(@Query('status') status?: string, @Query('department') department?: string) {
    return this.quality.equipment(status, department);
  }

  @Post('equipment/:id/maintenance')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST, Role.RADIOLOGIST)
  createMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMaintenanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quality.createMaintenance(id, dto, user.id);
  }

  @Get('maintenance')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  maintenance(@Query('equipmentId') equipmentId?: string, @Query('status') status?: string) {
    return this.quality.maintenance(equipmentId, status);
  }

  @Patch('maintenance/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updateMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quality.updateMaintenance(id, dto, user.id);
  }

  @Get('security/summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  securitySummary() {
    return this.continuity.securitySummary();
  }

  @Get('security/login-events')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  loginEvents(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.continuity.loginEvents(limit);
  }

  @Get('security/sessions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  sessions(@Query('userId') userId?: string) {
    return this.continuity.activeSessions(userId);
  }

  @Patch('security/sessions/:id/revoke')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  revokeSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.continuity.revokeSession(id, user.id);
  }

  @Get('backups')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  backups() {
    return this.continuity.backups();
  }

  @Post('backups')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  registerBackup(@Body() dto: CreateBackupRunDto, @CurrentUser() user: AuthenticatedUser) {
    return this.continuity.registerBackup(dto, user.id);
  }

  @Patch('backups/:id/restored')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  markBackupRestored(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.continuity.markBackupRestored(id, notes, user.id);
  }

  @Get('offline-conflicts')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  conflicts(@Query('status') status?: string) {
    return this.continuity.conflicts(status);
  }

  @Post('offline-conflicts')
  @Roles(...administrativeRoles, ...clinicalRoles, ...laboratoryRoles, Role.RADIOLOGIST, Role.PHARMACIST)
  createConflict(@Body() dto: CreateOfflineConflictDto, @CurrentUser() user: AuthenticatedUser) {
    return this.continuity.createConflict(dto, user.id);
  }

  @Patch('offline-conflicts/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  resolveConflict(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveOfflineConflictDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.continuity.resolveConflict(id, dto, user.id);
  }

  @Get('continuity/summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  continuitySummary() {
    return this.continuity.continuitySummary();
  }
}
