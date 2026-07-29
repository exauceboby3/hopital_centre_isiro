CREATE TYPE "ArchiveAction" AS ENUM ('ARCHIVED', 'RESTORED');

ALTER TABLE "Patient"
  ADD COLUMN "archiveDepartment" TEXT,
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "retentionUntil" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

CREATE INDEX "Patient_archiveDepartment_archivedAt_idx"
  ON "Patient"("archiveDepartment", "archivedAt");

ALTER TABLE "Patient"
  ADD CONSTRAINT "Patient_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PatientArchiveEvent" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "action" "ArchiveAction" NOT NULL,
  "department" TEXT,
  "reason" TEXT NOT NULL,
  "actorId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "PatientArchiveEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientArchiveEvent_reference_key"
  ON "PatientArchiveEvent"("reference");
CREATE INDEX "PatientArchiveEvent_patientId_occurredAt_idx"
  ON "PatientArchiveEvent"("patientId", "occurredAt");
CREATE INDEX "PatientArchiveEvent_action_occurredAt_idx"
  ON "PatientArchiveEvent"("action", "occurredAt");
CREATE INDEX "PatientArchiveEvent_department_occurredAt_idx"
  ON "PatientArchiveEvent"("department", "occurredAt");

ALTER TABLE "PatientArchiveEvent"
  ADD CONSTRAINT "PatientArchiveEvent_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientArchiveEvent"
  ADD CONSTRAINT "PatientArchiveEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ArchivePolicy" (
  "id" TEXT NOT NULL DEFAULT 'patient',
  "retentionYears" INTEGER NOT NULL DEFAULT 10,
  "autoArchiveAfterMonths" INTEGER,
  "requireReason" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArchivePolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ArchivePolicy"
  ADD CONSTRAINT "ArchivePolicy_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ArchivePolicy" (
  "id", "retentionYears", "requireReason", "updatedAt"
) VALUES ('patient', 10, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
