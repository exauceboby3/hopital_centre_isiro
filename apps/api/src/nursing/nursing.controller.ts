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
import { NursingCareStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateNursingCareDto, UpdateNursingCareDto } from './dto/nursing.dto';
import { MedicationAdministrationLedgerService } from './medication-administration-ledger.service';
import { NursingService } from './nursing.service';

const clinicalRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.DOCTOR,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.NURSE,
];

@ApiTags('nursing-care')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...clinicalRoles)
@Controller('nursing-care')
export class NursingController {
  constructor(
    private readonly nursing: NursingService,
    private readonly ledger: MedicationAdministrationLedgerService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('status', new ParseEnumPipe(NursingCareStatus, { optional: true }))
    status?: NursingCareStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.nursing.list(user, patientId, status, from, to);
  }

  @Get('administration-ledger')
  administrationLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown> {
    return this.ledger.list(user, patientId, from, to);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  create(@Body() dto: CreateNursingCareDto, @CurrentUser() user: AuthenticatedUser) {
    return this.nursing.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNursingCareDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.nursing.update(id, dto, user);
  }
}
