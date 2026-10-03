#!/bin/sh
# Encrypted backup of the Sextante database.
#   pg_dump  ->  gzip  ->  gpg (AES256, symmetric)  ->  rclone (Google Drive)
#
# Encryption happens BEFORE the data leaves the server: only a .gpg that is unreadable
# without the passphrase lands in Google Drive (this closes the GDPR "sub-processor" issue).
# The variables are injected by the entrypoint in /usr/local/bin/backup-env.sh.
set -eu
# ash (alpine) supports pipefail: if pg_dump fails, the pipe fails (no empty .gpg).
set -o pipefail 2>/dev/null || true

. /usr/local/bin/backup-env.sh

TS=$(date -u +%Y%m%d-%H%M%SZ)
FILE="sextante-${TS}.sql.gz.gpg"
TMP="/tmp/${FILE}"

# The passphrase goes through a FILE (600), not argv: a process's arguments are
# visible in `ps` to any other process in the container/host.
PASSFILE=$(mktemp)
chmod 600 "${PASSFILE}"
trap 'rm -f "${PASSFILE}" "${TMP}"' EXIT INT TERM
printf '%s' "${BACKUP_GPG_PASSPHRASE}" > "${PASSFILE}"

echo "[backup] $(date -u) dumping ${POSTGRES_DB}@${POSTGRES_HOST}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "${PASSFILE}" -o "${TMP}"

# Verification: a backup that cannot be restored is not a backup. We unwind the whole
# chain (decrypt → decompress) and check the marker pg_dump writes at the END of the
# dump. That proves in one go the passphrase, the gzip integrity and that the dump was
# not cut short (e.g. if Postgres died mid-dump).
# Done BEFORE uploading: we would rather fail loudly than fill Drive with junk that
# looks like a backup. On failure the local file is NOT deleted (it stays for debugging).
echo "[backup] verifying that ${FILE} is restorable…"
if ! gpg --batch --yes --decrypt --passphrase-file "${PASSFILE}" "${TMP}" 2>/dev/null \
     | gunzip 2>/dev/null \
     | tail -c 200 \
     | grep -q 'PostgreSQL database dump complete'; then
  echo "[backup] ERROR: ${FILE} failed verification (it does not decrypt, does not decompress" >&2
  echo "[backup]        or the dump is incomplete). NOT uploading. File at ${TMP}" >&2
  trap - EXIT INT TERM
  rm -f "${PASSFILE}"
  exit 1
fi

echo "[backup] uploading ${FILE} -> ${RCLONE_REMOTE}"
rclone copy "${TMP}" "${RCLONE_REMOTE}" --no-traverse

# Confirms that the upload is the same size as the local file: a truncated upload
# (network drop, full quota) can finish without an error and leave a partial file.
LOCAL_SIZE=$(wc -c < "${TMP}" | tr -d ' ')
REMOTE_SIZE=$(rclone size "${RCLONE_REMOTE}" --include "${FILE}" --json 2>/dev/null \
  | sed -n 's/.*"bytes":[[:space:]]*\([0-9]*\).*/\1/p')
if [ "${REMOTE_SIZE:-0}" != "${LOCAL_SIZE}" ]; then
  echo "[backup] ERROR: incomplete upload (local ${LOCAL_SIZE} B, remote ${REMOTE_SIZE:-0} B)" >&2
  exit 1
fi
echo "[backup] upload verified (${LOCAL_SIZE} bytes)"

rm -f "${TMP}"

# Rotation: deletes backups older than the retention period.
echo "[backup] rotation: deleting > ${BACKUP_RETENTION_DAYS}d in ${RCLONE_REMOTE}"
rclone delete "${RCLONE_REMOTE}" \
  --min-age "${BACKUP_RETENTION_DAYS}d" \
  --include "sextante-*.sql.gz.gpg"

echo "[backup] $(date -u) OK"
