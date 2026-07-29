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
const financialRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.CASHIER,
  Role.ACCOUNTANT,
  Role.RECEPTIONIST,
  Role.SECRETARY,
] as const;
const procurementRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.STOREKEEPER, Role.PHARMACIST] as const;

@ApiTags('hospital-operations')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('clinical-orders')
  @Roles(...clinicalRoles)
  clinicalOrders(@Query() filters: ListOperationsDto) {
    return this.operations.clinicalOrders(filters);
  }

  @Get('clinical-orders/:id')
  @Roles(...clinicalRoles)
  clinicalOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.clinicalOrder(id);
  }

  @Post('clinical-orders')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR)
  createClinicalOrder(@Body() dto: CreateClinicalOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.operations.createClinicalOrder(dto, user.id);
  }

  @Patch('clinical-orders/:id')
  @Roles(...clinicalRoles)
  updateClinicalOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicalOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.operations.updateClinicalOrder(id, dto, user.id);
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
  transfusions() {
    return this.operations.transfusions();
  }

  @Get('blood-bank/transfusions/:id')
  @Roles(...clinicalRoles)
  transfusion(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.transfusion(id);
  }

  @Post('blood-bank/transfusions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR)
  createTransfusion(@Body() dto: CreateTransfusionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.operations.createTransfusion(dto, user.id);
  }

  @Patch('blood-bank/transfusions/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.NURSE)
  updateTransfusion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransfusionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.operations.updateTransfusion(id, dto, user.id);
  }

  @Get('insurance/providers')
  @Roles(...financialRoles)
  insuranceProviders() {
    return this.operations.insuranceProviders();
  }

  @Post('insurance/providers')
  @Roles(...administrativeRoles)
  createInsuranceProvider(@Body() dto: CreateInsuranceProviderDto) {
    return this.operations.createInsuranceProvider(dto);
  }

  @Get('insurance/policies')
  @Roles(...financialRoles)
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
