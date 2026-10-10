"use client";
import { useState } from "react";
import {
  ShieldCheck,
  ExternalLink,
  Plus,
  Save,
  Check,
  AlertCircle,
  Users,
  Plug,
  LockKeyhole,
  BookOpen,
} from "lucide-react";
import { useStudio, api } from "./studio-context";
import { Heading, Field, Note, SectionTitle } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { Model } from "@/lib/types";
const newModel = {
  name: "",
  provider_model_id: "",
  endpoint: "",
  operation: "text-to-image",
  aspect_ratios: [],
  resolutions: [],
  durations: [],
  audio: false,
  required_fields: ["prompt"],
  optional_fields: [],
  input_schema: {
    type: "object",
    properties: { prompt: { type: "string", minLength: 3, maxLength: 6000 } },
    required: ["prompt"],
    additionalProperties: false,
  },
  field_map: { prompt: "prompt" },
  defaults: {},
  pricing: null,
  available: false,
  verification_status: "unverified",
  verification_source: null,
  verified_at: null,
};
function editableModel(m: Model) {
  return Object.fromEntries(
    ["id", ...Object.keys(newModel)].map((k) => [
      k,
      (m as unknown as Record<string, unknown>)[k],
    ]),
  );
}
export function SettingsPage() {
  const { data, refresh, notify } = useStudio();
  const admin = data.profile?.role === "admin";
  const [settings, setSettings] = useState(data.settings);
  const [busy, setBusy] = useState("");
  const [registry, setRegistry] = useState(false);
  const [modelJson, setModelJson] = useState("");
  const [staff, setStaff] = useState({
    id: "",
    full_name: "",
    role: "creator",
    active: true,
  });
  const [requestId, setRequestId] = useState("");
  async function save(action: string, values: unknown) {
    setBusy(action);
    try {
      await api("/api/manage", { action, values });
      await refresh();
      notify(
        action === "connection"
          ? "Connection verified by a read-only request."
          : "Settings saved.",
      );
      if (action === "model") setRegistry(false);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  function openModel(m?: Model) {
    setModelJson(JSON.stringify(m ? editableModel(m) : newModel, null, 2));
    setRegistry(true);
  }
  const services = [
    {
      id: "supabase",
      name: "Supabase",
      description: "Authentication, database & private storage",
      present: data.integrations.supabase,
    },
    {
      id: "higgsfield",
      name: "Higgsfield",
      description: "Image & video generation · server-side REST",
      present: data.integrations.higgsfield,
    },
    {
      id: "llm",
      name: "Prompt enhancement",
      description: "Configurable OpenAI-compatible text provider",
      present: data.integrations.llm,
    },
    {
      id: "cron",
      name: "Job reconciliation",
      description: "Authenticated scheduled polling",
      present: data.integrations.cron,
    },
    {
      id: "media",
      name: "Media retention",
      description: "Approved exact output hostnames",
      present: data.integrations.media,
    },
  ];
  return (
    <>
      <Heading
        eyebrow="Studio settings"
        title="Make the studio work your way."
        description="Connect your providers, verify your models, and keep access under control."
      >
        <span className="pill">
          <ShieldCheck size={12} />
          SERVER-SIDE SECRETS
        </span>
      </Heading>
      {!data.configured && (
        <div className="mb-6">
          <Note>
            Set the variables in .env.local for local development or in Vercel’s
            environment settings. Apply the Supabase migrations and provision an
            administrator. This configuration view contains no live studio data.
          </Note>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel">
          <SectionTitle
            title="Connected services"
            detail="Configured bindings are not proof of live connectivity"
          />
          <div className="divide-y divide-border">
            {services.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-5">
                <div className="rounded-xl bg-secondary p-2.5 text-muted-foreground">
                  <Plug size={19} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">{s.name}</h3>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {s.description}
                  </p>
                </div>
                <span
                  className={`pill ml-auto shrink-0 ${s.present ? "text-emerald-300" : "text-amber-200"}`}
                >
                  {s.present ? <Check size={11} /> : <AlertCircle size={11} />}{" "}
                  {s.present ? "Configured" : "Not configured"}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-5">
            <p className="text-[11px] leading-6 text-muted-foreground">
              API credentials are stored in server environment variables, never
              in the database or browser. Connection testing never submits a
              generation.
            </p>
            {admin && (
              <div className="mt-4 space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => save("connection", { provider: "supabase" })}
                >
                  Test Supabase
                </Button>
                <div className="flex gap-2">
                  <input
                    className="field"
                    placeholder="Existing Higgsfield request ID"
                    aria-label="Request ID for read-only connection test"
                    value={requestId}
                    onChange={(e) => setRequestId(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!requestId || Boolean(busy)}
                    onClick={() =>
                      save("connection", {
                        provider: "higgsfield",
                        request_id: requestId,
                      })
                    }
                  >
                    Test polling
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <SectionTitle
            title="Workspace preferences"
            detail="Defaults and operating limits"
          />
          <div className="space-y-4 p-5">
            <Field label="Studio brand">
              <input
                className="field"
                disabled={!admin}
                value={settings.brand_name}
                onChange={(e) =>
                  setSettings({ ...settings, brand_name: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="USD / MYR display rate">
                <input
                  className="field"
                  type="number"
                  step="0.001"
                  min="0.001"
                  disabled={!admin}
                  value={settings.usd_myr_rate}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      usd_myr_rate: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Upload limit (MB)">
                <input
                  className="field"
                  type="number"
                  min="1"
                  max="50"
                  disabled={!admin}
                  value={settings.upload_limit_mb}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      upload_limit_mb: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Maximum concurrent studio jobs">
              <input
                className="field"
                type="number"
                min="1"
                max="20"
                disabled={!admin}
                value={settings.max_concurrent_jobs}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_concurrent_jobs: Number(e.target.value),
                  })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Default image model">
                <select
                  className="field"
                  disabled={!admin}
                  value={settings.default_image_model || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      default_image_model: e.target.value || null,
                    })
                  }
                >
                  <option value="">Select when generating</option>
                  {data.models
                    .filter(
                      (m) => m.operation === "text-to-image" && m.available,
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Default video model">
                <select
                  className="field"
                  disabled={!admin}
                  value={settings.default_video_model || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      default_video_model: e.target.value || null,
                    })
                  }
                >
                  <option value="">Select when generating</option>
                  {data.models
                    .filter(
                      (m) =>
                        ["image-to-video", "text-to-video"].includes(
                          m.operation,
                        ) && m.available,
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <p className="text-[10px] leading-5 text-muted-foreground">
              Display conversion is configured manually. Provider costs and
              budgets remain in USD. Warning thresholds are fixed at 70%, 85%,
              and 100%.
            </p>
            <Button
              disabled={!admin || Boolean(busy)}
              onClick={() =>
                save(
                  "settings",
                  Object.fromEntries(
                    [
                      "usd_myr_rate",
                      "default_image_model",
                      "default_video_model",
                      "upload_limit_mb",
                      "max_concurrent_jobs",
                      "brand_name",
                    ].map((k) => [k, settings[k as keyof typeof settings]]),
                  ),
                )
              }
            >
              <Save />
              Save preferences
            </Button>
          </div>
        </section>
      </div>
      <section className="panel mt-6">
        <SectionTitle
          title="Model registry"
          detail="Documented capabilities and prices, with explicit verification"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={!admin}
            onClick={() => openModel()}
          >
            <Plus />
            Register model
          </Button>
        </SectionTitle>
        {data.models.length ? (
          <div className="divide-y divide-border">
            {data.models.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div>
                  <h3 className="text-sm font-semibold">{m.name}</h3>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {m.provider_model_id} · {m.operation}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`pill ${m.verification_status === "verified" && m.available ? "text-emerald-300" : "text-amber-200"}`}
                  >
                    {m.verification_status === "verified"
                      ? "Verified"
                      : m.verification_status === "sdk-documented"
                        ? "SDK documented · pricing pending"
                        : "Unverified"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openModel(m)}
                  >
                    {admin ? "Configure" : "Inspect"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-xs leading-6 text-muted-foreground">
            Apply the Supabase migrations to install the SDK-documented model
            records. No chargeable route is enabled by default.
          </div>
        )}
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="panel">
          <SectionTitle
            title="Staff access"
            detail="Internal accounts · no public signup"
          />
          <div className="p-5">
            {data.staff.length > 0 && (
              <div className="mb-5 space-y-3">
                {data.staff.map((s) => (
                  <button
                    key={s.id}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left"
                    disabled={!admin}
                    onClick={() =>
                      setStaff({
                        id: s.id,
                        full_name: s.full_name,
                        role: s.role,
                        active: s.active,
                      })
                    }
                  >
                    <Users size={15} className="text-muted-foreground" />
                    <span className="text-xs">{s.full_name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {s.role} · {s.active ? "active" : "inactive"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {admin ? (
              <div className="space-y-4">
                <Note tone="slate">
                  Create or invite staff in Supabase Auth first. Provision their
                  user UUID here, then grant project access in Client Projects.
                </Note>
                <Field label="Supabase Auth user UUID">
                  <input
                    className="field font-mono text-xs"
                    value={staff.id}
                    onChange={(e) => setStaff({ ...staff, id: e.target.value })}
                  />
                </Field>
                <Field label="Full name">
                  <input
                    className="field"
                    value={staff.full_name}
                    onChange={(e) =>
                      setStaff({ ...staff, full_name: e.target.value })
                    }
                  />
                </Field>
                <div className="flex items-center gap-4">
                  <select
                    aria-label="Staff role"
                    className="field"
                    value={staff.role}
                    onChange={(e) =>
                      setStaff({ ...staff, role: e.target.value })
                    }
                  >
                    <option value="creator">Creator</option>
                    <option value="admin">Administrator</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                      checked={staff.active}
                      onChange={(e) =>
                        setStaff({ ...staff, active: e.target.checked })
                      }
                    />
                    Active
                  </label>
                </div>
                <Button
                  disabled={!staff.id || !staff.full_name || Boolean(busy)}
                  onClick={() => save("staff", staff)}
                >
                  Save staff access
                </Button>
              </div>
            ) : (
              <p className="text-xs leading-6 text-muted-foreground">
                Administrators provision staff and manage their roles. Creators
                only access projects they own or are assigned to.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <SectionTitle
            title="Privacy & production setup"
            detail="Before using real client materials"
          />
          <div className="space-y-5 p-5">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-semibold">
                <LockKeyhole size={15} className="text-orange-400" />
                Private by default
              </h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Assets are kept in a private Supabase bucket. Signed access
                links expire. Reference URLs are shared with the selected
                external generation provider to process your request.
              </p>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-xs font-semibold">
                <BookOpen size={15} className="text-orange-400" />
                Verify account-level policies
              </h3>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Review provider retention, training, licensing, and privacy
                terms for your account before uploading confidential client
                data. This application does not control an external provider’s
                training or retention settings.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: "Higgsfield docs",
                  url: "https://open.higgsfield.ai/quick-start",
                },
                {
                  label: "Model explorer",
                  url: "https://open.higgsfield.ai/explore",
                },
                { label: "Pricing", url: "https://open.higgsfield.ai/pricing" },
                {
                  label: "Terms",
                  url: "https://open.higgsfield.ai/terms-of-service",
                },
              ].map((l) => (
                <Button asChild variant="outline" size="sm" key={l.label}>
                  <a target="_blank" rel="noreferrer" href={l.url}>
                    {l.label}
                    <ExternalLink />
                  </a>
                </Button>
              ))}
            </div>
            <p className="text-[11px] leading-6 text-muted-foreground">
              Vercel’s one-minute polling schedule requires a plan that supports
              it. For local development, run the documented polling helper while
              the app is running.
            </p>
          </div>
        </section>
      </div>
      <Dialog open={registry} onOpenChange={setRegistry}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="text-lg font-semibold">
            Verified model configuration
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-6 text-muted-foreground">
            Only an administrator can edit. Verify every capability, input
            field, encoding, and pricing rule against official documentation.
            Pricing expires after seven days.
          </DialogDescription>
          <div className="my-4">
            <Note tone="slate">
              rates_micros contains verified USD microdollars for each
              resolution (or “default”). maximum_multiplier must represent a
              provider-supported safe maximum. Never enter a guessed rate.
            </Note>
          </div>
          <textarea
            className="field min-h-[420px] font-mono text-[11px] leading-5"
            aria-label="Model configuration JSON"
            readOnly={!admin}
            value={modelJson}
            onChange={(e) => setModelJson(e.target.value)}
          />
          {admin && (
            <Button
              className="mt-4"
              disabled={Boolean(busy)}
              onClick={() => {
                try {
                  const value = JSON.parse(modelJson);
                  void save("model", value);
                } catch {
                  notify("Model configuration is not valid JSON.", true);
                }
              }}
            >
              <Save />
              Save model configuration
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
