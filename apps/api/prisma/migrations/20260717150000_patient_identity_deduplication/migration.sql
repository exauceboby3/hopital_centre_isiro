ALTER TABLE "Patient"
  ADD COLUMN "identityKey" TEXT;

WITH normalized AS (
  SELECT
    "id",
    lower(regexp_replace(trim(concat_ws(' ', "lastName", "postName", "firstName")), '\s+', ' ', 'g'))
      || '|'
      || COALESCE(
        to_char("dateOfBirth", 'YYYY-MM-DD'),
        NULLIF(regexp_replace(COALESCE("phone", ''), '[^0-9+]', '', 'g'), ''),
        'sans-identifiant'
      ) AS base_key,
    row_number() OVER (
      PARTITION BY
        lower(regexp_replace(trim(concat_ws(' ', "lastName", "postName", "firstName")), '\s+', ' ', 'g')),
        COALESCE(
          to_char("dateOfBirth", 'YYYY-MM-DD'),
          NULLIF(regexp_replace(COALESCE("phone", ''), '[^0-9+]', '', 'g'), ''),
          'sans-identifiant'
        )
      ORDER BY "createdAt", "id"
    ) AS duplicate_rank
  FROM "Patient"
)
UPDATE "Patient" AS patient
SET "identityKey" = CASE
  WHEN normalized.duplicate_rank = 1 THEN normalized.base_key
  ELSE normalized.base_key || '#historique#' || patient."id"
END
FROM normalized
WHERE normalized."id" = patient."id";

CREATE UNIQUE INDEX "Patient_identityKey_key" ON "Patient"("identityKey");
