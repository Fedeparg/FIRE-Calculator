#!/bin/sh
# Entrypoint of the backup container: prepares the rclone config and the
# environment (cron starts with an empty env, so we dump it to a file that
# backup.sh sources), takes an immediate backup and leaves a daily cron running.
set -eu

# 1) rclone config from the base64 secret (generated ONCE with `rclone config` on
#    your machine and stored as the GitHub Secret RCLONE_CONF_BASE64).
if [ -z "${RCLONE_CONF_BASE64:-}" ]; then
  echo "[backup] ERROR: RCLONE_CONF_BASE64 is missing (rclone config)" >&2
  exit 1
fi
mkdir -p /root/.config/rclone
echo "${RCLONE_CONF_BASE64}" | base64 -d > /root/.config/rclone/rclone.conf
chmod 600 /root/.config/rclone/rclone.conf

# 2) Dumps the required environment to a file (cron does not inherit the container's env).
umask 077
cat > /usr/local/bin/backup-env.sh <<EOF
export POSTGRES_HOST='${POSTGRES_HOST:-postgres}'
export POSTGRES_USER='${POSTGRES_USER:-sextante}'
export POSTGRES_DB='${POSTGRES_DB:-sextante}'
export POSTGRES_PASSWORD='${POSTGRES_PASSWORD}'
export BACKUP_GPG_PASSPHRASE='${BACKUP_GPG_PASSPHRASE}'
export RCLONE_REMOTE='${RCLONE_REMOTE:-gdrive:sextante-backups}'
export BACKUP_RETENTION_DAYS='${BACKUP_RETENTION_DAYS:-7}'
EOF

# 3) Immediate backup on start: leaves a recent copy and validates the config
#    (if rclone/gpg/pg_dump fail, you see it in the logs right away, not 24 h later).
echo "[backup] initial backup on start…"
/usr/local/bin/backup.sh || echo "[backup] WARN: the initial backup failed — check the config"

# 4) Daily cron (04:00 Europe/Madrid by default).
echo "${BACKUP_CRON:-0 4 * * *} /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
echo "[backup] crond running (cron: ${BACKUP_CRON:-0 4 * * *}, TZ: ${TZ:-UTC})"
exec crond -f -l 8
