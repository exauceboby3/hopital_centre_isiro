import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
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
import { CreateMedicationDto } from './dto/create-medication.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { DispenseMedicationDto } from './dto/dispense-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { PharmacyService } from './pharmacy.service';

@ApiTags('pharmacy')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST, Role.STOREKEEPER)
@Controller('pharmacy/medications')
export class PharmacyController {
  constructor(private readonly pharmacy: PharmacyService) {}

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.PHARMACIST,
    Role.STOREKEEPER,
    Role.DOCTOR,
    Role.NURSE,
    Role.SURGEON,
    Role.MIDWIFE,
  )
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('lowStock', new ParseBoolPipe({ optional: true })) lowStock?: boolean,
  ) {
    return this.pharmacy.list(lowStock, user);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST)
  create(@Body() dto: CreateMedicationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pharmacy.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMedicationDto) {
    return this.pharmacy.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pharmacy.deactivate(id, user.id);
  }

  @Post(':id/movements')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST, Role.STOREKEEPER)
  moveStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pharmacy.moveStock(id, dto, user.id);
  }

  @Post(':id/dispense')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.PHARMACIST)
  dispense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispenseMedicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pharmacy.dispense(id, dto, user.id);
  }
}
