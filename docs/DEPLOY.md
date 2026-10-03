# Deploying Sextante

Continuous deployment with a **quality gate**: a push to `main` runs `ci.yml`
(typecheck, lint, tests and build of both packages) and **only if CI ends
green** does it trigger `.github/workflows/deploy.yml`, which runs on a
**self-hosted runner** and brings up the stack with `docker-compose.prod.yml`. A
reverse proxy in front (nginx, Nginx Proxy Manager…) terminates TLS and proxies
to the `web` service.

The deployment checks out the **exact commit CI validated**
(`workflow_run.head_sha`), not the branch tip: if new commits land while CI is
running, what was validated gets deployed and nothing else.

```
push to main ─▶ ci (GitHub runners) ─▶ green? ─▶ deploy ─▶ self-hosted runner (label: sextante)
                                   └─ docker compose -f docker-compose.prod.yml up -d --build
                                        ├─ postgres (volume sextante_pgdata)
                                        ├─ migrate (one-shot)
                                        ├─ api  (NestJS, internal network only)
                                        ├─ web  (Next, port WEB_PORT) ◀─ reverse proxy (TLS)
                                        ├─ analytics-db (volume sextante_analytics_pgdata)
                                        ├─ analytics (Umami; dashboard on ANALYTICS_PORT, local network only)
                                        └─ backup (pg_dump → gpg → rclone, daily cron; see §6)
```

---

> ## ⚠️ First of all: self-hosted runners and public repositories
>
> **A self-hosted runner must not be used on a public repository** without
> additional safeguards. On a `pull_request` event, GitHub runs the workflow
> files **as they are on the PR branch**, not the ones on `main`. Anyone can
> open a PR from a fork that includes a new workflow with
> `runs-on: [self-hosted, sextante]` and get **code execution on your
> machine**. Runner labels are routing, not authorisation.
>
> Since this runner mounts `/var/run/docker.sock`, that execution is equivalent
> to root on the host.
>
> If the repository is public, pick one of two routes:
>
> 1. **Recommended — remove the whole class of problem.** Build on GitHub's
>    runners, publish the image to a registry (GHCR) and have the server only
>    `pull`. That way **no self-hosted runner is needed** (see
>    "Alternative: build on GitHub + pull" at the end).
> 2. **If you keep the runner**, in this order:
>    1. Settings → Actions → General → *Fork pull request workflows from outside
>       collaborators* → **"Require approval for all external collaborators"**
>       (the default, *first-time contributors*, stops asking for approval as
>       soon as someone has had a contribution accepted).
>    2. Register the runner in **ephemeral** mode (`EPHEMERAL=1`).
>    3. Move the secrets to a `production` **Environment** with *required
>       reviewers*, and add `environment: production` to the deploy job.
>    4. Give the runner's PAT the **minimum** scope that lets it register.

---

## 1. Dedicated runner (label `sextante`)

The workflow uses `runs-on: [self-hosted, sextante]`. The dedicated label keeps
the job from landing on another self-hosted runner you may already have
registered for other projects. Example service:

```yaml
services:
  github-runner-sextante:
    image: myoung34/github-runner:latest
    container_name: github-runner-sextante
    restart: unless-stopped
    environment:
      - TZ=Europe/Madrid
      - RUNNER_NAME=sextante-runner
      - REPO_URL=https://github.com/<user>/<repo>
      - ACCESS_TOKEN=<PAT with access to the repo>  # see notes
      - RUNNER_SCOPE=repo
      - EPHEMERAL=1                               # recommended (see warning above)
      - LABELS=sextante
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # ⚠️ root-equivalent on the host
      - /path/to/state/runner-sextante:/tmp/github-runner
```

Notes:
- **PAT:** fine-grained PATs are per repo; it needs the *Administration:
  read/write* permission to register runners. Use one dedicated to this repository.
- **`docker compose` on the runner:** the workflow uses Compose v2. The
  `myoung34/github-runner` image ships the Docker client; if `docker compose`
  were not available, install the compose plugin on the runner.
- The runner automatically registers the `self-hosted` label in addition to `sextante`.

## 2. GitHub Secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**
(or, better, in a `production` *Environment*). The workflow writes them to an
ephemeral `.env` with mode 600 and deletes it at the end.

