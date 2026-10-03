# Despliegue de Sextante

Despliegue continuo con **gate de calidad**: un push a `main` lanza `ci.yml`
(typecheck, lint, tests y build de los dos paquetes) y **solo si CI termina en
verde** se dispara `.github/workflows/deploy.yml`, que corre en un **runner
self-hosted** y levanta el stack con `docker-compose.prod.yml`. Un proxy inverso
delante (nginx, Nginx Proxy Manager…) termina el TLS y proxea al servicio `web`.

El despliegue hace checkout del **commit exacto que validó CI**
(`workflow_run.head_sha`), no del tip de la rama: si entran commits nuevos
mientras CI corre, se despliega lo que se validó y no otra cosa.

```
push a main ─▶ ci (runners de GitHub) ─▶ ¿verde? ─▶ deploy ─▶ runner self-hosted (label: sextante)
                                   └─ docker compose -f docker-compose.prod.yml up -d --build
                                        ├─ postgres (volumen sextante_pgdata)
                                        ├─ migrate (one-shot)
                                        ├─ api  (NestJS, solo red interna)
                                        ├─ web  (Next, puerto WEB_PORT) ◀─ proxy inverso (TLS)
                                        ├─ analytics-db (volumen sextante_analytics_pgdata)
                                        ├─ analytics (Umami; panel en ANALYTICS_PORT, solo red local)
                                        └─ backup (pg_dump → gpg → rclone, cron diario; ver §6)
```

---

> ## ⚠️ Antes de nada: runner self-hosted y repositorios públicos
>
> **Un runner self-hosted no debe usarse en un repositorio público** sin
> protecciones adicionales. En un evento `pull_request`, GitHub ejecuta los
> ficheros de workflow **tal y como vienen en la rama del PR**, no los de `main`.
> Cualquiera puede abrir un PR desde un fork que incluya un workflow nuevo con
> `runs-on: [self-hosted, sextante]` y conseguir **ejecución de código en tu
> máquina**. Las etiquetas del runner son enrutado, no autorización.
>
> Como este runner monta `/var/run/docker.sock`, esa ejecución es equivalente a
> root en el host.
>
> Si el repositorio es público, elige una de las dos vías:
>
> 1. **Recomendada — eliminar la clase de problema.** Construir en los runners de
>    GitHub, publicar la imagen a un registro (GHCR) y que el servidor solo haga
>    `pull`. Así **no hace falta ningún runner self-hosted** (ver
>    "Alternativa: build en GitHub + pull" al final).
> 2. **Si mantienes el runner**, en este orden:
>    1. Settings → Actions → General → *Fork pull request workflows from outside
>       collaborators* → **"Require approval for all external collaborators"**
>       (el valor por defecto, *first-time contributors*, deja de pedir
>       aprobación en cuanto alguien tiene una contribución aceptada).
>    2. Registra el runner en modo **efímero** (`EPHEMERAL=1`).
>    3. Mueve los secrets a un **Environment** `production` con *required
>       reviewers*, y añade `environment: production` al job de deploy.
>    4. Da al PAT del runner el **mínimo** alcance que permita registrarlo.

---

## 1. Runner dedicado (label `sextante`)

El workflow usa `runs-on: [self-hosted, sextante]`. La etiqueta propia evita que
el job caiga en otro runner self-hosted que ya tengas registrado para otros
proyectos. Ejemplo de servicio:

```yaml
services:
  github-runner-sextante:
    image: myoung34/github-runner:latest
    container_name: github-runner-sextante
    restart: unless-stopped
    environment:
      - TZ=Europe/Madrid
      - RUNNER_NAME=sextante-runner
      - REPO_URL=https://github.com/<usuario>/<repo>
      - ACCESS_TOKEN=<PAT con acceso al repo>     # ver notas
      - RUNNER_SCOPE=repo
      - EPHEMERAL=1                               # recomendado (ver aviso arriba)
      - LABELS=sextante
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # ⚠️ root-equivalente en el host
      - /ruta/al/estado/runner-sextante:/tmp/github-runner
```

Notas:
- **PAT:** los fine-grained PAT son por-repo; necesita permiso *Administration:
  read/write* para registrar runners. Usa uno dedicado a este repositorio.
- **`docker compose` en el runner:** el workflow usa Compose v2. La imagen
  `myoung34/github-runner` trae el cliente Docker; si `docker compose` no
  estuviera disponible, instala el plugin compose en el runner.
- El runner registra automáticamente el label `self-hosted` además de `sextante`.

## 2. GitHub Secrets

En el repo: **Settings → Secrets and variables → Actions → New repository secret**
(o, mejor, en un *Environment* `production`). El workflow los vuelca a un `.env`
efímero con permisos 600 y lo borra al terminar.

