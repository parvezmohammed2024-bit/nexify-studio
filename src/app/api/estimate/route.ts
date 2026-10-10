import { NextResponse } from "next/server";
import { generationSchema, estimateCost, AppError } from "@/lib/domain";
import { requireProject } from "@/lib/server/auth";
import { checkMutation, checked, failure, jsonBody } from "@/lib/server/http";
import { inputHash, signQuote } from "@/lib/server/quotes";
import { buildPayload } from "@/lib/providers/higgsfield";
import { configurationState } from "@/lib/server/data";
import type { Model } from "@/lib/types";
export async function POST(request: Request) {
  try {
    checkMutation(request);
    const input = generationSchema.parse(await jsonBody(request));
    const { db, user } = await requireProject(input.project_id);
    const state = configurationState();
    if (!state.higgsfield || !state.cron || !state.media)
      throw new AppError(
        "Generation requires Higgsfield credentials, scheduled polling, and approved media hosts. Configure these before estimating.",
        503,
        "NOT_CONFIGURED",
      );
    const model = checked(
      await db
        .from("model_registry")
        .select("*")
        .eq("id", input.model_id)
        .single(),
    ) as Model;
    if (!model) throw new AppError("Model not found.", 404);
    const estimate = estimateCost(model, input);
    // Validate the exact provider shape before any budget reservation or submission.
    const assetRows = input.asset_ids.length
      ? checked(
          await db
            .from("generation_assets")
            .select("id,kind,archived")
            .in("id", input.asset_ids),
        )
      : [];
    if (
      assetRows.length !== input.asset_ids.length ||
      assetRows.some((a) => a.kind !== "image" || a.archived)
    )
      throw new AppError("A source image is missing or inaccessible.", 403);
    buildPayload(
      model,
      input,
      assetRows.map(() => "https://example.com/validated-reference.png"),
    );
    const report = checked(await db.rpc("studio_report"));
    const budget = report.budgets.find(
      (b: { client_id: string | null }) => b.client_id === null,
    );
    if (!budget)
      throw new AppError(
        "An administrator must set the monthly studio budget.",
        409,
      );
    const project = checked(
      await db
        .from("projects")
        .select("client_id")
        .eq("id", input.project_id)
        .single(),
    );
    const clientBudget = report.budgets.find(
      (b: { client_id: string | null }) => b.client_id === project.client_id,
    );
    const available =
      Number(budget.limit) - Number(budget.spent) - Number(budget.reserved);
    const clientAvailable = clientBudget
      ? Number(clientBudget.limit) -
        Number(clientBudget.spent) -
        Number(clientBudget.reserved)
      : null;
    const token = signQuote({
      user_id: user.id,
      model_id: model.id,
      model_updated_at: model.updated_at,
      input_hash: inputHash(input),
      maximum_micros: estimate.maximum_micros,
      expires: Date.now() + 300_000,
    });
    return NextResponse.json({
      ...estimate,
      available_micros: available,
      after_micros: available - estimate.maximum_micros,
      client_available_micros: clientAvailable,
      token,
      expires_in: 300,
    });
  } catch (e) {
    return failure(e);
  }
}
