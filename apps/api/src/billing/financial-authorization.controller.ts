import {
  Body,
  Controller,
  Delete,
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
import { BillableServiceType, CareAuthorizationStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateBillableServiceDto,
  CreateCareAuthorizationDto,
  CreatePharmacyAuthorizationDto,
  ListCareAuthorizationsDto,
  UpdateBillableServiceDto,
  WaiveAuthorizationDto,
} from './dto/financial-authorization.dto';
import { FinancialAuthorizationService } from './financial-authorization.service';

@ApiTags('financial-authorizations')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class FinancialAuthorizationController {
  constructor(private readonly authorizations: FinancialAuthorizationService) {}

  @Get('services')
  listServices(
    @Query('type', new ParseEnumPipe(BillableServiceType, { optional: true }))
    type?: BillableServiceType,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.authorizations.listServices(type, includeInactive === 'true');
  }

  @Post('services')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  createService(@Body() dto: CreateBillableServiceDto) {
    return this.authorizations.createService(dto);
  }

  @Patch('services/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  updateService(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBillableServiceDto) {
    return this.authorizations.updateService(id, dto);
  }

  @Delete('services/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  removeService(@Param('id', ParseUUIDPipe) id: string) {
    return this.authorizations.removeService(id);
  }

  @Get('authorizations')
  listAuthorizations(
    @Query('type', new ParseEnumPipe(BillableServiceType, { optional: true }))
    type?: BillableServiceType,
    @Query('status', new ParseEnumPipe(CareAuthorizationStatus, { optional: true }))
    status?: CareAuthorizationStatus,
    @Query('patientId') patientId?: string,
  ) {
    const filters: ListCareAuthorizationsDto = { type, status, patientId };
    return this.authorizations.listAuthorizations(filters);
  }

  @Post('authorizations')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.RECEPTIONIST, Role.SECRETARY)
  createAuthorization(
    @Body() dto: CreateCareAuthorizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizations.createAuthorization(dto, user.id);
  }

  @Post('authorizations/pharmacy')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.RECEPTIONIST, Role.SECRETARY)
  createPharmacyAuthorization(
    @Body() dto: CreatePharmacyAuthorizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizations.createPharmacyAuthorization(dto, user.id);
  }

  @Post('authorizations/:id/waive')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaiveAuthorizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizations.waive(id, dto.reason, user.id);
  }
}
