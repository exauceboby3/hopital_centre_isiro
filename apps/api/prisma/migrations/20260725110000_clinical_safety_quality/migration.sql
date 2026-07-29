CREATE TABLE "TriageAssessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "assessedById" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "painScore" INTEGER,
    "consciousness" TEXT,
    "breathing" TEXT,
    "bleeding" TEXT,
    "pregnancyStatus" TEXT,
    "notes" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TriageAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TriageAssessment_level_check" CHECK ("level" IN ('RED','ORANGE','YELLOW','GREEN','BLUE')),
    CONSTRAINT "TriageAssessment_pain_check" CHECK ("painScore" IS NULL OR ("painScore" >= 0 AND "painScore" <= 10))
);
CREATE UNIQUE INDEX "TriageAssessment_appointmentId_key" ON "TriageAssessment"("appointmentId");
CREATE INDEX "TriageAssessment_patientId_assessedAt_idx" ON "TriageAssessment"("patientId", "assessedAt");
CREATE INDEX "TriageAssessment_level_assessedAt_idx" ON "TriageAssessment"("level", "assessedAt");
ALTER TABLE "TriageAssessment"
ADD CONSTRAINT "TriageAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "TriageAssessment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "TriageAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatientClinicalAlert" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "label" TEXT NOT NULL,
    "details" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    CONSTRAINT "PatientClinicalAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientClinicalAlert_type_check" CHECK ("type" IN ('ALLERGY','BLOOD_TYPE','CHRONIC_CONDITION','CHRONIC_TREATMENT','RISK','OTHER')),
    CONSTRAINT "PatientClinicalAlert_severity_check" CHECK ("severity" IN ('INFO','WARNING','CRITICAL'))
);
CREATE INDEX "PatientClinicalAlert_patientId_isActive_idx" ON "PatientClinicalAlert"("patientId", "isActive");
CREATE INDEX "PatientClinicalAlert_type_severity_idx" ON "PatientClinicalAlert"("type", "severity");
ALTER TABLE "PatientClinicalAlert"
ADD CONSTRAINT "PatientClinicalAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientClinicalAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PatientClinicalAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "verifiedById" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "nameConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "recordNumberConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "birthDateConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "braceletCode" TEXT,
    "medicationCode" TEXT,
    "specimenCode" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdentityVerification_context_check" CHECK ("context" IN ('MEDICATION','SPECIMEN','TRANSFUSION','SURGERY','RADIOLOGY','CONSULTATION','OTHER'))
);
CREATE INDEX "IdentityVerification_patientId_verifiedAt_idx" ON "IdentityVerification"("patientId", "verifiedAt");
CREATE INDEX "IdentityVerification_context_success_idx" ON "IdentityVerification"("context", "success");
ALTER TABLE "IdentityVerification"
ADD CONSTRAINT "IdentityVerification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "IdentityVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LabSpecimen" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "examRequestId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "collectedById" TEXT,
    "receivedById" TEXT,
    "specimenType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "collectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabSpecimen_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabSpecimen_status_check" CHECK ("status" IN ('ORDERED','COLLECTED','RECEIVED','REJECTED','IN_ANALYSIS','COMPLETED'))
);
CREATE UNIQUE INDEX "LabSpecimen_code_key" ON "LabSpecimen"("code");
CREATE UNIQUE INDEX "LabSpecimen_barcode_key" ON "LabSpecimen"("barcode");
CREATE UNIQUE INDEX "LabSpecimen_examRequestId_key" ON "LabSpecimen"("examRequestId");
CREATE INDEX "LabSpecimen_status_createdAt_idx" ON "LabSpecimen"("status", "createdAt");
ALTER TABLE "LabSpecimen"
ADD CONSTRAINT "LabSpecimen_examRequestId_fkey" FOREIGN KEY ("examRequestId") REFERENCES "ExamRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "LabSpecimen_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "LabSpecimen_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "LabSpecimen_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DischargeSummary" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "hospitalizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "admissionReason" TEXT NOT NULL,
    "diagnoses" TEXT NOT NULL,
    "examsPerformed" TEXT,
    "treatmentsReceived" TEXT,
    "dischargePrescription" TEXT,
    "recommendations" TEXT NOT NULL,
    "followUpInstructions" TEXT,
    "warningSigns" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DischargeSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DischargeSummary_number_key" ON "DischargeSummary"("number");
