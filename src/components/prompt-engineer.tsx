"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Copy,
  ArrowRight,
  Bookmark,
  RefreshCw,
  Camera,
  Clapperboard,
  Megaphone,
  ArrowUpRight,
} from "lucide-react";
import { Heading, Field, Note, Empty, SectionTitle } from "./shared";
import { useStudio, api } from "./studio-context";
import { Button } from "./ui/button";
interface Option {
  style: "Realistic" | "Cinematic" | "Advertising";
  prompt: string;
  negative_prompt?: string;
}
export function PromptEngineer() {
  const { data, refresh, notify } = useStudio();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("image");
  const [detail, setDetail] = useState("balanced");
  const [client, setClient] = useState("");
  const [model, setModel] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  async function enhance() {
    setBusy(true);
    try {
      const result = await api<{ options: Option[] }>("/api/prompt", {
        prompt,
        mode,
        detail,
        ...(client ? { client_id: client } : {}),
        ...(model ? { model_id: model } : {}),
      });
      setOptions(result.options);
      notify("Three prompt directions are ready to edit.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Prompt copied.");
    } catch {
      notify(
        "Clipboard access is unavailable. Select and copy the text manually.",
        true,
      );
    }
  }
  async function save(option: Option) {
    try {
      await api("/api/manage", {
        action: "template",
        values: {
          name: `${option.style} · ${prompt.slice(0, 50)}`,
          mode,
          prompt: option.prompt,
          ...(option.negative_prompt
            ? { negative_prompt: option.negative_prompt }
            : {}),
        },
      });
      await refresh();
      notify("Prompt saved to your templates.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function send(value: string, negative_prompt?: string) {
    sessionStorage.setItem(
      "nexify-prompt",
      JSON.stringify({
        mode,
        prompt: value,
        original: prompt || value,
        negative_prompt,
      }),
    );
    router.push(
      mode === "image"
        ? "/image-studio"
        : mode === "b-roll"
          ? "/b-roll-studio"
          : "/video-studio",
    );
  }
  return (
    <>
      <Heading
        eyebrow="AI prompt engineer"
        title="Simple words. Exceptional direction."
        description="Turn a rough idea into a clear, production-ready creative brief."
      >
        <span className="pill">
          <Sparkles size={12} />
          YOUR CREATIVE COPILOT
        </span>
      </Heading>
      {!data.integrations.llm && (
        <div className="mb-6">
          <Note>
            Connect a text LLM provider to enable AI enhancement. Manual
            prompts, copy, saved templates, and studio handoff are available.
          </Note>
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[380px_1fr]">
        <section className="panel">
          <SectionTitle
            title="Start with your idea"
            detail="No perfect English needed"
          />
          <div className="space-y-5 p-5">
            <Field label="What would you like to create?">
              <textarea
                className="field min-h-48 leading-6"
                placeholder="Make my perfume bottle look expensive with water and nice lighting."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Creative mode">
                <select
                  className="field"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="image">Image</option>
                  <option value="image-to-video">Image to video</option>
                  <option value="text-to-video">Text to video</option>
                  <option value="b-roll">B-roll</option>
                </select>
              </Field>
              <Field label="Prompt length">
                <select
                  className="field"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                >
                  <option value="short">Short</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </Field>
            </div>
            <Field label="Client brand context">
              <select
                className="field"
                value={client}
                onChange={(e) => setClient(e.target.value)}
              >
                <option value="">No brand context</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target model">
              <select
                className="field"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">General creative direction</option>
                {data.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              className="w-full"
              disabled={
                !data.configured ||
                !data.integrations.llm ||
                prompt.trim().length < 3 ||
                busy
              }
              onClick={enhance}
            >
              {busy ? <RefreshCw className="animate-spin" /> : <Sparkles />}
              {busy
                ? "Refining your idea…"
                : options.length
                  ? "Regenerate options"
                  : "Enhance my prompt"}
            </Button>
            <p className="text-[10px] leading-5 text-muted-foreground">
              Enhancement uses your separate LLM provider and may incur
              text-provider charges. Image/video budget reservations do not
              cover LLM usage.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!prompt}
                onClick={() => copy(prompt)}
              >
                <Copy />
                Copy original
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!prompt}
                onClick={() => send(prompt)}
              >
                Use manual prompt
                <ArrowRight />
              </Button>
            </div>
          </div>
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Three ways to tell your story
            </h2>
            <span className="text-[10px] text-muted-foreground">
              EDIT · SAVE · CREATE
            </span>
          </div>
          <div className="space-y-4">
            {(["Realistic", "Cinematic", "Advertising"] as const).map(
              (style, i) => {
                const option = options.find((o) => o.style === style);
                const Icon = [Camera, Clapperboard, Megaphone][i];
                return (
                  <article key={style} className="panel p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span
                        className={`rounded-lg p-2 ${i === 0 ? "bg-sky-500/10 text-sky-300" : i === 1 ? "bg-violet-500/10 text-violet-300" : "bg-orange-500/10 text-orange-300"}`}
                      >
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">{style}</h3>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {
                            [
                              "Clean commercial photography",
                              "Camera, atmosphere, and dramatic light",
                              "A focused campaign composition",
                            ][i]
                          }
                        </p>
                      </div>
                      <span className="ml-auto text-[10px] text-slate-500">
                        0{i + 1}
                      </span>
                    </div>
                    {option ? (
                      <>
                        <textarea
                          aria-label={`${style} enhanced prompt`}
                          className="field min-h-28 leading-6"
                          value={option.prompt}
                          onChange={(e) =>
                            setOptions(
                              options.map((o) =>
                                o.style === style
                                  ? { ...o, prompt: e.target.value }
                                  : o,
                              ),
                            )
                          }
                        />
                        {option.negative_prompt && (
                          <Field label="Optional negative prompt">
                            <textarea
                              className="field mt-2"
                              value={option.negative_prompt}
                              onChange={(e) =>
                                setOptions(
                                  options.map((o) =>
                                    o.style === style
                                      ? {
                                          ...o,
                                          negative_prompt: e.target.value,
                                        }
                                      : o,
                                  ),
                                )
                              }
                            />
                          </Field>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copy(option.prompt)}
                          >
                            <Copy />
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => save(option)}
                          >
                            <Bookmark />
                            Save template
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-auto"
                            onClick={() =>
                              send(option.prompt, option.negative_prompt)
                            }
                          >
                            Send to studio
                            <ArrowUpRight />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-background/40 p-5 text-xs leading-6 text-muted-foreground">
                        {busy
                          ? "Your prompt is being refined by the configured text provider…"
                          : "Your enhanced direction will appear here once the LLM provider is connected and you enhance an idea."}
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </section>
      </div>
      <section className="panel mt-7">
        <SectionTitle
          title="Your prompt collection"
          detail="Saved directions, ready to use again"
        />
        {data.templates.length ? (
          <div className="grid gap-3 p-5 md:grid-cols-3">
            {data.templates.map((t) => (
              <button
                key={t.id}
                className="rounded-xl border border-border p-4 text-left hover:border-orange-500/40"
                onClick={() => {
                  setPrompt(t.prompt);
                  setMode(t.mode);
                  notify("Template loaded into the original prompt editor.");
                }}
              >
                <Bookmark size={16} className="text-orange-400" />
                <h3 className="mt-3 text-xs font-semibold">{t.name}</h3>
                <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-muted-foreground">
                  {t.prompt}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="Keep the directions you love"
            description="Save enhanced prompts as templates for your next campaign."
            icon={<Bookmark size={24} />}
          />
        )}
      </section>
    </>
  );
}
