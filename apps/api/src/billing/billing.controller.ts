import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus, Role } from '@prisma/client';
import { Response } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EnterpriseExportService, ExportFormat } from '../enterprise/enterprise-export.service';
import { BillingService } from './billing.service';
import { CashClosureService } from './cash-closure.service';
import { CreateCashClosureDto } from './dto/cash-closure.dto';
import { CreateBatchPaymentDto } from './dto/create-batch-payment.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

@ApiTags('billing')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
@Controller('billing/invoices')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly closures: CashClosureService,
    private readonly exports: EnterpriseExportService,
  ) {}

  @Get()
  list(
    @Query('status', new ParseEnumPipe(InvoiceStatus, { optional: true })) status?: InvoiceStatus,
    @Query('patientId') patientId?: string,
  ) {
    return this.billing.list(status, patientId);
  }

  @Get('closures')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  listClosures() {
    return this.closures.list();
  }

  @Post('closures')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  closeDay(@Body() dto: CreateCashClosureDto, @CurrentUser() user: AuthenticatedUser) {
    return this.closures.close(dto, user.id);
  }

  @Get('closures/:id/export')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  async exportClosure(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: ExportFormat = 'xlsx',
    @Res({ passthrough: true }) response: Response,
  ) {
    const closure = await this.closures.findOne(id);
    const date = closure.businessDate.toISOString().slice(0, 10);
    const file = await this.exports.generate('billing', format, date, date);
    response.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="caisse-${date}.${format}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.buffer);
  }

  @Get('documents/grouped')
  groupedDocument(@Query('ids') ids: string) {
    return this.billing.groupedDocument(
      (ids ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.create(dto, user.id);
  }

  @Post(':id/payments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.addPayment(id, dto, user.id);
  }

  @Post('payments/batch')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT)
  addBatchPayments(@Body() dto: CreateBatchPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.addBatchPayments(dto, user.id);
  }
}
