ALTER TABLE "ExamRequest"
ADD COLUMN "requestGroupId" TEXT,
ADD COLUMN "resultSchema" JSONB,
ADD COLUMN "resultData" JSONB,
ADD COLUMN "reviewComment" TEXT;

UPDATE "ExamRequest"
SET "requestGroupId" = COALESCE("consultationId", "id");

ALTER TABLE "ExamRequest"
ALTER COLUMN "requestGroupId" SET NOT NULL;

ALTER TABLE "BillableService"
ADD COLUMN "labResultTemplate" JSONB;

CREATE TYPE "PatientJourneyStage" AS ENUM (
  'AWAITING_PAYMENT',
  'WAITING_DOCTOR',
  'IN_CONSULTATION',
  'LABORATORY',
  'RETURN_TO_DOCTOR',
  'HOSPITALIZATION',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "Appointment"
ADD COLUMN "journeyStage" "PatientJourneyStage" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN "journeyUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Appointment"
SET "journeyStage" = CASE
  WHEN "status" = 'CHECKED_IN' THEN 'WAITING_DOCTOR'::"PatientJourneyStage"
  WHEN "status" = 'COMPLETED' THEN 'COMPLETED'::"PatientJourneyStage"
  WHEN "status" IN ('CANCELLED', 'NO_SHOW') THEN 'CANCELLED'::"PatientJourneyStage"
  ELSE 'AWAITING_PAYMENT'::"PatientJourneyStage"
END;

CREATE INDEX "ExamRequest_requestGroupId_requestedAt_idx"
ON "ExamRequest"("requestGroupId", "requestedAt");

CREATE INDEX "Appointment_journeyStage_journeyUpdatedAt_idx"
ON "Appointment"("journeyStage", "journeyUpdatedAt");

-- Le secrétariat et la réception constituent désormais un seul rôle d'accueil.
UPDATE "User" SET "role" = 'RECEPTIONIST' WHERE "role" = 'SECRETARY';
UPDATE "User"
SET "additionalRoles" = array_replace("additionalRoles", 'SECRETARY'::"Role", 'RECEPTIONIST'::"Role")
WHERE "additionalRoles" @> ARRAY['SECRETARY'::"Role"];
