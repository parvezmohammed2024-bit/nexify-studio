import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/domain";
import type { GenerationInput } from "@/lib/types";
function signingKey() {
  const key = process.env.QUOTE_SIGNING_SECRET;
  if (!key || key.length < 32)
    throw new AppError(
      "Configure a strong QUOTE_SIGNING_SECRET of at least 32 characters before generating.",
      503,
      "NOT_CONFIGURED",
    );
  return key;
}
export function inputHash(input: GenerationInput) {
  return createHmac("sha256", signingKey())
    .update(JSON.stringify(input))
    .digest("hex");
}
interface Quote {
  user_id: string;
  model_id: string;
  model_updated_at: string;
  input_hash: string;
  maximum_micros: number;
  expires: number;
}
export function signQuote(quote: Quote) {
  const body = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return (
    body +
    "." +
    createHmac("sha256", signingKey()).update(body).digest("base64url")
  );
}
export function verifyQuote(token: string) {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra)
    throw new AppError("Invalid estimate confirmation.");
  const expected = createHmac("sha256", signingKey()).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    throw new AppError("Estimate confirmation was modified.", 403);
  const quote = JSON.parse(Buffer.from(body, "base64url").toString()) as Quote;
  if (quote.expires < Date.now())
    throw new AppError("Estimate expired. Preview the cost again.", 409);
  return quote;
}
