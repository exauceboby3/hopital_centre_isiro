import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DepartmentReportStatus,
  RequisitionPriority,
  RequisitionStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DepartmentReportItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  itemName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingStock: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  pendingOrder: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  usedQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  returnedQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  lostQuantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}

export class CreateDepartmentReportDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  department: string;

  @ApiProperty()
  @IsDateString()
  businessDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shift?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  newAdmissions: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  hospitalized: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  ambulatory: number;

  @ApiPropertyOptional({ description: 'MIH, MIF, PED, G-O, MATERNITE, CHIRURGIE et autres indicateurs.' })
  @IsOptional()
  @IsObject()
  metrics?: Record<string, string | number | boolean | null>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  observations?: string;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => DepartmentReportItemDto)
  items: DepartmentReportItemDto[];
}

export class UpdateDepartmentReportStatusDto {
  @IsEnum(DepartmentReportStatus)
  status: DepartmentReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RequisitionItemDto {
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  itemName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityRequested: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}

export class CreateInternalRequisitionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  department: string;

  @IsEnum(RequisitionPriority)
  priority: RequisitionPriority;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemDto)
  items: RequisitionItemDto[];
}

export class ApproveRequisitionItemDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityApproved: number;
}

export class ApproveRequisitionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApproveRequisitionItemDto)
  items: ApproveRequisitionItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class FulfillRequisitionItemDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityIssued: number;
}

export class FulfillRequisitionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillRequisitionItemDto)
  items: FulfillRequisitionItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ListServiceReportsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(DepartmentReportStatus)
  status?: DepartmentReportStatus;
}

export class ListRequisitionsQueryDto {
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(RequisitionStatus)
  status?: RequisitionStatus;
}
