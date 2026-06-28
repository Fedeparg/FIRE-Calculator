# Despliegue de Sextante (UNRAID + GitHub Actions)

Despliegue continuo: cada **push a `main`** dispara `.github/workflows/deploy.yml`,
que corre en **tu runner self-hosted de UNRAID** y levanta el stack con
`docker-compose.prod.yml`. nginx (en el host) termina el TLS y proxea a `web`.

```
push a main ─▶ GitHub Actions ─▶ runner UNRAID (label: sextante)
                                   └─ docker compose -f docker-compose.prod.yml up -d --build
                                        ├─ postgres (volumen sextante_pgdata)
                                        ├─ migrate (one-shot)
                                        ├─ api  (NestJS, interno)
                                        └─ web  (Next, 127.0.0.1:8790) ◀─ nginx (TLS) ◀─ sextante.fpardo.net
```

> ⚠️ El despliegue solo arranca cuando hagas merge a `main`. Hasta entonces, todo
> el trabajo vive en ramas de feature. El subdominio en nginx es el último paso.

---

## 1. Runner dedicado (label `sextante`)

Ya tienes un runner para `fpardo-web` con label `self-hosted`. Crea **otro**
runner para este repo con un label propio, **`sextante`**, para que el workflow
no se ejecute en el runner equivocado. Añádelo a tu stack de runners:

```yaml
services:
  github-runner-sextante:
    image: myoung34/github-runner:latest
    container_name: github-runner-sextante
    restart: unless-stopped
    environment:
      - TZ=Europe/Madrid
      - RUNNER_NAME=unraid-sextante
      - REPO_URL=https://github.com/Fedeparg/FIRE-Calculator   # <-- este repo
      - ACCESS_TOKEN=<PAT con acceso a FIRE-Calculator>        # <-- ver nota
      - RUNNER_SCOPE=repo
      - LABELS=sextante                                        # <-- label propio
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /mnt/user/web/runner-sextante:/tmp/github-runner       # ruta propia
```

Notas:
- **PAT:** los fine-grained PAT son por-repo. El que usas en `fpardo-web` casi
  seguro **no** cubre `FIRE-Calculator`. Genera/edita uno con acceso a este repo
  (permiso *Administration: read/write* para registrar runners).
- **`docker compose` en el runner:** el workflow usa `docker compose` (v2). La
  imagen `myoung34/github-runner` trae el cliente Docker; si `docker compose` no
  estuviera disponible, instala el plugin compose en el runner.
- El runner registra automáticamente el label `self-hosted` además de `sextante`,
  por eso el workflow usa `runs-on: [self-hosted, sextante]`.

## 2. GitHub Secrets

En el repo: **Settings → Secrets and variables → Actions → New repository secret**.
Crea estos (el workflow los vuelca a un `.env` efímero, permisos 600, y lo borra
al terminar):

| Secret | Qué es | Cómo generarlo |
|---|---|---|
| `POSTGRES_PASSWORD` | Contraseña de Postgres | `openssl rand -base64 24` |
| `JWT_SECRET` | Firma de la sesión JWT | `openssl rand -base64 48` |
| `RESEND_API_KEY` | API key de Resend (envío del magic link) | Dashboard de Resend |
| `OPENFIGI_API_KEY` | Resolución ISIN/ticker → símbolo | Cuenta OpenFIGI |
| `REVALIDATE_TOKEN` | Revalidación on-demand de la wiki | `openssl rand -base64 32` |
| `BACKUP_GPG_PASSPHRASE` | Cifra los backups (AES256) antes de subirlos | `openssl rand -base64 32` |
| `RCLONE_CONF_BASE64` | Config de rclone (acceso a tu Google Drive), en base64 | Ver §6 |

Valores **no secretos** (van fijos en el workflow, edítalos ahí si cambian):
`APP_URL=https://sextante.fpardo.net`, `EMAIL_FROM`, `WEB_PORT=8790`,
`COOKIE_SECURE=true`, `EMAIL_TRANSPORT=resend`, `RCLONE_REMOTE=gdrive:sextante-backups`.

> ⚠️ Guarda `BACKUP_GPG_PASSPHRASE` también **fuera** del servidor (gestor de
> contraseñas). Sin ella, los backups son irrecuperables — es la pieza que los
> hace ilegibles en Drive, pero también para ti si la pierdes.

> `JWT_SECRET` debe ser **fijo y estable**: si lo cambias, invalidas todas las
> sesiones (todos deben volver a entrar). Defínelo una vez.

## 3. Email (Resend)

Verifica el dominio de envío y pon los registros DNS (SPF/DKIM/DMARC + MX) según
**`apps/api/README.md` → sección "Email (Resend)"**. El test e2e real del magic
link solo funcionará cuando el subdominio (paso 5) resuelva, porque el enlace usa
`APP_URL=https://sextante.fpardo.net`.

## 4. Primer despliegue

