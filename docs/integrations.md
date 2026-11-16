# First connected pilot

## Connect the core before adding external accounts

The first live acceptance flow is: sign in with a private pilot code → create an area and a memory → reload and verify persistence → ask Mistral a scoped question → prepare and edit a draft. No synthetic responses, fallback demo data, or unsupported “connected” badges.

Proposed infrastructure: Supabase PostgreSQL in Central EU (Frankfurt), the existing Python API on Render Frankfurt, and the existing GitHub Pages frontend. These are region selections, not claims that the providers are exclusively EU-owned or that every ancillary processing activity is EU-only. Review the relevant processing agreements for the pilot.

`render.yaml` prepares a free setup instance with manual deployments and secret placeholders. Free Render services sleep after inactivity, so use an approved always-on plan before regular testing. A paid plan must be selected by the owner with an explicit budget. No hosted resources are provisioned merely by committing this file.

Before enabling live mode, run `python scripts/check_setup.py --mistral` with the backend environment loaded. It checks connection security, runtime privileges, RLS configuration and Mistral model availability without sending workspace data or printing secrets. It does not establish that chat generation or hosted end-to-end behavior works; those still require smoke tests.

## Gmail first

A connection in the coding assistant is not a Gmail connection in Morrowfold. Each Morrowfold user must authorise our own Google OAuth client. Do not reuse the developer's Gmail connector or tokens for testers.

First workflow: the user chooses emails relevant to one area; the assistant can summarise them or prepare a response inside Morrowfold. Keep email text out of model context until the user explicitly chooses to use it. Start with `gmail.readonly` only if inbox reading is needed; this is a restricted scope, not an exemption from verification requirements. For a smaller initial experiment, users can paste selected email text without OAuth.

Prepare replies in Morrowfold first. Saving drafts into Gmail requires additional permission (`gmail.compose`, which also permits sending at the provider level). Do not request it until the product needs Gmail drafts; server-side controls must still prohibit sending unless a separate explicit approval flow exists.

Implementation needs OAuth state/PKCE, per-user encrypted refresh-token storage, revocation/disconnect, scope checks, timeouts/retries, clear source attribution, prompt-injection boundaries and a minimal privacy/retention policy. Confirm Google's verification and security assessment requirements before external rollout. Never infer approval to send mail from a generated draft.

## LinkedIn second

LinkedIn's standard self-service sign-in provides limited identity/profile data, not unrestricted access to inboxes, job applications or the professional graph. Additional APIs require their specific products/approvals. Do not build the MVP around scraping or promise automated job applications through an unapproved API.

Start the career workflow with a pasted job description and user-confirmed career facts. Add a profile import through supported user-provided exports or an approved API later. LinkedIn sign-in is optional and does not itself make the career assistant more capable.

## Primary references

- [Google Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Render free-service limits](https://render.com/docs/free)
- [Mistral API-key setup](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)
