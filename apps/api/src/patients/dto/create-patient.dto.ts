import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sex } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'ZAKUDA' })
  @IsString()
  @Length(2, 100)
  lastName: string;

  @ApiPropertyOptional({ example: 'BOBY' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  postName?: string;

  @ApiPropertyOptional({ example: 'Exaucé' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ enum: Sex })
  @IsEnum(Sex)
  sex: Sex;

  @ApiPropertyOptional({ example: '1995-06-20' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  bloodType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  emergencyContact?: string;

  @ApiPropertyOptional({
    type: Object,
    description: "Valeurs des rubriques configurées par l'administrateur ou le superadmin",
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
