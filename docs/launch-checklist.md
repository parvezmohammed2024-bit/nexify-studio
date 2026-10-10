# Launch Nexify AI Studio

The application source is complete. A running interface does not establish that
hosted authentication, storage, or paid generation is ready. Complete the steps
below for the actual production account.

## 1. Correct the Supabase project URL

Set `NEXT_PUBLIC_SUPABASE_URL` to the project's HTTPS API URL from Supabase's
project settings. Enter only the URL, without an assignment, quotes, or a database
connection string. The anon and service-role keys must belong to the same project.
Use secure environment settings for all keys; never paste them into chat.

In the October 10 launch check, the supplied URL was invalid. Read-only calls
verified the project identified by both keys, but its studio tables were unavailable.
The verified URL is supplied in the cloud configuration draft, rather than stored
as account configuration in this repository.

## 2. Apply the database schema

For a fresh Supabase project, generate a single SQL Editor file:

```bash
node scripts/export-supabase-setup.mjs
```

Open the reported `.nexify/supabase-setup.sql` file, review it, and run it once in
the target project's SQL Editor as the database administrator. It includes every
repository migration in order and stops if studio tables already exist. It does
not delete existing records or store credentials. A repeat export preserves the
previous file and creates a timestamped copy.

For an existing studio schema, apply only pending migrations through your normal
migration workflow. The SQL Editor export does not record Supabase CLI migration
history; use a configured `supabase db push` workflow instead if the CLI will manage
this project's migrations. Do not mix workflows without reconciling their history.

The REST service-role key cannot execute these schema migrations. Database-admin
access through the SQL Editor or a configured database connection is required.

## 3. Set up internal staff access

Disable new user signups in Supabase Auth. The October 10 read-only check found
signup enabled. Enable email/password login, create the first Auth user, and add
its actual UUID as an active administrator using the SQL in [README.md](../README.md).
Configure the production Site URL and redirect URLs after deployment.

Sign in, create a client and project, and set the global monthly USD budget. The
studio deliberately blocks generation without these prerequisites.

## 4. Verify media hosts before paid generation

Run [media hostname discovery](media-host-discovery.md) against existing completed
API requests first. The required tables were unavailable during the launch check,
so a hosted completed-request search could not be completed.

Both fixed discovery models' estimate routes were verified with the authenticated
account on October 10. A fresh `quote` reports current account estimates. Running
`generate` requires explicit user approval of those requests and that estimate.
Direct discovery requests are outside the studio's budget ledger. Keep
`PROVIDER_MEDIA_HOSTS` blank until real output hostnames are verified; do not use
wildcards or invented domains.

In a proxy-only cloud environment, native public DNS may be unavailable. Verify
discovery and DNS-pinned media retention in a runtime with supported DNS and HTTPS
egress. Keep the downloader's DNS, destination, redirect, size and file checks intact.

## 5. Deploy and check the real workflow

Import the GitHub repository into Vercel with the Next.js preset and enter the
variables from `.env.example` securely. Choose a cron-capable plan or configure an
equivalent trusted scheduler as described in [README.md](../README.md). A repository
push does not deploy the site unless your Vercel project is already connected.

Before any approved paid test, verify staff sign-in, project access, private image
upload/download, model availability, cost preview, monthly budget and cron access.
Then validate one approved generation through completion, private retention and
confirmed final-cost reconciliation. Test prompt enhancement separately with
approval because the external LLM can charge for it.

Local tests verify application logic and browser behavior. The database suite uses
test-only Auth/Storage schemas; it does not establish that your hosted project has
been migrated or that the live generation lifecycle has succeeded.
