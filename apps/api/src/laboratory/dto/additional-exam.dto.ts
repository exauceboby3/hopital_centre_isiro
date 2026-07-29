import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AddBiologistExamDto {
  @ApiProperty({ description: 'Examen actif du catalogue laboratoire à ajouter à la demande.' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({
    enum: ['ROUTINE', 'URGENT', 'CRITICAL'],
    description:
      'Urgence de la demande. Les examens urgents ou critiques peuvent être autorisés directement avec justification.',
  })
  @IsIn(['ROUTINE', 'URGENT', 'CRITICAL'])
  urgency: 'ROUTINE' | 'URGENT' | 'CRITICAL';

  @ApiProperty({ description: 'Justification biologique ou clinique de l’examen complémentaire.' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
