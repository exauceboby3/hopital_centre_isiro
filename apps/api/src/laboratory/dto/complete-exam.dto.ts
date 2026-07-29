import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LabResultValueDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  value: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CompleteExamDto {
  @ApiPropertyOptional({ description: 'Ancien format libre conservé pour compatibilité.' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  result?: string;

  @ApiPropertyOptional({ type: [LabResultValueDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LabResultValueDto)
  resultValues?: LabResultValueDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  conclusion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  resultFileKey?: string;
}

export class RejectExamResultDto {
  @ApiProperty({ description: 'Correction demandée au technicien.' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  comment: string;
}
