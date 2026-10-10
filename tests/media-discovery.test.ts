// Automated tests only. All provider responses, credentials and media URLs below are fake.
import { describe, expect, it, vi } from "vitest";
import {
  approvalReference,
  formatUsd,
  generateApproved,
  hostReport,
  logRequestIds,
  outputHosts,
  parseUsd,
  providerCall,
  requireApproval,
} from "../scripts/discover-media-hosts.mjs";

const now = Date.parse("2026-10-10T00:00:00Z");
const requestId = "11111111-1111-4111-8111-111111111111";
function plan() {
  return {
    version: 1,
    account: "TEST_ONLY_ACCOUNT_HASH",
    createdAt: new Date(now).toISOString(),
    tests: [
      {
        kind: "image",
        endpoint: "marketing-studio/image",
        payload: { prompt: "TEST_ONLY" },
        usd: "0.016200",
        idempotencyKey: "TEST_ONLY_IMAGE_KEY",
        status: "quoted",
      },
      {
        kind: "video",
        endpoint: "alibaba/wan-3.0-prime/text-to-video",
        payload: { prompt: "TEST_ONLY", duration: 2 },
        usd: "0.136000",
        idempotencyKey: "TEST_ONLY_VIDEO_KEY",
        status: "quoted",
      },
    ],
  };
}
const resolver = vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
function dependencies(call: ReturnType<typeof vi.fn>, save = vi.fn()) {
  return { account: "TEST_ONLY_ACCOUNT_HASH", now: () => now, call, save };
}
function options(p: ReturnType<typeof plan>) {
  return { approval: approvalReference(p), maximum: "0.152200" };
}

describe("discovery approval and financial controls", () => {
  it("uses exact decimal accounting and rejects unsupported estimate precision", () => {
    expect(formatUsd(parseUsd("0.0162") + parseUsd("0.136"))).toBe("0.152200");
    for (const invalid of ["-1", "1e-2", "0.0000001", "NaN"])
      expect(() => parseUsd(invalid)).toThrow();
  });
  it("makes zero calls without matching approval, a valid quote and sufficient ceiling", async () => {
    const cases = [
      (p: ReturnType<typeof plan>) => ({ ...options(p), approval: "" }),
      (p: ReturnType<typeof plan>) => ({ ...options(p), approval: "wrong" }),
      (p: ReturnType<typeof plan>) => ({ ...options(p), maximum: "0.15" }),
    ];
    for (const configure of cases) {
      const p = plan();
      const call = vi.fn();
      await expect(
        generateApproved(p, configure(p), dependencies(call)),
      ).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    }
    const p = plan();
    const call = vi.fn();
    await expect(
      generateApproved(p, options(p), {
        ...dependencies(call),
        now: () => now + 16 * 60_000,
      }),
    ).rejects.toThrow("expired");
    expect(call).not.toHaveBeenCalled();
  });
  it("rejects altered inputs, changed credentials and existing submissions", () => {
    const p = plan();
    const reference = approvalReference(p);
    p.tests[1].payload.duration = 10;
    expect(() => requireApproval(p, reference, "1", p.account, now)).toThrow(
      "approval",
    );
    expect(() =>
      requireApproval(p, approvalReference(p), "1", "OTHER_TEST_ACCOUNT", now),
    ).toThrow("Credential");
    p.tests[0].status = "submission_unknown";
    expect(() =>
      requireApproval(p, approvalReference(p), "1", p.account, now),
    ).toThrow("already started");
  });
  it("blocks all chargeable POSTs when refreshed account estimates change", async () => {
    const p = plan();
    const call = vi.fn().mockResolvedValue({ usd: "0.2" });
    await expect(
      generateApproved(p, options(p), dependencies(call)),
    ).rejects.toThrow("estimates changed");
    expect(call).toHaveBeenCalledTimes(2);
    expect(
      call.mock.calls.every(([route]) => route.startsWith("estimate/")),
    ).toBe(true);
  });
  it("persists submitting state before each single POST and supplies the saved idempotency key", async () => {
    const p = plan();
    const stored: string[] = [];
    const save = vi.fn(async (state) => {
      stored.push(JSON.stringify(state));
    });
    const call = vi.fn(async (route, _payload, key) => {
      if (route.startsWith("estimate/"))
        return { usd: route.includes("marketing") ? "0.0162" : "0.136" };
      const state = JSON.parse(stored.at(-1)!);
      const test = state.tests.find(
        (t: { endpoint: string }) => t.endpoint === route,
      );
      expect(test.status).toBe("submitting");
      expect(test.idempotencyKey).toBe(key);
      return { request_id: requestId, status: "queued" };
    });
    await generateApproved(p, options(p), dependencies(call, save));
    expect(
      call.mock.calls.filter(([route]) => !route.startsWith("estimate/")),
    ).toHaveLength(2);
    const beforeRepeat = call.mock.calls.length;
    await expect(
      generateApproved(p, options(p), dependencies(call, save)),
    ).rejects.toThrow("already started");
    expect(call.mock.calls.length).toBe(beforeRepeat);
  });
  it("retains unknown outcomes, stops the second submission, and refuses resubmission", async () => {
    const p = plan();
    const saved: string[] = [];
    const call = vi.fn(async (route) => {
      if (route.startsWith("estimate/"))
        return { usd: route.includes("marketing") ? "0.0162" : "0.136" };
      throw new Error("TEST_ONLY secret and signed URL must never surface");
    });
    const save = vi.fn(async (state) => {
      saved.push(JSON.stringify(state));
    });
    await expect(
      generateApproved(p, options(p), dependencies(call, save)),
    ).rejects.toThrow("No automatic retry");
    expect(
      call.mock.calls.filter(([route]) => !route.startsWith("estimate/")),
    ).toHaveLength(1);
    expect(JSON.parse(saved.at(-1)!).tests[0].status).toBe(
      "submission_unknown",
    );
    await expect(
      generateApproved(p, options(p), dependencies(call, save)),
    ).rejects.toThrow("already started");
    expect(call.mock.calls).toHaveLength(3);
  });
  it("does not submit if durable state cannot be written", async () => {
    const p = plan();
    const call = vi.fn(async (route) => ({
      usd: route.includes("marketing") ? "0.0162" : "0.136",
    }));
    await expect(
      generateApproved(
        p,
        options(p),
        dependencies(
          call,
          vi.fn().mockRejectedValue(new Error("TEST_ONLY disk error")),
        ),
      ),
    ).rejects.toThrow();
    expect(
      call.mock.calls.every(([route]) => route.startsWith("estimate/")),
    ).toBe(true);
  });
});

