# Implementation log

Record changes with their date, purpose, implementation, validation, deployment status and remaining work. Do not turn plans into completion claims. Keep secrets and user content out of this log.

## 16 November 2026 — working private pilot and Gmail foundation

### Outcome

Morrowfold moved from an interactive design preview to a deployed private pilot with persistent personal workspaces and real Mistral replies. Gmail connection support was then deployed. At the last verified live check, Google configuration was ready but no mailbox was connected. This is an early founder pilot, not a finished autonomous personal assistant or a public release.

### 1. Repository and responsive workspace

- Created the dedicated `StormVolf123/morrowfold-mvp` repository and local code workspace, separate from the supplied Polsia download.
- Built React/TypeScript/Vite views for Today, Chat as the second navigation tab, Areas, Memory and workspace settings.
- Retained the pale green/white palette, Inter typography, visual area cards, landscape morning-brief treatment and gentle motion. Included reduced-motion support.
- Implemented area/task/memory editing, task completion and workspace export. The current brief shows workspace tasks; it is not a scheduled AI briefing, news feed or calendar integration.
- Kept preview and live modes explicit. The live application does not silently substitute fictional data when a request fails.

### 2. PostgreSQL backend and live infrastructure

- Adopted managed PostgreSQL as the primary store instead of Snowflake, using a dedicated Supabase project in Frankfurt.
- Implemented a Python FastAPI API, a non-root Docker image and a Render service in Frankfurt.
- Created a private database schema with areas, tasks, memory, drafts and conversations represented by validated encrypted payloads. Added optimistic version checks and same-user area foreign keys.
- Connected GitHub Pages to the live Render API and verified authenticated database access and a real Mistral response with synthetic test content. The synthetic chat record was removed after verification; temporary smoke credentials were revoked.
- Added CI verification with a disposable PostgreSQL database and frontend build before Pages deployment. Render backend deployments remain separately controlled.
- Enabled individual, expiring pilot access codes. Supabase Auth, public registration, passkeys and account recovery are not implemented.

### 3. Security work

- AES-256-GCM protects stored payloads, with tenant/object/type bound to encryption authentication. The backend retains decryption capability: this is encryption at rest, **not end-to-end encryption**.
- Forced PostgreSQL row-level security and a restricted runtime database role provide tenant isolation. The runtime role cannot administer the database or create invitations.
- Access codes are stored as hashes, expire and can be revoked. Browser sessions use sessionStorage.
- Configured verified TLS to Supabase using its trusted database CA; certificate checking was not disabled to resolve the initial connection problem.
- Added explicit frontend CORS, input validation, request limits and AI throttling. Sanitized configuration errors to avoid exposing secret input values; disabled application access logging in the container command.
- Kept credentials in ignored private files/backend configuration, outside the public repository and frontend bundle.
- Remaining work includes key rotation/versioning, backup/restore drills, full identity management, broader operational monitoring and provider processing/retention review. GitHub Pages is globally delivered; Frankfurt backend/database placement is not an EU-only guarantee for the entire stack.

### 4. Working AI and personalization direction

- Connected the Mistral API; the current baseline remains `mistral-small-latest`.
- Implemented chat using general or area-scoped context and manually curated memory, with persisted conversations.
- Implemented application drafting from career context and a pasted job description, retaining source/model provenance and user review. It does not submit applications.
- Documented the recommended strategy: product instructions + editable personal profile + scoped memory/retrieval + explicit tool permissions. We did **not** fine-tune a model per user or build an autonomous multi-agent system.
- Proposed evaluating versioned Small against stronger models on synthetic tasks before changing production. No model comparison benchmark or routing system has been completed.

### 5. Gmail implementation and Google setup

