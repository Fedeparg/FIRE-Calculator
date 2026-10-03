#!/bin/sh
# Restores an encrypted Sextante backup.
#   .sql.gz.gpg  ->  gpg -d  ->  gunzip  ->  psql
#
# ⚠️ DESTRUCTIVE: writes over the target database. Use it deliberately.
#
# Usage (from the host, with the stack running):
#   BACKUP_GPG_PASSPHRASE=... \
#   ./scripts/backup/restore.sh sextante-20260628-040000Z.sql.gz.gpg
#
# First, download the file from Drive:
#   rclone copy gdrive:sextante-backups/<file>.sql.gz.gpg .
#
# Variables (with defaults for the Compose stack):
#   PGHOST (127.0.0.1)  PGPORT (5432)  PGUSER (sextante)  PGDATABASE (sextante)
#   PGPASSWORD (= POSTGRES_PASSWORD)   BACKUP_GPG_PASSPHRASE (required)
set -eu
set -o pipefail 2>/dev/null || true

FILE="${1:-}"
if [ -z "${FILE}" ] || [ ! -f "${FILE}" ]; then
  echo "Usage: $0 <file.sql.gz.gpg>   (the file must exist)" >&2
  exit 2
fi
: "${BACKUP_GPG_PASSPHRASE:?set BACKUP_GPG_PASSPHRASE}"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-sextante}"
PGDATABASE="${PGDATABASE:-sextante}"

echo "Restoring ${FILE} -> ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
printf 'Are you sure? This OVERWRITES the database. Type "RESTAURAR" to confirm: '
read -r CONFIRM
[ "${CONFIRM}" = "RESTAURAR" ] || { echo "Cancelled."; exit 1; }

# The passphrase goes through a FILE (600), not argv: a process's arguments are
# visible in `ps` to any other process on the machine.
PASSFILE=$(mktemp)
chmod 600 "${PASSFILE}"
trap 'rm -f "${PASSFILE}"' EXIT INT TERM
printf '%s' "${BACKUP_GPG_PASSPHRASE}" > "${PASSFILE}"

gpg --batch --yes --decrypt --passphrase-file "${PASSFILE}" "${FILE}" \
  | gunzip \
  | psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}"

echo "Restore complete."
