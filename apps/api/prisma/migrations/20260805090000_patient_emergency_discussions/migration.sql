ALTER TABLE "EmergencyAlert"
  ADD COLUMN "patientId" TEXT,
  ADD COLUMN "hospitalizationId" TEXT;

CREATE TABLE "EmergencyAlertComment" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyAlertComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmergencyAlert_patientId_status_createdAt_idx"
  ON "EmergencyAlert"("patientId", "status", "createdAt");
CREATE INDEX "EmergencyAlertComment_alertId_createdAt_idx"
  ON "EmergencyAlertComment"("alertId", "createdAt");

ALTER TABLE "EmergencyAlert"
  ADD CONSTRAINT "EmergencyAlert_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyAlert"
  ADD CONSTRAINT "EmergencyAlert_hospitalizationId_fkey"
  FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyAlertComment"
  ADD CONSTRAINT "EmergencyAlertComment_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "EmergencyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyAlertComment"
  ADD CONSTRAINT "EmergencyAlertComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
