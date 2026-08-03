#!/bin/sh
# Restauración de un backup cifrado de Sextante.
#   .sql.gz.gpg  ->  gpg -d  ->  gunzip  ->  psql
#
# ⚠️ DESTRUCTIVO: escribe sobre la base de datos destino. Úsalo a conciencia.
#
# Uso (desde el host, con el stack levantado):
#   BACKUP_GPG_PASSPHRASE=... \
#   ./scripts/backup/restore.sh sextante-20260628-040000Z.sql.gz.gpg
#
# Antes, descarga el fichero desde Drive:
#   rclone copy gdrive:sextante-backups/<fichero>.sql.gz.gpg .
#
# Variables (con defaults para el stack de Compose):
#   PGHOST (127.0.0.1)  PGPORT (5432)  PGUSER (sextante)  PGDATABASE (sextante)
#   PGPASSWORD (= POSTGRES_PASSWORD)   BACKUP_GPG_PASSPHRASE (obligatoria)
set -eu
set -o pipefail 2>/dev/null || true

FILE="${1:-}"
if [ -z "${FILE}" ] || [ ! -f "${FILE}" ]; then
  echo "Uso: $0 <fichero.sql.gz.gpg>   (el fichero debe existir)" >&2
  exit 2
fi
: "${BACKUP_GPG_PASSPHRASE:?define BACKUP_GPG_PASSPHRASE}"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-sextante}"
PGDATABASE="${PGDATABASE:-sextante}"

echo "Restaurando ${FILE} -> ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
printf '¿Seguro? Esto SOBREESCRIBE la base de datos. Escribe "RESTAURAR": '
read -r CONFIRM
[ "${CONFIRM}" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

# La passphrase va por FICHERO (600), no por argv: los argumentos de un proceso son
# visibles en `ps` para cualquier otro proceso de la máquina.
PASSFILE=$(mktemp)
chmod 600 "${PASSFILE}"
trap 'rm -f "${PASSFILE}"' EXIT INT TERM
printf '%s' "${BACKUP_GPG_PASSPHRASE}" > "${PASSFILE}"

gpg --batch --yes --decrypt --passphrase-file "${PASSFILE}" "${FILE}" \
  | gunzip \
  | psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}"

echo "Restauración completada."