- Created a dedicated Google Cloud project, verified Gmail API enabled, configured External/Testing OAuth branding, and added the founder as a test user.
- The owner created the web OAuth client. Its downloaded credentials were validated and stored privately, then configured on Render.
- Applied the connection/state migration to Supabase, verifying forced RLS on both tables.
- Implemented OAuth PKCE, random expiring one-use state, hashed state/proof storage, encrypted token staging and confirmation tied to the original signed-in workspace/browser. A callback alone cannot activate a connection.
- Added Settings → Connect Gmail and disconnect/revocation. Tokens remain on the backend, never in model context or frontend responses.
- Added on-demand listing of 10 recent inbox messages, plain-text preview without attachments, selection of up to three messages, and an explicit confirmation before sharing selected content/context with Mistral.
- Added summaries and single-message reply drafts saved inside Morrowfold chat history. There is no Gmail sending, mailbox editing, Gmail-native draft creation or automatic inbox ingestion.
- The underlying permission is read-only mailbox access; selecting messages in the UI does not narrow Google's underlying grant. Testing-mode grants may require reconnection after seven days.
- **Verified live:** Gmail configured=true, mailbox connected=false, authenticated endpoint/CORS and visible Connect Gmail button. **Still pending:** owner consent and an end-to-end selected-message summary/draft test. No real emails were read during setup.

### 6. Integration and scheduling decisions

- LinkedIn: start from user-provided career information; no full-profile/inbox synchronization, scraping or automatic applications were implemented.
- Strava/Runna: documented access and provider-policy constraints; no wearable integration or training-data import was implemented.
- Scheduling: designed a future durable schedule/run ledger with user timezones, retries, leases and duplicate protection, using a separate runner. No scheduler or paid cron resource was created.
- Initial proposed automation is an in-app morning brief. Email delivery, live news, external actions and area collaboration remain separate future features.

### Validation and release evidence

| Evidence | Result / limit |
| --- | --- |
| Local Python/API/PostgreSQL suite after Gmail changes | 25 tests passed; one dependency deprecation warning |
| Security cases | Tenant isolation, ciphertext persistence, foreign keys, version conflicts, expired/revoked codes, OAuth callback staging, browser proof, replay rejection and AI-sharing consent |
| Frontend validation | TypeScript check and production Vite build passed |
| GitHub Actions | Verify and deploy Pages succeeded for `dbc4fb1` |
| Render | Deployment `dep-dbta1sui0phs73f4q8u0` reached live at commit `dbc4fb1` |
| Live core smoke test | Authenticated database/CORS and real Mistral response verified using synthetic content |
| Live Gmail check | Configuration ready and endpoint protected; no authorized mailbox yet |
| Browser check | Updated live Settings page showed Connect Gmail |

Passing tests do not establish completed public-launch readiness, provider compliance, load capacity or a fully tested mobile experience.

### Implementation commits

- `dc08639` — initialize repository.
- `67a5b74` — responsive workspace, managed PostgreSQL API and tenant-isolation tests.
- `5bb449f` — EU deployment preparation and safe connection checks.
- `4c5dd78` — verified Supabase TLS and redacted settings-validation inputs.
- `6fe1021` — switch frontend to the verified live private pilot.
- `dbc4fb1` — consent-based read-only Gmail integration and assistant strategy.

### Next steps

1. Owner connects Gmail and tests one deliberately chosen, non-sensitive message through preview → explicit AI consent → summary/draft → disconnect.
2. Improve personal-profile onboarding, memory provenance and user-controlled corrections so assistance becomes meaningfully personal.
3. Evaluate model quality/cost on a small synthetic task set and pin a chosen version.
4. Implement an in-app scheduled morning brief, with approved hosting budget and visible schedule/run controls.
5. Complete wider-pilot gates: identity, privacy/retention, recovery, operational monitoring and mobile acceptance before expanding access.

### Documentation maintenance

Updated README, architecture, deployment, integration and assistant-strategy documents to remove stale preview-only/hosting-undecided claims. This log is the dated evidence trail; those documents describe current behavior and procedures. Future changes should update both where relevant.
