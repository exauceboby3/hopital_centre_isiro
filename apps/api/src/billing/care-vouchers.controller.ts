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
import { CareVoucherStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CareVouchersService } from './care-vouchers.service';
import {
  AllocateCareVoucherDto,
  CreateCareVoucherDto,
  UpdateCareVoucherStatusDto,
} from './dto/care-voucher.dto';

const voucherRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT];

@ApiTags('care-vouchers')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...voucherRoles)
@Controller('billing/vouchers')
export class CareVouchersController {
  constructor(private readonly vouchers: CareVouchersService) {}

  @Get()
  list(
    @Query('patientId') patientId?: string,
    @Query('status', new ParseEnumPipe(CareVoucherStatus, { optional: true }))
    status?: CareVoucherStatus,
  ) {
    return this.vouchers.list(patientId, status);
  }

  @Get('coverages')
  coverages(@Query('invoiceId') invoiceId?: string) {
    return this.vouchers.coverages(invoiceId);
  }

  @Post()
  create(@Body() dto: CreateCareVoucherDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vouchers.create(dto, user.id);
  }

  @Post('allocate')
  allocate(@Body() dto: AllocateCareVoucherDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vouchers.allocate(dto, user.id);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCareVoucherStatusDto) {
    return this.vouchers.updateStatus(id, dto);
  }

  @Post('coverages/:id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  cancelCoverage(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.cancelCoverage(id);
  }
}
