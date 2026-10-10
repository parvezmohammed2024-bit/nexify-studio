import "server-only";
import { adminDb } from "@/lib/supabase/server";
import { redact } from "@/lib/redact";
export async function recordProviderResponse(
  generation: string,
  phase: "submission" | "poll",
  response: unknown,
) {
  const secrets = [
    process.env.HF_API_KEY,
    process.env.HF_CREDENTIALS,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.LLM_API_KEY,
  ].filter((v): v is string => Boolean(v));
  const result = await adminDb()
    .from("provider_diagnostics")
    .insert({
      generation_id: generation,
      phase,
      payload: redact(response, secrets),
    });
  if (result.error)
    console.error(
      "Provider diagnostic persistence failed; inspect database configuration.",
    );
}
