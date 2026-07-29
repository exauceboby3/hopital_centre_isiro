import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdmitPatientDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: "Demande d'hospitalisation validée par le médecin" })
  @IsUUID()
  authorizationId: string;

  @ApiProperty()
  @IsUUID()
  bedId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDischargeAt?: string;
}
