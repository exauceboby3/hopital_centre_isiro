import {
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
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import {
  CleanupAuditLogsDto,
  CreateAdministrativeUserDto,
  ListAuditLogsDto,
  UpdateManagedUserDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.admin.overview(user);
  }

  @Get('users')
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.admin.listUsers(user);
  }

  @Post('users/administrators')
  @Roles(Role.SUPER_ADMIN)
  createAdministrator(@Body() dto: CreateAdministrativeUserDto) {
    return this.admin.createAdministrativeUser(dto);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManagedUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.updateUser(id, dto, user);
  }

  @Delete('users/:id')
  deactivateUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.admin.deactivateUser(id, user);
  }

  @Get('audit-logs')
  @Roles(Role.SUPER_ADMIN)
  auditLogs(@Query() filters: ListAuditLogsDto) {
    return this.admin.listAuditLogs(filters, filters.page, filters.limit);
  }

  @Post('audit-logs/cleanup')
  @Roles(Role.SUPER_ADMIN)
  cleanupAuditLogs(@Body() dto: CleanupAuditLogsDto) {
    return this.admin.cleanupAuditLogs(dto);
  }
}
