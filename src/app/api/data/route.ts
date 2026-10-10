import { NextResponse } from "next/server";
import { loadStudio } from "@/lib/server/data";
import { failure } from "@/lib/server/http";
export async function GET() {
  try {
    return NextResponse.json(await loadStudio(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
