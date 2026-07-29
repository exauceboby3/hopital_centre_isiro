ALTER TYPE "CustomFieldEntity" ADD VALUE 'CARE_VOUCHER';
ALTER TYPE "CustomFieldEntity" ADD VALUE 'NURSING_CARE';
ALTER TYPE "PaymentPayer" ADD VALUE 'SPONSOR';

CREATE TYPE "CareVoucherStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "VoucherCoverageStatus" AS ENUM ('GUARANTEED', 'SETTLED', 'CANCELLED');
CREATE TYPE "NursingCareType" AS ENUM ('INJECTION', 'INFUSION', 'MEDICATION', 'DRESSING', 'WOUND_CARE', 'SAMPLE_COLLECTION', 'VITAL_SIGNS', 'HYGIENE', 'MOBILIZATION', 'MONITORING', 'OTHER');
CREATE TYPE "NursingCareStatus" AS ENUM ('ORDERED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'CANCELLED');

CREATE TABLE "CareVoucher" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "issuerName" TEXT NOT NULL,
  "coveragePercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
  "ceilingAmount" DECIMAL(12,2),
  "usedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "status" "CareVoucherStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareVoucher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoucherCoverage" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "careVoucherId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "VoucherCoverageStatus" NOT NULL DEFAULT 'GUARANTEED',
  "coveragePercent" DECIMAL(5,2) NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "patientAmount" DECIMAL(12,2) NOT NULL,
  "sponsorAmount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoucherCoverage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NursingCare" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "consultationId" TEXT,
  "hospitalizationId" TEXT,
  "orderedById" TEXT,
  "assignedNurseId" TEXT,
  "performedById" TEXT,
  "type" "NursingCareType" NOT NULL,
  "status" "NursingCareStatus" NOT NULL DEFAULT 'ORDERED',
  "label" TEXT NOT NULL,
  "medicationName" TEXT,
  "dose" TEXT,
  "route" TEXT,
  "site" TEXT,
  "instructions" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "performedAt" TIMESTAMP(3),
  "observations" TEXT,
  "adverseReaction" TEXT,
  "vitalSigns" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NursingCare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareVoucher_number_key" ON "CareVoucher"("number");
CREATE INDEX "CareVoucher_patientId_status_idx" ON "CareVoucher"("patientId", "status");
CREATE INDEX "CareVoucher_issuerName_status_idx" ON "CareVoucher"("issuerName", "status");
CREATE INDEX "CareVoucher_validUntil_status_idx" ON "CareVoucher"("validUntil", "status");
CREATE UNIQUE INDEX "VoucherCoverage_invoiceId_key" ON "VoucherCoverage"("invoiceId");
CREATE INDEX "VoucherCoverage_status_createdAt_idx" ON "VoucherCoverage"("status", "createdAt");
CREATE INDEX "VoucherCoverage_careVoucherId_status_idx" ON "VoucherCoverage"("careVoucherId", "status");
CREATE INDEX "NursingCare_patientId_scheduledAt_idx" ON "NursingCare"("patientId", "scheduledAt");
CREATE INDEX "NursingCare_assignedNurseId_status_scheduledAt_idx" ON "NursingCare"("assignedNurseId", "status", "scheduledAt");
CREATE INDEX "NursingCare_status_scheduledAt_idx" ON "NursingCare"("status", "scheduledAt");

ALTER TABLE "CareVoucher" ADD CONSTRAINT "CareVoucher_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareVoucher" ADD CONSTRAINT "CareVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherCoverage" ADD CONSTRAINT "VoucherCoverage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherCoverage" ADD CONSTRAINT "VoucherCoverage_careVoucherId_fkey" FOREIGN KEY ("careVoucherId") REFERENCES "CareVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherCoverage" ADD CONSTRAINT "VoucherCoverage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NursingCare" ADD CONSTRAINT "NursingCare_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NursingCare" ADD CONSTRAINT "NursingCare_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NursingCare" ADD CONSTRAINT "NursingCare_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NursingCare" ADD CONSTRAINT "NursingCare_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NursingCare" ADD CONSTRAINT "NursingCare_assignedNurseId_fkey" FOREIGN KEY ("assignedNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NursingCare" ADD CONSTRAINT "NursingCare_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
