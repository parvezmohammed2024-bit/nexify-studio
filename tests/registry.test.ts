import { describe, it, expect } from "vitest";
import registry from "../docs/verified-models.json";
import type { Model, GenerationInput } from "@/lib/types";
import { estimateCost } from "@/lib/domain";
import { buildPayload } from "@/lib/providers/higgsfield";
describe("officially documented configuration registry", () => {
  for (const record of registry.filter(
    (m) => m.verification_status === "verified",
  )) {
    const model = {
      ...record,
      id: "11111111-1111-4111-8111-111111111111",
      updated_at: record.verified_at,
      provider: "higgsfield",
    } as unknown as Model;
    it(`constructs only the priced configuration: ${model.name}`, () => {
      const input: GenerationInput = {
        project_id: "22222222-2222-4222-8222-222222222222",
        model_id: model.id,
        operation: model.operation,
        original_prompt: "Test scene",
        prompt: "Test scene",
        aspect_ratio: model.aspect_ratios[0],
        resolution: model.resolutions[0],
        ...(model.durations[0] ? { duration: model.durations[0] } : {}),
        ...(model.audio ? { audio: true } : {}),
        outputs: 1,
        asset_ids:
          model.operation === "image-edit" ||
          model.operation === "image-to-video"
            ? ["33333333-3333-4333-8333-333333333333"]
            : [],
        advanced: {},
      };
      const cost = estimateCost(model, input, new Date(model.verified_at!));
      expect(cost.maximum_micros).toBe(
        model.operation.includes("video") ? 136_000 : 16_200,
      );
      const payload = buildPayload(
        model,
        input,
        input.asset_ids.map(() => "https://test.example/reference.png"),
      );
      expect(payload.prompt).toBe(input.prompt);
      if (model.operation.includes("video"))
        expect(payload).toMatchObject({
          duration: 2,
          resolution: "480p",
          aspect_ratio: "adaptive",
          generate_audio: true,
        });
      else
        expect(payload).toMatchObject({
          quality: "low",
          resolution: "1k",
          aspect_ratio: "auto",
          enhance_prompt: false,
        });
      // Cost-affecting fields cannot escape the verified price by using the advanced JSON editor.
      expect(() =>
        buildPayload(
          model,
          {
            ...input,
            advanced: model.operation.includes("video")
              ? { enable_thinking: true }
              : { quality: "high" },
          },
          input.asset_ids.map(() => "https://test.example/reference.png"),
        ),
      ).toThrow();
    });
  }
  it("preserves models whose schemas are documented but prices are unavailable", () => {
    expect(
      registry
        .filter((m) => m.pricing === null)
        .map((m) => m.provider_model_id),
    ).toEqual(["z-image/turbo", "higgsfield-ai/soul/v2/standard"]);
  });
});
