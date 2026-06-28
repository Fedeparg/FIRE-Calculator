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

Valores **no secretos** (van fijos en el workflow, edítalos ahí si cambian):
`APP_URL=https://sextante.fpardo.net`, `EMAIL_FROM`, `WEB_PORT=8790`,
`COOKIE_SECURE=true`, `EMAIL_TRANSPORT=resend`.

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

---

## Operación

- **Actualizar:** push a `main` → redeploy automático. El volumen `sextante_pgdata`
  persiste; las migraciones nuevas se aplican solas.
- **NUNCA** `docker compose ... down -v` en producción: borra la base de datos.
  Tampoco cambies `JWT_SECRET` salvo que quieras desloguear a todo el mundo.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f api web`.
- **Backups:** los cubre la rama `feat/backups` (pg_dump cifrado → Google Drive).

## Nota sobre el build en el servidor

El workflow construye las imágenes en el runner (UNRAID). El build de Next puede
consumir RAM/CPU. Si resultara pesado para la caja, la alternativa es construir en
los runners de GitHub y publicar a un registro (GHCR), y que el servidor solo haga
`pull`. No hace falta para empezar; se documenta por si escala.
