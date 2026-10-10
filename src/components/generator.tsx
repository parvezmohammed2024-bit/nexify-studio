"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ImagePlus,
  Clapperboard,
  ArrowRight,
  Sparkles,
  Upload,
  ScanLine,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useStudio, api } from "./studio-context";
import { Heading, Field, Note, Status, SectionTitle } from "./shared";
import { Button } from "./ui/button";
import { AssetPreview, AssetGrid } from "./library";
import type { GenerationInput, Operation, Pricing } from "@/lib/types";
import { usd, myr } from "@/lib/utils";
export const imagePresets = [
  "Luxury product advertising",
  "Cosmetics photography",
  "Fashion editorial",
  "E-commerce product photography",
  "Food and beverage",
  "Corporate advertising",
  "Lifestyle photography",
  "Social media campaign",
  "Minimal studio background",
];
export const motionPresets = [
  "Slow cinematic zoom",
  "Dolly in",
  "Dolly out",
  "Pan left",
  "Pan right",
  "Orbit around subject",
  "Handheld movement",
  "Product rotation",
  "Ambient movement",
  "Custom motion",
];
interface Quote {
  estimated_micros: number;
  maximum_micros: number;
  available_micros: number;
  after_micros: number;
  client_available_micros: number | null;
  pricing: Pricing;
  token: string;
}
export function Generator({
  kind = "image",
  scenePrompt,
  sceneProject,
  sceneOriginal,
  onSubmitted,
}: {
  kind?: "image" | "video" | "b-roll";
  scenePrompt?: string;
  sceneProject?: string;
  sceneOriginal?: string;
  onSubmitted?: (id: string) => void;
}) {
  const { data, refresh, notify, currentProject, setCurrentProject } =
    useStudio();
  const params = useSearchParams();
  const duplicate = data.generations.find(
    (g) => g.id === params.get("duplicate"),
  );
  const initial = duplicate?.input_config as
    Partial<GenerationInput> | undefined;
  const initialOperation: Operation =
    initial?.operation ||
    (kind === "image"
      ? "text-to-image"
      : kind === "video"
        ? "image-to-video"
        : "text-to-video");
  const requestedModel =
    initial?.model_id ||
    (kind === "image"
      ? data.settings.default_image_model
      : data.settings.default_video_model);
  const startingModel = data.models.find(
    (m) => m.id === requestedModel && m.operation === initialOperation,
  );
  const [operation, setOperation] = useState<Operation>(initialOperation);
  const [project, setProject] = useState(
    initial?.project_id ||
      sceneProject ||
      params.get("project") ||
      currentProject ||
      "",
  );
  const [modelId, setModel] = useState(startingModel?.id || "");
  const [prompt, setPrompt] = useState(initial?.prompt || scenePrompt || "");
  const [original, setOriginal] = useState(
    initial?.original_prompt || sceneOriginal || "",
  );
  const [ratio, setRatio] = useState(
    initial?.aspect_ratio || startingModel?.aspect_ratios[0] || "",
  );
  const [resolution, setResolution] = useState(
    initial?.resolution || startingModel?.resolutions[0] || "",
  );
  const [duration, setDuration] = useState(
    initial?.duration || startingModel?.durations[0] || 0,
  );
  const [outputs, setOutputs] = useState(initial?.outputs || 1);
  const [audio, setAudio] = useState(
    initial?.audio ?? startingModel?.defaults.generate_audio === true,
  );
  const [seed, setSeed] = useState(initial?.seed?.toString() || "");
  const [negative, setNegative] = useState(initial?.negative_prompt || "");
  const [assetIds, setAssets] = useState<string[]>(
    initial?.asset_ids || (params.get("source") ? [params.get("source")!] : []),
  );
  const [preset, setPreset] = useState("");
  const [preserve, setPreserve] = useState(false);
  const [advanced, setAdvanced] = useState(
    initial?.advanced ? JSON.stringify(initial.advanced) : "{}",
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState("");
  const [jobId, setJob] = useState("");
  const [idempotency, setIdempotency] = useState("");
  const model = data.models.find((m) => m.id === modelId);
  const models = data.models.filter((m) => m.operation === operation);
  const job = data.generations.find((g) => g.id === jobId);
  const jobAssets = data.assets.filter((a) => a.generation_id === jobId);
  const capable = Boolean(
    model?.available && model.verification_status === "verified",
  );
  useEffect(() => {
    let active = true;
    if (!jobId) return;
    const timer = setInterval(() => {
      refresh().catch((e) => {
        if (active) notify(e.message, true);
      });
    }, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, refresh, notify]);
  useEffect(() => {
    const draft = sessionStorage.getItem("nexify-prompt");
    if (!draft || duplicate || scenePrompt) return;
    Promise.resolve().then(() => {
      try {
        const value = JSON.parse(draft);
        setPrompt(value.prompt);
        if (
          kind === "video" &&
          ["image-to-video", "text-to-video"].includes(value.mode)
        ) {
          setOperation(value.mode as Operation);
          setModel("");
        }
        setOriginal(value.original || value.prompt);
        setNegative(value.negative_prompt || "");
        sessionStorage.removeItem("nexify-prompt");
      } catch {
        sessionStorage.removeItem("nexify-prompt");
      }
    });
  }, [duplicate, scenePrompt, kind]);
  function edit(fn: () => void) {
    setQuote(null);
    setIdempotency("");
    fn();
  }
  function selectModel(id: string) {
    const m = data.models.find((m) => m.id === id);
    edit(() => {
      setModel(id);
      setRatio(m?.aspect_ratios[0] || "");
      setResolution(m?.resolutions[0] || "");
      setDuration(m?.durations[0] || 0);
      setOutputs(1);
      setAudio(m?.defaults.generate_audio === true);
      setSeed("");
      setNegative("");
      setAdvanced("{}");
    });
  }
  function getInput(): GenerationInput {
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(advanced);
      if (!settings || Array.isArray(settings) || typeof settings !== "object")
        throw new Error();
    } catch {
      throw new Error("Advanced settings must be a JSON object.");
    }
    const final = [
      prompt,
      preset
        ? kind === "image"
          ? `Art direction: ${preset}.`
          : `Camera direction: ${preset}.`
        : "",
      preserve
        ? "Keep the reference product shape, existing label, and brand colors consistent; do not invent or replace label text."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      project_id: project,
      model_id: modelId,
      operation,
      original_prompt: original || prompt,
      prompt: final,
      ...(ratio ? { aspect_ratio: ratio } : {}),
      ...(resolution ? { resolution } : {}),
      ...(duration ? { duration } : {}),
      outputs,
      ...(model?.audio ? { audio } : {}),
      ...(seed && model?.field_map.seed ? { seed: Number(seed) } : {}),
      ...(negative && model?.field_map.negative_prompt
        ? { negative_prompt: negative }
        : {}),
      asset_ids: assetIds,
      advanced: settings,
    };
  }
  async function preview() {
    setBusy("estimate");
    setQuote(null);
    try {
      const result = await api<Quote>("/api/estimate", getInput());
      setQuote(result);
      setIdempotency(crypto.randomUUID());
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function submit() {
    if (!quote || !idempotency) return;
    setBusy("generate");
    try {
      const result = await api<{ id: string }>("/api/generations", {
        input: getInput(),
        quote: quote.token,
        idempotency_key: idempotency,
      });
      setJob(result.id);
      await refresh();
      setQuote(null);
      onSubmitted?.(result.id);
      notify(
        "Generation recorded. Open history to follow its real provider status.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function upload(file: File) {
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      if (project) form.append("project_id", project);
      const result = await api<{ id: string }>("/api/upload", form);
      edit(() => setAssets([...assetIds, result.id]));
      await refresh();
      notify("Reference uploaded.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  const title =
    kind === "image"
      ? "From imagination to image."
      : kind === "video"
        ? "Give your visuals a little life."
        : "Bring your scene to the screen.";
  const globalBudget = data.budgets.find((b) => b.client_id === null);
  const clientBudget = data.budgets.find(
    (b) =>
      b.client_id === data.projects.find((p) => p.id === project)?.client_id,
  );
  const blockedBudget = Boolean(
    quote &&
    ((quote.after_micros < 0 && globalBudget?.hard_stop) ||
      (quote.client_available_micros !== null &&
        quote.client_available_micros < quote.maximum_micros &&
        clientBudget?.hard_stop)),
  );
  return (
    <>
      {kind !== "b-roll" && (
        <Heading
          eyebrow={kind === "image" ? "Image studio" : "Video studio"}
          title={title}
          description={
            kind === "image"
              ? "Craft campaign-ready visuals with a prompt and a point of view."
              : "Transform a still image into a cinematic moment."
          }
        >
          <span className="pill">
            <ShieldCheck size={12} />
            Cost confirmation required
          </span>
        </Heading>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="panel">
          <SectionTitle
            title={
              kind === "image" ? "Create your visual" : "Direct your motion"
            }
            detail="Your brief, your creative direction"
          />
          <div className="space-y-5 p-5">
            <div className="flex rounded-lg bg-background p-1">
              {(kind === "image"
                ? [
                    { id: "text-to-image", label: "Text to image" },
                    { id: "image-edit", label: "Image editing" },
                  ]
                : kind === "video"
                  ? [
                      { id: "image-to-video", label: "Image to video" },
                      { id: "text-to-video", label: "Text to video" },
                    ]
                  : [
                      { id: "text-to-video", label: "Scene to video" },
                      { id: "image-to-video", label: "Reference to video" },
                    ]
              ).map((o) => (
                <button
                  key={o.id}
                  aria-pressed={operation === o.id}
                  onClick={() =>
                    edit(() => {
                      setOperation(o.id as Operation);
                      setModel("");
                    })
                  }
                  className={`flex-1 rounded-md py-2 text-xs ${operation === o.id ? "bg-secondary text-white" : "text-muted-foreground"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Field label="Client / project">
              <select
                className="field"
                value={project}
                onChange={(e) =>
                  edit(() => {
                    setProject(e.target.value);
                    setCurrentProject(e.target.value);
                  })
                }
              >
                <option value="">Select a project</option>
                {data.projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {data.clients.find((c) => c.id === p.client_id)?.name} /{" "}
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            {operation === "image-to-video" ||
            operation === "image-edit" ||
            model?.field_map.asset_urls ? (
              <div>
                <Field
                  label={kind === "image" ? "Reference images" : "Source image"}
                >
                  <select
                    className="field"
                    value={assetIds[0] || ""}
                    onChange={(e) =>
                      edit(() =>
                        setAssets(e.target.value ? [e.target.value] : []),
                      )
                    }
                  >
                    <option value="">Choose from your library</option>
                    {data.assets
                      .filter((a) => a.kind === "image" && !a.archived)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  <Upload size={15} />
                  {busy === "upload"
                    ? "Uploading…"
                    : "Or upload a reference image"}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!data.configured || Boolean(busy)}
                    onChange={(e) => {
                      if (e.target.files?.[0]) void upload(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {assetIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assetIds.map((id) => {
                      const a = data.assets.find((a) => a.id === id);
                      return a ? (
                        <button
                          key={id}
                          className="pill"
                          onClick={() =>
                            edit(() =>
                              setAssets(assetIds.filter((v) => v !== id)),
                            )
                          }
                        >
                          {a.name} ×
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            ) : null}
            <Field
              label={
                kind === "image"
                  ? "Describe your vision"
                  : "Describe the motion"
              }
              hint="Write naturally. Add a subject, setting, light, and the feeling you want."
            >
              <textarea
                className="field min-h-36 leading-6"
                placeholder={
                  kind === "image"
                    ? "A perfume bottle on dark stone, dramatic warm lighting, a quiet sense of luxury…"
                    : "A slow, cinematic camera move toward the subject, with soft ambient movement…"
                }
                value={prompt}
                onChange={(e) =>
                  edit(() => {
                    setPrompt(e.target.value);
                    setOriginal(e.target.value);
                  })
                }
              />
            </Field>
            <Link
              href="/prompt-engineer"
              className="flex items-center gap-2 text-xs text-orange-400"
            >
              <Sparkles size={13} />
              Need a stronger prompt? Open Prompt Engineer
              <ArrowRight size={12} />
            </Link>
            <Field
              label={
                kind === "image" ? "Creative preset" : "Camera motion preset"
              }
            >
              <select
                className="field"
                value={preset}
                onChange={(e) => edit(() => setPreset(e.target.value))}
              >
                <option value="">Custom creative direction</option>
                {(kind === "image" ? imagePresets : motionPresets).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            {kind === "image" && (
              <label className="flex items-start gap-3 text-xs leading-5 text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-1 accent-orange-500"
                  checked={preserve}
                  onChange={(e) => edit(() => setPreserve(e.target.checked))}
                />
                Request product shape, label, and brand-color consistency. Exact
                preservation is model dependent and cannot be guaranteed.
              </label>
            )}
            <Field label="Generation model">
              <select
                className="field"
                value={modelId}
                onChange={(e) => selectModel(e.target.value)}
              >
                <option value="">Select a verified model</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.available && m.verification_status === "verified"
                      ? ""
                      : " · awaiting verification"}
                  </option>
                ))}
              </select>
            </Field>
            {!models.length && (
              <Note tone="slate">
                No model is registered for this workflow yet. An administrator
                can add one in Settings after verifying the official
                documentation.
              </Note>
            )}
            {model && !capable && (
              <Note>
                This model’s route or pricing is not fully verified. Chargeable
                requests are disabled.
              </Note>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Aspect ratio">
                <select
                  disabled={!model?.aspect_ratios.length}
                  className="field"
                  value={ratio}
                  onChange={(e) => edit(() => setRatio(e.target.value))}
                >
                  <option value="">
                    {model?.aspect_ratios.length
                      ? "Select ratio"
                      : "Provider default"}
                  </option>
                  {model?.aspect_ratios.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Resolution">
                <select
                  disabled={!model?.resolutions.length}
                  className="field"
                  value={resolution}
                  onChange={(e) => edit(() => setResolution(e.target.value))}
                >
                  <option value="">
                    {model?.resolutions.length
                      ? "Select resolution"
                      : "Provider default"}
                  </option>
                  {model?.resolutions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {kind === "image" ? (
                <Field label="Number of outputs">
                  <select
                    className="field"
                    value={outputs}
                    disabled={!model?.field_map.outputs}
                    onChange={(e) =>
                      edit(() => setOutputs(Number(e.target.value)))
                    }
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "image" : "images"}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Duration">
                  <select
                    className="field"
                    value={duration}
                    disabled={!model?.durations.length}
                    onChange={(e) =>
                      edit(() => setDuration(Number(e.target.value)))
                    }
                  >
                    <option value={0}>Provider default</option>
                    {model?.durations.map((d) => (
                      <option key={d} value={d}>
                        {d} seconds
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {kind !== "image" && (
                <Field label="Audio">
                  <select
                    className="field"
                    disabled={!model?.audio}
                    value={audio ? "on" : "off"}
                    onChange={(e) =>
                      edit(() => setAudio(e.target.value === "on"))
                    }
                  >
                    {(
                      model?.input_schema as {
                        properties?: Record<string, { const?: unknown }>;
                      }
                    )?.properties?.[model?.field_map.audio || ""]?.const !==
                      true && <option value="off">Off</option>}
                    <option value="on">On</option>
                  </select>
                </Field>
              )}
            </div>
            <details className="border-t border-border pt-4">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                Advanced model settings
              </summary>
              <div className="mt-4 space-y-4">
                {model?.field_map.seed && (
                  <Field label="Seed">
                    <input
                      className="field"
                      type="number"
                      min="0"
                      max="2147483647"
                      value={seed}
                      onChange={(e) => edit(() => setSeed(e.target.value))}
                    />
                  </Field>
                )}
                {model?.field_map.negative_prompt && (
                  <Field label="Negative prompt">
                    <textarea
                      className="field"
                      value={negative}
                      onChange={(e) => edit(() => setNegative(e.target.value))}
                    />
                  </Field>
                )}
                <Field
                  label="Verified optional fields (JSON)"
                  hint={`Allowed: ${model?.optional_fields.join(", ") || "None registered"}`}
                >
                  <textarea
                    className="field font-mono text-xs"
                    value={advanced}
                    onChange={(e) => edit(() => setAdvanced(e.target.value))}
                  />
                </Field>
              </div>
            </details>
            <Button
              variant="outline"
              className="w-full"
              onClick={preview}
              disabled={
                !data.configured ||
                !capable ||
                !project ||
                prompt.trim().length < 3 ||
                Boolean(busy)
              }
            >
              {busy === "estimate" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ScanLine />
              )}
              Preview generation cost
            </Button>
          </div>
        </div>
        <div className="space-y-5">
          <section className="panel overflow-hidden">
            <SectionTitle
              title={kind === "image" ? "Creative canvas" : "Motion preview"}
              detail="Your output will appear here"
            />
            <div className="grid-pattern flex min-h-[340px] flex-col items-center justify-center p-7">
              {jobAssets.length ? (
                <AssetGrid assets={jobAssets} />
              ) : job ? (
                <div className="text-center">
                  <Status status={job.status} />
                  <h3 className="mt-5 text-lg font-medium">
                    {job.status === "completed"
                      ? "Generation complete"
                      : job.status === "failed"
                        ? "Generation failed"
                        : job.status === "submission_unknown" ||
                            job.status === "needs_review"
                          ? "Administrator review required"
                          : "Your idea is in the making"}
                  </h3>
                  <p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground">
                    {job.error_metadata?.message
                      ? String(job.error_metadata.message)
                      : "Status is synchronized from the provider. No estimated progress percentage is shown."}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-5">
                    <Link href={`/generation-history?job=${job.id}`}>
                      View generation details
                    </Link>
                  </Button>
                </div>
              ) : assetIds[0] &&
                data.assets.find((a) => a.id === assetIds[0]) ? (
                <AssetPreview
                  asset={data.assets.find((a) => a.id === assetIds[0])!}
                  className="max-h-80 w-full rounded-xl object-contain"
                />
              ) : (
                <>
                  <div className="mb-5 flex size-20 items-center justify-center rounded-2xl border border-border bg-card shadow-xl">
                    {kind === "image" ? (
                      <ImagePlus size={34} className="text-orange-400" />
                    ) : (
                      <Clapperboard size={34} className="text-orange-400" />
                    )}
                  </div>
                  <h3 className="text-base font-medium">
                    {kind === "image"
                      ? "Your next great visual starts here"
                      : "A still image. A moving story."}
                  </h3>
                  <p className="mt-3 max-w-xs text-center text-xs leading-6 text-muted-foreground">
                    Set your creative direction, preview the cost, and confirm
                    when you’re ready.
                  </p>
                  <div className="mt-6 flex gap-2">
                    <span className="pill">PRIVATE ASSETS</span>
                    <span className="pill">BUDGET PROTECTED</span>
                  </div>
                </>
              )}
            </div>
          </section>
          <section className="panel surface">
            <SectionTitle
              title="Before you generate"
              detail="A clear view of the cost. Always."
            />
            <div className="p-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Estimated provider cost
                </span>
                <span className="text-2xl font-semibold">
                  {quote ? usd(quote.estimated_micros) : "—"}
                </span>
              </div>
              <div className="space-y-3 border-y border-border py-4 text-xs">
                {[
                  ["Model", model?.name || "Select a model"],
                  ["Outputs", String(outputs)],
                  ["Duration", duration ? `${duration}s` : "Provider default"],
                  ["Resolution", resolution || "Provider default"],
                  [
                    "MYR display",
                    quote
                      ? myr(
                          quote.estimated_micros,
                          Number(data.settings.usd_myr_rate),
                        )
                      : "—",
                  ],
                  [
                    "Maximum reservation",
                    quote ? usd(quote.maximum_micros) : "—",
                  ],
                  [
                    "Monthly available",
                    quote ? usd(quote.available_micros) : "—",
                  ],
                  [
                    "Available after reservation",
                    quote ? usd(quote.after_micros) : "—",
                  ],
                ].map(([label, value]) => (
                  <div className="flex justify-between gap-4" key={label}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-right">{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
                MYR uses the configured display rate of{" "}
                {data.settings.usd_myr_rate}; this is not a live exchange rate.
                Accounting and reservations are in USD.
              </p>
              {quote && (
                <>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    {quote.pricing.kind === "exact"
                      ? "Verified pricing calculation"
                      : "Approximate estimate with verified maximum"}{" "}
                    · verified{" "}
                    {new Date(quote.pricing.verified_at).toLocaleString(
                      "en-MY",
                      { timeZone: "Asia/Kuala_Lumpur" },
                    )}
                  </p>
                  <a
                    href={quote.pricing.source}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-[11px] text-orange-400"
                  >
                    View pricing source ↗
                  </a>
                </>
              )}
              {blockedBudget && (
                <div className="mt-4">
                  <Note tone="red">
                    This reservation exceeds the studio or client hard spending
                    limit.
                  </Note>
                </div>
              )}
              <Button
                className="mt-5 w-full"
                disabled={!quote || blockedBudget || Boolean(busy)}
                onClick={submit}
              >
                {busy === "generate" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {busy === "generate"
                  ? "Submitting once…"
                  : quote
                    ? `Generate — Estimated Cost ${usd(quote.estimated_micros)}`
                    : "Preview cost to continue"}
              </Button>
              <p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">
                No generation starts until you confirm. Uncertain submissions
                are held for review.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
