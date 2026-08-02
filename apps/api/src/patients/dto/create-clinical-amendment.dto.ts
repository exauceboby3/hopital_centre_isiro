import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateClinicalAmendmentDto {
  @ApiProperty({ example: 'CONSULTATION' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category: string;

  @ApiProperty({ example: 'Diagnostic' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fieldName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  previousValue?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  newValue: string;

  @ApiProperty({ description: 'Motif clinique obligatoire de la correction ou de l’ajout.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consultationId?: string;
}
