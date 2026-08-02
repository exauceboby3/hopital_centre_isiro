import {
  Body,
  Controller,
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
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list() {
    return this.staff.list();
  }

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Patch(':id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('value', ParseBoolPipe) isActive: boolean,
  ) {
    return this.staff.setActive(id, isActive);
  }
}
