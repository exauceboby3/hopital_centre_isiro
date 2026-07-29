import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CustomFieldEntity, Role } from '@prisma/client';
import { AuthenticatedUser, effectiveRoles } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConfigurationService } from './configuration.service';
import {
  CreatePrintTemplateDto,
  CreateCustomFieldDto,
  SaveCustomValuesDto,
  UpdateCustomFieldDto,
  UpdateHospitalProfileDto,
  UpdatePrintTemplateDto,
} from './dto/configuration.dto';

@ApiTags('configuration')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get('hospital-profile')
  hospitalProfile() {
    return this.configuration.hospitalProfile();
  }

  @Patch('hospital-profile')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updateHospitalProfile(
    @Body() dto: UpdateHospitalProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configuration.updateHospitalProfile(dto, user.id);
  }

  @Get('print-context')
  printContext(@Query('kind') kind: string) {
    return this.configuration.printContext(kind);
  }

  @Get('print-templates')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  printTemplates() {
    return this.configuration.printTemplates();
  }

  @Post('print-templates')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createPrintTemplate(@Body() dto: CreatePrintTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.configuration.createPrintTemplate(dto, user.id);
  }

  @Patch('print-templates/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updatePrintTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrintTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configuration.updatePrintTemplate(id, dto, user.id);
  }

  @Delete('print-templates/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  deactivatePrintTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configuration.deactivatePrintTemplate(id, user.id);
  }

  @Get('custom-fields')
  fields(
    @Query('entity', new ParseEnumPipe(CustomFieldEntity, { optional: true }))
    entity?: CustomFieldEntity,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive = false,
  ) {
    return this.configuration.listFields(entity, includeInactive);
  }

  @Post('custom-fields')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createField(@Body() dto: CreateCustomFieldDto, @CurrentUser() user: AuthenticatedUser) {
    return this.configuration.createField(dto, user.id);
  }

  @Patch('custom-fields/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updateField(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.configuration.updateField(id, dto);
  }

  @Delete('custom-fields/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  deactivateField(@Param('id', ParseUUIDPipe) id: string) {
    return this.configuration.deactivateField(id);
  }

  @Get('custom-values/:entity/:entityId')
  values(
    @Param('entity', new ParseEnumPipe(CustomFieldEntity)) entity: CustomFieldEntity,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configuration.valuesForUser(entity, entityId, effectiveRoles(user), user.id);
  }

  @Patch('custom-values/:entity/:entityId')
  updateValues(
    @Param('entity', new ParseEnumPipe(CustomFieldEntity)) entity: CustomFieldEntity,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() dto: SaveCustomValuesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configuration.updateValues(
      entity,
      entityId,
      dto.values,
      effectiveRoles(user),
      user.id,
    );
  }
}
