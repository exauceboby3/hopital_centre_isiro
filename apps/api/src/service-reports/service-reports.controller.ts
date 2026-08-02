import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ApproveRequisitionDto,
  CreateDepartmentReportDto,
  CreateInternalRequisitionDto,
  FulfillRequisitionDto,
  ListRequisitionsQueryDto,
  ListServiceReportsQueryDto,
  UpdateDepartmentReportStatusDto,
} from './dto/service-report.dto';
import { ServiceReportsService } from './service-reports.service';

const reportRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.HR,
  Role.DOCTOR,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.NURSE,
  Role.LAB_TECHNICIAN,
  Role.MEDICAL_BIOLOGIST,
  Role.RADIOLOGIST,
  Role.PHARMACIST,
  Role.STOREKEEPER,
  Role.RECEPTIONIST,
  Role.SECRETARY,
  Role.CASHIER,
];

@ApiTags('service-reports')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...reportRoles)
@Controller('service-reports')
export class ServiceReportsController {
  constructor(private readonly reports: ServiceReportsService) {}

  @Get()
  list(@Query() query: ListServiceReportsQueryDto) {
    return this.reports.listReports(query);
  }

  @Post()
  create(@Body() dto: CreateDepartmentReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.createReport(dto, user.id);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentReportStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.updateReportStatus(id, dto, user.id);
  }

  @Get('accounting/summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  accounting(@Query() query: ListServiceReportsQueryDto) {
    return this.reports.accountingSummary(query);
  }

  @Get('stocks')
  stocks(@Query('department') department?: string) {
    return this.reports.departmentStocks(department);
  }

  @Get('requisitions/list')
  requisitions(@Query() query: ListRequisitionsQueryDto) {
    return this.reports.listRequisitions(query);
  }

  @Post('requisitions')
  createRequisition(
    @Body() dto: CreateInternalRequisitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.createRequisition(dto, user.id);
  }

  @Patch('requisitions/:id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  approveRequisition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRequisitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.approveRequisition(id, dto, user.id);
  }

  @Patch('requisitions/:id/fulfill')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST, Role.STOREKEEPER)
  fulfillRequisition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FulfillRequisitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.fulfillRequisition(id, dto, user.id);
  }
}