CREATE INDEX "DischargeSummary_patientId_createdAt_idx" ON "DischargeSummary"("patientId", "createdAt");
ALTER TABLE "DischargeSummary"
ADD CONSTRAINT "DischargeSummary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "DischargeSummary_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "DischargeSummary_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "DischargeSummary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BedTurnover" (
    "id" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "hospitalizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CLEANING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanedById" TEXT,
    "cleanedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "BedTurnover_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BedTurnover_status_check" CHECK ("status" IN ('PENDING_CLEANING','CLEANING','READY','MAINTENANCE'))
);
CREATE INDEX "BedTurnover_bedId_status_idx" ON "BedTurnover"("bedId", "status");
CREATE INDEX "BedTurnover_status_requestedAt_idx" ON "BedTurnover"("status", "requestedAt");
ALTER TABLE "BedTurnover"
ADD CONSTRAINT "BedTurnover_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "BedTurnover_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "BedTurnover_cleanedById_fkey" FOREIGN KEY ("cleanedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NursingHandoff" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalizationId" TEXT,
    "fromNurseId" TEXT NOT NULL,
    "toNurseId" TEXT,
    "diagnosis" TEXT,
    "currentCondition" TEXT NOT NULL,
    "treatmentsInProgress" TEXT,
    "nextDoseAt" TIMESTAMP(3),
    "pendingExams" TEXT,
    "risks" TEXT,
    "instructions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    CONSTRAINT "NursingHandoff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NursingHandoff_patientId_createdAt_idx" ON "NursingHandoff"("patientId", "createdAt");
CREATE INDEX "NursingHandoff_toNurseId_acknowledgedAt_idx" ON "NursingHandoff"("toNurseId", "acknowledgedAt");
ALTER TABLE "NursingHandoff"
ADD CONSTRAINT "NursingHandoff_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "NursingHandoff_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "NursingHandoff_fromNurseId_fkey" FOREIGN KEY ("fromNurseId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "NursingHandoff_toNurseId_fkey" FOREIGN KEY ("toNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FollowUpPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "hospitalizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "reminderChannel" TEXT NOT NULL DEFAULT 'NONE',
    "reminderStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reminderSentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FollowUpPlan_type_check" CHECK ("type" IN ('CONSULTATION','DRESSING','LABORATORY','RADIOLOGY','MEDICATION_RENEWAL','OTHER')),
    CONSTRAINT "FollowUpPlan_channel_check" CHECK ("reminderChannel" IN ('NONE','SMS','WHATSAPP')),
    CONSTRAINT "FollowUpPlan_status_check" CHECK ("reminderStatus" IN ('PENDING','SENT','FAILED','CANCELLED'))
);
CREATE INDEX "FollowUpPlan_patientId_scheduledAt_idx" ON "FollowUpPlan"("patientId", "scheduledAt");
CREATE INDEX "FollowUpPlan_reminderStatus_scheduledAt_idx" ON "FollowUpPlan"("reminderStatus", "scheduledAt");
ALTER TABLE "FollowUpPlan"
ADD CONSTRAINT "FollowUpPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUpPlan_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUpPlan_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUpPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SIGNED',
    "signedByName" TEXT NOT NULL,
    "relationship" TEXT,
    "witnessName" TEXT,
    "details" TEXT,
    "signatureHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientConsent_type_check" CHECK ("type" IN ('SURGERY','ANESTHESIA','TRANSFUSION','SENSITIVE_EXAM','MEDICAL_PHOTO','DATA_SHARING','DISCHARGE_AGAINST_MEDICAL_ADVICE','OTHER')),
    CONSTRAINT "PatientConsent_status_check" CHECK ("status" IN ('SIGNED','REVOKED'))
);
CREATE UNIQUE INDEX "PatientConsent_number_key" ON "PatientConsent"("number");
CREATE INDEX "PatientConsent_patientId_signedAt_idx" ON "PatientConsent"("patientId", "signedAt");
ALTER TABLE "PatientConsent"
ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PatientConsent_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RecordAmendment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "reason" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "RecordAmendment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecordAmendment_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED'))
);
CREATE INDEX "RecordAmendment_patientId_createdAt_idx" ON "RecordAmendment"("patientId", "createdAt");
CREATE INDEX "RecordAmendment_status_createdAt_idx" ON "RecordAmendment"("status", "createdAt");
ALTER TABLE "RecordAmendment"
ADD CONSTRAINT "RecordAmendment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "RecordAmendment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "RecordAmendment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClinicalIncident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientId" TEXT,
    "reportedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "ClinicalIncident_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalIncident_category_check" CHECK ("category" IN ('MEDICATION_ERROR','FALL','TRANSFUSION','LABORATORY','BILLING','EQUIPMENT','SECURITY','OTHER')),
    CONSTRAINT "ClinicalIncident_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    CONSTRAINT "ClinicalIncident_status_check" CHECK ("status" IN ('OPEN','IN_REVIEW','ACTION_REQUIRED','CLOSED'))
);
CREATE UNIQUE INDEX "ClinicalIncident_reference_key" ON "ClinicalIncident"("reference");
CREATE INDEX "ClinicalIncident_status_severity_idx" ON "ClinicalIncident"("status", "severity");
CREATE INDEX "ClinicalIncident_patientId_reportedAt_idx" ON "ClinicalIncident"("patientId", "reportedAt");
ALTER TABLE "ClinicalIncident"
ADD CONSTRAINT "ClinicalIncident_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "ClinicalIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "ClinicalIncident_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BiomedicalEquipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "department" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acquiredAt" TIMESTAMP(3),
    "lastMaintenanceAt" TIMESTAMP(3),
    "nextMaintenanceAt" TIMESTAMP(3),
    "assignedTechnicianId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BiomedicalEquipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BiomedicalEquipment_status_check" CHECK ("status" IN ('ACTIVE','MAINTENANCE','OUT_OF_SERVICE','RETIRED'))
);
CREATE UNIQUE INDEX "BiomedicalEquipment_code_key" ON "BiomedicalEquipment"("code");
CREATE UNIQUE INDEX "BiomedicalEquipment_serialNumber_key" ON "BiomedicalEquipment"("serialNumber");
CREATE INDEX "BiomedicalEquipment_department_status_idx" ON "BiomedicalEquipment"("department", "status");
CREATE INDEX "BiomedicalEquipment_nextMaintenanceAt_idx" ON "BiomedicalEquipment"("nextMaintenanceAt");
ALTER TABLE "BiomedicalEquipment"
ADD CONSTRAINT "BiomedicalEquipment_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EquipmentMaintenance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "technicianId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "cost" DECIMAL(12,2),
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "EquipmentMaintenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EquipmentMaintenance_type_check" CHECK ("type" IN ('PREVENTIVE','CORRECTIVE')),
    CONSTRAINT "EquipmentMaintenance_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED'))
);
CREATE INDEX "EquipmentMaintenance_equipmentId_reportedAt_idx" ON "EquipmentMaintenance"("equipmentId", "reportedAt");
CREATE INDEX "EquipmentMaintenance_status_reportedAt_idx" ON "EquipmentMaintenance"("status", "reportedAt");
ALTER TABLE "EquipmentMaintenance"
ADD CONSTRAINT "EquipmentMaintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "BiomedicalEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EquipmentMaintenance_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "EquipmentMaintenance_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LoginSecurityEvent" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginSecurityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginSecurityEvent_username_occurredAt_idx" ON "LoginSecurityEvent"("username", "occurredAt");
CREATE INDEX "LoginSecurityEvent_success_occurredAt_idx" ON "LoginSecurityEvent"("success", "occurredAt");
ALTER TABLE "LoginSecurityEvent"
ADD CONSTRAINT "LoginSecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserSecurityLock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSecurityLock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserSecurityLock_userId_key" ON "UserSecurityLock"("userId");
ALTER TABLE "UserSecurityLock"
ADD CONSTRAINT "UserSecurityLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "sizeBytes" BIGINT,
    "location" TEXT,
    "checksum" TEXT,
    "restoredTestAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BackupRun_status_check" CHECK ("status" IN ('RUNNING','SUCCESS','FAILED','RESTORED_TESTED'))
);
CREATE INDEX "BackupRun_status_startedAt_idx" ON "BackupRun"("status", "startedAt");
ALTER TABLE "BackupRun"
ADD CONSTRAINT "BackupRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OfflineSyncConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "localPayload" JSONB NOT NULL,
    "serverPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "OfflineSyncConflict_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfflineSyncConflict_status_check" CHECK ("status" IN ('OPEN','RESOLVED','DISCARDED'))
);
CREATE INDEX "OfflineSyncConflict_status_createdAt_idx" ON "OfflineSyncConflict"("status", "createdAt");
ALTER TABLE "OfflineSyncConflict"
ADD CONSTRAINT "OfflineSyncConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prepare_bed_after_discharge"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'ACTIVE' AND NEW."status" IN ('DISCHARGED','TRANSFERRED','CANCELLED') THEN
    UPDATE "Bed" SET "status" = 'MAINTENANCE' WHERE "id" = NEW."bedId";
    INSERT INTO "BedTurnover" ("id", "bedId", "hospitalizationId", "status", "requestedAt")
    VALUES (gen_random_uuid()::text, NEW."bedId", NEW."id", 'PENDING_CLEANING', CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Hospitalization_prepare_bed_turnover"
AFTER UPDATE OF "status" ON "Hospitalization"
FOR EACH ROW EXECUTE FUNCTION "prepare_bed_after_discharge"();
