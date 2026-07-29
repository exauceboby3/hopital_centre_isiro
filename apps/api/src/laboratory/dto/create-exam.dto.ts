import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LabResultFieldDto {
  @ApiProperty({ example: 'hemoglobine' })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: 'Hémoglobine' })
  @IsString()
  @MaxLength(120)
  label: string;

  @ApiProperty({ enum: ['TEXT', 'NUMBER', 'SELECT', 'LONG_TEXT'] })
  @IsIn(['TEXT', 'NUMBER', 'SELECT', 'LONG_TEXT'])
  type: 'TEXT' | 'NUMBER' | 'SELECT' | 'LONG_TEXT';

  @ApiPropertyOptional({ example: 'g/dL' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional({ example: 'Adulte : 12–17' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];
}

export class CreateExamDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: "Tarif de l'examen à facturer avant sa réalisation" })
  @IsUUID()
  billableServiceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observations?: string;
}

export class CreateLabExamCatalogDto {
  @ApiProperty({
    description: 'Référence courte et unique de l’examen, par exemple NFS, GLY ou PALU.',
    example: 'NFS',
  })
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ example: 'Biochimie' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiProperty({ example: 'Glycémie' })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'Sang total, sérum ou plasma' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  specimenType?: string;

  @ApiPropertyOptional({ example: 'Spectrophotométrie' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  method?: string;

  @ApiProperty({ minimum: 1, example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [LabResultFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LabResultFieldDto)
  resultFields?: LabResultFieldDto[];
}

export class UpdateLabExamCatalogDto extends PartialType(CreateLabExamCatalogDto) {}

export class CreateExamBatchDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @ApiProperty({ type: [String], description: 'Tarifs des examens sélectionnés.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  serviceIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observations?: string;
}