| Secret | Qué es | Cómo generarlo |
|---|---|---|
| `POSTGRES_PASSWORD` | Contraseña de Postgres | `openssl rand -base64 24` |
| `JWT_SECRET` | Firma de la sesión JWT | `openssl rand -base64 48` |
| `RESEND_API_KEY` | API key de Resend (envío del magic link) | Dashboard de Resend |
| `OPENFIGI_API_KEY` | Resolución ISIN/ticker → símbolo | Cuenta OpenFIGI |
| `REVALIDATE_TOKEN` | Revalidación on-demand de la wiki | `openssl rand -base64 32` |
| `BACKUP_GPG_PASSPHRASE` | Cifra los backups (AES256) antes de subirlos | `openssl rand -base64 32` |
| `RCLONE_CONF_BASE64` | Config de rclone (acceso al Drive destino), en base64 | Ver §6 |
| `STRIPE_SECRET_KEY` | Donaciones; la consume el `api`. Vacía/ausente = donaciones desactivadas | Dashboard de Stripe → Developers → API keys |
| `ANALYTICS_DB_PASSWORD` | Contraseña del Postgres de la analítica (Umami) | `openssl rand -base64 24` |
| `ANALYTICS_APP_SECRET` | Firma las sesiones del panel de Umami y los IDs de visita | `openssl rand -base64 48` |

Valores **no secretos** (van fijos en el workflow; edítalos ahí si cambian):
`APP_URL`, `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, `WEB_PORT`, `COOKIE_SECURE=true`,
`EMAIL_TRANSPORT=resend`, `RCLONE_REMOTE`.

**Variables** (no secretas; **Settings → Secrets and variables → Actions → Variables**):
`NEXT_PUBLIC_DONATIONS_ENABLED=1` enciende el botón de donación (se hornea en el
build del `web`; déjala vacía para ocultarlo). Debe ir junto con el secret
`STRIPE_SECRET_KEY`. `NEXT_PUBLIC_ANALYTICS_WEBSITE_ID` es el ID del sitio en Umami
(ver §7); vacía, no se carga el tracker.

> ⚠️ Guarda `BACKUP_GPG_PASSPHRASE` también **fuera** del servidor (gestor de
> contraseñas). Sin ella los backups son irrecuperables — es la pieza que los
> hace ilegibles en el destino, pero también para ti si la pierdes.

> `JWT_SECRET` debe ser **fijo y estable**: si lo cambias, invalidas todas las
> sesiones. Defínelo una vez.

> Con `NODE_ENV=production` la API **se niega a arrancar** si `JWT_SECRET` es el de
> desarrollo o tiene menos de 32 caracteres, si `COOKIE_SECURE` no es `true` o si
> `APP_URL` no empieza por `https://` (`apps/api/src/config/env.ts`).

## 3. Email (Resend)

