import { NextResponse } from "next/server";
import { z } from "zod";
import { generationSchema, estimateCost, AppError } from "@/lib/domain";
import { requireProject } from "@/lib/server/auth";
import { checkMutation, checked, failure, jsonBody } from "@/lib/server/http";
import { verifyQuote, inputHash } from "@/lib/server/quotes";
import { adminDb } from "@/lib/supabase/server";
import {
  buildPayload,
  higgsfield,
  SubmissionError,
  providerStatus,
  diagnostics,
} from "@/lib/providers/higgsfield";
import { recordProviderResponse } from "@/lib/server/provider-logs";
import { configurationState } from "@/lib/server/data";
import type { Model } from "@/lib/types";
export async function POST(request: Request) {
  try {
    checkMutation(request);
    const body = z
      .object({
        input: generationSchema,
        quote: z.string().max(4000),
        idempotency_key: z.uuid(),
      })
      .strict()
      .parse(await jsonBody(request));
    const { db, user } = await requireProject(body.input.project_id);
    const state = configurationState();
    if (!state.higgsfield || !state.cron || !state.media)
      throw new AppError("Generation infrastructure is not configured.", 503);
    const quote = verifyQuote(body.quote);
    const model = checked(
      await db
        .from("model_registry")
        .select("*")
        .eq("id", body.input.model_id)
        .single(),
    ) as Model;
    if (
      !model ||
      quote.user_id !== user.id ||
      quote.model_id !== model.id ||
      quote.model_updated_at !== model.updated_at ||
      quote.input_hash !== inputHash(body.input)
    )
      throw new AppError(
        "Inputs or model configuration changed. Preview the cost again.",
        409,
      );
    const estimate = estimateCost(model, body.input);
    if (estimate.maximum_micros !== quote.maximum_micros)
      throw new AppError("Pricing changed. Preview the cost again.", 409);
    const admin = adminDb();
    const urls: string[] = [];
    for (const id of body.input.asset_ids) {
      const asset = checked(
        await db
          .from("generation_assets")
          .select("storage_path,kind,archived")
          .eq("id", id)
          .single(),
      );
      if (!asset || asset.kind !== "image" || asset.archived)
        throw new AppError("Source image access denied.", 403);
      const signed = checked(
        await admin.storage
          .from("studio-assets")
          .createSignedUrl(asset.storage_path, 3600),
      );
      urls.push(signed.signedUrl);
    }
    const payload = buildPayload(model, body.input, urls);
    const jobId = checked(
      await admin.rpc("reserve_generation", {
        p_user: user.id,
        p_key: body.idempotency_key,
        p_project: body.input.project_id,
        p_model: model.id,
        p_type: body.input.operation,
        p_original: body.input.original_prompt,
        p_final: body.input.prompt,
        p_input: body.input,
        p_assets: body.input.asset_ids,
        p_estimate: estimate.maximum_micros,
        p_pricing: estimate.pricing,
      }),
    ) as string;
    // Compare-and-set is the submission claim; duplicate requests only observe existing jobs.
    const claim = checked(
      await admin
        .from("generations")
        .update({ status: "submitting", updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "reserved")
        .select("id"),
    );
    if (!claim.length) return NextResponse.json({ id: jobId, duplicate: true });
    try {
      const response = await higgsfield.submit(model, payload);
      checked(
        await admin
          .from("generations")
          .update({
            provider_request_id: response.request_id,
            status: providerStatus(response.status),
            provider_response: diagnostics(response),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("status", "submitting"),
      );
      await recordProviderResponse(jobId, "submission", response);
      if (["failed", "nsfw"].includes(response.status))
        checked(
          await admin.rpc("reconcile_cost", {
            p_generation: jobId,
            p_cost: 0,
            p_evidence:
              "Official provider returned failed/nsfw; SDK documentation states credits refunded.",
          }),
        );
    } catch (e) {
      // A DB failure after acceptance is also ambiguous. Never release its budget or resubmit.
      const rejected = e instanceof SubmissionError && e.outcome === "rejected";
      const update = await admin
        .from("generations")
        .update({
          status: rejected ? "failed" : "submission_unknown",
          error_metadata: {
            code: rejected ? "PROVIDER_REJECTED" : "SUBMISSION_UNKNOWN",
            message:
              e instanceof SubmissionError
                ? e.message
                : "Submission or persistence outcome is unknown. Administrator review required.",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "submitting");
      if (!update.error && rejected)
        await admin.rpc("reconcile_cost", {
          p_generation: jobId,
          p_cost: 0,
          p_evidence:
            "Provider rejected request before acceptance, HTTP " +
            (e as SubmissionError).httpStatus,
        });
    }
    return NextResponse.json({ id: jobId }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
