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
import { CareAuthorizationStatus, Role } from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateBloodUnitDto,
  CreateClinicalOrderDto,
  CreateInsuranceClaimDto,
  CreateInsuranceProviderDto,
  CreatePatientInsuranceDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  CreateTransfusionDto,
  ListBloodUnitsDto,
  ListOperationsDto,
  UpdateClinicalOrderDto,
  UpdateInsuranceClaimDto,
  UpdateTransfusionDto,
} from './dto/operations.dto';
import { OperationsService } from './operations.service';

const administrativeRoles = [Role.SUPER_ADMIN, Role.ADMIN] as const;
const clinicalRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.DOCTOR,
  Role.NURSE,
  Role.LAB_TECHNICIAN,
  Role.RADIOLOGIST,
  Role.SURGEON,
  Role.MIDWIFE,
] as const;
const financialRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT] as const;
const insuranceRegistrationRoles = [...financialRoles, Role.RECEPTIONIST, Role.SECRETARY] as const;
const procurementRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.STOREKEEPER, Role.PHARMACIST] as const;

@ApiTags('hospital-operations')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  private presentAuthorization<
    T extends {
      careAuthorization?: { id: string; status: CareAuthorizationStatus } | null;
    },
  >(row: T, user: AuthenticatedUser) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) return row;
    const { careAuthorization, ...clinicalData } = row;
    if (!careAuthorization) return { ...clinicalData, careAuthorization };
    const clearedStatuses: CareAuthorizationStatus[] = [
      CareAuthorizationStatus.AUTHORIZED,
      CareAuthorizationStatus.WAIVED,
      CareAuthorizationStatus.CONSUMED,
    ];
    const inOrder = clearedStatuses.includes(careAuthorization.status);
    return {
      ...clinicalData,
      careAuthorization: {
        id: careAuthorization.id,
        status: careAuthorization.status,
        paymentClearance: { inOrder, status: inOrder ? 'IN_ORDER' : 'TO_REGULARIZE' },
      },
    };
  }

  private presentClinicalOrder<
    T extends {
      service: { price: unknown };
      careAuthorization?: { id: string; status: CareAuthorizationStatus } | null;
    },
  >(row: T, user: AuthenticatedUser) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) return row;
    const { price, ...service } = row.service;
    void price;
    return { ...this.presentAuthorization(row, user), service };
  }

  private presentTransfusion<
    T extends {
      clinicalOrder: {
        careAuthorization?: { id: string; status: CareAuthorizationStatus } | null;
      };
    },
  >(row: T, user: AuthenticatedUser) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) return row;
    return {
      ...row,
      clinicalOrder: this.presentAuthorization(row.clinicalOrder, user),
    };
  }

  @Get('clinical-orders')
  @Roles(...clinicalRoles)
  async clinicalOrders(
    @Query() filters: ListOperationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rows = await this.operations.clinicalOrders(filters);
    return rows.map((row) => this.presentClinicalOrder(row, user));
  }

  @Get('clinical-orders/:id')
  @Roles(...clinicalRoles)
  async clinicalOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presentClinicalOrder(await this.operations.clinicalOrder(id), user);
  }

  @Post('clinical-orders')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  async createClinicalOrder(
    @Body() dto: CreateClinicalOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presentClinicalOrder(await this.operations.createClinicalOrder(dto, user.id), user);
  }

  @Patch('clinical-orders/:id')
  @Roles(...clinicalRoles)
  async updateClinicalOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicalOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presentClinicalOrder(
      await this.operations.updateClinicalOrder(id, dto, user.id),
      user,
    );
  }

  @Get('blood-bank/units')
  @Roles(...clinicalRoles)
  bloodUnits(@Query() filters: ListBloodUnitsDto) {
    return this.operations.bloodUnits(filters);
  }

  @Post('blood-bank/units')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.LAB_TECHNICIAN, Role.NURSE)
  createBloodUnit(@Body() dto: CreateBloodUnitDto) {
    return this.operations.createBloodUnit(dto);
  }

  @Get('blood-bank/transfusions')
  @Roles(...clinicalRoles)
  async transfusions(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.operations.transfusions();
    return rows.map((row) => this.presentTransfusion(row, user));
  }

  @Get('blood-bank/transfusions/:id')
  @Roles(...clinicalRoles)
  async transfusion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presentTransfusion(await this.operations.transfusion(id), user);
  }

  @Post('blood-bank/transfusions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR)
  async createTransfusion(
    @Body() dto: CreateTransfusionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presentTransfusion(await this.operations.createTransfusion(dto, user.id), user);
  }

  @Patch('blood-bank/transfusions/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE)
  async updateTransfusion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransfusionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presentTransfusion(await this.operations.updateTransfusion(id, dto, user.id), user);
  }

  @Get('insurance/providers')
  @Roles(...insuranceRegistrationRoles)
  insuranceProviders() {
    return this.operations.insuranceProviders();
  }

  @Post('insurance/providers')
  @Roles(...administrativeRoles)
  createInsuranceProvider(@Body() dto: CreateInsuranceProviderDto) {
    return this.operations.createInsuranceProvider(dto);
  }

  @Get('insurance/policies')
  @Roles(...insuranceRegistrationRoles)
  insurancePolicies() {
    return this.operations.insurancePolicies();
  }

  @Post('insurance/policies')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.ACCOUNTANT)
  createPatientInsurance(@Body() dto: CreatePatientInsuranceDto) {
    return this.operations.createPatientInsurance(dto);
  }

  @Get('insurance/claims')
  @Roles(...financialRoles)
  insuranceClaims() {
    return this.operations.insuranceClaims();
  }

  @Post('insurance/claims')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  createInsuranceClaim(@Body() dto: CreateInsuranceClaimDto) {
    return this.operations.createInsuranceClaim(dto);
  }

  @Patch('insurance/claims/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  updateInsuranceClaim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInsuranceClaimDto,
  ) {
    return this.operations.updateInsuranceClaim(id, dto);
  }

  @Get('procurement/suppliers')
  @Roles(...procurementRoles)
  suppliers() {
    return this.operations.suppliers();
  }

  @Post('procurement/suppliers')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STOREKEEPER)
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.operations.createSupplier(dto);
  }

  @Get('procurement/orders')
  @Roles(...procurementRoles)
  purchaseOrders() {
    return this.operations.purchaseOrders();
  }

  @Get('procurement/orders/:id')
  @Roles(...procurementRoles)
  purchaseOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.purchaseOrder(id);
  }

  @Post('procurement/orders')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STOREKEEPER)
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.operations.createPurchaseOrder(dto, user.id);
  }

  @Patch('procurement/orders/:id/order')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STOREKEEPER)
  orderPurchase(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.orderPurchase(id);
  }

  @Patch('procurement/orders/:id/receive')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STOREKEEPER, Role.PHARMACIST)
  receivePurchase(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.operations.receivePurchase(id, user.id);
  }

  @Get('reports/summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  reports(@Query('from') from?: string, @Query('to') to?: string) {
    return this.operations.reports(from, to);
  }
}
