#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${BACKUP_FILE:-}" ]]; then
  echo "ERREUR: BACKUP_FILE est obligatoire." >&2
  exit 1
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "ERREUR: RESTORE_DATABASE_URL est obligatoire et doit viser une base de test isolée." >&2
  exit 1
fi
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERREUR: sauvegarde introuvable: ${BACKUP_FILE}" >&2
  exit 1
fi
if [[ "${RESTORE_DATABASE_URL}" == "${DATABASE_URL:-}" ]]; then
  echo "ERREUR: la base de restauration ne peut pas être la base de production." >&2
  exit 1
fi

CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [[ -f "${CHECKSUM_FILE}" ]]; then
  sha256sum --check "${CHECKSUM_FILE}"
else
  echo "AVERTISSEMENT: aucun fichier de checksum associé." >&2
fi

pg_restore --list "${BACKUP_FILE}" >/dev/null
pg_restore \
  --dbname="${RESTORE_DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "${BACKUP_FILE}"

psql "${RESTORE_DATABASE_URL}" --set=ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF to_regclass('public."Patient"') IS NULL THEN
    RAISE EXCEPTION 'Table Patient absente après restauration';
  END IF;
  IF to_regclass('public."User"') IS NULL THEN
    RAISE EXCEPTION 'Table User absente après restauration';
  END IF;
  IF to_regclass('public."Invoice"') IS NULL THEN
    RAISE EXCEPTION 'Table Invoice absente après restauration';
  END IF;
  IF to_regclass('public."AuditLog"') IS NULL THEN
    RAISE EXCEPTION 'Table AuditLog absente après restauration';
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM "User") AS users,
  (SELECT COUNT(*) FROM "Patient") AS patients,
  (SELECT COUNT(*) FROM "Invoice") AS invoices,
  (SELECT COUNT(*) FROM "AuditLog") AS audit_rows;
SQL

printf 'Restauration de contrôle réussie depuis %s\n' "${BACKUP_FILE}"
