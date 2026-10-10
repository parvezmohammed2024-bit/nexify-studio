import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, requireProject } from "@/lib/server/auth";
import { checkMutation, checked, failure, jsonBody } from "@/lib/server/http";
import { adminDb } from "@/lib/supabase/server";
import { AppError } from "@/lib/domain";
async function accessible(id: string) {
  const { db, user } = await requireStaff();
  const asset = checked(
    await db
      .from("generation_assets")
      .select("*")
      .eq("id", z.uuid().parse(id))
      .single(),
  );
  if (!asset) throw new AppError("Asset not found or access denied.", 404);
  return { asset, db, user };
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { asset } = await accessible(id);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const signed = checked(
      await adminDb()
        .storage.from("studio-assets")
        .createSignedUrl(asset.storage_path, 300, {
          download: download ? asset.name : false,
        }),
    );
    if (download) return NextResponse.redirect(signed.signedUrl);
    return NextResponse.json(
      { url: signed.signedUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const { id } = await params;
    const { asset, user } = await accessible(id);
    const values = z
      .object({
        favorite: z.boolean().optional(),
        archived: z.boolean().optional(),
        project_id: z.uuid().optional(),
        name: z.string().trim().min(1).max(120).optional(),
      })
      .strict()
      .parse(await jsonBody(request));
    if (values.project_id) {
      await requireProject(values.project_id);
    }
    const admin = adminDb();
    const project = values.project_id
      ? checked(
          await admin
            .from("projects")
            .select("client_id")
            .eq("id", values.project_id)
            .single(),
        )
      : null;
    checked(
      await admin
        .from("generation_assets")
        .update({
          ...values,
          ...(project ? { client_id: project.client_id } : {}),
        })
        .eq("id", asset.id),
    );
    checked(
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "asset.updated",
        resource_id: asset.id,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
