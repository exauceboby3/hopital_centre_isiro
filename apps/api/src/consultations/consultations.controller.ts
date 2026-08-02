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
import { ConsultationStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConsultationsService } from './consultations.service';
import {
  CreateConsultationDto,
  CreateHospitalizationReferralDto,
} from './dto/create-consultation.dto';
import { CreateVitalSignDto } from './dto/create-vital-sign.dto';
import { SignConsultationDto } from './dto/sign-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { HospitalizationReferralService } from './hospitalization-referral.service';

@ApiTags('consultations')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly consultations: ConsultationsService,
    private readonly hospitalizationReferrals: HospitalizationReferralService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('status', new ParseEnumPipe(ConsultationStatus, { optional: true }))
    status?: ConsultationStatus,
  ) {
    return this.consultations.list(user, patientId, status);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  create(@Body() dto: CreateConsultationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.consultations.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConsultationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consultations.update(id, dto, user);
  }

  @Patch(':id/sign')
  @Roles(Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignConsultationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consultations.sign(id, dto, user);
  }

  @Post(':id/vitals')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.NURSE)
  addVitals(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVitalSignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consultations.addVitalSign(id, dto, user.id);
  }

  @Post(':id/hospitalization-referral')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  requestHospitalization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateHospitalizationReferralDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hospitalizationReferrals.request(id, dto.serviceId, user);
  }
}
