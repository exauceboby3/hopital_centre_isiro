import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BillableServiceType,
  BloodUnitStatus,
  ClinicalOrderStatus,
  InsuranceClaimStatus,
  TransfusionStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateClinicalOrderDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  serviceId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  clinicalIndication: string;

  @ApiPropertyOptional({ enum: ['ROUTINE', 'URGENT', 'EMERGENCY'] })
  @IsOptional()
  @IsIn(['ROUTINE', 'URGENT', 'EMERGENCY'])
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateClinicalOrderDto {
  @ApiProperty({ enum: ClinicalOrderStatus })
  @IsEnum(ClinicalOrderStatus)
  status: ClinicalOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  result?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class CreateBloodUnitDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  bloodType: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  component: string;

  @ApiProperty()
  @IsInt()
  @Min(50)
  @Max(1000)
  volumeMl: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  donorReference?: string;

  @ApiProperty()
  @IsDateString()
  collectedAt: string;

  @ApiProperty()
  @IsDateString()
  expiresAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateTransfusionDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  bloodUnitId: string;

  @ApiProperty({ description: 'Acte de transfusion sanguine facturé avant la transfusion' })
  @IsUUID()
  clinicalOrderId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  indication: string;

  @ApiProperty({ description: 'Référence du test de compatibilité validé au laboratoire' })
  @IsString()
  @MaxLength(120)
  crossmatchReference: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateTransfusionDto {
  @ApiProperty({ enum: TransfusionStatus })
  @IsEnum(TransfusionStatus)
  status: TransfusionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reactionNotes?: string;
}

export class CreateInsuranceProviderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(30)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class CreatePatientInsuranceDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  providerId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  memberNumber: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  coveragePercent: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class CreateInsuranceClaimDto {
  @ApiProperty()
  @IsUUID()
  patientInsuranceId: string;

  @ApiProperty()
  @IsUUID()
  invoiceId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  claimedAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateInsuranceClaimDto {
  @ApiProperty({ enum: InsuranceClaimStatus })
  @IsEnum(InsuranceClaimStatus)
  status: InsuranceClaimStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approvedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateSupplierDto {
  @ApiProperty()
  @IsString()
  @MaxLength(30)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class PurchaseOrderItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  description: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListOperationsDto {
  @ApiPropertyOptional({ enum: BillableServiceType })
  @IsOptional()
  @IsEnum(BillableServiceType)
  type?: BillableServiceType;

  @ApiPropertyOptional({ enum: ClinicalOrderStatus })
  @IsOptional()
  @IsEnum(ClinicalOrderStatus)
  status?: ClinicalOrderStatus;
}

export class ListBloodUnitsDto {
  @ApiPropertyOptional({ enum: BloodUnitStatus })
  @IsOptional()
  @IsEnum(BloodUnitStatus)
  status?: BloodUnitStatus;
}
