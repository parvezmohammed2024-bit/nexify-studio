import { z } from "zod";
import type {
  JobStatus,
  Model,
  Role,
  Budget,
  Ledger,
  Reservation,
  GenerationInput,
} from "./types";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_REQUEST",
  ) {
    super(message);
  }
}
export function assertRole(role: Role, required: Role) {
  if (required === "admin" && role !== "admin")
    throw new AppError("Administrator access required.", 403, "FORBIDDEN");
}
export const generationSchema = z
  .object({
    project_id: z.uuid(),
    model_id: z.uuid(),
    operation: z.enum([
      "text-to-image",
      "image-edit",
      "image-to-video",
      "text-to-video",
    ]),
    original_prompt: z.string().trim().min(3).max(6000),
    prompt: z.string().trim().min(3).max(6000),
    aspect_ratio: z.string().max(30).optional(),
    resolution: z.string().max(30).optional(),
    duration: z.number().int().positive().max(120).optional(),
    outputs: z.number().int().min(1).max(4).default(1),
    audio: z.boolean().optional(),
    seed: z.number().int().min(0).max(2147483647).optional(),
    negative_prompt: z.string().max(3000).optional(),
    asset_ids: z.array(z.uuid()).max(5).default([]),
    advanced: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export const pricingSchema = z
  .object({
    basis: z.enum(["per-output", "per-second"]),
    rates_micros: z.record(
      z.string(),
      z.number().int().positive().max(1_000_000_000),
    ),
    kind: z.enum(["exact", "approximate"]),
    verified_at: z.iso.datetime(),
    source: z.url(),
    maximum_multiplier: z.number().min(1).max(10),
  })
  .strict();
export function estimateCost(
  model: Model,
  input: GenerationInput,
  now = new Date(),
) {
  if (
    !model.available ||
    model.verification_status !== "verified" ||
    !model.verified_at
  )
    throw new AppError(
      "This model awaits documentation and pricing verification.",
      409,
      "MODEL_UNVERIFIED",
    );
  if (model.operation !== input.operation)
    throw new AppError("Model operation does not match the workflow.");
  const pricing = pricingSchema.safeParse(model.pricing);
  if (!pricing.success)
    throw new AppError(
      "No verified pricing record. Generation is blocked.",
      409,
      "PRICE_UNAVAILABLE",
    );
  const age = now.getTime() - new Date(pricing.data.verified_at).getTime();
  if (age < -60_000 || age > 7 * 86400_000)
    throw new AppError(
      "Pricing verification is older than seven days. An administrator must refresh it.",
      409,
      "PRICE_EXPIRED",
    );
  if (input.aspect_ratio && !model.aspect_ratios.includes(input.aspect_ratio))
    throw new AppError("Unsupported aspect ratio.");
  if (input.resolution && !model.resolutions.includes(input.resolution))
    throw new AppError("Unsupported resolution.");
  if (model.aspect_ratios.length && !input.aspect_ratio)
    throw new AppError("Select an aspect ratio.");
  if (model.resolutions.length && !input.resolution)
    throw new AppError("Select a resolution.");
  if (model.durations.length && !input.duration)
    throw new AppError("Select a duration.");
  if (input.duration && !model.durations.includes(input.duration))
    throw new AppError("Unsupported duration.");
  if (input.audio && !model.audio)
    throw new AppError("This model does not support audio.");
  if (input.outputs !== 1 && !model.field_map.outputs)
    throw new AppError("This model supports one output per request.");
  if (input.seed !== undefined && !model.field_map.seed)
    throw new AppError("This model does not support a seed.");
  if (input.negative_prompt && !model.field_map.negative_prompt)
    throw new AppError("Negative prompts are not supported.");
  if (
    ["image-to-video", "image-edit"].includes(input.operation) &&
    !input.asset_ids.length
  )
    throw new AppError("A source image is required.");
  if (input.asset_ids.length && !model.field_map.asset_urls)
    throw new AppError("Reference images are not supported by this model.");
  const rate = pricing.data.rates_micros[input.resolution || "default"];
  if (!rate)
    throw new AppError(
      "The selected configuration has no verified price.",
      409,
      "PRICE_UNAVAILABLE",
    );
  if (pricing.data.basis === "per-second" && !input.duration)
    throw new AppError(
      "A verified duration is required for per-second pricing.",
    );
  const cost =
    rate *
    input.outputs *
    (pricing.data.basis === "per-second" ? input.duration! : 1);
  const maximum = Math.ceil(cost * pricing.data.maximum_multiplier);
  if (!Number.isSafeInteger(maximum))
    throw new AppError("Cost is out of range.");
  return {
    estimated_micros: cost,
    maximum_micros: maximum,
    pricing: pricing.data,
  };
}
export function budgetSummary(
  budget: Budget | undefined,
  ledger: Ledger[],
  reservations: Reservation[],
  period: string,
) {
  const matches = (client: string) =>
    !budget?.client_id || client === budget.client_id;
  const spent = ledger
    .filter((l) => l.billing_period === period && matches(l.client_id))
    .reduce((n, l) => n + Number(l.amount_micros), 0);
  const reserved = reservations
    .filter((r) => !r.released_at && matches(r.client_id))
    .reduce((n, r) => n + Number(r.amount_micros), 0);
  const limit = Number(budget?.monthly_limit_micros || 0);
  const utilization = limit ? ((spent + reserved) / limit) * 100 : 0;
  return {
    spent,
    reserved,
    limit,
    available: limit - spent - reserved,
    utilization,
    warning:
      utilization >= 100
        ? 100
        : utilization >= 85
          ? 85
          : utilization >= 70
            ? 70
            : null,
  };
}
export function billingPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7) + "-01";
}
const transitions: Record<JobStatus, JobStatus[]> = {
  reserved: ["submitting", "failed", "needs_review"],
  submitting: [
    "queued",
    "running",
    "storing",
    "failed",
    "submission_unknown",
    "needs_review",
  ],
  submission_unknown: ["needs_review", "queued", "failed"],
  queued: ["running", "storing", "failed", "needs_review"],
  running: ["storing", "failed", "needs_review"],
  storing: ["completed", "needs_review"],
  completed: [],
  failed: [],
  needs_review: ["queued", "failed"],
};
export function canTransition(from: JobStatus, to: JobStatus) {
  return from === to || transitions[from].includes(to);
}
