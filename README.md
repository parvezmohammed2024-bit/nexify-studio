# Nexify AI Studio

An internal image and video production workspace for Nexify Solution. Built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix components, Lucide, Zod, and Supabase Auth/PostgreSQL/Storage.

The application includes all ten requested pages: Dashboard, Image Studio, Video Studio, B-Roll Studio, Prompt Engineer, Client Projects, Creative Library, Generation History, Budget & Spending, and Settings. It uses real database records and aggregates. Without configuration it shows an empty setup workspace; it never simulates a successful generation.

## Quick start

Node 24 is recommended; the environment was tested with Node 24.19.0. Dependencies are pinned by `package-lock.json`.

Next 16.4 supports ESLint 10. Its bundled React, accessibility, and import plugins still advertise older peer ranges, so npm prints peer warnings. The locked installation and lint checks pass without disabling rules or dependency verification.

```bash
cd /workspace/nexify-studio
npm ci --cache /tmp/nexify-npm
cp .env.example .env.local
# Fill in the required values securely; never commit .env.local.
npm run dev
```

Use the existing checkout. Codex cloud tasks are already isolated; no Git worktree is needed.

## Connect Supabase and staff authentication

1. Create a Supabase project. Copy its project URL and anon/publishable key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Put the legacy service-role key in the server-only `SUPABASE_SERVICE_ROLE_KEY`. This application uses JWT service-role authorization for privileged server operations.
2. Apply every SQL migration in `supabase/migrations`, in filename order, with the Supabase SQL editor or a configured Supabase CLI (`supabase db push`). These migrations require Supabase's existing `auth` and `storage` schemas. Do not apply them to an unrelated production database.
3. In Supabase Auth, **disable new user signups**. The application has no signup route, and only explicitly provisioned active profiles may enter. Enable email/password sign-in. Configure the production Site URL and allowed redirect URLs for your deployed domain.
4. Create the initial administrator in Supabase Auth. Copy that user's UUID and run this once, using that actual UUID:

   ```sql
   insert into public.profiles(id, full_name, role, active)
   values ('YOUR_AUTH_USER_UUID', 'Studio Administrator', 'admin', true);
   ```

5. Sign in at `/login`. In Settings, provision other Auth users by UUID with creator/admin roles. Create or invite those Auth users through the Supabase dashboard first. Creators see projects they create or are assigned to; administrators grant access in Client Projects.
6. Set a global monthly USD budget in Budget & Spending. Generation blocks until that budget exists. Optional per-client budgets add a second enforced limit.

`studio-assets` is a private bucket created by migration 001. Browser uploads, downloads, favourites, archive/move operations, signed URLs, and history mutations use permission-checked server routes. Supabase RLS remains enabled. Job details and financial evidence are project-scoped; shared budget/client spending aggregates remain visible to active staff. The service key never reaches browser bundles. Reference uploads are fully decoded, limited to 40 million pixels, re-encoded, and stripped of EXIF metadata before external sharing.

## Configure generation

