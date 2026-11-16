# Deployment runbook

## Frontend — GitHub Pages

`.github/workflows/pages.yml` builds, tests and deploys `dist/` on pushes to `main`. Repository Settings → Pages must use **GitHub Actions**. No backend secrets are required for preview deployment.

Current deployed `web/public/config.json`:

```json
{"apiUrl":"https://morrowfold-api-8ify.onrender.com","mode":"live"}
```

Only after the API is deployed and acceptance tests pass, set a public HTTPS API URL and `"mode":"live"`. Never put a database connection string in this file. GitHub Pages cannot run FastAPI, hold database secrets, or execute model requests securely.

## Database — managed PostgreSQL in the EU

Create a dedicated Supabase or Neon project in a specific EU region, such as Frankfurt. Do not rely on a broad Europe selection, which may include non-EU regions. The current deployment uses Supabase Central EU (Frankfurt) and Render Frankfurt. Compare actual free-tier limits, backups, pausing, egress and upgrade costs before opening the pilot.

The application uses ordinary PostgreSQL via psycopg; it is compatible with both providers without changing business logic. Supabase Auth/Storage are not integrated in this slice. No service-role key or public browser database access is used.

Place the direct migration-owner connection string in `MIGRATION_DATABASE_URL` in an ignored `.env` file or local secret manager. Require `sslmode=verify-full` and configure the provider's trusted CA certificate if necessary. The runtime rejects remote URLs without hostname-verifying TLS. Never paste credentials into chat, source code or CLI arguments.

```sh
.venv/bin/python scripts/setup_postgres.py
```

The initial schema runs atomically and deliberately fails if `morrowfold` already exists. It creates only the private app schema inside the selected database, not an account-wide database. Use a new dedicated project/database. It defines:

- Tenant-bound items with encrypted content, optimistic versioning, timestamps and checked types.
- Composite foreign keys preventing cross-user or non-area references and orphaned child records.
- Forced row-level security using a transaction-local tenant context.
- Expiring, revocable access-code hashes.

Create a dedicated runtime LOGIN role using the provider’s secure admin flow. It must not be a superuser, table owner or have BYPASSRLS. Apply the three scoped grants documented at the end of `api/schema.sql`. Use that role's connection string as `DATABASE_URL`. Keep the private `morrowfold` schema out of Supabase's exposed Data API schemas. The runtime role cannot create pilot access codes.

Use a provider pooled URL for runtime when needed and a direct URL for migration. Prepared statements are disabled for transaction-pooler compatibility; tenant identity is set locally inside each transaction, never session-wide.

## API — Render Frankfurt

The Dockerfile runs a non-root Uvicorn process on port 8000. Deploy behind an HTTPS reverse proxy with one worker initially. Provide secrets through the host's secret manager:

- `DATABASE_URL`: restricted PostgreSQL runtime role, `sslmode=verify-full` and provider CA if needed.
- `DATA_KEY`: base64-encoded 32 cryptographically random bytes, backed up separately from the database.
- `ALLOWED_ORIGINS=https://stormvolf123.github.io` (origin only; no repository path).
- `MISTRAL_API_KEY`: backend-only secret, after checking processing location and retention terms.
- `MISTRAL_MODEL`: supported model, initially `mistral-small-latest`; pin an evaluated model version for a stable release.

For local API work, copy `.env.example` to `.env`, supply values securely, and run `.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log`. Loopback PostgreSQL can run without TLS for local testing; remote databases cannot. The live browser configuration requires HTTPS; use a local TLS proxy for full client-server checks. Preview mode never connects to the API.

Disable sensitive payload logging at the host/proxy. Configure limits and alerts for database and model costs. `/health` indicates process health, not database/model readiness.

## Pilot access

After live acceptance checks, create an individual expiring workspace code for each tester. `MIGRATION_DATABASE_URL` must be available to this administrator-only command:

```sh
.venv/bin/python scripts/invite.py --output .private/tester-invitation.txt
```

Distribute privately through a channel you choose. The file has mode 0600 and `.private/` is gitignored. Do not share a code between users. Revoke it by updating its hash row's `revoked` flag. Expiry is 30 days. The helper creates new workspaces; recovery of an existing workspace requires an audited administrator process retaining its user_id. Public signup/passkeys/OIDC are a later identity upgrade.

## Acceptance evidence

- Persist records in the chosen hosted PostgreSQL instance; restart, reload and re-login preserve them.
- Two user codes cannot read or mutate each other's records. Verify RLS with the restricted runtime role, not the migration owner.
- Expired/revoked codes fail, stale versions return 409, foreign-key violations cannot orphan records.
- Raw payloads are ciphertext; decryption survives a tested backup/restore.
- Real Mistral requests use only selected context and produce editable drafts without sending applications.
- Verify Pages project-path assets, mobile keyboard, reduced motion, CORS, gateway rate limits and EU processing settings.

Local database integration tests and unit/API tests support these checks but do not prove the hosted deployment is configured correctly. The founder-only live pilot is enabled; outstanding wider-pilot acceptance checks remain required. See the implementation log for completed evidence.

## Prepared Supabase + Render setup

The root `render.yaml` describes the deployed Frankfurt backend. It contains no secrets and does not enable public live mode. Its free instance is for setup only; request an approved always-on plan before regular testing. Supply required secrets in Render's environment settings. The encryption key must remain stable across redeployments and be backed up securely.

With the environment configured, run `python scripts/check_setup.py --mistral` from the repository root. This validates database permissions/RLS and available Mistral models without sending user data. A passing result is followed by real persistence and chat smoke tests; only then change `web/public/config.json` to live.

See [integration sequencing](integrations.md) for Gmail and LinkedIn permissions and the initial supported workflows.

## Deployed Gmail configuration — 16 November 2026

Migration `api/migrations/002_google_connections.sql` has been applied to the dedicated Supabase project. Both new tables have forced RLS. For a new installation, apply it once after the base schema and runtime role exist; do not rerun it blindly.

Render has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` configured as backend environment variables. Google project `healthy-mark-514905-q9` has Gmail API enabled, External/Testing OAuth, and the founder registered as a test user. Callback: `https://morrowfold-api-8ify.onrender.com/v1/integrations/google/callback`.

The Gmail release is `dbc4fb18c823f8fdbd1a59189c9d234d0492ab77`; Render deployment `dep-dbta1sui0phs73f4q8u0` reached live, and GitHub Pages verification/deployment succeeded. Authenticated status returned configured=true, connected=false. The owner must complete Settings → Connect Gmail, then test a selected message. No mailbox contents were read during setup.

The Supabase runtime uses the Frankfurt session pooler with hostname-verifying TLS and the trusted provider CA in `api/certs/`. Preserve DATA_KEY across releases. Backend auto-deploy is off; environment updates can initiate deployments, so inspect deployment status before triggering another one.
