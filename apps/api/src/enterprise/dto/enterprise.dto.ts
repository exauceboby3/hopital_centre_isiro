import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttendanceStatus,
  InsuranceCoverageStatus,
  InteractionSeverity,
  JournalEntryStatus,
  LedgerAccountType,
  PayrollEntryStatus,
  PayrollPeriodStatus,
  RadiologyModality,
  RadiologyStudyStatus,
  ShiftStatus,
  SpecialtyCaseStatus,
  UtilityBillStatus,
  UtilityType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AllocateInsuranceDto {
  @IsUUID()
  invoiceId: string;

  @IsUUID()
  patientInsuranceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guaranteeReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCoverageDto {
  @ApiProperty({ enum: InsuranceCoverageStatus })
  @IsEnum(InsuranceCoverageStatus)
  status: InsuranceCoverageStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guaranteeReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreatePrescriptionItemDto {
  @IsUUID()
  medicationId: string;

  @IsString()
  @MaxLength(120)
  dosage: string;

  @IsString()
  @MaxLength(120)
  frequency: string;

  @IsString()
  @MaxLength(80)
  route: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  generalInstructions?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  interactionOverrideReason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items: CreatePrescriptionItemDto[];
}

export class DispensePrescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateDrugInteractionDto {
  @IsUUID()
  medicationAId: string;

  @IsUUID()
  medicationBId: string;

  @IsEnum(InteractionSeverity)
  severity: InteractionSeverity;

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  recommendation?: string;
}

export class CreateMedicationBatchDto {
  @IsUUID()
  medicationId: string;

  @IsString()
  @MaxLength(100)
  lotNumber: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsDateString()
  manufacturedAt?: string;

  @IsDateString()
  expiresAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;
}

export class InventoryLineDto {
  @IsUUID()
  medicationId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity: number;
}

export class ReconcileInventoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  lines: InventoryLineDto[];
}

export class CreateSpecialtyCaseDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  clinicalOrderId: string;

  @IsIn(['SURGERY', 'MATERNITY', 'PEDIATRICS'])
  specialty: 'SURGERY' | 'MATERNITY' | 'PEDIATRICS';

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  diagnosis?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  structuredData: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;
}

export class UpdateSpecialtyCaseDto {
  @IsEnum(SpecialtyCaseStatus)
  status: SpecialtyCaseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  report?: string;

  @IsOptional()
  @IsObject()
  structuredData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;
}

export class UpdatePacsConfigurationDto {
  @IsString()
  @MaxLength(160)
  name: string;

  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  baseUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  dicomWebPath?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  viewerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  aeTitle?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateRadiologyStudyDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  clinicalOrderId: string;

  @IsEnum(RadiologyModality)
  modality: RadiologyModality;

  @IsString()
  @MaxLength(120)
  bodyPart: string;

  @IsString()
  @MaxLength(3000)
  indication: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateRadiologyStudyDto {
  @IsEnum(RadiologyStudyStatus)
  status: RadiologyStudyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  studyInstanceUid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  report?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RegisterDicomInstanceDto {
  @IsString()
  @MaxLength(128)
  seriesInstanceUid: string;

  @IsString()
  @MaxLength(128)
  sopInstanceUid: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sopClassUid?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  instanceNumber?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  objectUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateShiftDto {
  @IsUUID()
  employeeId: string;

  @IsString()
  @MaxLength(120)
  service: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateShiftDto {
  @IsEnum(ShiftStatus)
  status: ShiftStatus;
}

export class UpsertAttendanceDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsDateString()
  clockIn?: string;

  @IsOptional()
  @IsDateString()
  clockOut?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minutesLate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PayrollLineDto {
  @IsUUID()
  employeeId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseSalary: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  allowances?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtime?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deductions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxes?: number;
}

export class CreatePayrollPeriodDto {
  @IsString()
  @MaxLength(120)
  label: string;

  @IsDateString()
  startsOn: string;

  @IsDateString()
  endsOn: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PayrollLineDto)
  entries: PayrollLineDto[];
}

export class UpdatePayrollPeriodDto {
  @IsEnum(PayrollPeriodStatus)
  status: PayrollPeriodStatus;
}

export class UpdatePayrollEntryDto {
  @IsEnum(PayrollEntryStatus)
  status: PayrollEntryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;
}

export class CreateLedgerAccountDto {
  @IsString()
  @MaxLength(30)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsEnum(LedgerAccountType)
  type: LedgerAccountType;
}

export class CreateUtilityBillDto {
  @IsEnum(UtilityType)
  type: UtilityType;

  @IsDateString()
  periodStart: string;

  @IsString()
  @MaxLength(160)
  provider: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateUtilityBillDto {
  @IsEnum(UtilityBillStatus)
  status: UtilityBillStatus;
}

export class JournalLineDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit: number;
}

export class CreateJournalEntryDto {
  @IsDateString()
  date: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

export class UpdateJournalEntryDto {
  @IsEnum(JournalEntryStatus)
  status: JournalEntryStatus;
}
