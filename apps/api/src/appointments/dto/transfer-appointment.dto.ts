import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class TransferAppointmentDto {
  @ApiProperty({ description: 'Profil du nouveau médecin destinataire' })
  @IsUUID()
  doctorId: string;

  @ApiPropertyOptional({
    description: 'Motif clinique ou organisationnel du transfert. Un motif système est appliqué au transfert rapide.',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason?: string;
}