1. Crea el runner (paso 1) y los secrets (paso 2).
2. Haz merge a `main`. El workflow construye las imágenes **en el servidor** y
   levanta el stack. El servicio `migrate` aplica las migraciones antes de la API.
3. Comprueba: `docker compose -f docker-compose.prod.yml ps` y
   `curl -fsS http://127.0.0.1:8790/` en el host.

## 5. nginx + TLS (último paso)

1. Apunta el DNS `sextante.fpardo.net` → IP del servidor.
2. Adapta `docs/nginx/sextante.fpardo.net.conf` a tu nginx.
3. `certbot --nginx -d sextante.fpardo.net` para el certificado (Let's Encrypt).

## 6. Backups cifrados a Google Drive

El servicio `backup` (ver `docker-compose.prod.yml` + `scripts/backup/`) hace
`pg_dump → gzip → gpg (AES256) → rclone` a tu Google Drive: un backup **al
arrancar** y luego **uno diario** (04:00 Europe/Madrid por defecto), con rotación
(borra los > 7 días, configurable con `BACKUP_RETENTION_DAYS`). **El cifrado ocurre
en el servidor**, así que en Drive solo
aterriza un `.gpg` ilegible sin `BACKUP_GPG_PASSPHRASE`.

### Conectar tu Google Drive (rclone) — se hace UNA vez

`rclone` necesita un token OAuth de tu Drive. Lo generas en tu ordenador (donde
tengas navegador) y lo subes como secret. Pasos:

1. **Instala rclone** en tu equipo: https://rclone.org/install/
   (macOS: `brew install rclone`).
2. **Configura el remote** llamado exactamente `gdrive`:
   ```sh
   rclone config
   # n) New remote
   # name> gdrive
   # Storage> drive            (Google Drive)
   # client_id>                (déjalo vacío; o usa uno propio, ver nota)
   # client_secret>            (vacío)
   # scope> 1                  (acceso completo) o 3 (solo a ficheros creados por rclone)
   # Edit advanced config> n
   # Use auto config> y        -> abre el navegador, autoriza con tu cuenta Google
   # Configure as Shared Drive> n
   # y) Yes this is OK
   ```
3. **Crea la carpeta destino** en tu Drive (el nombre debe casar con
   `RCLONE_REMOTE=gdrive:sextante-backups`):
   ```sh
   rclone mkdir gdrive:sextante-backups
   rclone lsd gdrive:                 # comprueba que aparece
   ```
4. **Exporta la config a base64** y úsala como el secret `RCLONE_CONF_BASE64`:
   ```sh
   base64 -i "$(rclone config file | tail -1)" | tr -d '\n' | pbcopy   # macOS: al portapapeles
   # Linux: base64 -w0 "$(rclone config file | tail -1)"
   ```
   Pega el resultado en GitHub → Settings → Secrets → `RCLONE_CONF_BASE64`.
5. Crea también `BACKUP_GPG_PASSPHRASE` (`openssl rand -base64 32`) y guárdala en
   tu gestor de contraseñas (sin ella no se puede restaurar).

> **Nota (client_id propio):** con el `client_id` por defecto de rclone, Google
> aplica límites de cuota compartidos (puede dar errores esporádicos). Para una
> herramienta personal de backups diarios es suficiente. Si quieres robustez,
> crea un OAuth client en Google Cloud Console (Drive API) y úsalo en el paso 2;
> rclone lo documenta en https://rclone.org/drive/#making-your-own-client-id.

### Restaurar un backup

```sh
# 1) Descarga el .gpg desde Drive
rclone copy gdrive:sextante-backups/sextante-AAAAMMDD-HHMMSSZ.sql.gz.gpg .
# 2) Restaura (DESTRUCTIVO; pide confirmación escribiendo "RESTAURAR")
BACKUP_GPG_PASSPHRASE='...' PGPASSWORD='<POSTGRES_PASSWORD>' \
  ./scripts/backup/restore.sh sextante-AAAAMMDD-HHMMSSZ.sql.gz.gpg
```

> **Prueba la restauración** de vez en cuando (idealmente contra una BD de
> prueba). Un backup que nunca se ha restaurado no es un backup de fiar.

---

## Operación

- **Actualizar:** push a `main` → redeploy automático. El volumen `sextante_pgdata`
  persiste; las migraciones nuevas se aplican solas.
- **NUNCA** `docker compose ... down -v` en producción: borra la base de datos.
  Tampoco cambies `JWT_SECRET` salvo que quieras desloguear a todo el mundo.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f api web`.
- **Backups:** ver §6.

## Nota sobre el build en el servidor

El workflow construye las imágenes en el runner (UNRAID). El build de Next puede
consumir RAM/CPU. Si resultara pesado para la caja, la alternativa es construir en
los runners de GitHub y publicar a un registro (GHCR), y que el servidor solo haga
`pull`. No hace falta para empezar; se documenta por si escala.
