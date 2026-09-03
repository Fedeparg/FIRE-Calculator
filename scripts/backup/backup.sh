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

# Verificación: un backup que no se puede restaurar no es un backup. Deshacemos la
# cadena entera (descifrar → descomprimir) y comprobamos la marca que pg_dump escribe
# al FINAL del volcado. Eso prueba de una vez la passphrase, la integridad del gzip y
# que el dump no se cortó a medias (p. ej. si Postgres murió durante el volcado).
# Se hace ANTES de subir: preferimos fallar ruidosamente a llenar Drive de basura
# que parece un backup. Si falla, el fichero local NO se borra (queda para depurar).
echo "[backup] verificando que ${FILE} es restaurable…"
if ! gpg --batch --yes --decrypt --passphrase-file "${PASSFILE}" "${TMP}" 2>/dev/null \
     | gunzip 2>/dev/null \
     | tail -c 200 \
     | grep -q 'PostgreSQL database dump complete'; then
  echo "[backup] ERROR: ${FILE} no supera la verificación (no se descifra, no descomprime" >&2
  echo "[backup]        o el volcado está incompleto). NO se sube. Fichero en ${TMP}" >&2
  trap - EXIT INT TERM
  rm -f "${PASSFILE}"
  exit 1
fi

echo "[backup] subiendo ${FILE} -> ${RCLONE_REMOTE}"
rclone copy "${TMP}" "${RCLONE_REMOTE}" --no-traverse

# Confirmación de que lo subido pesa lo mismo que lo local: una subida truncada
# (corte de red, cuota llena) puede terminar sin error y dejar un fichero a medias.
LOCAL_SIZE=$(wc -c < "${TMP}" | tr -d ' ')
REMOTE_SIZE=$(rclone size "${RCLONE_REMOTE}" --include "${FILE}" --json 2>/dev/null \
  | sed -n 's/.*"bytes":[[:space:]]*\([0-9]*\).*/\1/p')
if [ "${REMOTE_SIZE:-0}" != "${LOCAL_SIZE}" ]; then
  echo "[backup] ERROR: subida incompleta (local ${LOCAL_SIZE} B, remoto ${REMOTE_SIZE:-0} B)" >&2
  exit 1
fi
echo "[backup] subida verificada (${LOCAL_SIZE} bytes)"

rm -f "${TMP}"

# Rotación: borra los backups más antiguos que la retención.
echo "[backup] rotación: elimina > ${BACKUP_RETENTION_DAYS}d en ${RCLONE_REMOTE}"
rclone delete "${RCLONE_REMOTE}" \
  --min-age "${BACKUP_RETENTION_DAYS}d" \
  --include "sextante-*.sql.gz.gpg"

echo "[backup] $(date -u) OK"
