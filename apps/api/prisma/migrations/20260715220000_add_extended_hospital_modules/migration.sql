ALTER TYPE "Role" ADD VALUE 'RADIOLOGIST';
ALTER TYPE "Role" ADD VALUE 'SURGEON';
ALTER TYPE "Role" ADD VALUE 'MIDWIFE';
ALTER TYPE "Role" ADD VALUE 'PHARMACIST';
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE 'STOREKEEPER';

ALTER TYPE "BillableServiceType" ADD VALUE 'RADIOLOGY' BEFORE 'OTHER';
ALTER TYPE "BillableServiceType" ADD VALUE 'SURGERY' BEFORE 'OTHER';
ALTER TYPE "BillableServiceType" ADD VALUE 'MATERNITY' BEFORE 'OTHER';
ALTER TYPE "BillableServiceType" ADD VALUE 'PEDIATRICS' BEFORE 'OTHER';
ALTER TYPE "BillableServiceType" ADD VALUE 'BLOOD_BANK' BEFORE 'OTHER';

CREATE TYPE "CustomFieldEntity" AS ENUM ('PATIENT', 'STAFF', 'APPOINTMENT', 'CONSULTATION', 'LABORATORY', 'HOSPITALIZATION', 'INVOICE');
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');
CREATE TYPE "ClinicalOrderStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'CANCELLED');
CREATE TYPE "BloodUnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'TRANSFUSED', 'DISCARDED', 'EXPIRED');
CREATE TYPE "TransfusionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "StaffProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "postName" TEXT,
  "firstName" TEXT,
  "specialty" TEXT,
  "grade" TEXT,
  "phone" TEXT,
  "address" TEXT,
  CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HospitalProfile" (
  "id" TEXT NOT NULL DEFAULT 'main',
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "registrationNumber" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'CDF',
  "invoiceFooter" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HospitalProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldDefinition" (
  "id" TEXT NOT NULL,
  "entity" "CustomFieldEntity" NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "CustomFieldType" NOT NULL,
  "placeholder" TEXT,
  "helpText" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldValue" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalOrder" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "performedById" TEXT,
  "type" "BillableServiceType" NOT NULL,
  "status" "ClinicalOrderStatus" NOT NULL DEFAULT 'REQUESTED',
  "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
  "clinicalIndication" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "validatedAt" TIMESTAMP(3),
  "result" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BloodUnit" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "bloodType" TEXT NOT NULL,
  "component" TEXT NOT NULL,
  "volumeMl" INTEGER NOT NULL,
  "donorReference" TEXT,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "BloodUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BloodUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BloodTransfusion" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "bloodUnitId" TEXT NOT NULL,
  "clinicalOrderId" TEXT NOT NULL,
  "prescribedById" TEXT NOT NULL,
  "administeredById" TEXT,
  "status" "TransfusionStatus" NOT NULL DEFAULT 'PLANNED',
  "indication" TEXT NOT NULL,
  "crossmatchReference" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "reactionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BloodTransfusion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsuranceProvider" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InsuranceProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientInsurance" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "memberNumber" TEXT NOT NULL,
  "coveragePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "PatientInsurance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsuranceClaim" (
  "id" TEXT NOT NULL,
  "patientInsuranceId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'DRAFT',
  "claimedAmount" DECIMAL(12,2) NOT NULL,
  "approvedAmount" DECIMAL(12,2),
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "orderedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "medicationId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CareAuthorization" ADD COLUMN "clinicalOrderId" TEXT;

CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");
CREATE UNIQUE INDEX "CustomFieldDefinition_entity_key_key" ON "CustomFieldDefinition"("entity", "key");
CREATE INDEX "CustomFieldDefinition_entity_isActive_displayOrder_idx" ON "CustomFieldDefinition"("entity", "isActive", "displayOrder");
CREATE UNIQUE INDEX "CustomFieldValue_definitionId_entityId_key" ON "CustomFieldValue"("definitionId", "entityId");
CREATE INDEX "CustomFieldValue_entityId_idx" ON "CustomFieldValue"("entityId");
CREATE INDEX "ClinicalOrder_type_status_createdAt_idx" ON "ClinicalOrder"("type", "status", "createdAt");
CREATE INDEX "ClinicalOrder_patientId_createdAt_idx" ON "ClinicalOrder"("patientId", "createdAt");
CREATE UNIQUE INDEX "BloodUnit_code_key" ON "BloodUnit"("code");
CREATE INDEX "BloodUnit_bloodType_component_status_idx" ON "BloodUnit"("bloodType", "component", "status");
CREATE INDEX "BloodUnit_expiresAt_status_idx" ON "BloodUnit"("expiresAt", "status");
CREATE UNIQUE INDEX "BloodTransfusion_bloodUnitId_key" ON "BloodTransfusion"("bloodUnitId");
CREATE UNIQUE INDEX "BloodTransfusion_clinicalOrderId_key" ON "BloodTransfusion"("clinicalOrderId");
CREATE INDEX "BloodTransfusion_patientId_createdAt_idx" ON "BloodTransfusion"("patientId", "createdAt");
CREATE INDEX "BloodTransfusion_status_scheduledAt_idx" ON "BloodTransfusion"("status", "scheduledAt");
CREATE UNIQUE INDEX "InsuranceProvider_code_key" ON "InsuranceProvider"("code");
CREATE UNIQUE INDEX "PatientInsurance_providerId_memberNumber_key" ON "PatientInsurance"("providerId", "memberNumber");
CREATE INDEX "PatientInsurance_patientId_isActive_idx" ON "PatientInsurance"("patientId", "isActive");
CREATE UNIQUE INDEX "InsuranceClaim_invoiceId_key" ON "InsuranceClaim"("invoiceId");
CREATE UNIQUE INDEX "InsuranceClaim_reference_key" ON "InsuranceClaim"("reference");
CREATE INDEX "InsuranceClaim_status_createdAt_idx" ON "InsuranceClaim"("status", "createdAt");
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");
CREATE INDEX "PurchaseOrder_status_createdAt_idx" ON "PurchaseOrder"("status", "createdAt");
CREATE UNIQUE INDEX "CareAuthorization_clinicalOrderId_key" ON "CareAuthorization"("clinicalOrderId");

ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HospitalProfile" ADD CONSTRAINT "HospitalProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BillableService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalOrder" ADD CONSTRAINT "ClinicalOrder_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BloodTransfusion" ADD CONSTRAINT "BloodTransfusion_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BloodTransfusion" ADD CONSTRAINT "BloodTransfusion_bloodUnitId_fkey" FOREIGN KEY ("bloodUnitId") REFERENCES "BloodUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BloodTransfusion" ADD CONSTRAINT "BloodTransfusion_clinicalOrderId_fkey" FOREIGN KEY ("clinicalOrderId") REFERENCES "ClinicalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BloodTransfusion" ADD CONSTRAINT "BloodTransfusion_prescribedById_fkey" FOREIGN KEY ("prescribedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BloodTransfusion" ADD CONSTRAINT "BloodTransfusion_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientInsuranceId_fkey" FOREIGN KEY ("patientInsuranceId") REFERENCES "PatientInsurance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_clinicalOrderId_fkey" FOREIGN KEY ("clinicalOrderId") REFERENCES "ClinicalOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
