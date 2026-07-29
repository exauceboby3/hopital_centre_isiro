-- Tout administrateur est également médecin directeur par défaut.
UPDATE "User"
SET "additionalRoles" = array_append("additionalRoles", 'DOCTOR'::"Role")
WHERE "role" = 'ADMIN'::"Role"
  AND NOT ('DOCTOR'::"Role" = ANY("additionalRoles"));

-- Les anciens administrateurs reçoivent un profil médical initial qu'ils peuvent compléter.
INSERT INTO "DoctorProfile" (
  "id",
  "userId",
  "lastName",
  "specialty"
)
SELECT
  md5("User"."id" || ':doctor-profile'),
  "User"."id",
  "User"."username",
  'Médecine générale'
FROM "User"
WHERE "User"."role" = 'ADMIN'::"Role"
  AND NOT EXISTS (
    SELECT 1 FROM "DoctorProfile" WHERE "DoctorProfile"."userId" = "User"."id"
  );
