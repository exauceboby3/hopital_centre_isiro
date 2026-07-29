import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ConsultationDecision } from '../clinical-report';

const decisions: ConsultationDecision[] = [
  'CONTINUE',
  'LABORATORY',
  'IMAGING',
  'HOSPITALIZATION',
  'TRANSFER',
  'PRESCRIPTION',
  'DISCHARGE',
  'COMPLETE',
];

export class UpdateConsultationDto {
  @ApiPropertyOptional({ enum: ConsultationStatus })
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  presentIllnessHistory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  anamnesisComplements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  medicalHistory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  physicalExamination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  paraclinicalExams?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  treatmentPlan?: string;

  @ApiPropertyOptional({ enum: decisions })
  @IsOptional()
  @IsIn(decisions)
  decision?: ConsultationDecision;

  @ApiPropertyOptional({ description: 'Motif obligatoire lorsqu’un dossier signé est amendé.' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  amendmentReason?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  report?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  orientation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  prescription?: string;
}
