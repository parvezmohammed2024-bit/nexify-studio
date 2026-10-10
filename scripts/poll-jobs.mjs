// Local scheduling helper. Reads .env.local using Node's --env-file flag; never prints keys.
const base = process.env.STUDIO_BASE_URL || "http://127.0.0.1:3000";
if (!process.env.CRON_SECRET) {
  console.error("Set CRON_SECRET in .env.local before starting the poller.");
  process.exit(1);
}
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
while (!stopped) {
  try {
    const response = await fetch(base + "/api/cron/reconcile", {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok)
      console.error("Reconciliation returned HTTP " + response.status);
    else {
      const data = await response.json();
      console.log("Reconciled " + data.processed + " jobs.");
    }
  } catch {
    console.error(
      "Reconciliation request failed; no generation POST was retried.",
    );
  }
  if (!stopped)
    await new Promise((resolve) => {
      const shutdown = () => {
        clearTimeout(timer);
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        resolve();
      };
      const timer = setTimeout(shutdown, 60_000);
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
}