El login es passwordless: la API envía un magic link por email. `EMAIL_TRANSPORT`
elige el transporte: `dev` (por defecto) solo escribe el enlace en el log;
`resend` envía de verdad vía [Resend](https://resend.com) y es lo que usa
producción (el workflow ya fija `EMAIL_TRANSPORT=resend` y `EMAIL_FROM`; la key es
el secret `RESEND_API_KEY`). Con `resend`, si falta `RESEND_API_KEY` o `EMAIL_FROM`
la API **falla al arrancar** en vez de enviar a ningún sitio.

`EMAIL_FROM` no tiene valor por defecto: depende del dominio verificado en tu
cuenta de Resend. Conviene un **subdominio de envío dedicado** (`send.<tu-dominio>`)
para aislar la reputación del dominio raíz.

Verificar el dominio:

1. En Resend, **Domains → Add Domain** con `send.<tu-dominio>`.
2. Resend muestra los **registros DNS concretos**; cópialos tal cual (los valores,
   en especial la clave DKIM, los genera Resend y varían por dominio y región) en
   la zona DNS de tu dominio.
3. Espera a que el dominio figure como **Verified** (de minutos a unas horas).

| Tipo | Host (ejemplo) | Para qué sirve |
|---|---|---|
| **MX** | `send.<tu-dominio>` | Return-Path / rebotes del subdominio de envío. Necesario para verificar. |
| **TXT (SPF)** | `send.<tu-dominio>` | Autoriza a los servidores de Resend a enviar en nombre del dominio. |
| **TXT (DKIM)** | `resend._domainkey.send.<tu-dominio>` (o el que indique Resend) | Firma que prueba que el correo no se ha manipulado. |
| **TXT (DMARC)** _(recomendado)_ | `_dmarc.send.<tu-dominio>` | Política para el correo que falle SPF/DKIM. Empieza laxo: `v=DMARC1; p=none; rua=mailto:tu@correo`. |

Comprueba el flujo completo pidiendo un magic link a tu propia dirección: debe
llegar desde `no-reply@send.<tu-dominio>` con el botón **Entrar en Sextante**. El
enlace usa `APP_URL`, así que solo funciona cuando el dominio público (§5) resuelve.

## 4. Primer despliegue

1. Crea el runner (paso 1) y los secrets (paso 2).
2. Haz merge a `main`. Primero corre `ci`; al pasar, arranca `deploy`, que
   construye las imágenes **en el servidor** y levanta el stack. El servicio
   `migrate` aplica las migraciones antes de la API.
3. Comprueba: `docker compose -f docker-compose.prod.yml ps` y
   `curl -fsS http://127.0.0.1:${WEB_PORT}/` en el host.

## 5. Proxy inverso + TLS (último paso)

1. Apunta el DNS de tu dominio a la IP del servidor.
2. Adapta `docs/nginx/sextante.conf` a tu proxy.
3. Emite el certificado, p. ej. `certbot --nginx -d <tu-dominio>` (Let's Encrypt).

> **Nota sobre el binding del puerto.** `docker-compose.prod.yml` publica
> `${WEB_PORT}:3000` **sin prefijo de interfaz**, es decir en `0.0.0.0`, no solo en
> loopback. Es deliberado: un proxy inverso que corre **en un contenedor** no
> alcanza el loopback del host. Si tu proxy corre en el host, o lo conectas a la
> red `sextante` de Compose y proxeas a `http://web:3000`, puedes (y deberías)
> cambiarlo a `127.0.0.1:${WEB_PORT}:3000`.

## 6. Backups cifrados

El servicio `backup` (ver `docker-compose.prod.yml` + `scripts/backup/`) hace
`pg_dump → gzip → gpg (AES256) → rclone` al destino configurado: un backup **al
arrancar** y luego **uno diario** (04:00 Europe/Madrid por defecto), con rotación
(borra los > 7 días, configurable con `BACKUP_RETENTION_DAYS`). **El cifrado
ocurre en el servidor**, así que en el destino solo aterriza un `.gpg` ilegible
sin `BACKUP_GPG_PASSPHRASE` (esto es lo que cierra el problema de "subencargado"
del RGPD: el proveedor de almacenamiento nunca ve datos personales en claro).

### Conectar el destino (rclone) — se hace UNA vez

`rclone` necesita un token OAuth del destino. Lo generas en un equipo con
navegador y lo subes como secret. Ejemplo con Google Drive:

1. **Instala rclone**: https://rclone.org/install/ (macOS: `brew install rclone`).
2. **Configura el remote** con el mismo nombre que uses en `RCLONE_REMOTE`:
   ```sh
   rclone config
   # n) New remote
   # name> gdrive
   # Storage> drive            (Google Drive)
   # client_id>                (vacío; o usa uno propio, ver nota)
   # client_secret>            (vacío)
   # scope> 3                  (solo ficheros creados por rclone) o 1 (acceso completo)
   # Edit advanced config> n
   # Use auto config> y        -> abre el navegador y autoriza
   # Configure as Shared Drive> n
   # y) Yes this is OK
   ```
3. **Crea la carpeta destino** (debe casar con `RCLONE_REMOTE`):
   ```sh
   rclone mkdir gdrive:sextante-backups
   rclone lsd gdrive:
   ```
4. **Exporta la config a base64** y úsala como el secret `RCLONE_CONF_BASE64`:
   ```sh
   base64 -i "$(rclone config file | tail -1)" | tr -d '\n' | pbcopy   # macOS
   # Linux: base64 -w0 "$(rclone config file | tail -1)"
   ```
5. Crea también `BACKUP_GPG_PASSPHRASE` (`openssl rand -base64 32`) y guárdala en
   tu gestor de contraseñas (sin ella no se puede restaurar).

> **Nota (client_id propio):** con el `client_id` por defecto de rclone, Google
> aplica límites de cuota compartidos. Para backups diarios es suficiente; si
> quieres robustez, crea un OAuth client propio:
> https://rclone.org/drive/#making-your-own-client-id.

### Restaurar un backup

```sh
# 1) Descarga el .gpg desde el destino
rclone copy gdrive:sextante-backups/sextante-AAAAMMDD-HHMMSSZ.sql.gz.gpg .

# 2) Restaura (DESTRUCTIVO; pide confirmación escribiendo "RESTAURAR").
#    Pasa las credenciales por entorno, NO en la línea de comandos, para que no
#    queden en el historial del shell ni sean visibles en `ps`.
read -rs BACKUP_GPG_PASSPHRASE; export BACKUP_GPG_PASSPHRASE
read -rs PGPASSWORD; export PGPASSWORD
./scripts/backup/restore.sh sextante-AAAAMMDD-HHMMSSZ.sql.gz.gpg
```

> **Prueba la restauración** de vez en cuando (idealmente contra una BD de
> prueba). Un backup que nunca se ha restaurado no es un backup de fiar.

---

## 7. Analítica (Umami)

Analítica propia y sin cookies. Umami corre en su contenedor con **su propio
Postgres** (no se mezcla con los datos de usuarios ni entra en los backups de §6:
son métricas agregadas y perderlas no compromete nada). Desde el origen público
solo existen `/stats/script.js` y `/stats/api/send`, que el `web` reenvía a
`http://analytics:3000` por la red interna; el CSP sigue siendo `'self'`.

**El panel NO pasa por el proxy público.** Se publica en `ANALYTICS_PORT` (8791 por
defecto) del host: entra por la red local o Tailscale, `http://<ip-del-nas>:8791`.
No añadas ese puerto al proxy inverso.

Puesta en marcha (una vez):

1. Crea los secrets `ANALYTICS_DB_PASSWORD` y `ANALYTICS_APP_SECRET` (§2) y añádelos
   al `env:` y al heredoc del paso "Materializar el .env" de `deploy.yml`, junto con
   la variable `NEXT_PUBLIC_ANALYTICS_WEBSITE_ID`. Sin los dos secrets, `docker
   compose` se niega a arrancar (producción se queda en la versión anterior).
2. Despliega. Entra al panel con `admin` / `umami` y **cambia la contraseña en el
   acto**.
3. En el panel, *Settings → Websites → Add website* con el dominio público. Copia
   el **Website ID** (un UUID) a la variable `NEXT_PUBLIC_ANALYTICS_WEBSITE_ID`.
4. Redespliega (se hornea en el build del `web`). Comprueba en el navegador que
   `/stats/script.js` responde 200 y que la visita aparece en *Realtime*.

Privacidad, ya configurada: el tracker no envía la query string ni el hash (los
cálculos compartibles llevan ahí sus valores), respeta Do Not Track y solo mide en
el dominio canónico; Umami no guarda la IP y el ID de visita cambia cada día
(`SALT_ROTATION=day`). Los eventos que se miden están en
`src/shared/analytics/track.ts`; si añades uno, recógelo también en la política
de privacidad.

## Operación

- **Actualizar:** push a `main` → CI y, si pasa, redeploy automático. El volumen
  `sextante_pgdata` persiste; las migraciones nuevas se aplican solas.
- **Desplegar a mano:** pestaña *Actions* → workflow `deploy` → *Run workflow*.
  Es la escotilla para redesplegar sin tocar código, o si el gate se atasca.
- **CI en rojo = no hay despliegue.** Producción se queda en la versión anterior;
  arregla el fallo y vuelve a hacer push. No hay forma de saltarse el gate salvo
  el disparo manual, que es deliberadamente explícito.
- **Migraciones aditivas (expand/contract).** `migrate` corre antes de recrear la API,
  así que durante unos segundos la API **anterior** sirve con el esquema **nuevo**, y
  un rollback a la imagen anterior también la deja sobre ese esquema. Por eso cada
  migración debe ser compatible con el código del despliegue anterior:
  - **Expand** (en el mismo despliegue que el código que lo usa): crear tablas, columnas
    con `DEFAULT` o anulables, índices, `CHECK … NOT VALID`.
  - **Contract** (en un despliegue **posterior**, cuando ya ningún código lo usa):
    borrar o renombrar columnas y tablas, pasar a `NOT NULL`, `VALIDATE CONSTRAINT`.
  - Un renombrado es siempre expand (columna nueva + copia) y, más adelante, contract.
  - Nunca edites una migración ya aplicada en producción: se añade otra.
- **NUNCA** `docker compose ... down -v` en producción: borra la base de datos.
  Tampoco cambies `JWT_SECRET` salvo que quieras desloguear a todo el mundo.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f api web analytics`.
- **Backups:** ver §6.

## Alternativa: build en GitHub + pull (recomendada si el repo es público)

El workflow actual construye las imágenes en el runner. Además de la cuestión de
seguridad del aviso inicial, el build de Next consume RAM/CPU del servidor. La
alternativa es construir en los runners de GitHub, publicar a GHCR y que el
servidor solo haga `pull`:

```yaml
jobs:
  build-push:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@<sha>
      - uses: docker/login-action@<sha>
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@<sha>
        with:
          context: .
          file: Dockerfile.web
          push: true
          tags: ghcr.io/<usuario>/sextante-web:latest
```

En el servidor, un cron (o Watchtower) hace
`docker compose -f docker-compose.prod.yml pull && up -d`, con el `.env` escrito
**una vez a mano** (permisos 600) en lugar de generado por el workflow. Con esto
**no hace falta runner self-hosted**. Publica los paquetes de GHCR como
**privados**: la etapa de build de `Dockerfile.web` ve todo el repositorio.
