import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class PermanentDeletePatientDto {
  @ApiProperty({ description: 'Numéro de dossier médical saisi exactement pour confirmer' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  confirmation: string;

  @ApiProperty({ description: 'Motif administratif obligatoire de suppression définitive' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}
