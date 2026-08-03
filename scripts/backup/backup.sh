#!/bin/sh
# Backup cifrado de la base de datos de Sextante.
#   pg_dump  ->  gzip  ->  gpg (AES256, simétrico)  ->  rclone (Google Drive)
#
# El cifrado se hace ANTES de salir del servidor: en Google Drive solo aterriza
# un .gpg ilegible sin la passphrase (cierra el problema de "subencargado" RGPD).
# Las variables las inyecta el entrypoint en /usr/local/bin/backup-env.sh.
set -eu
# ash (alpine) soporta pipefail: si pg_dump falla, el pipe falla (no un .gpg vacío).
set -o pipefail 2>/dev/null || true

. /usr/local/bin/backup-env.sh

TS=$(date -u +%Y%m%d-%H%M%SZ)
FILE="sextante-${TS}.sql.gz.gpg"
TMP="/tmp/${FILE}"

# La passphrase va por FICHERO (600), no por argv: los argumentos de un proceso son
# visibles en `ps` para cualquier otro proceso del contenedor/host.
PASSFILE=$(mktemp)
chmod 600 "${PASSFILE}"
trap 'rm -f "${PASSFILE}" "${TMP}"' EXIT INT TERM
printf '%s' "${BACKUP_GPG_PASSPHRASE}" > "${PASSFILE}"

echo "[backup] $(date -u) dump de ${POSTGRES_DB}@${POSTGRES_HOST}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "${PASSFILE}" -o "${TMP}"

echo "[backup] subiendo ${FILE} -> ${RCLONE_REMOTE}"
rclone copy "${TMP}" "${RCLONE_REMOTE}" --no-traverse
rm -f "${TMP}"

# Rotación: borra los backups más antiguos que la retención.
echo "[backup] rotación: elimina > ${BACKUP_RETENTION_DAYS}d en ${RCLONE_REMOTE}"
rclone delete "${RCLONE_REMOTE}" \
  --min-age "${BACKUP_RETENTION_DAYS}d" \
  --include "sextante-*.sql.gz.gpg"

echo "[backup] $(date -u) OK"