describe("discovery privacy and media boundaries", () => {
  it("returns only hostnames and compares distinct image/video origins", async () => {
    const found = await outputHosts(
      {
        status: "completed",
        images: [
          {
            url: "https://images.test.example/private/path.png?signature=TEST_ONLY_SIGNATURE",
          },
        ],
        video: {
          url: "https://videos.test.example/private/path.mp4?signature=TEST_ONLY_SIGNATURE",
        },
      },
      resolver,
    );
    expect(hostReport(found)).toEqual({
      image_hostnames: ["images.test.example"],
      video_hostnames: ["videos.test.example"],
      PROVIDER_MEDIA_HOSTS: "images.test.example,videos.test.example",
    });
    expect(JSON.stringify(found)).not.toContain("private");
    expect(JSON.stringify(found)).not.toContain("SIGNATURE");
    expect(hostReport(found.slice(0, 1)).PROVIDER_MEDIA_HOSTS).toBeNull();
    expect(
      hostReport([
        { kind: "image", hostname: "same.test.example" },
        { kind: "video", hostname: "same.test.example" },
      ]).PROVIDER_MEDIA_HOSTS,
    ).toBe("same.test.example");
  });
  it("rejects non-HTTPS, credentials, IP addresses, ports and private DNS destinations", async () => {
    for (const url of [
      "http://test.example/a",
      "https://user:TEST_ONLY@test.example/a",
      "https://127.0.0.1/a",
      "https://test.example:8443/a",
    ]) {
      await expect(
        outputHosts({ status: "completed", images: [{ url }] }, resolver),
      ).rejects.toThrow("unsafe origin");
    }
    await expect(
      outputHosts(
        { status: "completed", video: { url: "https://test.example/a" } },
        vi.fn().mockResolvedValue([{ address: "10.0.0.1", family: 4 }]),
      ),
    ).rejects.toThrow("private");
    await expect(
      outputHosts({ status: "in_progress" }, resolver),
    ).rejects.toThrow("not completed");
  });
  it("finds IDs only in completed structured log events without returning private fields", () => {
    const log = JSON.stringify({
      response: {
        status: "completed",
        request_id: requestId,
        prompt: "TEST_ONLY_PRIVATE_CUSTOMER",
        images: [{ url: "https://test.example/private?token=TEST_ONLY" }],
      },
    });
    expect(logRequestIds(log)).toEqual([requestId]);
    expect(
      logRequestIds(
        JSON.stringify({ status: "queued", request_id: requestId }),
      ),
    ).toEqual([]);
  });
  it("pins API requests, disables redirects and suppresses error bodies and transport details", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"request_id":"TEST_ONLY"}'));
    await providerCall(
      "TEST_ONLY_KEY",
      `requests/${requestId}/status`,
      undefined,
      undefined,
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.higgsfield.ai/requests/${requestId}/status`);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    await expect(
      providerCall("TEST_ONLY_KEY", "../other", undefined, undefined, fetcher),
    ).rejects.toThrow("Invalid provider route");
    const rejected = vi
      .fn()
      .mockResolvedValue(
        new Response("TEST_ONLY_SECRET_SIGNED_URL", { status: 401 }),
      );
    await expect(
      providerCall(
        "TEST_ONLY_KEY",
        "requests/test/status",
        undefined,
        undefined,
        rejected,
      ),
    ).rejects.toThrow("HTTP 401; response body suppressed");
    const failed = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "TEST_ONLY_KEY https://test.example/private?signature=TEST_ONLY",
        ),
      );
    await expect(
      providerCall(
        "TEST_ONLY_KEY",
        "requests/test/status",
        undefined,
        undefined,
        failed,
      ),
    ).rejects.toThrow("sensitive details suppressed");
  });
});
