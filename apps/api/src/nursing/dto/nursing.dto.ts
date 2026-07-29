import { ApiPropertyOptional } from '@nestjs/swagger';
import { NursingCareStatus, NursingCareType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateNursingCareDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  hospitalizationId?: string;

  @IsOptional()
  @IsUUID()
  assignedNurseId?: string;

  @IsEnum(NursingCareType)
  type: NursingCareType;

  @IsString()
  @MaxLength(160)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  medicationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  site?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsDateString()
  scheduledAt: string;
}

export class UpdateNursingCareDto {
  @IsEnum(NursingCareStatus)
  status: NursingCareStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedNurseId?: string;

  @IsOptional()
  @IsIn(['ADMINISTERED', 'REFUSED', 'OMITTED', 'MISSED'])
  administrationOutcome?: 'ADMINISTERED' | 'REFUSED' | 'OMITTED' | 'MISSED';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  administeredDose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  omissionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  patientBarcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  medicationBarcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  observations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adverseReaction?: string;

  @IsOptional()
  @IsObject()
  vitalSigns?: Record<string, unknown>;
}
