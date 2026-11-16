# Architecture and first pilot boundary

## Product

Morrowfold organises the user's own ambitions into private areas. Today surfaces next steps; Chat operates across all authorised context or one area; Memory contains facts explicitly entered by the user. An initial useful assistant workflow prepares an application draft from selected-area context and a pasted job description. The user reviews and sends it themselves.

## Components

1. React + TypeScript + Vite static frontend on GitHub Pages. No database connection or model credentials in the browser. Preview and live mode are distinct; failure never silently falls back to fictional data.
2. Python FastAPI service on Render in Frankfurt, with HTTPS, explicit CORS origins and secret injection. One process initially; rate limits are per-process and must move to a shared gateway/store before horizontal scaling.
3. Managed PostgreSQL on Supabase in Central EU (Frankfurt). A private `morrowfold` schema uses primary keys, checked entity types, composite foreign keys and row-level security. The browser never accesses the database directly.
4. Mistral API for explicitly requested assistance. Verify contract, processing location and retention settings before real pilot data. European branding alone is not a data residency guarantee.

## Data model

`ITEMS`: composite primary key `(USER_ID, ID)`, kind, optimistic version, encrypted payload, created/updated timestamps. Typed payload schemas for area, task, memory and draft. Conversations retain ordered role/content messages and area scope. Drafts preserve model identity and job source; users can edit content and review status but not provenance.

`ACCESS_TOKENS`: SHA-256 digest of a 384-bit random access code, workspace UUID, expiry and revocation flag. No raw codes in the database. This is a closed-pilot identity mechanism, not a complete consumer identity platform: replace with established OIDC/passkeys before public signup. Session codes are held in sessionStorage, cleared on logout, and checked against PostgreSQL on every API request. A stolen code grants access until revoked or expired. Do not put it in URLs.

The typed aggregate store intentionally avoids unencrypted free-text search columns. It is a small pilot model, not the final analytics warehouse. Before broad adoption, split aggregates where needed into dedicated domain tables, add paginated retrieval and richer read models, and define event schemas. Application validation and a composite foreign key both enforce same-user area references. The foreign key also requires that the referenced entity is an area. Database transactions prevent concurrent deletion from leaving orphaned children. No unsupported claims of a finished enterprise data platform.

`CONNECTIONS`: tenant/provider primary key and encrypted refresh-token payload, with forced tenant RLS. `OAUTH_STATES`: hashed state and browser proof, expiry, phase and encrypted temporary payload. OAuth callback access is scoped to the matching random state digest; activating a connection additionally requires the original signed-in workspace and browser proof. Migration: `api/migrations/002_google_connections.sql`.

## Security properties and limits

- AES-256-GCM with random 96-bit nonces; tenant, object ID and kind are authenticated associated data. Payload substitution across tenants or types fails authentication.
- The server has the key and decrypts for authorised responses and model context. **This is application-layer encryption at rest, not end-to-end encryption.** IDs, kinds, versions and timestamps remain queryable metadata.
- Store DATA_KEY in the backend host's secret manager, separately from PostgreSQL. A lost key loses all encrypted content. A compromised API can read content. Key versioning, rotation and restore drills are required before wider release.
- SQL binds and explicit tenant filters on every operation. Runtime role has only app-table CRUD and token-table SELECT; it must not own tables, be superuser or have BYPASSRLS. Each transaction sets a local tenant identity; forced RLS denies item access without it. The private schema must not be added to Supabase’s exposed Data API schemas.
- No telemetry SDK, third-party fonts, automatic model memory capture, model tools, external sending or scheduled actions.
- AI responses render as plain text, not HTML. Retrieved text is marked untrusted in the prompt. No model tool execution exists, so prompt injection cannot send mail or mutate workspace records.
- Export is available. Individual items can be deleted; an area must be emptied first. Provider backup/retention rules still apply; do not promise immediate removal from every recovery copy.
- Backend has body limits, AI request throttling, no-store responses and sanitised service errors. Production gateway should add edge request limits, TLS/HSTS, maximum body limits and monitoring without payload logging.

## Wider pilot and public release gates

Run live two-user isolation, CRUD persistence after re-login, conflict handling, token expiry/revocation, Mistral factuality checks, ciphertext verification, backup/restore and mobile acceptance tests. Verify EU hosting and database region, contracts/retention, and actual per-user costs. The founder-only live pilot is enabled. These remaining checks are gates for broader tester onboarding and public release; local tests are not proof that every live release gate has passed.

## Reference documentation

- [GitHub Pages is static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Mistral chat API](https://docs.mistral.ai/api/endpoint/chat)

## Next integration and personalization phase

See [Personal assistant strategy](personal-assistant-strategy.md) for the deployed architecture, permissions, source-specific API limits, model evaluation and proposed scheduling design. Gmail OAuth and selected-message assistance are deployed, with mailbox consent/end-to-end validation pending. Scheduling, richer profile/retrieval and other proposed integrations remain planned.
