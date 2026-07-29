import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class DispenseMedicationDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Autorisation de pharmacie intégralement payée' })
  @IsUUID()
  authorizationId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