| Secret | What it is | How to generate it |
|---|---|---|
| `POSTGRES_PASSWORD` | Postgres password | `openssl rand -base64 24` |
| `JWT_SECRET` | Signs the session JWT | `openssl rand -base64 48` |
| `RESEND_API_KEY` | Resend API key (sends the magic link) | Resend dashboard |
| `OPENFIGI_API_KEY` | ISIN/ticker → symbol resolution | OpenFIGI account |
| `REVALIDATE_TOKEN` | On-demand wiki revalidation | `openssl rand -base64 32` |
| `BACKUP_GPG_PASSPHRASE` | Encrypts backups (AES256) before uploading them | `openssl rand -base64 32` |
| `RCLONE_CONF_BASE64` | rclone config (access to the target Drive), base64-encoded | See §6 |
| `STRIPE_SECRET_KEY` | Donations; consumed by `api`. Empty/missing = donations disabled | Stripe dashboard → Developers → API keys |
| `ANALYTICS_DB_PASSWORD` | Password of the analytics (Umami) Postgres | `openssl rand -base64 24` |
| `ANALYTICS_APP_SECRET` | Signs Umami dashboard sessions and visit IDs | `openssl rand -base64 48` |

**Non-secret** values (hard-coded in the workflow; edit them there if they change):
`APP_URL`, `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, `WEB_PORT`, `COOKIE_SECURE=true`,
`EMAIL_TRANSPORT=resend`, `RCLONE_REMOTE`.

**Variables** (not secret; **Settings → Secrets and variables → Actions → Variables**):
`NEXT_PUBLIC_DONATIONS_ENABLED=1` turns on the donation button (baked into the
`web` build; leave it empty to hide it). It must go together with the
`STRIPE_SECRET_KEY` secret. `NEXT_PUBLIC_ANALYTICS_WEBSITE_ID` is the site ID in
Umami (see §7); when empty, the tracker is not loaded.

> ⚠️ Also keep `BACKUP_GPG_PASSPHRASE` **outside** the server (a password
> manager). Without it the backups are unrecoverable — it is what makes them
> unreadable at the destination, but also to you if you lose it.

> `JWT_SECRET` must be **fixed and stable**: changing it invalidates every
> session. Set it once.

> With `NODE_ENV=production` the API **refuses to start** if `JWT_SECRET` is the
> development one or shorter than 32 characters, if `COOKIE_SECURE` is not `true`
> or if `APP_URL` does not start with `https://` (`apps/api/src/config/env.ts`).

## 3. Email (Resend)

Login is passwordless: the API emails a magic link. `EMAIL_TRANSPORT` picks the
transport: `dev` (the default) only writes the link to the log; `resend` really
sends it via [Resend](https://resend.com) and is what production uses (the
workflow already sets `EMAIL_TRANSPORT=resend` and `EMAIL_FROM`; the key is the
`RESEND_API_KEY` secret). With `resend`, if `RESEND_API_KEY` or `EMAIL_FROM` is
missing the API **fails at startup** instead of sending into the void.

`EMAIL_FROM` has no default: it depends on the domain verified in your Resend
account. A **dedicated sending subdomain** (`send.<your-domain>`) is advisable
to isolate the root domain's reputation.

Verifying the domain:

1. In Resend, **Domains → Add Domain** with `send.<your-domain>`.
2. Resend shows the **exact DNS records**; copy them verbatim (the values,
   especially the DKIM key, are generated by Resend and vary by domain and
   region) into your domain's DNS zone.
3. Wait until the domain shows as **Verified** (minutes to a few hours).

| Type | Host (example) | Purpose |
|---|---|---|
| **MX** | `send.<your-domain>` | Return-Path / bounces of the sending subdomain. Required for verification. |
| **TXT (SPF)** | `send.<your-domain>` | Authorises Resend's servers to send on behalf of the domain. |
| **TXT (DKIM)** | `resend._domainkey.send.<your-domain>` (or whatever Resend says) | Signature proving the mail has not been tampered with. |
| **TXT (DMARC)** _(recommended)_ | `_dmarc.send.<your-domain>` | Policy for mail that fails SPF/DKIM. Start lenient: `v=DMARC1; p=none; rua=mailto:you@mail`. |

