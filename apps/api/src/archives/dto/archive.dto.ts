import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const archiveDepartments = [
  'RECEPTION',
  'CLINICAL',
  'LABORATORY',
  'HOSPITALIZATION',
  'PHARMACY',
  'RADIOLOGY',
  'MATERNITY',
  'SURGERY',
  'PEDIATRICS',
  'FINANCE',
  'GENERAL',
] as const;

export type ArchiveDepartment = (typeof archiveDepartments)[number];

export class ListArchivesDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsIn(archiveDepartments)
  department?: ArchiveDepartment;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

export class ArchivePatientDto {
  @ApiProperty({ enum: archiveDepartments })
  @IsIn(archiveDepartments)
  department: ArchiveDepartment;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  retentionYears?: number;
}

export class RestorePatientDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}

export class UpdateArchivePolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  retentionYears: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1200)
  autoArchiveAfterMonths?: number;

  @IsBoolean()
  requireReason: boolean;
}
