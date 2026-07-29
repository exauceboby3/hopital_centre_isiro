CREATE TABLE "LabExamDocument" (
  "id" TEXT NOT NULL,
  "examRequestId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabExamDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LabExamDocument_examRequestId_key"
  ON "LabExamDocument"("examRequestId");
CREATE INDEX "LabExamDocument_uploadedById_uploadedAt_idx"
  ON "LabExamDocument"("uploadedById", "uploadedAt");

ALTER TABLE "LabExamDocument"
  ADD CONSTRAINT "LabExamDocument_examRequestId_fkey"
  FOREIGN KEY ("examRequestId") REFERENCES "ExamRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LabExamDocument"
  ADD CONSTRAINT "LabExamDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
