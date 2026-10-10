import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcileJobs } from "@/lib/server/jobs";
import { failure } from "@/lib/server/http";
import { AppError } from "@/lib/domain";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new AppError("Cron secret is not configured.", 503);
    const actual = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new AppError("Unauthorized.", 401);
    return NextResponse.json({ processed: await reconcileJobs() });
  } catch (e) {
    return failure(e);
  }
}
