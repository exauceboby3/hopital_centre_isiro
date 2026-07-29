import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmergencySeverity, Role } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEmergencyAlertDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiProperty({ enum: EmergencySeverity })
  @IsEnum(EmergencySeverity)
  severity: EmergencySeverity;

  @ApiPropertyOptional({ enum: Role, description: 'Vide pour alerter tout le personnel' })
  @IsOptional()
  @IsEnum(Role)
  targetRole?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
