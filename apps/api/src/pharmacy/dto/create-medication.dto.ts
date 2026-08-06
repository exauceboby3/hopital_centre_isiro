import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMedicationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  form?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  strength?: string;

  @ApiProperty({ default: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumStock: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @ApiProperty({ default: 0, description: 'Quantité réellement disponible lors de la création' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialStock: number;
}
