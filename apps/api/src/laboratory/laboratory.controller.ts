import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ExamStatus, Role } from '@prisma/client';
import { Response } from 'express';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BiologistAdditionalExamService } from './biologist-additional-exam.service';
import { AddBiologistExamDto } from './dto/additional-exam.dto';
import { CompleteExamDto, RejectExamResultDto } from './dto/complete-exam.dto';
import {
  CreateExamBatchDto,
  CreateExamDto,
  CreateLabExamCatalogDto,
  UpdateLabExamCatalogDto,
} from './dto/create-exam.dto';
import { LaboratoryBatchValidationService } from './laboratory-batch-validation.service';
import { LaboratoryProfileService } from './laboratory-profile.service';
import { LabDocumentUpload, LaboratoryService } from './laboratory.service';

@ApiTags('laboratory')
@ApiCookieAuth('hospital_access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST)
@Controller('laboratory/exams')
export class LaboratoryController {
  constructor(
    private readonly laboratory: LaboratoryService,
    private readonly profiles: LaboratoryProfileService,
    private readonly batchValidation: LaboratoryBatchValidationService,
    private readonly additionalExams: BiologistAdditionalExamService,
  ) {}

  @Get()
  async list(
    @Query('status', new ParseEnumPipe(ExamStatus, { optional: true })) status?: ExamStatus,
    @Query('patientId') patientId?: string,
    @Query('scope') scope: 'active' | 'history' = 'active',
  ) {
    const rows = await this.laboratory.list(status, patientId);
    if (status) return rows;
    return rows.filter((row) =>
      scope === 'history'
        ? ['VALIDATED', 'CANCELLED'].includes(row.workflowStatus)
        : !['VALIDATED', 'CANCELLED'].includes(row.workflowStatus),
    );
  }

  @Patch('batch/:requestGroupId/validate')
  @Roles(Role.MEDICAL_BIOLOGIST)
  async validateBatch(
    @Param('requestGroupId', ParseUUIDPipe) requestGroupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.profiles.ensure(user.id);
    return this.batchValidation.validate(requestGroupId, user.id);
  }

  @Post('batch/:requestGroupId/additional')
  @Roles(Role.MEDICAL_BIOLOGIST)
  async addAdditionalExam(
    @Param('requestGroupId', ParseUUIDPipe) requestGroupId: string,
    @Body() dto: AddBiologistExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.profiles.ensure(user.id);
    return this.additionalExams.add(requestGroupId, dto, user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.laboratory.get(id);
  }

  @Post()
  @Roles(Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  request(@Body() dto: CreateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.laboratory.request(dto, user.id);
  }

  @Post('batch')
  @Roles(Role.DOCTOR, Role.SURGEON, Role.MIDWIFE)
  requestBatch(@Body() dto: CreateExamBatchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.laboratory.requestBatch(dto, user.id);
  }

  @Post('catalog')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MEDICAL_BIOLOGIST)
  createCatalogEntry(@Body() dto: CreateLabExamCatalogDto) {
    return this.laboratory.createCatalogEntry(dto);
  }

  @Patch('catalog/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MEDICAL_BIOLOGIST)
  updateCatalogEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabExamCatalogDto,
  ) {
    return this.laboratory.updateCatalogEntry(id, dto);
  }

  @Patch(':id/complete')
  @Roles(Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.profiles.ensure(user.id);
    return this.laboratory.complete(id, dto, user.id);
  }

  @Patch(':id/validate')
  @Roles(Role.MEDICAL_BIOLOGIST)
  async validate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.profiles.ensure(user.id);
    return this.laboratory.validate(id, user.id);
  }

  @Patch(':id/reject')
  @Roles(Role.MEDICAL_BIOLOGIST)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectExamResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.profiles.ensure(user.id);
    return this.laboratory.reject(id, dto.comment, user.id);
  }

  @Post(':id/document')
  @Roles(Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: LabDocumentUpload | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Sélectionnez un document à numériser.');
    await this.profiles.ensure(user.id);
    return this.laboratory.uploadDocument(id, file, user.id);
  }

  @Get(':id/document')
  async document(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.laboratory.document(id);
    response.set({
      'Content-Type': document.mimeType,
      'Content-Length': String(document.sizeBytes),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(document.data);
  }
}
