import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Tarif de consultation à facturer avant le rendez-vous' })
  @IsUUID()
  billableServiceId: string;

  @ApiProperty({ description: 'Médecin affecté avant le paiement et l’arrivée automatique' })
  @IsUUID()
  doctorId: string;

  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  service: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
