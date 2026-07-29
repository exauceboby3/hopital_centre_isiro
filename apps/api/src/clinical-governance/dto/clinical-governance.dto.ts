import { PaymentMethod } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
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
  MinLength,
} from 'class-validator';

export class CreatePatientAdvanceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class AllocatePatientAdvanceDto {
  @IsUUID()
  advanceId: string;

  @IsUUID()
  invoiceId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount: number;
}

export class CreatePaymentPlanDto {
  @IsInt()
  @Min(1)
  @Max(12)
  installmentCount: number;

  @IsDateString()
  firstDueAt: string;

  @IsInt()
  @Min(1)
  @Max(90)
  intervalDays: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreatePatientEpisodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsDateString()
  openedAt?: string;
}

export class CreateBreakGlassAccessDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @IsDateString()
  expiresAt: string;
}

export class DecideAdditionalExamDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}

export class CreateDeathCaseDto {
  @IsDateString()
  occurredAt: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  cause: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  declaringDoctorName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  declaringDoctorLicense?: string;

  @IsOptional()
  @IsDateString()
  morgueTransferredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  morgueLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  morgueRegisterNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDeathCaseDto {
  @IsOptional()
  @IsDateString()
  morgueTransferredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  morgueLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  morgueRegisterNumber?: string;

  @IsOptional()
  @IsDateString()
  familyReleasedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientIdentity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  recipientRelationship?: string;

  @IsOptional()
  @IsBoolean()
  closeFinancialAccount?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
