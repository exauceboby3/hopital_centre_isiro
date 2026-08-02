ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR';

CREATE TYPE "PrescriptionAvailability" AS ENUM ('INTERNAL', 'PARTIAL', 'EXTERNAL', 'NON_CATALOGUED');
CREATE TYPE "DepartmentReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CLOSED', 'REJECTED');
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED', 'CANCELLED');
CREATE TYPE "RequisitionPriority" AS ENUM ('ROUTINE', 'URGENT', 'CRITICAL');

ALTER TABLE "PrescriptionItem"
  ADD COLUMN "medicationName" TEXT,
  ADD COLUMN "form" TEXT,
  ADD COLUMN "strength" TEXT,
  ADD COLUMN "availability" "PrescriptionAvailability" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "externalReason" TEXT;

UPDATE "PrescriptionItem" item
SET "medicationName" = medication."name",
    "form" = medication."form",
    "strength" = medication."strength"
FROM "Medication" medication
WHERE medication."id" = item."medicationId";

UPDATE "PrescriptionItem"
SET "medicationName" = 'Médicament non référencé'
WHERE "medicationName" IS NULL;

ALTER TABLE "PrescriptionItem" ALTER COLUMN "medicationName" SET NOT NULL;
ALTER TABLE "PrescriptionItem" ALTER COLUMN "medicationId" DROP NOT NULL;
ALTER TABLE "PrescriptionItem" DROP CONSTRAINT IF EXISTS "PrescriptionItem_medicationId_fkey";
ALTER TABLE "PrescriptionItem"
  ADD CONSTRAINT "PrescriptionItem_medicationId_fkey"
  FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PrescriptionItem_availability_idx" ON "PrescriptionItem"("availability");

CREATE TABLE "PatientClinicalAmendment" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "consultationId" TEXT,
  "authorId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "previousValue" TEXT,
  "newValue" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientClinicalAmendment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PatientClinicalAmendment_patientId_createdAt_idx" ON "PatientClinicalAmendment"("patientId", "createdAt");
CREATE INDEX "PatientClinicalAmendment_consultationId_createdAt_idx" ON "PatientClinicalAmendment"("consultationId", "createdAt");
CREATE INDEX "PatientClinicalAmendment_authorId_createdAt_idx" ON "PatientClinicalAmendment"("authorId", "createdAt");
ALTER TABLE "PatientClinicalAmendment" ADD CONSTRAINT "PatientClinicalAmendment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientClinicalAmendment" ADD CONSTRAINT "PatientClinicalAmendment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientClinicalAmendment" ADD CONSTRAINT "PatientClinicalAmendment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DepartmentStock" (
  "id" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "minimumQuantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DepartmentStock_department_medicationId_key" ON "DepartmentStock"("department", "medicationId");
CREATE INDEX "DepartmentStock_department_quantity_idx" ON "DepartmentStock"("department", "quantity");
ALTER TABLE "DepartmentStock" ADD CONSTRAINT "DepartmentStock_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DepartmentStockMovement" (
  "id" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceDepartment" TEXT,
  "targetDepartment" TEXT,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentStockMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DepartmentStockMovement_medicationId_createdAt_idx" ON "DepartmentStockMovement"("medicationId", "createdAt");
CREATE INDEX "DepartmentStockMovement_sourceDepartment_createdAt_idx" ON "DepartmentStockMovement"("sourceDepartment", "createdAt");
CREATE INDEX "DepartmentStockMovement_targetDepartment_createdAt_idx" ON "DepartmentStockMovement"("targetDepartment", "createdAt");
ALTER TABLE "DepartmentStockMovement" ADD CONSTRAINT "DepartmentStockMovement_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepartmentStockMovement" ADD CONSTRAINT "DepartmentStockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DepartmentDailyReport" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "shift" TEXT,
  "status" "DepartmentReportStatus" NOT NULL DEFAULT 'DRAFT',
  "newAdmissions" INTEGER NOT NULL DEFAULT 0,
  "hospitalized" INTEGER NOT NULL DEFAULT 0,
  "ambulatory" INTEGER NOT NULL DEFAULT 0,
  "serviceTotal" INTEGER NOT NULL DEFAULT 0,
  "metrics" JSONB,
  "observations" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentDailyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DepartmentDailyReport_reference_key" ON "DepartmentDailyReport"("reference");
CREATE UNIQUE INDEX "DepartmentDailyReport_department_businessDate_shift_key" ON "DepartmentDailyReport"("department", "businessDate", "shift");
CREATE INDEX "DepartmentDailyReport_businessDate_department_idx" ON "DepartmentDailyReport"("businessDate", "department");
CREATE INDEX "DepartmentDailyReport_status_businessDate_idx" ON "DepartmentDailyReport"("status", "businessDate");
ALTER TABLE "DepartmentDailyReport" ADD CONSTRAINT "DepartmentDailyReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepartmentDailyReport" ADD CONSTRAINT "DepartmentDailyReport_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DepartmentDailyReportItem" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "medicationId" TEXT,
  "itemName" TEXT NOT NULL,
  "unit" TEXT,
  "openingStock" INTEGER NOT NULL DEFAULT 0,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "pendingOrder" INTEGER NOT NULL DEFAULT 0,
  "usedQuantity" INTEGER NOT NULL DEFAULT 0,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "lostQuantity" INTEGER NOT NULL DEFAULT 0,
  "closingStock" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2),
  "observations" TEXT,
  CONSTRAINT "DepartmentDailyReportItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DepartmentDailyReportItem_reportId_idx" ON "DepartmentDailyReportItem"("reportId");
CREATE INDEX "DepartmentDailyReportItem_medicationId_idx" ON "DepartmentDailyReportItem"("medicationId");
ALTER TABLE "DepartmentDailyReportItem" ADD CONSTRAINT "DepartmentDailyReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DepartmentDailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentDailyReportItem" ADD CONSTRAINT "DepartmentDailyReportItem_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InternalRequisition" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "priority" "RequisitionPriority" NOT NULL DEFAULT 'ROUTINE',
  "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "fulfilledById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InternalRequisition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InternalRequisition_reference_key" ON "InternalRequisition"("reference");
CREATE INDEX "InternalRequisition_department_requestedAt_idx" ON "InternalRequisition"("department", "requestedAt");
CREATE INDEX "InternalRequisition_status_requestedAt_idx" ON "InternalRequisition"("status", "requestedAt");
ALTER TABLE "InternalRequisition" ADD CONSTRAINT "InternalRequisition_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalRequisition" ADD CONSTRAINT "InternalRequisition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InternalRequisition" ADD CONSTRAINT "InternalRequisition_fulfilledById_fkey" FOREIGN KEY ("fulfilledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InternalRequisitionItem" (
  "id" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "medicationId" TEXT,
  "itemName" TEXT NOT NULL,
  "unit" TEXT,
  "quantityRequested" INTEGER NOT NULL,
  "quantityApproved" INTEGER NOT NULL DEFAULT 0,
  "quantityIssued" INTEGER NOT NULL DEFAULT 0,
  "observations" TEXT,
  CONSTRAINT "InternalRequisitionItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalRequisitionItem_requisitionId_idx" ON "InternalRequisitionItem"("requisitionId");
CREATE INDEX "InternalRequisitionItem_medicationId_idx" ON "InternalRequisitionItem"("medicationId");
ALTER TABLE "InternalRequisitionItem" ADD CONSTRAINT "InternalRequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "InternalRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalRequisitionItem" ADD CONSTRAINT "InternalRequisitionItem_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
