import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  AllocateInsuranceDto,
  CreateDrugInteractionDto,
  CreateJournalEntryDto,
  CreateLedgerAccountDto,
  CreateMedicationBatchDto,
  CreatePayrollPeriodDto,
  CreatePrescriptionDto,
  CreateRadiologyStudyDto,
  CreateShiftDto,
  CreateSpecialtyCaseDto,
  CreateUtilityBillDto,
  DispensePrescriptionDto,
  ReconcileInventoryDto,
  RegisterDicomInstanceDto,
  UpdateCoverageDto,
  UpdateJournalEntryDto,
  UpdatePacsConfigurationDto,
  UpdatePayrollEntryDto,
  UpdatePayrollPeriodDto,
  UpdateRadiologyStudyDto,
  UpdateShiftDto,
  UpdateSpecialtyCaseDto,
  UpdateUtilityBillDto,
  UpsertAttendanceDto,
} from './dto/enterprise.dto';
import { EnterpriseExportService, ExportFormat, ExportReport } from './enterprise-export.service';
import { EnterpriseService } from './enterprise.service';

const financialRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT];
const clinicalRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.DOCTOR,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.NURSE,
];
const pharmacyRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST, Role.STOREKEEPER];
const radiologyRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.RADIOLOGIST, Role.DOCTOR];
const hrRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.HR];
const accountingRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT];

@ApiTags('enterprise')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise')
export class EnterpriseController {
  constructor(
    private readonly enterprise: EnterpriseService,
    private readonly exports: EnterpriseExportService,
  ) {}

  @Get('insurance/coverages')
  @Roles(...financialRoles)
  coverages() {
    return this.enterprise.insuranceCoverages();
  }

  @Get('insurance/coverages/:id')
  @Roles(...financialRoles)
  coverage(@Param('id', ParseUUIDPipe) id: string) {
    return this.enterprise.insuranceCoverage(id);
  }

  @Post('insurance/coverages')
  @Roles(...financialRoles)
  allocateInsurance(@Body() dto: AllocateInsuranceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.allocateInsurance(dto, user.id);
  }

