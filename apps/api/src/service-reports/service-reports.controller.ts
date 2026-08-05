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
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
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
  async list(@Query() query: ListServiceReportsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const rows = await this.reports.listReports(query);
    return rows.map((row) => this.reports.presentReport(row, user));
  }

  @Post()
  async create(@Body() dto: CreateDepartmentReportDto, @CurrentUser() user: AuthenticatedUser) {
    const canSetManualUnitCost = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.CASHIER,
      Role.ACCOUNTANT,
    ]);
    return this.reports.presentReport(
      await this.reports.createReport(dto, user.id, canSetManualUnitCost),
      user,
    );
  }

  @Patch(':id/status')
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentReportStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.presentReport(await this.reports.updateReportStatus(id, dto, user), user);
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
  async requisitions(
    @Query() query: ListRequisitionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rows = await this.reports.listRequisitions(query);
    return rows.map((row) => this.reports.presentRequisition(row, user));
  }

  @Post('requisitions')
  async createRequisition(
    @Body() dto: CreateInternalRequisitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.presentRequisition(
      await this.reports.createRequisition(dto, user.id),
      user,
    );
  }

  @Patch('requisitions/:id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async approveRequisition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRequisitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.presentRequisition(
      await this.reports.approveRequisition(id, dto, user.id),
      user,
    );
  }

  @Patch('requisitions/:id/fulfill')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST, Role.STOREKEEPER)
  async fulfillRequisition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FulfillRequisitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.presentRequisition(
      await this.reports.fulfillRequisition(id, dto, user.id),
      user,
    );
  }
}
