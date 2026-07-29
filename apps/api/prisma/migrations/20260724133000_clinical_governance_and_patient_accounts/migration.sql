CREATE TABLE "PatientEpisode" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientEpisode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientEpisode_status_check" CHECK ("status" IN ('OPEN', 'CLOSED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "PatientEpisode_number_key" ON "PatientEpisode"("number");
CREATE UNIQUE INDEX "PatientEpisode_appointmentId_key" ON "PatientEpisode"("appointmentId");
CREATE INDEX "PatientEpisode_patientId_openedAt_idx" ON "PatientEpisode"("patientId", "openedAt");
CREATE INDEX "PatientEpisode_status_openedAt_idx" ON "PatientEpisode"("status", "openedAt");

ALTER TABLE "PatientEpisode"
ADD CONSTRAINT "PatientEpisode_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientEpisode_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PatientEpisode_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientEpisode_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PatientAdvance" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientAdvance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientAdvance_amount_check" CHECK ("amount" > 0 AND "remainingAmount" >= 0 AND "remainingAmount" <= "amount")
);

CREATE UNIQUE INDEX "PatientAdvance_number_key" ON "PatientAdvance"("number");
CREATE INDEX "PatientAdvance_patientId_receivedAt_idx" ON "PatientAdvance"("patientId", "receivedAt");
ALTER TABLE "PatientAdvance"
ADD CONSTRAINT "PatientAdvance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAdvance_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatientAdvanceAllocation" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedById" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientAdvanceAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientAdvanceAllocation_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "PatientAdvanceAllocation_advanceId_allocatedAt_idx" ON "PatientAdvanceAllocation"("advanceId", "allocatedAt");
CREATE INDEX "PatientAdvanceAllocation_invoiceId_allocatedAt_idx" ON "PatientAdvanceAllocation"("invoiceId", "allocatedAt");
ALTER TABLE "PatientAdvanceAllocation"
ADD CONSTRAINT "PatientAdvanceAllocation_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "PatientAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAdvanceAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientAdvanceAllocation_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentPlan_status_check" CHECK ("status" IN ('ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED')),
    CONSTRAINT "PaymentPlan_total_check" CHECK ("totalAmount" > 0)
);

CREATE UNIQUE INDEX "PaymentPlan_number_key" ON "PaymentPlan"("number");
CREATE INDEX "PaymentPlan_patientId_status_idx" ON "PaymentPlan"("patientId", "status");
ALTER TABLE "PaymentPlan"
ADD CONSTRAINT "PaymentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PaymentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentInstallment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentInstallment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentInstallment_status_check" CHECK ("status" IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')),
    CONSTRAINT "PaymentInstallment_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "PaymentInstallment_planId_sequence_key" ON "PaymentInstallment"("planId", "sequence");
CREATE INDEX "PaymentInstallment_status_dueAt_idx" ON "PaymentInstallment"("status", "dueAt");
ALTER TABLE "PaymentInstallment"
ADD CONSTRAINT "PaymentInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BreakGlassAccess" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BreakGlassAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BreakGlassAccess_duration_check" CHECK ("expiresAt" > "startedAt" AND "expiresAt" <= "startedAt" + INTERVAL '30 minutes')
);

CREATE INDEX "BreakGlassAccess_patientId_expiresAt_idx" ON "BreakGlassAccess"("patientId", "expiresAt");
CREATE INDEX "BreakGlassAccess_userId_expiresAt_idx" ON "BreakGlassAccess"("userId", "expiresAt");
ALTER TABLE "BreakGlassAccess"
ADD CONSTRAINT "BreakGlassAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "BreakGlassAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "BreakGlassAccess_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MedicationAdministrationEvent" (
    "id" TEXT NOT NULL,
    "nursingCareId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prescribedDose" TEXT,
    "administeredDose" TEXT,
    "route" TEXT,
    "omissionReason" TEXT,
    "comment" TEXT,
    "adverseReaction" TEXT,
    "patientBarcode" TEXT,
    "medicationBarcode" TEXT,
    "signatureHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicationAdministrationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MedicationAdministrationEvent_status_check" CHECK ("status" IN ('ADMINISTERED', 'REFUSED', 'OMITTED', 'MISSED'))
);

