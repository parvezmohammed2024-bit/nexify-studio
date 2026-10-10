import "server-only";
import { z } from "zod";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { AppError } from "@/lib/domain";
import type { GenerationInput, Model } from "@/lib/types";
// REST contract verified against the official SDK's v2 client and README.
// Never use SDK default retries for chargeable POSTs.
const responseSchema = z
  .object({
    request_id: z.string().min(1).max(200),
    status: z.enum([
      "queued",
      "in_progress",
      "completed",
      "failed",
      "nsfw",
      "canceled",
    ]),
    images: z
      .array(z.object({ url: z.url() }))
      .max(4)
      .optional(),
    video: z.object({ url: z.url() }).optional(),
  })
  .passthrough();
export type ProviderResponse = z.infer<typeof responseSchema>;
export class SubmissionError extends AppError {
  constructor(
    message: string,
    public outcome: "rejected" | "unknown",
    public httpStatus?: number,
  ) {
    super(message, 502, "PROVIDER_SUBMISSION");
  }
}
export function buildPayload(
  model: Model,
  input: GenerationInput,
  imageUrls: string[],
) {
  if (!model.available || model.verification_status !== "verified")
    throw new AppError("Model has not been fully verified.", 409);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(model.endpoint) ||
    model.endpoint.includes("..")
  )
    throw new AppError("Unsafe provider endpoint.");
  const payload: Record<string, unknown> = { ...model.defaults };
  const values: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspect_ratio,
    resolution: input.resolution,
    duration: input.duration,
    outputs: input.outputs,
    audio: input.audio,
    seed: input.seed,
    negative_prompt: input.negative_prompt,
  };
  for (const [key, value] of Object.entries(values)) {
    const target = model.field_map[key];
    if (target && value !== undefined) payload[target] = value;
  }
  if (!model.field_map.prompt)
    throw new AppError("Verified model requires a prompt field mapping.");
  if (imageUrls.length) {
    const target = model.field_map.asset_urls;
    if (!target) throw new AppError("Reference images are unsupported.");
    // Explicit encodings from official per-model documentation; never guess a shape.
    const encoding = model.field_map.asset_encoding;
    if (encoding === "image_url_objects")
      payload[target] = imageUrls.map((image_url) => ({
        type: "image_url",
        image_url,
      }));
    else if (encoding === "url_array") payload[target] = imageUrls;
    else if (encoding === "single_url" && imageUrls.length === 1)
      payload[target] = imageUrls[0];
    else if (encoding === "single_image_object" && imageUrls.length === 1)
      payload[target] = { type: "image_url", image_url: imageUrls[0] };
    else
      throw new AppError(
        "Reference input encoding is not verified for this model.",
      );
  }
  const allowed = new Set([...model.required_fields, ...model.optional_fields]);
  for (const [key, value] of Object.entries(input.advanced)) {
    if (
      !allowed.has(key) ||
      key in payload ||
      ["__proto__", "constructor", "prototype"].includes(key)
    )
      throw new AppError(`Unsupported or conflicting advanced setting: ${key}`);
    payload[key] = value;
  }
  if (!Object.keys(model.input_schema).length)
    throw new AppError("A verified model input schema is required.");
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile({
    ...model.input_schema,
    additionalProperties: false,
  });
  if (!validate(payload))
    throw new AppError(
      "Model input validation failed: " + ajv.errorsText(validate.errors),
    );
  return payload;
}
function credentials() {
  const value = process.env.HF_API_KEY || process.env.HF_CREDENTIALS;
  if (!value)
    throw new AppError(
      "Higgsfield credentials are not configured.",
      503,
      "NOT_CONFIGURED",
    );
  return value;
}
export interface GenerationProvider {
  submit(
    model: Model,
    payload: Record<string, unknown>,
  ): Promise<ProviderResponse>;
  poll(requestId: string): Promise<ProviderResponse>;
}
export const higgsfield: GenerationProvider = {
  async submit(model, payload) {
    const key = credentials();
    let response: Response;
    try {
      response = await fetch(`https://api.higgsfield.ai/${model.endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25_000),
        redirect: "error",
      });
    } catch {
      throw new SubmissionError(
        "Provider submission outcome is unknown. Reservation retained; do not resubmit.",
        "unknown",
      );
    }
    if (!response.ok) {
      const rejected = [400, 401, 403, 404, 422, 429].includes(response.status);
      throw new SubmissionError(
        rejected
          ? `Provider rejected submission (HTTP ${response.status}).`
          : `Provider returned HTTP ${response.status}; submission outcome is unknown.`,
        rejected ? "rejected" : "unknown",
        response.status,
      );
    }
    try {
      return responseSchema.parse(await response.json());
    } catch {
      throw new SubmissionError(
        "Provider response did not match the documented contract. Reservation retained.",
        "unknown",
      );
    }
  },
  async poll(requestId) {
    const response = await fetch(
      `https://api.higgsfield.ai/requests/${encodeURIComponent(requestId)}/status`,
      {
        headers: { Authorization: `Key ${credentials()}` },
        signal: AbortSignal.timeout(12_000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new AppError(
        `Status polling failed (HTTP ${response.status}).`,
        502,
        "PROVIDER_POLL",
      );
    return responseSchema.parse(await response.json());
  },
};
export function providerStatus(status: ProviderResponse["status"]) {
  return status === "in_progress"
    ? "running"
    : status === "completed"
      ? "storing"
      : status === "nsfw" || status === "canceled"
        ? "failed"
        : status;
}
export function mediaUrls(response: ProviderResponse) {
  return [
    ...(response.images?.map((i) => i.url) || []),
    ...(response.video ? [response.video.url] : []),
  ];
}
// Do not persist signed URLs or arbitrary unknown provider fields into client-visible rows.
export function diagnostics(response: ProviderResponse) {
  return {
    request_id: response.request_id,
    status: response.status,
    image_count: response.images?.length || 0,
    has_video: Boolean(response.video),
  };
}
