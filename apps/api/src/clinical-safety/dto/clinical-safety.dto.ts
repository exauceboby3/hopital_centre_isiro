import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum TriageLevel {
  RED = 'RED',
  ORANGE = 'ORANGE',
  YELLOW = 'YELLOW',
  GREEN = 'GREEN',
  BLUE = 'BLUE',
}

export enum ClinicalAlertType {
  ALLERGY = 'ALLERGY',
  BLOOD_TYPE = 'BLOOD_TYPE',
  CHRONIC_CONDITION = 'CHRONIC_CONDITION',
  CHRONIC_TREATMENT = 'CHRONIC_TREATMENT',
  RISK = 'RISK',
  OTHER = 'OTHER',
}

export enum ClinicalAlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export class CreateTriageDto {
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsEnum(TriageLevel)
  level: TriageLevel;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  chiefComplaint: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  painScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  consciousness?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  breathing?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bleeding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pregnancyStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateClinicalAlertDto {
  @IsEnum(ClinicalAlertType)
  type: ClinicalAlertType;

  @IsEnum(ClinicalAlertSeverity)
  severity: ClinicalAlertSeverity;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

export class VerifyIdentityDto {
  @IsString()
  @MaxLength(40)
  context: string;

  @IsBoolean()
  nameConfirmed: boolean;

  @IsBoolean()
  recordNumberConfirmed: boolean;

  @IsBoolean()
  birthDateConfirmed: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  braceletCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  medicationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  specimenCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateSpecimenDto {
  @IsUUID()
  examRequestId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  specimenType: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateSpecimenDto {
  @IsString()
  status: 'COLLECTED' | 'RECEIVED' | 'REJECTED' | 'IN_ANALYSIS' | 'COMPLETED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateDischargeSummaryDto {
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  hospitalizationId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  admissionReason: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  diagnoses: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  examsPerformed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  treatmentsReceived?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  dischargePrescription?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  recommendations: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  followUpInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  warningSigns?: string;

  @IsOptional()
  @IsBoolean()
  signNow?: boolean;
}

export class UpdateBedTurnoverDto {
  @IsString()
  status: 'CLEANING' | 'READY' | 'MAINTENANCE';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateNursingHandoffDto {
  @IsOptional()
  @IsUUID()
  hospitalizationId?: string;

  @IsOptional()
  @IsUUID()
  toNurseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  diagnosis?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3000)
  currentCondition: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  treatmentsInProgress?: string;

  @IsOptional()
  @IsDateString()
  nextDoseAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  pendingExams?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  risks?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3000)
  instructions: string;
}

export class CreateFollowUpDto {
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  hospitalizationId?: string;

  @IsString()
  type: 'CONSULTATION' | 'DRESSING' | 'LABORATORY' | 'RADIOLOGY' | 'MEDICATION_RENEWAL' | 'OTHER';

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  reminderChannel?: 'NONE' | 'SMS' | 'WHATSAPP';
}

export class CreateConsentDto {
  @IsString()
  type:
    | 'SURGERY'
    | 'ANESTHESIA'
    | 'TRANSFUSION'
    | 'SENSITIVE_EXAM'
    | 'MEDICAL_PHOTO'
    | 'DATA_SHARING'
    | 'DISCHARGE_AGAINST_MEDICAL_ADVICE'
    | 'OTHER';

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  signedByName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  relationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  witnessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  details?: string;
}

export class CreateAmendmentDto {
  @IsString()
  @MaxLength(80)
  entityType: string;

  @IsString()
  @MaxLength(100)
  entityId: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;

  @IsObject()
  previousValue: Record<string, unknown>;

  @IsObject()
  newValue: Record<string, unknown>;
}

export class DecideAmendmentDto {
  @IsString()
  decision: 'APPROVED' | 'REJECTED';
}

export class CreateIncidentDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsString()
  category: string;

  @IsString()
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateIncidentDto {
  @IsString()
  status: 'OPEN' | 'IN_REVIEW' | 'ACTION_REQUIRED' | 'CLOSED';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  rootCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correctiveAction?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class CreateEquipmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serialNumber?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  department: string;

  @IsOptional()
  @IsDateString()
  acquiredAt?: string;

  @IsOptional()
  @IsDateString()
  nextMaintenanceAt?: string;

  @IsOptional()
  @IsUUID()
  assignedTechnicianId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateMaintenanceDto {
  @IsString()
  type: 'PREVENTIVE' | 'CORRECTIVE';

  @IsString()
  @MinLength(5)
  @MaxLength(3000)
  description: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateMaintenanceDto {
  @IsString()
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateBackupRunDto {
  @IsString()
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'RESTORED_TESTED';

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  checksum?: string;

  @IsOptional()
  @IsDateString()
  restoredTestAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateOfflineConflictDto {
  @IsString()
  @MaxLength(100)
  entityType: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsObject()
  localPayload: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  serverPayload?: Record<string, unknown>;
}

export class ResolveOfflineConflictDto {
  @IsString()
  status: 'RESOLVED' | 'DISCARDED';

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolution: string;
}
