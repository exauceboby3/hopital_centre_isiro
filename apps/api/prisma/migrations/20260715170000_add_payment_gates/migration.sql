CREATE TYPE "BillableServiceType" AS ENUM ('CONSULTATION', 'LABORATORY', 'HOSPITALIZATION', 'PHARMACY', 'PROCEDURE', 'OTHER');
CREATE TYPE "CareAuthorizationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CONSUMED', 'WAIVED', 'CANCELLED');

CREATE TABLE "BillableService" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BillableServiceType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "requiresPrepayment" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillableService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareAuthorization" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "serviceId" TEXT,
    "medicationId" TEXT,
    "appointmentId" TEXT,
    "consultationId" TEXT,
    "examRequestId" TEXT,
    "hospitalizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "waivedById" TEXT,
    "type" "BillableServiceType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "CareAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "authorizedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waiverReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillableService_code_key" ON "BillableService"("code");
CREATE INDEX "BillableService_type_isActive_idx" ON "BillableService"("type", "isActive");
CREATE UNIQUE INDEX "CareAuthorization_invoiceId_key" ON "CareAuthorization"("invoiceId");
CREATE UNIQUE INDEX "CareAuthorization_appointmentId_key" ON "CareAuthorization"("appointmentId");
CREATE UNIQUE INDEX "CareAuthorization_consultationId_key" ON "CareAuthorization"("consultationId");
CREATE UNIQUE INDEX "CareAuthorization_examRequestId_key" ON "CareAuthorization"("examRequestId");
CREATE UNIQUE INDEX "CareAuthorization_hospitalizationId_key" ON "CareAuthorization"("hospitalizationId");
CREATE INDEX "CareAuthorization_patientId_status_createdAt_idx" ON "CareAuthorization"("patientId", "status", "createdAt");
CREATE INDEX "CareAuthorization_type_status_idx" ON "CareAuthorization"("type", "status");
CREATE INDEX "CareAuthorization_serviceId_idx" ON "CareAuthorization"("serviceId");
CREATE INDEX "CareAuthorization_medicationId_idx" ON "CareAuthorization"("medicationId");

ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BillableService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_examRequestId_fkey" FOREIGN KEY ("examRequestId") REFERENCES "ExamRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareAuthorization" ADD CONSTRAINT "CareAuthorization_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
