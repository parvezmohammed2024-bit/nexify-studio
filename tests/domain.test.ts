import { describe, it, expect } from "vitest";
import {
  estimateCost,
  budgetSummary,
  billingPeriod,
  assertRole,
  canTransition,
  generationSchema,
} from "@/lib/domain";
import type { Budget, Ledger, Reservation } from "@/lib/types";
import { model, input, now } from "./fixtures";
describe("pricing gates and integer USD accounting", () => {
  it("calculates the verified estimate and reserves the maximum", () => {
    expect(estimateCost(model, input, now)).toMatchObject({
      estimated_micros: 100_000,
      maximum_micros: 200_000,
    });
  });
  it("blocks unverified models", () => {
    expect(() =>
      estimateCost(
        { ...model, verification_status: "sdk-documented" },
        input,
        now,
      ),
    ).toThrow(/verification/);
  });
  it("blocks missing prices instead of inventing rates", () => {
    expect(() => estimateCost({ ...model, pricing: null }, input, now)).toThrow(
      /No verified/,
    );
  });
  it("blocks expired pricing", () => {
    expect(() => estimateCost(model, input, new Date("2026-10-17"))).toThrow(
      /seven days/,
    );
  });
  it("rejects future pricing timestamps", () => {
    expect(() => estimateCost(model, input, new Date("2026-10-01"))).toThrow(
      /verification/,
    );
  });
  it("rejects unsupported resolutions", () => {
    expect(() =>
      estimateCost(model, { ...input, resolution: "8K" }, now),
    ).toThrow(/Unsupported resolution/);
  });
  it("requires explicit advertised choices", () => {
    expect(() =>
      estimateCost(model, { ...input, aspect_ratio: undefined }, now),
    ).toThrow(/Select an aspect/);
  });
  it("does not pass unsupported batches, seeds or negative prompts", () => {
    expect(() => estimateCost(model, { ...input, outputs: 2 }, now)).toThrow(
      /one output/,
    );
    expect(() => estimateCost(model, { ...input, seed: 1 }, now)).toThrow(
      /seed/,
    );
    expect(() =>
      estimateCost(model, { ...input, negative_prompt: "test" }, now),
    ).toThrow(/Negative/);
  });
  it("rejects unsupported audio and reference workflows", () => {
    expect(() => estimateCost(model, { ...input, audio: true }, now)).toThrow(
      /audio/,
    );
    expect(() =>
      estimateCost(model, { ...input, asset_ids: [input.project_id] }, now),
    ).toThrow(/Reference/);
  });
  it("computes duration-based pricing only for supported durations", () => {
    const video = {
      ...model,
      operation: "text-to-video" as const,
      durations: [5],
      pricing: { ...model.pricing!, basis: "per-second" as const },
    };
    expect(
      estimateCost(
        video,
        { ...input, operation: "text-to-video", duration: 5 },
        now,
      ).maximum_micros,
    ).toBe(1_000_000);
    expect(() =>
      estimateCost(
        video,
        { ...input, operation: "text-to-video", duration: 10 },
        now,
      ),
    ).toThrow(/Unsupported duration/);
  });
  it("rejects malformed and extra input fields", () => {
    expect(
      generationSchema.safeParse({ ...input, user_id: "attacker" }).success,
    ).toBe(false);
    expect(generationSchema.safeParse({ ...input, outputs: -1 }).success).toBe(
      false,
    );
  });
});
describe("budgets, roles and state changes", () => {
  const budget = { client_id: null, monthly_limit_micros: 1_000_000 } as Budget;
  const ledger = [
    {
      billing_period: "2026-10-01",
      client_id: "client",
      amount_micros: 400_000,
    },
    {
      billing_period: "2026-09-01",
      client_id: "client",
      amount_micros: 900_000,
    },
  ] as Ledger[];
  const reservations = [
    {
      billing_period: "2026-09-01",
      client_id: "client",
      amount_micros: 300_000,
      released_at: null,
    },
    {
      billing_period: "2026-10-01",
      client_id: "client",
      amount_micros: 100_000,
      released_at: "released",
    },
  ] as Reservation[];
  it("includes previous-month unfinished reservations without old spending", () => {
    expect(
      budgetSummary(budget, ledger, reservations, "2026-10-01"),
    ).toMatchObject({
      spent: 400_000,
      reserved: 300_000,
      available: 300_000,
      warning: 70,
    });
  });
  it("isolates client-specific accounting", () => {
    expect(
      budgetSummary(
        { ...budget, client_id: "other" },
        ledger,
        reservations,
        "2026-10-01",
      ).available,
    ).toBe(1_000_000);
  });
  it("reports the 85% and 100% thresholds", () => {
    expect(
      budgetSummary(
        { ...budget, monthly_limit_micros: 800_000 },
        ledger,
        reservations,
        "2026-10-01",
      ).warning,
    ).toBe(85);
    expect(
      budgetSummary(
        { ...budget, monthly_limit_micros: 500_000 },
        ledger,
        reservations,
        "2026-10-01",
      ).warning,
    ).toBe(100);
  });
  it("uses a stable UTC billing period", () => {
    expect(billingPeriod(new Date("2026-11-01T00:01:00Z"))).toBe("2026-11-01");
  });
  it("enforces admin permissions", () => {
    expect(() => assertRole("creator", "admin")).toThrow(/Administrator/);
    expect(() => assertRole("admin", "admin")).not.toThrow();
  });
  it("rejects terminal-job resubmission and allows storage recovery", () => {
    expect(canTransition("completed", "submitting")).toBe(false);
    expect(canTransition("storing", "completed")).toBe(true);
    expect(canTransition("submitting", "submission_unknown")).toBe(true);
  });
});