Check the whole flow by requesting a magic link to your own address: it should
arrive from `no-reply@send.<your-domain>` with the **Entrar en Sextante** ("Sign
in to Sextante") button. The link uses `APP_URL`, so it only works once the public
domain (§5) resolves.

## 4. First deployment

1. Create the runner (step 1) and the secrets (step 2).
2. Merge to `main`. `ci` runs first; once it passes, `deploy` starts, which
   builds the images **on the server** and brings up the stack. The `migrate`
   service applies the migrations before the API starts.
3. Check: `docker compose -f docker-compose.prod.yml ps` and
   `curl -fsS http://127.0.0.1:${WEB_PORT}/` on the host.

## 5. Reverse proxy + TLS (last step)

1. Point your domain's DNS at the server's IP.
2. Adapt `docs/nginx/sextante.conf` to your proxy.
3. Issue the certificate, e.g. `certbot --nginx -d <your-domain>` (Let's Encrypt).

> **Note on port binding.** `docker-compose.prod.yml` publishes
> `${WEB_PORT}:3000` **without an interface prefix**, i.e. on `0.0.0.0`, not just
> on loopback. This is deliberate: a reverse proxy running **in a container**
> cannot reach the host's loopback. If your proxy runs on the host, or you attach
> it to Compose's `sextante` network and proxy to `http://web:3000`, you can (and
> should) change it to `127.0.0.1:${WEB_PORT}:3000`.

## 6. Encrypted backups

The `backup` service (see `docker-compose.prod.yml` + `scripts/backup/`) runs
`pg_dump → gzip → gpg (AES256) → rclone` to the configured destination: one backup
**on start** and then **one daily** (04:00 Europe/Madrid by default), with rotation
(deletes those older than 7 days, configurable with `BACKUP_RETENTION_DAYS`).
**Encryption happens on the server**, so only a `.gpg` that is unreadable without
`BACKUP_GPG_PASSPHRASE` lands at the destination (this is what closes the GDPR
"sub-processor" issue: the storage provider never sees personal data in the clear).

### Connecting the destination (rclone) — done ONCE

`rclone` needs an OAuth token for the destination. You generate it on a machine
with a browser and upload it as a secret. Example with Google Drive:

1. **Install rclone**: https://rclone.org/install/ (macOS: `brew install rclone`).
2. **Configure the remote** with the same name you use in `RCLONE_REMOTE`:
   ```sh
   rclone config
   # n) New remote
   # name> gdrive
   # Storage> drive            (Google Drive)
   # client_id>                (empty; or use your own, see note)
   # client_secret>            (empty)
   # scope> 3                  (only files created by rclone) or 1 (full access)
   # Edit advanced config> n
   # Use auto config> y        -> opens the browser to authorise
   # Configure as Shared Drive> n
   # y) Yes this is OK
   ```
3. **Create the target folder** (it must match `RCLONE_REMOTE`):
   ```sh
   rclone mkdir gdrive:sextante-backups
   rclone lsd gdrive:
   ```
4. **Export the config as base64** and use it as the `RCLONE_CONF_BASE64` secret:
   ```sh
   base64 -i "$(rclone config file | tail -1)" | tr -d '\n' | pbcopy   # macOS
   # Linux: base64 -w0 "$(rclone config file | tail -1)"
   ```
5. Also create `BACKUP_GPG_PASSPHRASE` (`openssl rand -base64 32`) and store it in
   your password manager (without it nothing can be restored).

> **Note (your own client_id):** with rclone's default `client_id`, Google applies
> shared quota limits. That is enough for daily backups; for robustness, create
> your own OAuth client:
> https://rclone.org/drive/#making-your-own-client-id.

### Restoring a backup

```sh
# 1) Download the .gpg from the destination
rclone copy gdrive:sextante-backups/sextante-YYYYMMDD-HHMMSSZ.sql.gz.gpg .

# 2) Restore (DESTRUCTIVE; asks for confirmation by typing "RESTAURAR").
#    Pass the credentials through the environment, NOT on the command line, so they
#    stay out of the shell history and are not visible in `ps`.
read -rs BACKUP_GPG_PASSPHRASE; export BACKUP_GPG_PASSPHRASE
read -rs PGPASSWORD; export PGPASSWORD
./scripts/backup/restore.sh sextante-YYYYMMDD-HHMMSSZ.sql.gz.gpg
```

> **Test the restore** every now and then (ideally against a scratch DB). A
> backup that has never been restored is not a backup you can trust.

---

## 7. Analytics (Umami)

Self-hosted, cookieless analytics. Umami runs in its own container with **its own
Postgres** (it does not mix with user data and is not part of the §6 backups: it
holds aggregated metrics and losing them compromises nothing). From the public
origin only `/stats/script.js` and `/stats/api/send` exist, which `web` forwards to
`http://analytics:3000` over the internal network; the CSP stays `'self'`.

**The dashboard does NOT go through the public proxy.** It is published on the
host's `ANALYTICS_PORT` (8791 by default): reach it over the local network or
Tailscale, `http://<nas-ip>:8791`. Do not add that port to the reverse proxy.

Setup (once):

1. Create the `ANALYTICS_DB_PASSWORD` and `ANALYTICS_APP_SECRET` secrets (§2) and add
   them to the `env:` and the heredoc of the "Materialise the production .env" step
   in `deploy.yml`, together with the `NEXT_PUBLIC_ANALYTICS_WEBSITE_ID` variable.
   Without both secrets, `docker compose` refuses to start (production stays on the
   previous version).
2. Deploy. Log in to the dashboard with `admin` / `umami` and **change the password
   immediately**.
3. In the dashboard, *Settings → Websites → Add website* with the public domain.
   Copy the **Website ID** (a UUID) into the `NEXT_PUBLIC_ANALYTICS_WEBSITE_ID`
   variable.
4. Redeploy (it is baked into the `web` build). Check in the browser that
   `/stats/script.js` returns 200 and that the visit shows up under *Realtime*.

Privacy, already configured: the tracker sends neither the query string nor the
hash (shareable calculations carry their values there), honours Do Not Track and
only tracks on the canonical domain; Umami does not store the IP and the visit ID
changes every day (`SALT_ROTATION=day`). The tracked events are in
`src/shared/analytics/track.ts`; if you add one, cover it in the privacy policy
too.

## Operations

- **Updating:** push to `main` → CI and, if it passes, an automatic redeploy. The
  `sextante_pgdata` volume persists; new migrations are applied automatically.
- **Deploying by hand:** *Actions* tab → `deploy` workflow → *Run workflow*.
  It is the escape hatch for redeploying without touching code, or if the gate gets stuck.
- **Red CI = no deployment.** Production stays on the previous version; fix the
  failure and push again. There is no way to skip the gate except the manual
  trigger, which is deliberately explicit.
- **Additive migrations (expand/contract).** `migrate` runs before the API is
  recreated, so for a few seconds the **previous** API serves with the **new**
  schema, and a rollback to the previous image also leaves it on that schema. That
  is why every migration must be compatible with the previous deployment's code:
  - **Expand** (in the same deployment as the code that uses it): create tables,
    columns with a `DEFAULT` or nullable, indexes, `CHECK … NOT VALID`.
  - **Contract** (in a **later** deployment, once no code uses it any more): drop or
    rename columns and tables, switch to `NOT NULL`, `VALIDATE CONSTRAINT`.
  - A rename is always an expand (new column + copy) and, later on, a contract.
  - Never edit a migration already applied in production: add another one.
- **NEVER** run `docker compose ... down -v` in production: it deletes the database.
  Do not change `JWT_SECRET` either unless you want to log everyone out.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f api web analytics`.
- **Backups:** see §6.

## Alternative: build on GitHub + pull (recommended if the repo is public)

The current workflow builds the images on the runner. Besides the security issue
in the opening warning, the Next build consumes the server's RAM/CPU. The
alternative is to build on GitHub's runners, publish to GHCR and have the server
only `pull`:

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
          tags: ghcr.io/<user>/sextante-web:latest
```

On the server, a cron job (or Watchtower) runs
`docker compose -f docker-compose.prod.yml pull && up -d`, with the `.env` written
**once by hand** (mode 600) instead of generated by the workflow. With this **no
self-hosted runner is needed**. Publish the GHCR packages as **private**: the build
stage of `Dockerfile.web` sees the whole repository.