Set `HF_API_KEY` to the **complete API key copied from** [open.higgsfield.ai](https://open.higgsfield.ai/api-keys), as-is. Set `CRON_SECRET` and `QUOTE_SIGNING_SECRET` to strong independent random values (the quote signing secret must have at least 32 characters). Set `PROVIDER_MEDIA_HOSTS` to exact HTTPS output hostnames verified for your Higgsfield account; wildcard hosts and private addresses are rejected. No safe hostnames were invented during implementation. A storage failure retains the provider request and reservation, so an administrator can approve the verified hostname and let polling retry without generating again.

Read [provider-verification.md](docs/provider-verification.md) for sources, installed configurations, pricing rules, and the distinction between documentation verification and live account access.

Four registry workflows have verified, narrowly constrained documentation/pricing records: Marketing Studio Image (generation and editing), Wan 3.0 Prime (text-to-video and image-to-video). FLUX Kontext Max, DoP Turbo, Z-Image Turbo, and Soul 2 remain installed but disabled pending price/capability verification. All prices expire seven days after their actual verification date. These are not live provider-reported quotes, and the application does not invent an estimation endpoint.

A generation goes through:

1. Project permission, strict input/schema validation, credential/infrastructure gates, and recent price verification.
2. A five-minute HMAC-signed estimate bound to the user, inputs, and model revision.
3. An explicit **Generate — Estimated Cost $X.XX** confirmation.
4. A database transaction that locks budgets, checks global/client limits and concurrency, and reserves the documented maximum before submission.
5. A compare-and-set claim and a single chargeable POST. A duplicate user/idempotency key observes the same job. Unknown submission outcomes are never automatically retried or released.
6. Durable scheduled status polling using the stored provider request ID. Jobs have leases, backoff, stale detection, and a database-enforced state machine.
7. Safe media retention into private Supabase storage, with idempotent asset paths and retryable storage failures.
8. Final cost reconciliation from confirmed evidence in Generation History. Documented failed/nsfw refunds reconcile to zero. Successful and canceled results retain their reservations until an administrator confirms billing. The documented status API has no confirmed USD cost field, so the app does not pretend an estimate is the final charge.

USD microdollars are the accounting unit. MYR is display-only, using the configured manual rate (default 4.5), explicitly labelled as non-live. Active reservations from prior months remain deducted; reconciliation uses the original job billing period. The ledger is append-only and rejects updates/deletes. Admin budget overrides are audited. Studio limits cannot control spending made directly through the external provider account.

## Prompt enhancement

Set `LLM_API_KEY`, `LLM_MODEL`, and an HTTPS `LLM_BASE_URL` (default `https://api.openai.com/v1`). The provider must implement OpenAI-compatible `/chat/completions` with JSON response format. Responses are validated as three editable directions: Realistic, Cinematic, and Advertising.

The server supplies mode, length, brand context, verified model capabilities, and restrictions against invented product claims or extra objects. Unsupported negative prompts are removed. Enhancement is limited to five requests per staff member per minute using a transactional claim. LLM charges are separate from image/video budgets and are disclosed before enhancement. When unconfigured, manual prompts, copying, templates, and generator handoff remain available.

## Run the durable poller

In local development, start a second terminal after configuring `.env.local`:

```bash
node --env-file=.env.local scripts/poll-jobs.mjs
```

The helper calls the authenticated reconciliation route once per minute and never resubmits generations. It logs counts/status codes, not secrets. Stop it with Ctrl+C when done.

On Vercel, `vercel.json` schedules `/api/cron/reconcile` every minute. **Use a Vercel plan that supports this frequency** (or configure an equivalent trusted scheduler that sends `Authorization: Bearer <CRON_SECRET>`). Run one scheduler per environment. The API processes a bounded batch and returns; no video generation waits inside a long-running request handler. The secret must be a raw runtime value for bearer comparison, not a proxy placeholder. `QUOTE_SIGNING_SECRET` must also be a raw server runtime value; the quote signer never uses a provider proxy placeholder as signing material.

## Deploy to Vercel

1. Commit and push the reviewed application source, then import this repository, select the Next.js preset, and use the repository root as the project root.
2. Add the variables from `.env.example` in Vercel environment settings. Keep service-role, Higgsfield, LLM, and cron keys server-only. Configure Preview and Production separately; preview deployments should use a separate Supabase/provider account or disable generation.
3. Apply migrations to the target Supabase project and provision the initial administrator. Set the production Supabase Auth site URL and disable signup.
4. Verify model prices and output hostnames for the actual account. Configure a monthly budget.
5. Build with `npm run build`, deploy, then check sign-in, project creation, private reference upload/download, cost preview, and cron authorization. Perform the live generation lifecycle only with explicit confirmation and a controlled budget.
6. Confirm cron invocations in Vercel logs. Monitor unresolved submissions, stale jobs, storage failures, and pending cost reconciliation in Generation History.

No deployment or cloud publication was performed during implementation. Saving the cloud environment configuration does not publish a website.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
npm run test:auth
```

- Vitest covers pricing expiry, documented ceilings, unsupported model controls, permissions, monthly reservations, state transitions, single submission/no retry, provider response validation, prompt-provider handling, and SSRF/file-signature checks.
- Database checks execute the actual migrations and RPCs in PostgreSQL via PGlite, using **test-only** Auth/Storage schemas. They exercise RLS, hard budgets, idempotency, carried reservations, original-period reconciliation, append-only accounting, protected RPC grants, state transitions, and prompt rate limits. They do not claim to replace hosted Supabase integration or a multi-connection production concurrency test.
- Playwright uses Chromium to test all pages on desktop and mobile, disabled chargeable controls, B-roll scene editing/reordering, manual prompt handoff, sign-in states, and denied API access. Set `CHROMIUM_PATH` to your installed Chromium executable if it differs from `/usr/bin/chromium`.
- The production auth-boundary check uses isolated, clearly fake configuration to verify redirects and anonymous API rejection. It does not fabricate authenticated sessions or claim hosted sign-in succeeded.
- Mock provider responses appear **only in automated tests** and are clearly labelled test fixtures. No production mock provider or seeded fake dashboard statistics exist.

## Boundaries and remaining validation

Live Supabase Auth/Storage, provider-account access, chargeable generation, text enhancement, final provider billing, and deployment must be validated with real credentials. This build cannot claim those external workflows succeeded without them.

The studios support only the installed verified price configurations until an administrator expands the registry. Token-metered pricing, unpriced quality/audio modes, first/last-frame controls, motion intensity, model-specific training, provider cancellation actions, and video merging are not enabled. A B-roll storyboard saves and generates independent scenes; it is not an automatically merged video. Diagnostic responses are redacted; raw media signed URLs are not exposed as public records.

History/library show the latest 100 accessible rows, and client/project selectors load up to 500 rows; database reports aggregate all relevant rows. Infinite pagination/search and a bulk export of every historical record are not implemented. Client logos and approved product references select private uploaded library images. Staff invitations/password management remain with Supabase Auth; the app provisions roles and project membership.
