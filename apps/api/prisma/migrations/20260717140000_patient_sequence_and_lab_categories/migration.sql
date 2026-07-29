CREATE TABLE "PatientNumberSequence" (
  "year" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PatientNumberSequence_pkey" PRIMARY KEY ("year")
);

ALTER TABLE "BillableService"
  ADD COLUMN "category" TEXT;
