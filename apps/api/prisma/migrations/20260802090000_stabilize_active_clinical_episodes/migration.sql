-- Stabilisation des épisodes actifs. Cette migration ne supprime aucune donnée.
-- Elle s'arrête avec un message explicite si des doublons existent déjà afin qu'ils soient corrigés manuellement.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Hospitalization"
    WHERE "status" = 'ACTIVE'
    GROUP BY "patientId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration bloquée : un patient possède plusieurs hospitalisations actives.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Hospitalization"
    WHERE "status" = 'ACTIVE'
    GROUP BY "bedId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration bloquée : un lit possède plusieurs hospitalisations actives.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Consultation"
    WHERE "status" IN ('WAITING','IN_PROGRESS')
    GROUP BY "patientId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration bloquée : un patient possède plusieurs consultations actives.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Appointment"
    WHERE "status" IN ('SCHEDULED','CHECKED_IN')
      AND "journeyStage" NOT IN ('COMPLETED','CANCELLED')
    GROUP BY "patientId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration bloquée : un patient possède plusieurs parcours de rendez-vous actifs.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Hospitalization_one_active_per_patient"
ON "Hospitalization"("patientId") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "Hospitalization_one_active_per_bed"
ON "Hospitalization"("bedId") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "Consultation_one_active_per_patient"
ON "Consultation"("patientId") WHERE "status" IN ('WAITING','IN_PROGRESS');

CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_one_active_episode_per_patient"
ON "Appointment"("patientId")
WHERE "status" IN ('SCHEDULED','CHECKED_IN')
  AND "journeyStage" NOT IN ('COMPLETED','CANCELLED');
