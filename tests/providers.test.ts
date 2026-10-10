import { describe, it, expect, vi, afterEach } from "vitest";
import {
  higgsfield,
  SubmissionError,
  buildPayload,
  mediaUrls,
  diagnostics,
  providerStatus,
} from "@/lib/providers/higgsfield";
import { compatibleLlm } from "@/lib/providers/llm";
import { publicIp, sniffMedia } from "@/lib/server/media";
import { model, input } from "./fixtures";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("documented REST adapter (mocked responses for tests only)", () => {
  it("submits once with the documented authorization and direct payload", async () => {
    vi.stubEnv("HF_API_KEY", "TEST_KEY:TEST_SECRET");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ request_id: "test-request", status: "queued" }),
      );
    vi.stubGlobal("fetch", fetch);
    await higgsfield.submit(model, { prompt: "test" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.higgsfield.ai/test-fixture",
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      "Key TEST_KEY:TEST_SECRET",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ prompt: "test" });
  });
  it("never retries a timed-out chargeable submission", async () => {
    vi.stubEnv("HF_API_KEY", "TEST_KEY:TEST_SECRET");
    const fetch = vi.fn().mockRejectedValue(new Error("network timeout"));
    vi.stubGlobal("fetch", fetch);
    await expect(higgsfield.submit(model, {})).rejects.toMatchObject({
      outcome: "unknown",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("holds 5xx and malformed successful outcomes for review", async () => {
    vi.stubEnv("HF_API_KEY", "TEST_KEY:TEST_SECRET");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    await expect(higgsfield.submit(model, {})).rejects.toMatchObject({
      outcome: "unknown",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ unexpected: "test" })),
    );
    await expect(higgsfield.submit(model, {})).rejects.toBeInstanceOf(
      SubmissionError,
    );
  });
  it("distinguishes a definite input rejection", async () => {
    vi.stubEnv("HF_API_KEY", "TEST_KEY:TEST_SECRET");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 422 })),
    );
    await expect(higgsfield.submit(model, {})).rejects.toMatchObject({
      outcome: "rejected",
    });
  });
  it("polls the documented request status endpoint without resubmitting", async () => {
    vi.stubEnv("HF_API_KEY", "TEST_KEY:TEST_SECRET");
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        request_id: "original",
        status: "completed",
        images: [{ url: "https://test.example/output.png" }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await higgsfield.poll("original");
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.higgsfield.ai/requests/original/status",
    );
    expect(mediaUrls(response)).toEqual(["https://test.example/output.png"]);
    expect(providerStatus(response.status)).toBe("storing");
  });
  it("validates supported fields and rejects unknown advanced settings", () => {
    expect(buildPayload(model, input, [])).toEqual({
      prompt: input.prompt,
      ratio: "1:1",
    });
    expect(() =>
      buildPayload(model, { ...input, advanced: { unsupported: 1 } }, []),
    ).toThrow(/Unsupported/);
  });
  it("requires documented reference encodings", () => {
    const ref = {
      ...model,
      field_map: { ...model.field_map, asset_urls: "images" },
    };
    expect(() =>
      buildPayload(ref, input, ["https://test.example/ref.png"]),
    ).toThrow(/encoding/);
  });
  it("does not preserve signed URLs or extra secret fields in diagnostics", () => {
    expect(
      diagnostics({
        request_id: "test",
        status: "completed",
        images: [{ url: "https://test.example/image?secret=test" }],
      }),
    ).toEqual({
      request_id: "test",
      status: "completed",
      image_count: 1,
      has_video: false,
    });
  });
  it("fails closed without credentials", async () => {
    vi.stubEnv("HF_API_KEY", "");
    await expect(higgsfield.poll("test")).rejects.toThrow(/not configured/);
  });
});
describe("prompt provider", () => {
  it("disables enhancement when no provider is configured", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    await expect(
      compatibleLlm.enhance({
        prompt: "test",
        mode: "image",
        detail: "short",
        brand: null,
        model: null,
        supportsNegative: false,
      }),
    ).rejects.toThrow(/LLM API key/);
  });
  it("validates three alternatives and removes unsupported negatives", async () => {
    vi.stubEnv("LLM_API_KEY", "TEST_ONLY");
    vi.stubEnv("LLM_MODEL", "TEST_MODEL");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  options: ["Realistic", "Cinematic", "Advertising"].map(
                    (style) => ({
                      style,
                      prompt:
                        "A clearly labelled mocked prompt for automated testing.",
                      negative_prompt: "test negative",
                    }),
                  ),
                }),
              },
            },
          ],
        }),
      ),
    );
    const result = await compatibleLlm.enhance({
      prompt: "test",
      mode: "image",
      detail: "short",
      brand: null,
      model: null,
      supportsNegative: false,
    });
    expect(result.options).toHaveLength(3);
    expect(result.options.every((o) => !o.negative_prompt)).toBe(true);
  });
});
describe("media validation and SSRF boundaries", () => {
  it("rejects private, loopback, link-local and mapped IPv6 addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.1.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "fe80::1",
    ])
      expect(publicIp(ip), ip).toBe(false);
    expect(publicIp("8.8.8.8")).toBe(true);
  });
  it("rejects SVG/HTML/script masquerading as an image", () => {
    expect(() => sniffMedia(Buffer.from('<svg onload="test" />'))).toThrow(
      /not a supported/,
    );
    expect(() => sniffMedia(Buffer.from("<html>not media</html>"))).toThrow();
  });
  it("recognizes supported image signatures", () => {
    expect(
      sniffMedia(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))
        .mime,
    ).toBe("image/png");
  });
});
