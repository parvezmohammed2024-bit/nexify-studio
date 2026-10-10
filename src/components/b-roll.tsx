"use client";
import { useState, useEffect } from "react";
import {
  Film,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  Clapperboard,
  ListVideo,
} from "lucide-react";
import { Heading, Field, Note, SectionTitle } from "./shared";
import { useStudio, api } from "./studio-context";
import { Button } from "./ui/button";
import { Generator } from "./generator";
const categories = [
  "Product close-up",
  "Product reveal",
  "Workspace activity",
  "Restaurant and café",
  "Travel and tourism",
  "Fashion details",
  "Manufacturing",
  "Corporate office",
  "Nature and atmosphere",
  "Abstract cinematic backgrounds",
];
interface Scene {
  id: string;
  title: string;
  prompt: string;
  subject: string;
  location: string;
  lighting: string;
  angle: string;
  movement: string;
  mood: string;
  category: string;
  job_id?: string;
  original_prompt?: string;
}
const makeScene = (): Scene => ({
  id: crypto.randomUUID(),
  title: "New scene",
  prompt: "",
  subject: "",
  location: "",
  lighting: "",
  angle: "",
  movement: "",
  mood: "",
  category: categories[0],
});
function describe(s: Scene) {
  return [
    s.prompt,
    s.subject ? `Subject: ${s.subject}.` : "",
    s.location ? `Location: ${s.location}.` : "",
    s.lighting ? `Lighting: ${s.lighting}.` : "",
    s.angle ? `Camera angle: ${s.angle}.` : "",
    s.movement ? `Camera movement: ${s.movement}.` : "",
    s.mood ? `Mood: ${s.mood}.` : "",
    `Shot category: ${s.category}. Create a coherent cinematic supporting shot. Do not introduce unrelated subjects or factual product claims.`,
  ]
    .filter(Boolean)
    .join("\n");
}
export function BRoll() {
  const { data, refresh, notify } = useStudio();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [active, setActive] = useState("");
  const [project, setProject] = useState("");
  const [name, setName] = useState("");
  const [storyboardId, setStoryboardId] = useState("");
  const [loaded, setLoaded] = useState<
    { id: string; name: string; scenes: Scene[] }[]
  >([]);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const draft = sessionStorage.getItem("nexify-prompt");
    if (!draft) return;
    Promise.resolve().then(() => {
      try {
        const value = JSON.parse(draft);
        const s = {
          ...makeScene(),
          title: "Prompt direction",
          prompt: value.prompt,
          original_prompt: value.original || value.prompt,
        };
        setScenes([s]);
        setActive(s.id);
        sessionStorage.removeItem("nexify-prompt");
      } catch {
        sessionStorage.removeItem("nexify-prompt");
      }
    });
  }, []);
  const scene = scenes.find((s) => s.id === active);
  function add() {
    if (scenes.length >= 20) {
      notify("A storyboard supports up to 20 scenes.", true);
      return;
    }
    const s = makeScene();
    setScenes([...scenes, s]);
    setActive(s.id);
    setGenerating(false);
  }
  function update(values: Partial<Scene>) {
    setScenes(scenes.map((s) => (s.id === active ? { ...s, ...values } : s)));
    setGenerating(false);
  }
  function order(index: number, direction: number) {
    const copy = [...scenes];
    const next = index + direction;
    if (next < 0 || next >= copy.length) return;
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setScenes(copy);
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/manage", {
        action: "storyboard",
        values: {
          ...(storyboardId ? { id: storyboardId } : {}),
          project_id: project,
          name,
          scenes,
        },
      });
      setStoryboardId(r.id);
      notify(
        "Storyboard saved. Each scene is generated and budgeted separately.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    try {
      const r = await api<{
        storyboards: { id: string; name: string; scenes: Scene[] }[];
      }>(`/api/manage?project=${project}`, undefined, "GET");
      setLoaded(r.storyboards);
      if (!r.storyboards.length)
        notify("No saved storyboards in this project.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <Heading
        eyebrow="B-roll studio"
        title="Build the shots that tell the story."
        description="Plan a sequence, refine each scene, and generate it one shot at a time."
      >
        <Button onClick={add}>
          <Plus />
          Add scene
        </Button>
      </Heading>
      <div className="panel mb-5 flex flex-wrap gap-3 p-4">
        <input
          aria-label="Storyboard name"
          placeholder="Storyboard name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field flex-1"
        />
        <select
          className="field flex-1"
          aria-label="Storyboard project"
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setLoaded([]);
            setStoryboardId("");
          }}
        >
          <option value="">Select client / project</option>
          {data.projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <Button
          variant="outline"
          disabled={!data.configured || !project}
          onClick={load}
        >
          Load
        </Button>
        <Button
          disabled={
            !data.configured || !project || !name || !scenes.length || busy
          }
          onClick={save}
        >
          <Save />
          {busy ? "Saving…" : "Save storyboard"}
        </Button>
      </div>
      {loaded.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {loaded.map((s) => (
            <Button
              variant="outline"
              size="sm"
              key={s.id}
              onClick={() => {
                setStoryboardId(s.id);
                setName(s.name);
                setScenes(s.scenes);
                setActive(s.scenes[0]?.id || "");
                setGenerating(false);
              }}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}
      <div className="mb-6">
        <Note tone="slate">
          A storyboard is a collection of individual shots. Download completed
          scenes from the library; this studio does not merge them into a final
          video.
        </Note>
      </div>
      <div className="grid gap-5 lg:grid-cols-[270px_1fr]">
        <section className="panel self-start">
          <SectionTitle
            title="Shot list"
            detail={`${scenes.length} / 20 scenes`}
          />
          {scenes.length ? (
            <div className="space-y-2 p-3">
              {scenes.map((s, i) => (
                <div
                  key={s.id}
                  className={`rounded-xl border p-3 ${active === s.id ? "border-orange-500/40 bg-orange-500/5" : "border-border"}`}
                >
                  <button
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => {
                      setActive(s.id);
                      setGenerating(false);
                    }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-xs font-medium">{s.title}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {s.category}
                      </p>
                      {s.job_id && (
                        <p className="mt-2 text-[10px] text-orange-300">
                          Generation recorded
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="mt-3 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Move scene up"
                      disabled={i === 0}
                      onClick={() => order(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Move scene down"
                      disabled={i === scenes.length - 1}
                      onClick={() => order(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove scene"
                      className="ml-auto"
                      onClick={() => {
                        setScenes(scenes.filter((v) => v.id !== s.id));
                        if (s.id === active) setActive("");
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <ListVideo className="mx-auto text-slate-500" />
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                Add your first scene to start planning the story.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={add}
              >
                <Plus />
                First scene
              </Button>
            </div>
          )}
        </section>
        <section className="panel">
          <SectionTitle
            title={scene?.title || "Scene editor"}
            detail="Define the shot before opening the generator"
          />
          {scene ? (
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Scene title">
                  <input
                    className="field"
                    value={scene.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </Field>
                <Field label="B-roll category">
                  <select
                    className="field"
                    value={scene.category}
                    onChange={(e) => update({ category: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Scene description">
                <textarea
                  className="field min-h-24"
                  value={scene.prompt}
                  onChange={(e) => update({ prompt: e.target.value })}
                  placeholder="What should happen in this shot?"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    "subject",
                    "location",
                    "lighting",
                    "angle",
                    "movement",
                    "mood",
                  ] as const
                ).map((key) => (
                  <Field
                    key={key}
                    label={
                      {
                        subject: "Subject",
                        location: "Location",
                        lighting: "Lighting",
                        angle: "Camera angle",
                        movement: "Camera movement",
                        mood: "Mood",
                      }[key]
                    }
                  >
                    <input
                      className="field"
                      value={scene[key]}
                      onChange={(e) => update({ [key]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="kicker mb-3">Professional shot description</p>
                <p className="whitespace-pre-line text-xs leading-6 text-slate-300">
                  {describe(scene)}
                </p>
              </div>
              <Button
                disabled={scene.prompt.trim().length < 3 || !project}
                onClick={() => setGenerating(true)}
              >
                <Clapperboard />
                Estimate & generate this scene
              </Button>
            </div>
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
              <Film size={40} className="text-orange-400" />
              <h3 className="mt-5 text-lg font-medium">
                Every great edit starts with a great shot.
              </h3>
              <p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground">
                Create a scene and define the subject, atmosphere, lighting, and
                camera direction.
              </p>
            </div>
          )}
        </section>
      </div>
      {generating && scene && (
        <div className="mt-7">
          <h2 className="mb-5 text-lg font-semibold">
            Generate scene: {scene.title}
          </h2>
          <Generator
            key={scene.id + describe(scene) + project}
            kind="b-roll"
            scenePrompt={describe(scene)}
            sceneProject={project}
            sceneOriginal={scene.original_prompt || scene.prompt}
            onSubmitted={(id) => {
              setScenes(
                scenes.map((s) =>
                  s.id === scene.id ? { ...s, job_id: id } : s,
                ),
              );
              void refresh();
            }}
          />
        </div>
      )}
    </>
  );
}
