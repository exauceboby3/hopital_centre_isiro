-- CreateEnum
CREATE TYPE "PaymentPayer" AS ENUM ('PATIENT', 'INSURER');

-- CreateEnum
CREATE TYPE "InsuranceCoverageStatus" AS ENUM ('DRAFT', 'GUARANTEED', 'REJECTED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InteractionSeverity" AS ENUM ('INFO', 'MODERATE', 'SEVERE', 'CONTRAINDICATED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('DRAFT', 'COUNTING', 'RECONCILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SpecialtyCaseStatus" AS ENUM ('OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RadiologyModality" AS ENUM ('CR', 'DX', 'US', 'CT', 'MR', 'MG', 'XA', 'OTHER');

-- CreateEnum
CREATE TYPE "RadiologyStudyStatus" AS ENUM ('ORDERED', 'SCHEDULED', 'ACQUIRED', 'REPORTED', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'SICK');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollEntryStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CustomFieldEntity" ADD VALUE 'PRESCRIPTION';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'PHARMACY_BATCH';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'SURGERY';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'MATERNITY';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'PEDIATRICS';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'RADIOLOGY';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'SHIFT';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'ATTENDANCE';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'PAYROLL';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'ACCOUNTING';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "payerType" "PaymentPayer" NOT NULL DEFAULT 'PATIENT';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "InsuranceCoverage" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "patientInsuranceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "InsuranceCoverageStatus" NOT NULL DEFAULT 'DRAFT',
    "coveragePercent" DECIMAL(5,2) NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "patientAmount" DECIMAL(12,2) NOT NULL,
    "insurerAmount" DECIMAL(12,2) NOT NULL,
    "guaranteeReference" TEXT,
    "approvedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "prescribedById" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "diagnosis" TEXT,
    "generalInstructions" TEXT,
    "interactionWarnings" JSONB,
    "prescribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispensedAt" TIMESTAMP(3),

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dispensedQuantity" INTEGER NOT NULL DEFAULT 0,
    "instructions" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugInteraction" (
    "id" TEXT NOT NULL,
    "medicationAId" TEXT NOT NULL,
    "medicationBId" TEXT NOT NULL,
    "severity" "InteractionSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationBatch" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "manufacturedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "supplierName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isQuarantined" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MedicationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'DRAFT',
    "countedById" TEXT NOT NULL,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "countedQuantity" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialtyCase" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicalOrderId" TEXT,
    "responsibleId" TEXT NOT NULL,
    "specialty" "BillableServiceType" NOT NULL,
    "status" "SpecialtyCaseStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "diagnosis" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "structuredData" JSONB NOT NULL,
    "checklist" JSONB,
    "report" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialtyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PacsConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "dicomWebPath" TEXT,
    "viewerUrl" TEXT,
    "aeTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PacsConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyStudy" (
    "id" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicalOrderId" TEXT,
    "performedById" TEXT,
    "modality" "RadiologyModality" NOT NULL,
    "status" "RadiologyStudyStatus" NOT NULL DEFAULT 'ORDERED',
    "bodyPart" TEXT NOT NULL,
    "indication" TEXT NOT NULL,
    "studyInstanceUid" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "acquiredAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "report" TEXT,
    "pacsViewerUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiologyStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DicomInstance" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "seriesInstanceUid" TEXT NOT NULL,
    "sopInstanceUid" TEXT NOT NULL,
    "sopClassUid" TEXT,
    "instanceNumber" INTEGER,
    "objectUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DicomInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "minutesLate" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "PayrollEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(12,2) NOT NULL,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceCoverage_invoiceId_key" ON "InsuranceCoverage"("invoiceId");

-- CreateIndex
CREATE INDEX "InsuranceCoverage_status_createdAt_idx" ON "InsuranceCoverage"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_number_key" ON "Prescription"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_invoiceId_key" ON "Prescription"("invoiceId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_prescribedAt_idx" ON "Prescription"("patientId", "prescribedAt");

-- CreateIndex
CREATE INDEX "Prescription_status_prescribedAt_idx" ON "Prescription"("status", "prescribedAt");

-- CreateIndex
CREATE INDEX "PrescriptionItem_medicationId_idx" ON "PrescriptionItem"("medicationId");

-- CreateIndex
CREATE INDEX "DrugInteraction_severity_isActive_idx" ON "DrugInteraction"("severity", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DrugInteraction_medicationAId_medicationBId_key" ON "DrugInteraction"("medicationAId", "medicationBId");

-- CreateIndex
CREATE INDEX "MedicationBatch_medicationId_expiresAt_quantity_idx" ON "MedicationBatch"("medicationId", "expiresAt", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationBatch_medicationId_lotNumber_key" ON "MedicationBatch"("medicationId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_reference_key" ON "InventoryCount"("reference");

-- CreateIndex
CREATE INDEX "InventoryCount_status_startedAt_idx" ON "InventoryCount"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_inventoryId_medicationId_key" ON "InventoryCountLine"("inventoryId", "medicationId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialtyCase_clinicalOrderId_key" ON "SpecialtyCase"("clinicalOrderId");

-- CreateIndex
CREATE INDEX "SpecialtyCase_specialty_status_createdAt_idx" ON "SpecialtyCase"("specialty", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SpecialtyCase_patientId_createdAt_idx" ON "SpecialtyCase"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyStudy_accessionNumber_key" ON "RadiologyStudy"("accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyStudy_clinicalOrderId_key" ON "RadiologyStudy"("clinicalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyStudy_studyInstanceUid_key" ON "RadiologyStudy"("studyInstanceUid");

-- CreateIndex
CREATE INDEX "RadiologyStudy_patientId_createdAt_idx" ON "RadiologyStudy"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "RadiologyStudy_status_scheduledAt_idx" ON "RadiologyStudy"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "DicomInstance_sopInstanceUid_key" ON "DicomInstance"("sopInstanceUid");

-- CreateIndex
CREATE INDEX "DicomInstance_studyId_seriesInstanceUid_idx" ON "DicomInstance"("studyId", "seriesInstanceUid");

-- CreateIndex
CREATE INDEX "StaffShift_employeeId_startsAt_idx" ON "StaffShift"("employeeId", "startsAt");

-- CreateIndex
CREATE INDEX "StaffShift_service_startsAt_idx" ON "StaffShift"("service", "startsAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_date_status_idx" ON "AttendanceRecord"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_startsOn_idx" ON "PayrollPeriod"("status", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_startsOn_endsOn_key" ON "PayrollPeriod"("startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "PayrollEntry_status_paidAt_idx" ON "PayrollEntry"("status", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_periodId_employeeId_key" ON "PayrollEntry"("periodId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE INDEX "JournalEntry_status_date_idx" ON "JournalEntry"("status", "date");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_entryId_idx" ON "JournalLine"("accountId", "entryId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MedicationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCoverage" ADD CONSTRAINT "InsuranceCoverage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCoverage" ADD CONSTRAINT "InsuranceCoverage_patientInsuranceId_fkey" FOREIGN KEY ("patientInsuranceId") REFERENCES "PatientInsurance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCoverage" ADD CONSTRAINT "InsuranceCoverage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescribedById_fkey" FOREIGN KEY ("prescribedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_medicationAId_fkey" FOREIGN KEY ("medicationAId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_medicationBId_fkey" FOREIGN KEY ("medicationBId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationBatch" ADD CONSTRAINT "MedicationBatch_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialtyCase" ADD CONSTRAINT "SpecialtyCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialtyCase" ADD CONSTRAINT "SpecialtyCase_clinicalOrderId_fkey" FOREIGN KEY ("clinicalOrderId") REFERENCES "ClinicalOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialtyCase" ADD CONSTRAINT "SpecialtyCase_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyStudy" ADD CONSTRAINT "RadiologyStudy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyStudy" ADD CONSTRAINT "RadiologyStudy_clinicalOrderId_fkey" FOREIGN KEY ("clinicalOrderId") REFERENCES "ClinicalOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyStudy" ADD CONSTRAINT "RadiologyStudy_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomInstance" ADD CONSTRAINT "DicomInstance_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "RadiologyStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
