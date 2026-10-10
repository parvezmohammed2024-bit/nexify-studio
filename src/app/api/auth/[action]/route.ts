import { NextResponse } from "next/server";
import { z } from "zod";
import { userDb } from "@/lib/supabase/server";
import { checkMutation, failure, jsonBody } from "@/lib/server/http";
import { AppError } from "@/lib/domain";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    checkMutation(request);
    const { action } = await params;
    const db = await userDb();
    if (action === "logout") {
      await db.auth.signOut();
      return NextResponse.json({ ok: true });
    }
    if (action !== "login") throw new AppError("Unknown action.", 404);
    const { email, password } = z
      .object({ email: z.email(), password: z.string().min(1).max(300) })
      .parse(await jsonBody(request));
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user)
      throw new AppError(
        "Sign-in failed. Check your credentials or contact your administrator.",
        401,
      );
    const profile = await db
      .from("profiles")
      .select("active")
      .eq("id", data.user.id)
      .single();
    if (!profile.data?.active) {
      await db.auth.signOut();
      throw new AppError(
        "Your account has not been provisioned as active staff.",
        403,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