CREATE INDEX "MedicationAdministrationEvent_patientId_performedAt_idx" ON "MedicationAdministrationEvent"("patientId", "performedAt");
CREATE INDEX "MedicationAdministrationEvent_nursingCareId_performedAt_idx" ON "MedicationAdministrationEvent"("nursingCareId", "performedAt");
ALTER TABLE "MedicationAdministrationEvent"
ADD CONSTRAINT "MedicationAdministrationEvent_nursingCareId_fkey" FOREIGN KEY ("nursingCareId") REFERENCES "NursingCare"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "MedicationAdministrationEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "MedicationAdministrationEvent_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LabAdditionalExamDecision" (
    "id" TEXT NOT NULL,
    "examRequestId" TEXT NOT NULL,
    "requestGroupId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'ROUTINE',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "LabAdditionalExamDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabAdditionalExamDecision_urgency_check" CHECK ("urgency" IN ('ROUTINE', 'URGENT', 'CRITICAL')),
    CONSTRAINT "LabAdditionalExamDecision_status_check" CHECK ("status" IN ('AUTO_APPROVED', 'PENDING_DOCTOR', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX "LabAdditionalExamDecision_examRequestId_key" ON "LabAdditionalExamDecision"("examRequestId");
CREATE INDEX "LabAdditionalExamDecision_doctorUserId_status_idx" ON "LabAdditionalExamDecision"("doctorUserId", "status");
ALTER TABLE "LabAdditionalExamDecision"
ADD CONSTRAINT "LabAdditionalExamDecision_examRequestId_fkey" FOREIGN KEY ("examRequestId") REFERENCES "ExamRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "LabAdditionalExamDecision_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "LabAdditionalExamDecision_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "LabAdditionalExamDecision_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "LabAdditionalExamDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeathCase" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "declaredById" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "cause" TEXT NOT NULL,
    "declaringDoctorName" TEXT NOT NULL,
    "declaringDoctorLicense" TEXT,
    "morgueTransferredAt" TIMESTAMP(3),
    "morgueLocation" TEXT,
    "morgueRegisterNumber" TEXT,
    "familyReleasedAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "recipientIdentity" TEXT,
    "recipientRelationship" TEXT,
    "financialClosedAt" TIMESTAMP(3),
    "financialClosedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeathCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeathCase_patientId_key" ON "DeathCase"("patientId");
CREATE UNIQUE INDEX "DeathCase_certificateNumber_key" ON "DeathCase"("certificateNumber");
CREATE INDEX "DeathCase_occurredAt_idx" ON "DeathCase"("occurredAt");
ALTER TABLE "DeathCase"
ADD CONSTRAINT "DeathCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "DeathCase_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DeathCase_financialClosedById_fkey" FOREIGN KEY ("financialClosedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "block_unapproved_additional_lab_exam"()
RETURNS TRIGGER AS $$
DECLARE decision_status TEXT;
BEGIN
  IF NEW."status" IN ('IN_PROGRESS', 'COMPLETED', 'VALIDATED') AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    SELECT "status" INTO decision_status
    FROM "LabAdditionalExamDecision"
    WHERE "examRequestId" = NEW."id";

    IF decision_status IN ('PENDING_DOCTOR', 'REJECTED') THEN
      RAISE EXCEPTION 'Examen complémentaire bloqué : validation médicale requise ou demande rejetée.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExamRequest_additional_exam_approval_guard"
BEFORE UPDATE OF "status" ON "ExamRequest"
FOR EACH ROW EXECUTE FUNCTION "block_unapproved_additional_lab_exam"();
