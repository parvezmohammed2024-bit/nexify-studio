// Admin CLI only. No media downloads, database writes, or changes to the app's allowlist.
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const stateFile = path.join(root, ".nexify/media-discovery.json");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validityMs = 15 * 60_000;
export class DiscoveryError extends Error {}
class ProviderError extends DiscoveryError {
  constructor(status) {
    super(`Provider returned HTTP ${status}; response body suppressed.`);
    this.httpStatus = status;
  }
}
function check(condition, message) {
  if (!condition) throw new DiscoveryError(message);
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function parseUsd(value) {
  check(
    typeof value === "string" && /^\d+(\.\d{1,6})?$/.test(value),
    "An exact nonnegative USD amount with at most six decimal places is required.",
  );
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function formatUsd(micros) {
  return `${micros / 1_000_000n}.${(micros % 1_000_000n).toString().padStart(6, "0")}`;
}
export function approvalReference(plan) {
  return hash(
    JSON.stringify({
      version: plan.version,
      account: plan.account,
      createdAt: plan.createdAt,
      tests: plan.tests.map(
        ({ kind, endpoint, payload, usd, idempotencyKey }) => ({
          kind,
          endpoint,
          payload,
          usd,
          idempotencyKey,
        }),
      ),
    }),
  );
}
export function requireApproval(
  plan,
  approval,
  maximum,
  account,
  now = Date.now(),
) {
  check(
    plan?.version === 1 && plan.tests?.length === 2,
    "No valid two-request discovery plan exists. Run quote first.",
  );
  check(
    approval && approval === approvalReference(plan),
    "Explicit approval must match the displayed plan reference. No generation was submitted.",
  );
  check(
    plan.account === account,
    "Credential changed. Obtain and approve a new quote.",
  );
  const age = now - Date.parse(plan.createdAt);
  check(
    Number.isFinite(age) && age >= 0 && age <= validityMs,
    "Quote expired. Obtain and approve a new quote.",
  );
  check(
    plan.tests.every((test) => test.status === "quoted"),
    "A submission has already started. Use poll or inspect the provider account; do not resubmit.",
  );
  check(
    parseUsd(maximum) >=
      plan.tests.reduce((sum, test) => sum + parseUsd(test.usd), 0n),
    "Approved estimated USD ceiling is below the quoted total.",
  );
}
export async function providerCall(
  key,
  route,
  payload,
  idempotencyKey,
  fetcher = fetch,
) {
  check(
    /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(route) && !route.includes(".."),
    "Invalid provider route.",
  );
  let response;
  try {
    response = await fetcher(`https://api.higgsfield.ai/${route}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Key ${key}`,
        ...(payload === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new DiscoveryError(
      "Provider request failed or timed out; sensitive details suppressed.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderError(response.status);
  }
  try {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DiscoveryError(
      "Provider response was oversized or invalid; response suppressed.",
    );
  }
}
function publicAddress(ip) {
  // Match the app's public-address restrictions; this CLI never downloads media.
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 192 && b === 0 && c === 2)
    );
  }
  return (
    isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:db8:/i.test(ip)
  );
}
export async function outputHosts(response, resolver = lookup) {
  check(response.status === "completed", "Provider request is not completed.");
  check(
    response.images === undefined ||
      (Array.isArray(response.images) && response.images.length <= 4),
    "Invalid image output response; response suppressed.",
  );
  const outputs = [
    ...(response.images || []).map((image) => ({
      kind: "image",
      url: image?.url,
    })),
    ...(response.video ? [{ kind: "video", url: response.video.url }] : []),
  ];
  check(
    outputs.length > 0,
    "Completed request has no supported image/video output.",
  );
  const found = [];
  for (const output of outputs) {
    let url;
    try {
      url = new URL(output.url);
    } catch {
      throw new DiscoveryError("Invalid output URL; URL suppressed.");
    }
    check(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443") &&
        !isIP(url.hostname) &&
        /^[a-z0-9.-]+$/i.test(url.hostname),
      "Output has an unsafe origin; URL suppressed.",
    );
    let addresses;
    try {
      addresses = await resolver(url.hostname, { all: true });
    } catch {
      throw new DiscoveryError(
        "Output hostname DNS verification failed; URL suppressed.",
      );
    }
    check(
      addresses.length > 0 &&
        addresses.every((address) => publicAddress(address.address)),
      "Output hostname resolves to a private or reserved address; URL suppressed.",
    );
    found.push({ kind: output.kind, hostname: url.hostname.toLowerCase() });
  }
  return found;
}
export function hostReport(hosts) {
  const image = [
    ...new Set(hosts.filter((h) => h.kind === "image").map((h) => h.hostname)),
  ].sort();
  const video = [
    ...new Set(hosts.filter((h) => h.kind === "video").map((h) => h.hostname)),
  ].sort();
  return {
    image_hostnames: image,
    video_hostnames: video,
    PROVIDER_MEDIA_HOSTS:
      image.length && video.length
        ? [...new Set([...image, ...video])].sort().join(",")
        : null,
  };
}
export function logRequestIds(text) {
  const ids = new Set();
  function visit(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 8) return;
    if (value.status === "completed" && uuid.test(value.request_id || ""))
      ids.add(value.request_id);
    for (const child of Object.values(value).slice(0, 100))
      visit(child, depth + 1);
  }
  for (const line of text.split("\n")) {
    if (line.length > 256 * 1024) continue;
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    try {
      visit(JSON.parse(line.slice(start, end + 1)));
    } catch {
      /* Unstructured app logs contain no provider responses. */
    }
  }
  return [...ids];
}
async function logCandidates() {
  const ids = new Set();
  let files = 0;
  for (const directory of [
    path.join(root, ".next/dev/logs"),
    path.join(root, ".nexify"),
  ]) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".log")) continue;
      const file = await open(path.join(directory, entry.name), "r");
      try {
        const size = (await file.stat()).size;
        check(
          size <= 8 * 1024 * 1024,
          "Application log is too large for complete inspection; no data was logged.",
        );
        for (const id of logRequestIds(await file.readFile("utf8")))
          ids.add(id);
        files++;
      } finally {
        await file.close();
      }
    }
  }
  return { ids: [...ids], files };
}
async function databaseCandidates() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return { available: false, ids: [] };
  try {
    check(new URL(url).protocol === "https:", "Supabase URL must use HTTPS.");
    const db = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            signal: AbortSignal.timeout(12_000),
            redirect: "error",
          }),
      },
    });
    const rows = await db
      .from("generations")
      .select("provider_request_id,model_registry!inner(provider)")
      .eq("model_registry.provider", "higgsfield")
      .eq("status", "completed")
      .not("provider_request_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(40);
    // Includes provider-completed outputs whose retention failed and app jobs remain 'storing'.
    const diagnostics = await db
      .from("provider_diagnostics")
      .select("request_id:payload->>request_id")
      .eq("payload->>status", "completed")
      .order("created_at", { ascending: false })
      .limit(40);
    check(
      !rows.error && !diagnostics.error,
      "Database lookup failed; response suppressed.",
    );
    return {
      available: true,
      ids: [
        ...new Set(
          [
            ...(rows.data || []).map((r) => r.provider_request_id),
            ...(diagnostics.data || []).map((r) => r.request_id),
          ].filter((id) => uuid.test(id || "")),
        ),
      ],
    };
  } catch {
    throw new DiscoveryError(
      "Database lookup failed; database response suppressed.",
    );
  }
}
function providerKey() {
  const key = process.env.HF_API_KEY || process.env.HF_CREDENTIALS;
  check(
    key,
    "Higgsfield key is absent. Configure HF_API_KEY securely; never put its value in command arguments or chat.",
  );
  return key;
}
async function existing() {
  const [logs, db] = await Promise.all([logCandidates(), databaseCandidates()]);
  const supplied = (process.env.HF_DISCOVERY_REQUEST_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  check(
    supplied.every((id) => uuid.test(id)),
    "HF_DISCOVERY_REQUEST_IDS must contain only comma-separated API request UUIDs.",
  );
  const ids = [...new Set([...db.ids, ...logs.ids, ...supplied])].slice(0, 40);
  console.log(
    JSON.stringify({
      database_checked: db.available,
      application_logs_checked: logs.files,
      completed_request_candidates: ids.length,
      inspection_limit: 40,
    }),
  );
  const hosts = [];
  if (ids.length) {
    const key = providerKey();
    for (const id of ids) {
      const result = await providerCall(key, `requests/${id}/status`);
      check(
        result.request_id === id,
        "Provider request identity mismatch; response suppressed.",
      );
      if (result.status === "completed")
        hosts.push(...(await outputHosts(result)));
    }
  }
  console.log(JSON.stringify(hostReport(hosts), null, 2));
}
async function loadState() {
  try {
    return JSON.parse(await readFile(stateFile, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw new DiscoveryError(
      "Discovery state cannot be read; sensitive details suppressed.",
    );
  }
}
async function saveState(state) {
  const temporary = `${stateFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, stateFile);
}
async function locked(action) {
  await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  let lock;
  try {
    lock = await open(`${stateFile}.lock`, "wx", 0o600);
  } catch {
    throw new DiscoveryError(
      "Discovery is locked. Inspect any existing process/submission before clearing a stale lock.",
    );
  }
  try {
    return await action();
  } finally {
    await lock.close();
    await unlink(`${stateFile}.lock`);
  }
}
async function testRequests() {
  const registry = JSON.parse(
    await readFile(path.join(root, "docs/verified-models.json"), "utf8"),
  );
  const specs = [
    {
      kind: "image",
      endpoint: "marketing-studio/image",
      payload: {
        prompt:
          "A single orange sphere on a plain navy background, clean studio lighting.",
        quality: "low",
        moderation: "auto",
        resolution: "1k",
        aspect_ratio: "auto",
        enhance_prompt: false,
      },
    },
    {
      kind: "video",
      endpoint: "alibaba/wan-3.0-prime/text-to-video",
      payload: {
        prompt:
          "A calm ocean wave rolling onto an empty sandy beach in daylight, locked-off camera.",
        duration: 2,
        resolution: "480p",
        aspect_ratio: "adaptive",
        generate_audio: true,
        enable_thinking: false,
      },
    },
  ];
  const ajv = new Ajv({ strict: true });
  addFormats(ajv);
  for (const spec of specs) {
    const model = registry.find(
      (m) =>
        m.endpoint === spec.endpoint &&
        m.operation ===
          (spec.kind === "image" ? "text-to-image" : "text-to-video"),
    );
    check(
      model?.available && model.verification_status === "verified",
      "Discovery model is not verified and available.",
    );
    const age = Date.now() - Date.parse(model.pricing.verified_at);
    check(
      Number.isFinite(age) && age >= 0 && age <= 7 * 24 * 3600_000,
      "Model verification expired. Reverify documentation before discovery.",
    );
    check(
      ajv.compile(model.input_schema)(spec.payload),
      "Discovery input does not match the installed verified schema.",
    );
  }
  return specs.map((test) => ({
    ...test,
    idempotencyKey: randomUUID(),
    status: "quoted",
  }));
}
export async function estimateRequests(tests, call) {
  for (const test of tests) {
    // Billing docs show /estimate/<model path>. Exact-model support must succeed live;
    // unsupported/malformed estimates stop here, with no fallback to guessed/cached prices.
    const estimate = await call(`estimate/${test.endpoint}`, test.payload);
    test.usd = formatUsd(parseUsd(estimate.usd));
  }
  return tests;
}
async function quote() {
  const key = providerKey();
  const previous = await loadState();
  check(
    !previous || previous.tests?.every((t) => t.status === "quoted"),
    "Discovery already contains a submission. Use poll; do not overwrite or resubmit it.",
  );
  const tests = await estimateRequests(await testRequests(), (route, payload) =>
    providerCall(key, route, payload),
  );
  const plan = {
    version: 1,
    account: hash(key),
    createdAt: new Date().toISOString(),
    tests,
  };
  await saveState(plan);
  console.log(
    JSON.stringify(
      {
        requests: tests.map(({ kind, endpoint, payload, usd }) => ({
          kind,
          model: endpoint,
          inputs: payload,
          estimated_usd: usd,
        })),
        total_estimated_usd: formatUsd(
          tests.reduce((sum, t) => sum + parseUsd(t.usd), 0n),
        ),
        approval_reference: approvalReference(plan),
        valid_for_minutes: 15,
        generation_submitted: false,
      },
      null,
      2,
    ),
  );
}
export async function generateApproved(plan, options, dependencies) {
  const { call, save, account, now = Date.now } = dependencies;
  requireApproval(plan, options.approval, options.maximum, account, now());
  const refreshed = await estimateRequests(
    plan.tests.map((t) => ({ ...t })),
    call,
  );
  check(
    refreshed.every(
      (t, index) => parseUsd(t.usd) === parseUsd(plan.tests[index].usd),
    ),
    "Account estimates changed. Obtain and approve a new quote; no generation was submitted.",
  );
  requireApproval(plan, options.approval, options.maximum, account, now());
  for (const test of plan.tests) {
    test.status = "submitting";
    await save(plan); // Persist BEFORE the single chargeable POST, including its idempotency key.
    try {
      const result = await call(
        test.endpoint,
        test.payload,
        test.idempotencyKey,
      );
      check(
        uuid.test(result.request_id || ""),
        "Submission response had no valid request ID; response suppressed.",
      );
      test.requestId = result.request_id;
      test.status = "accepted";
      await save(plan);
    } catch (error) {
      test.status =
        error instanceof ProviderError &&
        [400, 401, 403, 404, 422, 429].includes(error.httpStatus)
          ? "rejected"
          : "submission_unknown";
      await save(plan);
      throw new DiscoveryError(
        "Discovery submission stopped. State retained; inspect the account before any further submission. No automatic retry was made.",
      );
    }
  }
}
async function generate(args) {
  check(
    args.length === 4 && args[0] === "--approve" && args[2] === "--max-usd",
    "Paid mode requires --approve <displayed-reference> --max-usd <approved-estimated-ceiling>.",
  );
  const key = providerKey();
  const plan = await loadState();
  await generateApproved(
    plan,
    { approval: args[1], maximum: args[3] },
    {
      account: hash(key),
      call: (route, payload, idempotencyKey) =>
        providerCall(key, route, payload, idempotencyKey),
      save: saveState,
    },
  );
  console.log(
    "Two discovery submissions accepted. Run poll to retrieve only verified hostnames.",
  );
}
async function poll() {
  const key = providerKey();
  const plan = await loadState();
  check(
    plan?.version === 1 && plan.account === hash(key),
    "No discovery state exists for the configured credential.",
  );
  const hosts = [];
  for (const test of plan.tests) {
    if (!test.requestId) continue;
    check(uuid.test(test.requestId), "Invalid saved request identity.");
    const response = await providerCall(
      key,
      `requests/${test.requestId}/status`,
    );
    check(
      response.request_id === test.requestId,
      "Provider request identity mismatch; response suppressed.",
    );
    check(
      [
        "queued",
        "in_progress",
        "completed",
        "failed",
        "nsfw",
        "canceled",
      ].includes(response.status),
      "Unexpected provider status; response suppressed.",
    );
    console.log(JSON.stringify({ kind: test.kind, status: response.status }));
    if (response.status === "completed") {
      const found = await outputHosts(response);
      check(
        found.some((h) => h.kind === test.kind),
        "Completed output type did not match the approved discovery request.",
      );
      test.hostnames = found;
      test.status = "completed";
      hosts.push(...found);
    }
  }
  await saveState(plan);
  console.log(JSON.stringify(hostReport(hosts), null, 2));
}
export async function main(args = process.argv.slice(2)) {
  const [command = "existing", ...rest] = args;
  if (command === "existing") {
    check(
      !rest.length,
      "existing takes no arguments; use HF_DISCOVERY_REQUEST_IDS for optional IDs.",
    );
    await existing();
  } else if (command === "quote") {
    check(!rest.length, "quote takes no arguments.");
    await locked(quote);
  } else if (command === "generate") await locked(() => generate(rest));
  else if (command === "poll") {
    check(!rest.length, "poll takes no arguments.");
    await locked(poll);
  } else
    throw new DiscoveryError(
      "Use existing, quote, generate, or poll. The default existing mode is read-only.",
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof DiscoveryError
        ? error.message
        : "Discovery failed; sensitive details suppressed.",
    );
    process.exitCode = 1;
  });
}
