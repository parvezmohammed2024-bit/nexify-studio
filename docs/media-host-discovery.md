# Discover verified Higgsfield media hostnames

The default script mode is read-only. It queries only provider request IDs from recent completed database jobs/diagnostics and checks structured application logs. It then performs authenticated GET status lookups and prints only image/video hostnames. It never prints request IDs, customer prompts, raw provider responses, signed URLs, or keys.

The current cloud instance has no Supabase connection or Higgsfield key. Its available application log contains no completed provider request IDs. This does **not** establish that your hosted database is empty. No paid discovery request has been executed.

## Try existing completed requests first

Configure `HF_API_KEY` securely in the environment or ignored `.env.local`. Database lookup additionally needs `NEXT_PUBLIC_SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY`; an administrator should run this CLI. Never place keys in command arguments or chat.

```bash
cd /workspace/nexify-studio
node --env-file-if-exists=.env.local scripts/discover-media-hosts.mjs existing
```

The script checks up to 40 recent completed generation rows and 40 completed diagnostic rows, then polls up to 40 distinct request IDs. Diagnostic lookup also covers completed provider outputs whose application job is still awaiting retention. This is a bounded discovery sample, not a bulk historical audit. Existing diagnostics are already redacted but retain output hostnames. Fresh API responses verify the actual origins again.

Alternatively set `HF_DISCOVERY_REQUEST_IDS` to comma-separated **API request UUIDs** from recent completed requests in the Higgsfield Console. No database connection is needed for those lookups. Set IDs through secure environment settings or `.env.local`; the script does not print them. The current app's Settings connection test checks polling but does not display output hostnames.

## Prepare a paid discovery pair only when necessary

The fixed inputs contain no customer data:

- One Marketing Studio image: low quality, 1k, auto aspect ratio, no prompt enhancement, default single output.
- One Wan 3.0 Prime text-to-video: 2 seconds, 480p, adaptive ratio, audio enabled, thinking disabled.

Both payloads are checked against the installed verified schemas. Model verification expires after seven days; expiry blocks quoting until documentation is reverified. The CLI reads the registry record; it does not enable models or change pricing.

```bash
node --env-file-if-exists=.env.local scripts/discover-media-hosts.mjs quote
```

This calls the estimate endpoint with the exact generation body, using the `/estimate/<model path>` pattern in the official billing example. Support for these specific model estimates still needs live verification. A missing endpoint, failed estimate, missing USD amount, or unsupported decimal precision stops the workflow. No cached price is substituted. The script prints each exact account-reported USD estimate, the total, the full benign inputs, and an approval reference. It does **not** submit a generation.

**Do not run `generate` until the user explicitly approves those requests and their displayed estimated total.** An approval reference is a technical safeguard; it does not replace the user's approval in the conversation. Exact account costs could not be obtained in the current instance because its key is absent.

After approval, the operator supplies the displayed reference and approved estimated USD ceiling:

```bash
node --env-file-if-exists=.env.local scripts/discover-media-hosts.mjs generate --approve <DISPLAYED_REFERENCE> --max-usd <APPROVED_USD_CEILING>
```

The command refuses missing/mismatched approval, quotes older than 15 minutes, credential changes, insufficient ceilings, or a prior submission. It requotes both bodies immediately before submission; changed estimates require a new quote and approval. The ceiling limits the **approved estimate**, not the provider's final billing or account-wide spending.

These approved discovery requests go directly to Higgsfield and are outside the studio's monthly budget enforcement and ledger. Their estimates must be reviewed separately before approval. The script never calls the studio's generation routes or relaxes their media-host requirement.

Private state under ignored `.nexify/media-discovery.json` stores inputs, estimates, idempotency keys and accepted request IDs, with owner-only file permissions. A lock prevents concurrent runs. Each intended generation gets a stable provider `Idempotency-Key`, and submitting state is written before each single POST. Unknown submission outcomes are retained for review, never automatically retried. A partial/previous submission prevents another `generate` or replacement quote. Inspect the account before resolving an interrupted run; do not delete state or a stale lock just to resubmit.

Read the accepted requests' current status with:

```bash
node --env-file-if-exists=.env.local scripts/discover-media-hosts.mjs poll
```

`poll` performs one bounded pass and never submits work. Repeat after a reasonable interval until both outputs complete. Only hostnames and recognized statuses are printed. If a submission is ambiguous and its ID was not saved, use the Console to recover the API request UUID and inspect it with `existing`; do not generate again.

## Set the verified allowlist

The report supplies `PROVIDER_MEDIA_HOSTS` only after both image and video origins have been verified. It joins unique bare hostnames with commas and includes a shared hostname once. Copy that exact reported value into environment settings; do not use documentation placeholders, wildcards, URLs, ports, or a JSON array.

Until a real report exists, leave the variable unset or blank. Image/video hosts may match or differ; documentation placeholders establish neither. A test verifies the observed outputs for those model configurations, not a universal provider CDN list or other models.

This CLI only parses output URLs and validates their HTTPS origins and public DNS addresses. It **never downloads media**, sends credentials to media hosts, changes the environment/network allowlist, alters application budget data, or relaxes `src/lib/server/media.ts`. Actual studio downloads still use all existing destination, DNS, redirect, size, timeout, and file validation.

Sources reviewed: [request status](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status.md), [billing and estimates](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md), [idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency.md), [Marketing Studio](https://open.higgsfield.ai/models/marketing-studio/image/api-reference), [Wan text-to-video](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/text-to-video/api-reference).
