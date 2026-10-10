import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/server";
import { checked } from "./http";
import {
  higgsfield,
  diagnostics,
  mediaUrls,
  providerStatus,
} from "@/lib/providers/higgsfield";
import { downloadMedia } from "./media";
import type { Generation } from "@/lib/types";
import { recordProviderResponse } from "./provider-logs";
import { AppError } from "@/lib/domain";
export async function processJob(job: Generation) {
  const admin = adminDb();
  if (!job.provider_request_id)
    throw new AppError("Provider request ID is missing.");
  try {
    const response = await higgsfield.poll(job.provider_request_id);
    if (response.request_id !== job.provider_request_id)
      throw new AppError("Provider request ID mismatch.");
    await recordProviderResponse(job.id, "poll", response);
    const update = {
      provider_response: diagnostics(response),
      updated_at: new Date().toISOString(),
      lease_until: null,
      next_poll_at: new Date(
        Date.now() + Math.min(300, 15 * 2 ** Math.min(job.attempts, 4)) * 1000,
      ).toISOString(),
    };
    if (
      Date.now() - new Date(job.created_at).getTime() > 24 * 3600_000 &&
      ["queued", "in_progress"].includes(response.status)
    ) {
      checked(
        await admin
          .from("generations")
          .update({
            ...update,
            status: "needs_review",
            error_metadata: {
              code: "STALE_JOB",
              message:
                "Provider has not returned a final outcome within 24 hours. Reservation retained for review.",
            },
          })
          .eq("id", job.id),
      );
      return;
    }
    if (job.status === "storing" && response.status !== "completed")
      throw new AppError(
        "Provider state regressed after completion. Retention will be retried without changing the original outcome.",
      );
    if (response.status === "completed") {
      const urls = mediaUrls(response);
      if (!urls.length)
        throw new AppError("Completed provider response has no media.");
      checked(
        await admin
          .from("generations")
          .update({
            ...update,
            status: "storing",
            lease_until: new Date(Date.now() + 90_000).toISOString(),
          })
          .eq("id", job.id),
      );
      for (const url of urls) {
        const hash = createHash("sha256")
          .update(url.split("?")[0])
          .digest("hex");
        const existing = checked(
          await admin
            .from("generation_assets")
            .select("id")
            .eq("generation_id", job.id)
            .eq("source_url_hash", hash),
        );
        if (existing.length) continue;
        const media = await downloadMedia(url);
        const path = `${job.user_id}/${job.id}/${hash}.${media.extension}`;
        checked(
          await admin.storage.from("studio-assets").upload(path, media.buffer, {
            contentType: media.mime,
            upsert: true,
          }),
        );
        checked(
          await admin.from("generation_assets").upsert(
            {
              generation_id: job.id,
              user_id: job.user_id,
              client_id: job.client_id,
              project_id: job.project_id,
              storage_path: path,
              name: `${job.type}-${job.id.slice(0, 8)}.${media.extension}`,
              kind: media.kind,
              mime_type: media.mime,
              size_bytes: media.buffer.length,
              source_url_hash: hash,
            },
            { onConflict: "generation_id,source_url_hash" },
          ),
        );
      }
      checked(
        await admin
          .from("generations")
          .update({
            ...update,
            status: "completed",
            completed_at: new Date().toISOString(),
            error_metadata: null,
          })
          .eq("id", job.id),
      );
      // SDK status response contains no confirmed USD charge. Hold reservation pending admin invoice reconciliation.
    } else {
      checked(
        await admin
          .from("generations")
          .update({
            ...update,
            status:
              job.status === "running" && response.status === "queued"
                ? "running"
                : providerStatus(response.status),
          })
          .eq("id", job.id),
      );
      if (["failed", "nsfw"].includes(response.status))
        checked(
          await admin.rpc("reconcile_cost", {
            p_generation: job.id,
            p_cost: 0,
            p_evidence:
              "Provider status confirms failed/nsfw; official SDK states credits refunded.",
          }),
        );
    }
  } catch (e) {
    const stale =
      Date.now() - new Date(job.created_at).getTime() > 24 * 3600_000;
    checked(
      await admin
        .from("generations")
        .update({
          lease_until: null,
          next_poll_at: new Date(
            Date.now() +
              Math.min(3600, 30 * 2 ** Math.min(job.attempts, 6)) * 1000,
          ).toISOString(),
          ...(stale ? { status: "needs_review" } : {}),
          error_metadata: {
            code: e instanceof AppError ? e.code : "RECONCILIATION_ERROR",
            message:
              e instanceof AppError
                ? e.message
                : "Polling or storage failed. Retry will retain the original request and reservation.",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id),
    );
  }
}
export async function reconcileJobs() {
  const admin = adminDb();
  // Interrupted pre-submit requests are conservative review cases. No automatic resubmission.
  checked(
    await admin
      .from("generations")
      .update({
        status: "needs_review",
        error_metadata: {
          code: "STALE_SUBMISSION",
          message:
            "Submission was interrupted. Verify provider account before resolving.",
        },
      })
      .in("status", ["reserved", "submitting"])
      .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString()),
  );
  const jobs = checked(
    await admin.rpc("claim_jobs", { p_limit: 2 }),
  ) as Generation[];
  await Promise.all(jobs.map(processJob));
  return jobs.length;
}
