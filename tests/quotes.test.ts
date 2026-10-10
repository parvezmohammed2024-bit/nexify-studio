import { it, expect, afterEach, vi } from "vitest";
import { signQuote, verifyQuote, inputHash } from "@/lib/server/quotes";
import { input } from "./fixtures";
afterEach(() => vi.unstubAllEnvs());
const fixture = () => ({
  user_id: "test-staff",
  model_id: "test-model",
  model_updated_at: "test-revision",
  input_hash: inputHash(input),
  maximum_micros: 200000,
  expires: Date.now() + 300000,
});
it("binds and verifies a cost confirmation without using provider credentials", () => {
  vi.stubEnv(
    "QUOTE_SIGNING_SECRET",
    "TEST_ONLY_32_CHARACTER_SIGNING_KEY_123456789",
  );
  const quote = fixture();
  expect(verifyQuote(signQuote(quote))).toEqual(quote);
});
it("rejects tampered costs, extra segments, and expired confirmations", () => {
  vi.stubEnv(
    "QUOTE_SIGNING_SECRET",
    "TEST_ONLY_32_CHARACTER_SIGNING_KEY_123456789",
  );
  const token = signQuote(fixture());
  const [body, signature] = token.split(".");
  const modified = JSON.parse(Buffer.from(body, "base64url").toString());
  modified.maximum_micros = 1;
  expect(() =>
    verifyQuote(
      Buffer.from(JSON.stringify(modified)).toString("base64url") +
        "." +
        signature,
    ),
  ).toThrow(/modified/);
  expect(() => verifyQuote(token + ".extra")).toThrow(/Invalid/);
  expect(() =>
    verifyQuote(signQuote({ ...fixture(), expires: Date.now() - 1 })),
  ).toThrow(/expired/);
});
it("fails closed when no independent signing key is configured", () => {
  vi.stubEnv("QUOTE_SIGNING_SECRET", "");
  expect(() => inputHash(input)).toThrow(/QUOTE_SIGNING_SECRET/);
});
