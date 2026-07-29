import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const graceScopes = ['ALL_CARE', 'MEDICAL_CARE', 'PHARMACY'] as const;
export type GraceScope = (typeof graceScopes)[number];

export class CreateGraceAuthorizationDto {
  @ApiProperty({ enum: graceScopes })
  @IsIn(graceScopes)
  scope: GraceScope;

  @ApiProperty({ description: 'Date et heure de fin, avec une durée maximale de 72 heures.' })
  @IsDateString()
  expiresAt: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class DeclarePatientDeathDto {
  @ApiProperty({ description: 'Date et heure du décès constaté.' })
  @IsDateString()
  occurredAt: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
