import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, requireProject } from "@/lib/server/auth";
import { checkMutation, checked, failure, jsonBody } from "@/lib/server/http";
import { adminDb } from "@/lib/supabase/server";
import { AppError } from "@/lib/domain";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const { id } = await params;
    const { db } = await requireStaff();
    const job = checked(
      await db
        .from("generations")
        .select("id,client_id,status")
        .eq("id", z.uuid().parse(id))
        .single(),
    );
    if (!job) throw new AppError("Job access denied.", 403);
    const values = z
      .object({
        archived: z.boolean().optional(),
        project_id: z.uuid().optional(),
      })
      .strict()
      .parse(await jsonBody(request));
    if (values.project_id) {
      const { project } = await requireProject(values.project_id);
      if (project.client_id !== job.client_id)
        throw new AppError(
          "Jobs can only move between projects for the same client. Accounting retains the original project.",
        );
    }
    checked(await adminDb().from("generations").update(values).eq("id", id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
