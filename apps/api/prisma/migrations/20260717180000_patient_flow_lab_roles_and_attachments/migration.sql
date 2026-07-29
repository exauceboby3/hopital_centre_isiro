ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEDICAL_BIOLOGIST';

ALTER TABLE "Appointment"
  ADD COLUMN "doctorAcknowledgedAt" TIMESTAMP(3);

ALTER TABLE "ExamRequest"
  ADD COLUMN "performedByLabTechId" TEXT;

UPDATE "ExamRequest"
SET "performedByLabTechId" = "validatedByLabTechId"
WHERE "validatedByLabTechId" IS NOT NULL;

UPDATE "ExamRequest"
SET "validatedByLabTechId" = NULL
WHERE "status" = 'COMPLETED';

CREATE INDEX "ExamRequest_performedByLabTechId_idx"
  ON "ExamRequest"("performedByLabTechId");

ALTER TABLE "ExamRequest"
  ADD CONSTRAINT "ExamRequest_performedByLabTechId_fkey"
  FOREIGN KEY ("performedByLabTechId") REFERENCES "LabTechnicianProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

ALTER TABLE "MessageAttachment"
  ADD CONSTRAINT "MessageAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "UtilityType" AS ENUM ('ELECTRICITY', 'WATER', 'INTERNET');
CREATE TYPE "UtilityBillStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "UtilityBill" (
  "id" TEXT NOT NULL,
  "type" "UtilityType" NOT NULL,
  "periodStart" DATE NOT NULL,
  "provider" TEXT NOT NULL,
  "reference" TEXT,
  "amount" DECIMAL(12, 2) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "status" "UtilityBillStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UtilityBill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UtilityBill_type_periodStart_key"
  ON "UtilityBill"("type", "periodStart");
CREATE INDEX "UtilityBill_status_periodStart_idx"
  ON "UtilityBill"("status", "periodStart");

ALTER TABLE "UtilityBill"
  ADD CONSTRAINT "UtilityBill_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
