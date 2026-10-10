import { NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireStaff, requireProject } from "@/lib/server/auth";
import { checkOrigin, checked, failure } from "@/lib/server/http";
import { adminDb } from "@/lib/supabase/server";
import { limitedBody, sniffMedia } from "@/lib/server/media";
import { AppError } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, user } = await requireStaff();
    const settings = checked(
      await db
        .from("app_settings")
        .select("upload_limit_mb")
        .eq("id", true)
        .single(),
    );
    const max = settings.upload_limit_mb * 1024 * 1024;
    const buffer = await limitedBody(request, max + 16_384);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") || "" },
      body: buffer,
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > max)
      throw new AppError("Select a file within the configured upload limit.");
    const projectId = form.get("project_id");
    let clientId: string | null = null;
    if (projectId) {
      const context = await requireProject(z.uuid().parse(projectId));
      clientId = context.project.client_id;
    }
    let content = Buffer.from(await file.arrayBuffer());
    const media = sniffMedia(content);
    if (media.kind !== "image")
      throw new AppError(
        "Reference uploads support JPEG, PNG, or WebP images.",
        415,
      );
    if (file.type !== media.mime)
      throw new AppError("File content does not match its declared type.", 415);
    try {
      const image = sharp(content, { limitInputPixels: 40_000_000 });
      const meta = await image.metadata();
      if (!meta.width || !meta.height || (meta.pages || 1) > 1)
        throw new Error("Unsupported image");
      // Decode fully, normalize orientation, and remove EXIF before sharing a reference externally.
      const normalized = image.rotate();
      content = await (
        media.mime === "image/jpeg"
          ? normalized.jpeg({ quality: 95 })
          : media.mime === "image/webp"
            ? normalized.webp({ quality: 95 })
            : normalized.png()
      ).toBuffer();
    } catch {
      throw new AppError(
        "Reference image could not be decoded safely. Animated or oversized-pixel images are not accepted.",
        415,
      );
    }
    if (content.length > max)
      throw new AppError(
        "Normalized image exceeds the configured upload limit.",
        413,
      );
    const id = randomUUID();
    const path = `${user.id}/uploads/${id}.${media.extension}`;
    const admin = adminDb();
    checked(
      await admin.storage
        .from("studio-assets")
        .upload(path, content, { contentType: media.mime, upsert: false }),
    );
    const result = await admin
      .from("generation_assets")
      .insert({
        id,
        user_id: user.id,
        client_id: clientId,
        project_id: projectId || null,
        storage_path: path,
        name:
          file.name.replace(/[^\w. -]/g, "").slice(0, 120) ||
          `reference.${media.extension}`,
        kind: media.kind,
        mime_type: media.mime,
        size_bytes: content.length,
      })
      .select("id")
      .single();
    if (result.error) {
      await admin.storage.from("studio-assets").remove([path]);
      checked(result);
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
