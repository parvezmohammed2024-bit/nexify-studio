import "server-only";
import { supabaseConfigured } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { checked } from "./http";
import type { StudioData } from "@/lib/types";
export const defaultSettings = {
  usd_myr_rate: 4.5,
  default_image_model: null,
  default_video_model: null,
  upload_limit_mb: 20,
  max_concurrent_jobs: 4,
  brand_name: "Nexify Solution",
};
export interface Report {
  counts: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    review: number;
  };
  budgets: {
    id: string;
    client_id: string | null;
    limit: number;
    spent: number;
    reserved: number;
  }[];
  by_client: { id: string; name: string; amount: number }[];
  by_model: { name: string; count: number }[];
}
export const emptyReport: Report = {
  counts: { total: 0, completed: 0, failed: 0, running: 0, review: 0 },
  budgets: [],
  by_client: [],
  by_model: [],
};
export function configurationState() {
  return {
    supabase: supabaseConfigured(),
    higgsfield: Boolean(process.env.HF_API_KEY || process.env.HF_CREDENTIALS),
    llm: Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL),
    cron: Boolean(process.env.CRON_SECRET),
    media: Boolean(process.env.PROVIDER_MEDIA_HOSTS),
  };
}
export async function loadStudio(): Promise<{
  data: StudioData;
  report: Report;
}> {
  const integrations = configurationState();
  const empty: StudioData = {
    configured: false,
    profile: null,
    clients: [],
    projects: [],
    models: [],
    generations: [],
    assets: [],
    budgets: [],
    ledger: [],
    reservations: [],
    settings: defaultSettings,
    templates: [],
    staff: [],
    integrations,
  };
  if (!integrations.supabase) return { data: empty, report: emptyReport };
  const { db, profile } = await requireStaff();
  const results = await Promise.all([
    db.from("clients").select("*,brand_kits(*)").order("name").limit(500),
    db
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("model_registry").select("*").order("name"),
    db
      .from("generations")
      .select(
        "id,user_id,client_id,project_id,model_id,type,original_prompt,final_prompt,input_config,input_asset_ids,provider_request_id,status,estimated_micros,final_cost_micros,billing_period,error_metadata,created_at,updated_at,attempts,archived",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("generation_assets")
      .select(
        "id,generation_id,name,kind,project_id,client_id,favorite,archived,mime_type,size_bytes,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("budget_settings").select("*"),
    db
      .from("usage_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("budget_reservations")
      .select("*")
      .is("released_at", null)
      .limit(100),
    db.from("app_settings").select("*").eq("id", true).single(),
    db
      .from("prompt_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("profiles")
      .select("id,full_name,role,active")
      .order("full_name")
      .limit(100),
    db.rpc("studio_report"),
  ]);
  const [
    clients,
    projects,
    models,
    generations,
    assets,
    budgets,
    ledger,
    reservations,
    settings,
    templates,
    staff,
    report,
  ] = results.map(checked);
  return {
    data: {
      ...empty,
      configured: true,
      profile,
      clients,
      projects,
      models,
      generations,
      assets,
      budgets,
      ledger,
      reservations,
      settings,
      templates,
      staff,
    } as StudioData,
    report: report as Report,
  };
}