  @Patch('insurance/coverages/:id')
  @Roles(...financialRoles)
  updateCoverage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCoverageDto) {
    return this.enterprise.updateCoverage(id, dto);
  }

  @Get('prescriptions')
  @Roles(...clinicalRoles, ...pharmacyRoles)
  async prescriptions(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.enterprise.prescriptions();
    return rows.map((row) => this.enterprise.presentPrescription(row, user));
  }

  @Post('prescriptions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  async createPrescription(
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const row = await this.enterprise.createPrescription(dto, user.id);
    return this.enterprise.presentPrescription(row, user);
  }

  @Get('prescriptions/:id')
  @Roles(...clinicalRoles, ...pharmacyRoles)
  async prescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const row = await this.enterprise.prescription(id);
    return this.enterprise.presentPrescription(row, user);
  }

  @Post('prescriptions/:id/dispense')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST)
  async dispensePrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispensePrescriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const row = await this.enterprise.dispensePrescription(id, dto, user.id);
    return this.enterprise.presentPrescription(row, user);
  }

  @Get('pharmacy/interactions')
  @Roles(...clinicalRoles, ...pharmacyRoles)
  interactions() {
    return this.enterprise.drugInteractions();
  }

  @Post('pharmacy/interactions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST)
  createInteraction(@Body() dto: CreateDrugInteractionDto) {
    return this.enterprise.createDrugInteraction(dto);
  }

  @Get('pharmacy/batches')
  @Roles(...pharmacyRoles)
  batches() {
    return this.enterprise.medicationBatches();
  }

  @Post('pharmacy/batches')
  @Roles(...pharmacyRoles)
  createBatch(@Body() dto: CreateMedicationBatchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.createMedicationBatch(dto, user.id);
  }

  @Get('pharmacy/inventories')
  @Roles(...pharmacyRoles)
  inventories() {
    return this.enterprise.inventories();
  }

  @Get('pharmacy/inventories/:id')
  @Roles(...pharmacyRoles)
  inventory(@Param('id', ParseUUIDPipe) id: string) {
    return this.enterprise.inventory(id);
  }

  @Post('pharmacy/inventories')
  @Roles(...pharmacyRoles)
  reconcileInventory(@Body() dto: ReconcileInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.reconcileInventory(dto, user.id);
  }

  @Get('specialties')
  @Roles(...clinicalRoles)
  async specialties(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.enterprise.specialtyCases();
    return rows.map((row) => this.enterprise.presentClinicalRecord(row, user));
  }

  @Post('specialties')
  @Roles(...clinicalRoles)
  async createSpecialty(
    @Body() dto: CreateSpecialtyCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterprise.presentClinicalRecord(
      await this.enterprise.createSpecialtyCase(dto, user.id),
      user,
    );
  }

  @Get('specialties/:id')
  @Roles(...clinicalRoles)
  async specialty(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.presentClinicalRecord(await this.enterprise.specialtyCase(id), user);
  }

  @Patch('specialties/:id')
  @Roles(...clinicalRoles)
  async updateSpecialty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpecialtyCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterprise.presentClinicalRecord(
      await this.enterprise.updateSpecialtyCase(id, dto, user.id),
      user,
    );
  }

  @Get('radiology/pacs')
  @Roles(...radiologyRoles)
  pacsConfiguration() {
    return this.enterprise.pacsConfiguration();
  }

  @Patch('radiology/pacs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updatePacs(@Body() dto: UpdatePacsConfigurationDto) {
    return this.enterprise.updatePacsConfiguration(dto);
  }

  @Get('radiology/studies')
  @Roles(...radiologyRoles)
  async radiologyStudies(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.enterprise.radiologyStudies();
    return rows.map((row) => this.enterprise.presentClinicalRecord(row, user));
  }

  @Post('radiology/studies')
  @Roles(...radiologyRoles)
  async createRadiologyStudy(
    @Body() dto: CreateRadiologyStudyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterprise.presentClinicalRecord(
      await this.enterprise.createRadiologyStudy(dto),
      user,
    );
  }

  @Get('radiology/studies/:id')
  @Roles(...radiologyRoles)
  async radiologyStudy(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterprise.presentClinicalRecord(await this.enterprise.radiologyStudy(id), user);
  }

  @Patch('radiology/studies/:id')
  @Roles(...radiologyRoles)
  updateRadiologyStudy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRadiologyStudyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterprise.updateRadiologyStudy(id, dto, user.id);
  }

  @Post('radiology/studies/:id/instances')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RADIOLOGIST)
  registerDicom(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterDicomInstanceDto) {
    return this.enterprise.registerDicomInstance(id, dto);
  }

  @Get('hr/shifts')
  @Roles(...hrRoles)
  shifts() {
    return this.enterprise.shifts();
  }

  @Get('hr/shifts/:id')
  @Roles(...hrRoles)
  shift(@Param('id', ParseUUIDPipe) id: string) {
    return this.enterprise.shift(id);
  }

  @Get('hr/employees')
  @Roles(...hrRoles)
  employees() {
    return this.enterprise.employees();
  }

  @Post('hr/shifts')
  @Roles(...hrRoles)
  createShift(@Body() dto: CreateShiftDto) {
    return this.enterprise.createShift(dto);
  }

  @Patch('hr/shifts/:id')
  @Roles(...hrRoles)
  updateShift(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.enterprise.updateShift(id, dto);
  }

  @Get('hr/attendance')
  @Roles(...hrRoles)
  attendance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.enterprise.attendance(from, to);
  }

  @Get('hr/attendance/:id')
  @Roles(...hrRoles)
  attendanceRecord(@Param('id', ParseUUIDPipe) id: string) {
    return this.enterprise.attendanceRecord(id);
  }

  @Post('hr/attendance')
  @Roles(...hrRoles)
  upsertAttendance(@Body() dto: UpsertAttendanceDto) {
    return this.enterprise.upsertAttendance(dto);
  }

  @Get('hr/payroll')
  @Roles(...hrRoles)
  payroll() {
    return this.enterprise.payrollPeriods();
  }

  @Get('hr/payroll/:id')
  @Roles(...hrRoles)
  payrollPeriod(@Param('id', ParseUUIDPipe) id: string) {
    return this.enterprise.payrollPeriod(id);
  }

  @Post('hr/payroll')
  @Roles(...hrRoles)
  createPayroll(@Body() dto: CreatePayrollPeriodDto) {
    return this.enterprise.createPayrollPeriod(dto);
  }

  @Patch('hr/payroll/:id')
  @Roles(...hrRoles)
  updatePayroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollPeriodDto) {
    return this.enterprise.updatePayrollPeriod(id, dto);
  }

  @Patch('hr/payroll/entries/:id')
  @Roles(...hrRoles)
  updatePayrollEntry(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollEntryDto) {
    return this.enterprise.updatePayrollEntry(id, dto);
  }

  @Get('accounting/accounts')
  @Roles(...accountingRoles)
  accounts() {
    return this.enterprise.ledgerAccounts();
  }

  @Post('accounting/accounts')
  @Roles(...accountingRoles)
  createAccount(@Body() dto: CreateLedgerAccountDto) {
    return this.enterprise.createLedgerAccount(dto);
  }

  @Get('accounting/utilities')
  @Roles(...accountingRoles)
  utilityBills() {
    return this.enterprise.utilityBills();
  }

  @Post('accounting/utilities')
  @Roles(...accountingRoles)
  createUtilityBill(@Body() dto: CreateUtilityBillDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.createUtilityBill(dto, user.id);
  }

  @Patch('accounting/utilities/:id')
  @Roles(...accountingRoles)
  updateUtilityBill(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUtilityBillDto) {
    return this.enterprise.updateUtilityBill(id, dto);
  }

  @Get('accounting/journal')
  @Roles(...accountingRoles)
  journal() {
    return this.enterprise.journalEntries();
  }

  @Get('accounting/journal/:id')
  @Roles(...accountingRoles)
  journalEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.enterprise.journalEntry(id);
  }

  @Post('accounting/journal')
  @Roles(...accountingRoles)
  createJournal(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.createJournalEntry(dto, user.id);
  }

  @Patch('accounting/journal/:id')
  @Roles(...accountingRoles)
  postJournal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalEntryDto) {
    return this.enterprise.updateJournalEntry(id, dto);
  }

  @Get('reports/summary')
  @Roles(...accountingRoles)
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.enterprise.enterpriseReport(from, to);
  }

  @Get('exports/:report')
  @Roles(...accountingRoles)
  async export(
    @Param('report') report: ExportReport,
    @Query('format') format: ExportFormat = 'xlsx',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exports.generate(report, format, from, to);
    response.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.buffer);
  }
}
