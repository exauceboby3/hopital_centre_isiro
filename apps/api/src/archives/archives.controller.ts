import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ArchivesService } from './archives.service';
import {
  ArchivePatientDto,
  ListArchivesDto,
  RestorePatientDto,
  UpdateArchivePolicyDto,
} from './dto/archive.dto';

@ApiTags('archives')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@Controller('archives')
export class ArchivesController {
  constructor(private readonly archives: ArchivesService) {}

  @Get('policy')
  policy() {
    return this.archives.policy();
  }

  @Patch('policy')
  @Roles(Role.SUPER_ADMIN)
  updatePolicy(@Body() dto: UpdateArchivePolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.archives.updatePolicy(dto, user.id);
  }

  @Get('patients')
  list(@Query() query: ListArchivesDto) {
    return this.archives.list(query);
  }

  @Post('patients/:id/archive')
  @Roles(Role.SUPER_ADMIN)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchivePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archives.archive(id, dto, user.id);
  }

  @Post('patients/:id/restore')
  @Roles(Role.SUPER_ADMIN)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestorePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archives.restore(id, dto, user.id);
  }

  @Get('patients/:id/export')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.archives.export(id, format);
    response.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.buffer);
  }

  @Get('patients/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.archives.findOne(id);
  }
}
