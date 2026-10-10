// Automated test only: isolated, clearly fake configuration to exercise anonymous authorization.
// Never submits a generation or fabricates an authenticated user.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://TEST-ONLY.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "TEST_ONLY_NO_ACCESS",
      SUPABASE_SERVICE_ROLE_KEY: "TEST_ONLY_NO_ACCESS",
      CRON_SECRET: "TEST_ONLY_CRON_SECRET_NEVER_USE_IN_PRODUCTION",
    },
    stdio: "ignore",
  },
);
const base = "http://127.0.0.1:3001";
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base + "/login");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "Production test server started");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  for (const path of ["/", "/image-studio", "/settings"]) {
    await page.goto(base + path);
    await page.waitForURL(base + "/login");
    assert.equal(
      await page
        .getByRole("heading", { name: "Welcome to the studio" })
        .count(),
      1,
    );
    assert.equal(
      await page.getByText("Your creative workspace", { exact: true }).count(),
      0,
    );
  }
  const denied = await fetch(base + "/api/manage", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ action: "budget", values: {} }),
  });
  assert.equal(denied.status, 401);
  const asset = await fetch(
    base + "/api/assets/11111111-1111-4111-8111-111111111111",
  );
  assert.equal(asset.status, 401);
  const cron = await fetch(base + "/api/cron/reconcile");
  assert.equal(cron.status, 401);
  const data = await fetch(base + "/api/data");
  assert.equal(data.status, 401);
  console.log(
    "PASS configured anonymous pages redirect to login; protected management, assets, data and cron routes reject access.",
  );
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
}
