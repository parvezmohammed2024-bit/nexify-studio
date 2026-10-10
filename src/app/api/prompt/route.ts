import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { checkMutation, checked, failure, jsonBody } from "@/lib/server/http";
import { compatibleLlm } from "@/lib/providers/llm";
export async function POST(request: Request) {
  try {
    checkMutation(request);
    const { db, user } = await requireStaff();
    const input = z
      .object({
        prompt: z.string().trim().min(3).max(3000),
        mode: z.enum(["image", "image-to-video", "text-to-video", "b-roll"]),
        detail: z.enum(["short", "balanced", "detailed"]),
        client_id: z.uuid().optional(),
        model_id: z.uuid().optional(),
      })
      .strict()
      .parse(await jsonBody(request));
    // Service-scoped rate check: creators cannot read audit logs directly.
    const { adminDb } = await import("@/lib/supabase/server");
    const admin = adminDb();
    const brand = input.client_id
      ? checked(
          await db
            .from("brand_kits")
            .select("colors,guidelines,preferred_style")
            .eq("client_id", input.client_id)
            .maybeSingle(),
        )
      : null;
    const model = input.model_id
      ? checked(
          await db
            .from("model_registry")
            .select(
              "name,operation,optional_fields,field_map,verification_status",
            )
            .eq("id", input.model_id)
            .single(),
        )
      : null;
    checked(
      await admin.rpc("claim_prompt_request", {
        p_user: user.id,
        p_mode: input.mode,
      }),
    );
    const result = await compatibleLlm.enhance({
      ...input,
      brand,
      model,
      supportsNegative: Boolean(
        model?.verification_status === "verified" &&
        model?.field_map?.negative_prompt,
      ),
    });
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
