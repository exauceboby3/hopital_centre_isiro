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
import { HospitalizationStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdmitPatientDto } from './dto/admit-patient.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { TransferPatientDto } from './dto/transfer-patient.dto';
import { HospitalizationsService } from './hospitalizations.service';

const hospitalizationRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.DOCTOR,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.RECEPTIONIST,
  Role.SECRETARY,
  Role.NURSE,
  Role.CASHIER,
  Role.ACCOUNTANT,
];

@ApiTags('hospitalizations')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...hospitalizationRoles)
@Controller('hospitalizations')
export class HospitalizationsController {
  constructor(private readonly hospitalizations: HospitalizationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status', new ParseEnumPipe(HospitalizationStatus, { optional: true }))
    status?: HospitalizationStatus,
  ) {
    return this.hospitalizations.list(status, user);
  }

  @Get('rooms')
  rooms() {
    return this.hospitalizations.rooms();
  }

  @Post('rooms')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createRoom(@Body() dto: CreateRoomDto) {
    return this.hospitalizations.createRoom(dto);
  }

  @Post()
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.DOCTOR,
    Role.SURGEON,
    Role.MIDWIFE,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.NURSE,
  )
  admit(@Body() dto: AdmitPatientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hospitalizations.admit(dto, user);
  }

  @Patch(':id/medical-discharge')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  medicalDischarge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hospitalizations.medicalDischarge(id, user);
  }

  @Patch(':id/discharge')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.CASHIER,
    Role.ACCOUNTANT,
    Role.RECEPTIONIST,
    Role.SECRETARY,
  )
  administrativeDischarge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hospitalizations.administrativeDischarge(id, user.id);
  }

  @Patch(':id/transfer')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.DOCTOR,
    Role.SURGEON,
    Role.MIDWIFE,
    Role.RECEPTIONIST,
    Role.SECRETARY,
    Role.NURSE,
  )
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferPatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hospitalizations.transfer(id, dto.bedId, user);
  }
}
