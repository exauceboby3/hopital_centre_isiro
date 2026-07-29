#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERREUR: DATABASE_URL est obligatoire." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/hopital-centre-isiro}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOST_TAG="$(hostname -s 2>/dev/null || echo server)"
BASE_NAME="hopital-${HOST_TAG}-${STAMP}"
TEMP_FILE="${BACKUP_DIR}/${BASE_NAME}.dump.tmp"
FINAL_FILE="${BACKUP_DIR}/${BASE_NAME}.dump"
CHECKSUM_FILE="${FINAL_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"
umask 077

cleanup() {
  rm -f "${TEMP_FILE}"
}
trap cleanup EXIT

printf 'Sauvegarde PostgreSQL vers %s\n' "${FINAL_FILE}"
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="${TEMP_FILE}"

pg_restore --list "${TEMP_FILE}" >/dev/null
mv "${TEMP_FILE}" "${FINAL_FILE}"
sha256sum "${FINAL_FILE}" >"${CHECKSUM_FILE}"

if [[ -n "${BACKUP_COPY_DIR:-}" ]]; then
  mkdir -p "${BACKUP_COPY_DIR}"
  cp --preserve=timestamps "${FINAL_FILE}" "${CHECKSUM_FILE}" "${BACKUP_COPY_DIR}/"
fi

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'hopital-*.dump' -o -name 'hopital-*.dump.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

printf 'Sauvegarde réussie: %s\n' "${FINAL_FILE}"
printf 'Checksum: %s\n' "$(cut -d' ' -f1 "${CHECKSUM_FILE}")"
