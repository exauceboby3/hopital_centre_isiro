import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { PatientFinancialAccessService } from '../billing/patient-financial-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateVitalSignDto } from '../consultations/dto/create-vital-sign.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsDto } from './dto/list-patients.dto';
import { PermanentDeletePatientDto } from './dto/permanent-delete-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientAccessService } from './patient-access.service';
import { PatientHistoryService } from './patient-history.service';
import { PatientTrashService } from './patient-trash.service';
import { PatientVitalSignService } from './patient-vital-sign.service';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.RECEPTIONIST,
  Role.SECRETARY,
  Role.DOCTOR,
  Role.NURSE,
  Role.MEDICAL_BIOLOGIST,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.RADIOLOGIST,
)
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly access: PatientAccessService,
    private readonly historyService: PatientHistoryService,
    private readonly trash: PatientTrashService,
    private readonly vitalSigns: PatientVitalSignService,
    private readonly financialAccess: PatientFinancialAccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query() query: ListPatientsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.access.list(query, user);
  }

  @Get('lookup')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.DOCTOR,
    Role.NURSE,
    Role.LAB_TECHNICIAN,
    Role.MEDICAL_BIOLOGIST,
    Role.RADIOLOGIST,
    Role.SURGEON,
    Role.MIDWIFE,
    Role.PHARMACIST,
    Role.CASHIER,
    Role.ACCOUNTANT,
  )
  lookup(@Query() query: ListPatientsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.access.list(query, user, true);
  }

  @Get(':id/history')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    await this.access.assertCanAccess(id, user);
    return this.historyService.history(id);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertCanAccess(id, user);
    return this.patients.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY)
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const patient = await this.patients.create(dto, transaction);
      const fileAuthorization = await this.financialAccess.createInitialFileAuthorization(
        patient.id,
        user.id,
        transaction,
      );
      return { ...patient, fileAuthorization };
    });
  }

  @Post(':id/vitals')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.NURSE,
  )
  async recordVitals(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVitalSignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertCanAccess(id, user);
    return this.vitalSigns.create(id, dto, user.id);
  }

  @Patch(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.DOCTOR,
    Role.MEDICAL_BIOLOGIST,
  )
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.access.assertCanAccess(id, user);
    return this.patients.update(id, dto);
  }

  @Delete(':id/permanent')
  @Roles(Role.SUPER_ADMIN)
  async removePermanently(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PermanentDeletePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(await this.trash.isInTrash(id))) {
      throw new BadRequestException(
        'La suppression définitive est autorisée uniquement depuis la corbeille.',
      );
    }
    return this.patients.removePermanently(id, user.id, dto.confirmation, dto.reason);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trash.moveToTrash(id, user.id);
  }
}
