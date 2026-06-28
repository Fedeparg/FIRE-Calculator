#!/bin/sh
# Entrypoint del contenedor de backups: prepara la config de rclone y la de
# entorno (cron arranca con un env vacío, así que la volcamos a un fichero que
# backup.sh sourcea), hace un backup inmediato y deja un cron diario corriendo.
set -eu

# 1) Config de rclone desde el secret base64 (se genera UNA vez con `rclone
#    config` en tu máquina y se guarda como GitHub Secret RCLONE_CONF_BASE64).
if [ -z "${RCLONE_CONF_BASE64:-}" ]; then
  echo "[backup] ERROR: falta RCLONE_CONF_BASE64 (config de rclone)" >&2
  exit 1
fi
mkdir -p /root/.config/rclone
echo "${RCLONE_CONF_BASE64}" | base64 -d > /root/.config/rclone/rclone.conf
chmod 600 /root/.config/rclone/rclone.conf

# 2) Vuelca el entorno necesario a un fichero (cron no hereda el env del contenedor).
umask 077
cat > /usr/local/bin/backup-env.sh <<EOF
export POSTGRES_HOST='${POSTGRES_HOST:-postgres}'
export POSTGRES_USER='${POSTGRES_USER:-sextante}'
export POSTGRES_DB='${POSTGRES_DB:-sextante}'
export POSTGRES_PASSWORD='${POSTGRES_PASSWORD}'
export BACKUP_GPG_PASSPHRASE='${BACKUP_GPG_PASSPHRASE}'
export RCLONE_REMOTE='${RCLONE_REMOTE:-gdrive:sextante-backups}'
export BACKUP_RETENTION_DAYS='${BACKUP_RETENTION_DAYS:-30}'
EOF

# 3) Backup inmediato al arrancar: deja una copia reciente y valida la config
#    (si rclone/gpg/pg_dump fallan, lo ves en los logs ya, no dentro de 24 h).
echo "[backup] backup inicial al arrancar…"
/usr/local/bin/backup.sh || echo "[backup] WARN: el backup inicial falló — revisa la config"

# 4) Cron diario (por defecto 04:00 Europe/Madrid).
echo "${BACKUP_CRON:-0 4 * * *} /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
echo "[backup] crond en marcha (cron: ${BACKUP_CRON:-0 4 * * *}, TZ: ${TZ:-UTC})"
exec crond -f -l 8
