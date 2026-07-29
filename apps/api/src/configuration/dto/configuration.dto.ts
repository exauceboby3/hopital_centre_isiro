import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CustomFieldEntity, CustomFieldType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomFieldDto {
  @ApiProperty({ enum: CustomFieldEntity })
  @IsEnum(CustomFieldEntity)
  entity: CustomFieldEntity;

  @ApiProperty({ example: 'profession' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,49}$/)
  key: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  label: string;

  @ApiProperty({ enum: CustomFieldType })
  @IsEnum(CustomFieldType)
  type: CustomFieldType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  displayOrder?: number;
}

export class UpdateCustomFieldDto extends PartialType(CreateCustomFieldDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SaveCustomValuesDto {
  @ApiProperty({ type: Object })
  @IsObject()
  values: Record<string, unknown>;
}

export class UpdateHospitalProfileDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  invoiceFooter?: string;

  @ApiPropertyOptional({ description: 'Logo PNG, JPEG ou WebP encodé en data URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(800000)
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  logoDataUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentHeader?: string;

  @ApiPropertyOptional({ example: '#167757' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  documentAccentColor?: string;

  @ApiPropertyOptional({ enum: ['A4', 'A5', 'LETTER'] })
  @IsOptional()
  @IsIn(['A4', 'A5', 'LETTER'])
  documentPaperSize?: string;

  @ApiPropertyOptional({ enum: ['PORTRAIT', 'LANDSCAPE'] })
  @IsOptional()
  @IsIn(['PORTRAIT', 'LANDSCAPE'])
  documentOrientation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  documentMarginMm?: number;
}

export class CreatePrintTemplateDto {
  @ApiProperty({ example: 'LABORATORY' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/)
  department: string;

  @ApiProperty({ example: 'LAB_RESULT' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,59}$/)
  documentType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  headerText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  footerText?: string;

  @ApiPropertyOptional({ enum: ['A4', 'A5', 'LETTER'] })
  @IsOptional()
  @IsIn(['A4', 'A5', 'LETTER'])
  paperSize?: string;

  @ApiPropertyOptional({ enum: ['PORTRAIT', 'LANDSCAPE'] })
  @IsOptional()
  @IsIn(['PORTRAIT', 'LANDSCAPE'])
  orientation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  marginMm?: number;

  @ApiPropertyOptional({ example: '#167757' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  accentColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePrintTemplateDto extends PartialType(CreatePrintTemplateDto) {}
