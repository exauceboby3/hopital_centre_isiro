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
  'FOLLOW_UP',
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

  @ApiPropertyOptional({ deprecated: true })
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

  @ApiPropertyOptional({
    description: 'Interprétation médicale distincte, saisie après validation des résultats.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  laboratoryInterpretation?: string;

  @ApiPropertyOptional({ description: 'Diagnostic confirmé ou révisé après le laboratoire.' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  postLaboratoryDiagnosis?: string;

  @ApiPropertyOptional({ description: 'Conduite médicale décidée après interprétation.' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  postLaboratoryPlan?: string;

  @ApiPropertyOptional({ description: 'Observations complémentaires du retour laboratoire.' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  postLaboratoryNotes?: string;

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

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  orientation?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  prescription?: string;
}
