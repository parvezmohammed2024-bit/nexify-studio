export type Role = "admin" | "creator";
export type Operation =
  "text-to-image" | "image-edit" | "image-to-video" | "text-to-video";
export type JobStatus =
  | "reserved"
  | "submitting"
  | "submission_unknown"
  | "queued"
  | "running"
  | "storing"
  | "completed"
  | "failed"
  | "needs_review";
export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
}
export interface Client {
  id: string;
  name: string;
  industry?: string;
  logo_asset_id?: string | null;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
  brand_kits?: BrandKit[];
}
export interface BrandKit {
  colors: string[];
  guidelines: string;
  preferred_style: string;
  product_reference_ids: string[];
}
export interface Project {
  id: string;
  name: string;
  client_id: string;
  description: string;
  archived: boolean;
  created_at: string;
}
export interface Pricing {
  basis: "per-output" | "per-second";
  rates_micros: Record<string, number>;
  kind: "exact" | "approximate";
  verified_at: string;
  source: string;
  maximum_multiplier: number;
}
export interface Model {
  id: string;
  name: string;
  provider: "higgsfield";
  provider_model_id: string;
  endpoint: string;
  operation: Operation;
  aspect_ratios: string[];
  resolutions: string[];
  durations: number[];
  audio: boolean;
  required_fields: string[];
  optional_fields: string[];
  input_schema: Record<string, unknown>;
  field_map: Record<string, string>;
  defaults: Record<string, unknown>;
  pricing: Pricing | null;
  verification_status: "unverified" | "sdk-documented" | "verified";
  available: boolean;
  verification_source: string | null;
  verified_at: string | null;
  updated_at: string;
}
export interface Generation {
  id: string;
  user_id: string;
  client_id: string;
  project_id: string;
  model_id: string;
  type: string;
  original_prompt: string;
  final_prompt: string;
  input_config: Record<string, unknown>;
  input_asset_ids: string[];
  provider_request_id: string | null;
  status: JobStatus;
  estimated_micros: number;
  final_cost_micros: number | null;
  billing_period: string;
  error_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  attempts: number;
  archived: boolean;
}
export interface Asset {
  id: string;
  generation_id: string | null;
  name: string;
  kind: "image" | "video";
  project_id: string | null;
  client_id: string | null;
  favorite: boolean;
  archived: boolean;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  url?: string;
}
export interface Budget {
  id: string;
  client_id: string | null;
  monthly_limit_micros: number;
  hard_stop: boolean;
  warning_thresholds: number[];
}
export interface Ledger {
  generation_id: string;
  client_id: string;
  project_id: string;
  billing_period: string;
  amount_micros: number;
  evidence: string;
  created_at: string;
}
export interface Reservation {
  generation_id: string;
  client_id: string;
  billing_period: string;
  amount_micros: number;
  released_at: string | null;
}
export interface AppSettings {
  usd_myr_rate: number;
  default_image_model: string | null;
  default_video_model: string | null;
  upload_limit_mb: number;
  max_concurrent_jobs: number;
  brand_name: string;
}
export interface StudioData {
  configured: boolean;
  profile: Profile | null;
  clients: Client[];
  projects: Project[];
  models: Model[];
  generations: Generation[];
  assets: Asset[];
  budgets: Budget[];
  ledger: Ledger[];
  reservations: Reservation[];
  settings: AppSettings;
  templates: {
    id: string;
    name: string;
    mode: string;
    prompt: string;
    negative_prompt?: string;
  }[];
  staff: Profile[];
  integrations: {
    supabase: boolean;
    higgsfield: boolean;
    llm: boolean;
    cron: boolean;
    media: boolean;
  };
}
export interface GenerationInput {
  project_id: string;
  model_id: string;
  operation: Operation;
  original_prompt: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  outputs: number;
  audio?: boolean;
  seed?: number;
  negative_prompt?: string;
  asset_ids: string[];
  advanced: Record<string, unknown>;
}
