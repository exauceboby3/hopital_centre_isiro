import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateConsultationDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ description: 'Autorisation payée pour une consultation sans rendez-vous' })
  @IsOptional()
  @IsUUID()
  authorizationId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class CreateHospitalizationReferralDto {
  @ApiProperty({ description: 'Tarif d’hospitalisation à envoyer à la caisse' })
  @IsUUID()
  serviceId: string;
}
