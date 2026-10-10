import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/domain";
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues.map((i) => i.message).join(" "),
        code: "VALIDATION",
      },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  console.error(
    "Studio operation failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return NextResponse.json(
    {
      error:
        "The operation failed. Check server diagnostics or contact an administrator.",
    },
    { status: 500 },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  const protocol =
    request.headers.get("x-forwarded-proto") ||
    new URL(request.url).protocol.replace(":", "");
  if (!origin || origin !== `${protocol}://${host}`)
    throw new AppError("Cross-origin mutation rejected.", 403, "FORBIDDEN");
}
export function checkMutation(request: Request) {
  checkOrigin(request);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 65_536) throw new AppError("Request is too large.", 413);
}
export async function jsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 65_536) throw new AppError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Invalid JSON body.");
  }
}
export function checked<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error)
    throw new AppError(
      "Database operation failed: " + result.error.message,
      409,
      "DATABASE",
    );
  return result.data as NonNullable<T>;
}
