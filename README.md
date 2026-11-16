# Morrowfold — personal workspace MVP

A calm, visual workspace for your ambitions: areas, small next steps, curated memory, and an assistant that helps you prepare work. Inspired by the supplied Polsia landing page; implemented as a static React app plus a separate PostgreSQL-backed Python API.

## Current status

The GitHub Pages build is an **interactive preview using fictional data**. Edits last until refresh. It does not pretend to save data or return AI replies. The API is implemented and tested against an isolated local PostgreSQL instance, but the live pilot requires the deployment steps below. Do not invite real users to upload personal information before the live acceptance checks pass.

### Implemented

- Responsive Today, Chat (second tab), Areas, and editable Memory views.
- Layered landscape brief, tactile area artwork, gentle transitions, reduced-motion support.
- Area/task/memory creation and editing, task completion, workspace export.
- API with expiring individual pilot access codes, tenant-scoped queries, parameter binding, optimistic concurrency, encrypted content, and request limits.
- Mistral chat using selected area + shared memory, and application drafts with source text, review status and preserved provenance.
- GitHub Pages workflow and a non-root API container.

### Not active yet

Live cloud storage, AI replies and sign-in are disabled in the public preview. Scheduled routines, news feeds, calendar and wearable integrations, image uploads, invitations to collaborators, and autonomous external actions are not implemented. An access-code invitation is a private pilot login, not area sharing. The daily brief is a view of workspace tasks, not generated news or calendar data.

## Run the interface

```sh
npm ci --ignore-scripts
npm run dev
npm run build
```

Open the printed local URL. Static output is `dist/`; relative asset paths support GitHub Pages project URLs.

## Run API tests

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r api/requirements.lock
.venv/bin/python -m pytest api/tests -q
```

API tests use an in-memory test adapter. Database integration tests use real PostgreSQL when `TEST_DATABASE_URL` points to a disposable database named `morrowfold_test` (the CI workflow provides one). They verify restricted-role row-level security, encrypted persistence, foreign keys, conflicts, and token expiry/revocation. These tests do not establish that a hosted provider or Mistral model is connected.

## Connect the pilot

See [deployment](docs/deployment.md) for PostgreSQL, secrets, hosting and Pages setup, and [architecture](docs/architecture.md) for the data and security boundaries.

No PostgreSQL credentials, API keys, access codes or personal data belong in `web/`, repository variables used in the browser bundle, or GitHub Pages artifacts. `web/public/config.json` contains only a public API URL and mode.

## Design provenance

Brand palette, Inter fonts, and visual direction come from the supplied Morrowfold Polsia project. The working app and API were created separately so the original download remains unchanged. Inter font sources are recorded in `web/public/fonts/SOURCE.md`.
