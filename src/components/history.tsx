"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  RefreshCw,
  History as HistoryIcon,
  Copy,
  Archive,
  Eye,
} from "lucide-react";
import { useStudio, api } from "./studio-context";
import { Heading, Status, Empty, Field, Note } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { AssetGrid } from "./library";
import { usd } from "@/lib/utils";
import type { Generation } from "@/lib/types";
export function History() {
  const { data, refresh, notify } = useStudio();
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [archive, setArchive] = useState(false);
  const [selected, setSelected] = useState<Generation | null>(
    data.generations.find((g) => g.id === params.get("job")) || null,
  );
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState("");
  const [cost, setCost] = useState("");
  const [evidence, setEvidence] = useState("");
  const [recovered, setRecovered] = useState("");
  const job = data.generations.find((g) => g.id === selected?.id) || selected;
  const hasActive = data.generations.some((g) =>
    ["queued", "running", "storing", "submitting"].includes(g.status),
  );
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(
      () => refresh().catch((e) => notify(e.message, true)),
      15_000,
    );
    return () => clearInterval(timer);
  }, [hasActive, refresh, notify]);
  async function reload() {
    setBusy(true);
    try {
      await refresh();
      notify("History synchronized from the database.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function duplicate(g: Generation) {
    const kind = ["image-to-video", "text-to-video"].includes(g.type)
      ? "video-studio"
      : "image-studio";
    router.push(`/${kind}?duplicate=${g.id}`);
  }
  async function patch(g: Generation, body: unknown) {
    try {
      await api(`/api/history/${g.id}`, body, "PATCH");
      await refresh();
      setSelected(null);
      notify("History record updated.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function reconcile() {
    if (!job) return;
    try {
      const amount = Math.round(Number(cost) * 1_000_000);
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Enter a confirmed USD amount.");
      await api("/api/manage", {
        action: "reconcile",
        values: {
          generation_id: job.id,
          cost_micros: amount,
          evidence,
          ...(recovered ? { provider_request_id: recovered } : {}),
        },
      });
      await refresh();
      notify(
        recovered
          ? "Existing provider request attached. Scheduled polling will resume."
          : "Confirmed cost recorded; reservation released.",
      );
      setSelected(null);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const jobs = data.generations.filter(
    (g) =>
      g.archived === archive &&
      (filter === "all" || g.status === filter) &&
      (g.final_prompt + " " + g.id)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="Generation history"
        title="Every idea has a paper trail."
        description="Follow the real status, settings, and costs of every generation."
      >
        <Button
          variant="outline"
          onClick={reload}
          disabled={!data.configured || busy}
        >
          <RefreshCw className={busy ? "animate-spin" : ""} />
          Refresh
        </Button>
      </Heading>
      <div className="panel mb-5 flex flex-wrap gap-3 p-4">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-3.5 text-muted-foreground"
          />
          <input
            className="field pl-9"
            aria-label="Search history"
            placeholder="Search prompts or job IDs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="field w-auto"
          aria-label="Job status filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {[
            "reserved",
            "submitting",
            "queued",
            "running",
            "storing",
            "completed",
            "failed",
            "submission_unknown",
            "needs_review",
          ].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <Button
          variant={archive ? "default" : "ghost"}
          onClick={() => setArchive(!archive)}
        >
          <Archive />
          Archived
        </Button>
      </div>
      {jobs.length ? (
        <section className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {[
                  "Generation",
                  "Client / project",
                  "Model",
                  "Status",
                  "Cost (USD)",
                  "Created",
                  "",
                ].map((label, i) => (
                  <th key={i} className="px-5 py-4 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((g) => (
                <tr key={g.id} className="hover:bg-secondary/20">
                  <td className="max-w-60 px-5 py-4">
                    <button
                      onClick={() => setSelected(g)}
                      className="text-left"
                    >
                      <p className="line-clamp-1 text-xs font-medium">
                        {g.original_prompt}
                      </p>
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                        {g.id.slice(0, 8)} · {g.type}
                      </p>
                    </button>
                  </td>
                  <td className="px-5 py-4 text-xs">
                    <p>
                      {data.clients.find((c) => c.id === g.client_id)?.name}
                    </p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {data.projects.find((p) => p.id === g.project_id)?.name}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-[11px]">
                    {data.models.find((m) => m.id === g.model_id)?.name}
                  </td>
                  <td className="px-5 py-4">
                    <Status status={g.status} />
                  </td>
                  <td className="px-5 py-4 text-xs">
                    {usd(g.final_cost_micros ?? g.estimated_micros)}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {g.final_cost_micros === null
                        ? "reserved maximum"
                        : "confirmed final"}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-[10px] text-muted-foreground">
                    {new Date(g.created_at).toLocaleString("en-MY", {
                      timeZone: "Asia/Kuala_Lumpur",
                    })}
                  </td>
                  <td className="px-5 py-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="View generation"
                      onClick={() => setSelected(g)}
                    >
                      <Eye />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="panel">
          <Empty
            title="Your creative history starts here"
            description="Every confirmed submission will be recorded with its settings, provider status, reservation, and final cost."
            href="/image-studio"
            action="Open Image Studio"
            icon={<HistoryIcon size={25} />}
          />
        </section>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground">
        Showing the latest 100 accessible records. Opening history never submits
        a new generation.
      </p>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          {job && (
            <>
              <DialogTitle className="text-lg font-semibold">
                Generation {job.id.slice(0, 8)}
              </DialogTitle>
              <DialogDescription className="mt-2 text-xs text-muted-foreground">
                Created{" "}
                {new Date(job.created_at).toLocaleString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                })}{" "}
                · Billing period {job.billing_period}
              </DialogDescription>
              <div className="my-5 flex flex-wrap items-center gap-3">
                <Status status={job.status} />
                <span className="pill">
                  {data.models.find((m) => m.id === job.model_id)?.name}
                </span>
                <span className="pill">
                  {job.final_cost_micros === null
                    ? "Reserved " + usd(job.estimated_micros)
                    : "Final " + usd(job.final_cost_micros)}
                </span>
              </div>
              {job.error_metadata?.message && (
                <Note tone="red">{String(job.error_metadata.message)}</Note>
              )}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <p className="kicker mb-3">Original prompt</p>
                  <p className="whitespace-pre-wrap text-xs leading-6">
                    {job.original_prompt}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="kicker mb-3">Final prompt</p>
                  <p className="whitespace-pre-wrap text-xs leading-6">
                    {job.final_prompt}
                  </p>
                </div>
              </div>
              <details className="mt-5 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Input configuration & provider reference
                </summary>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-background p-4 text-[11px]">
                  {JSON.stringify(
                    {
                      provider_request_id: job.provider_request_id,
                      input: job.input_config,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {data.assets.some((a) => a.generation_id === job.id) && (
                <div className="mt-5">
                  <AssetGrid
                    assets={data.assets.filter(
                      (a) => a.generation_id === job.id,
                    )}
                  />
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <Button variant="outline" onClick={() => duplicate(job)}>
                  <Copy />
                  Duplicate settings
                </Button>
                <Button variant="outline" onClick={() => duplicate(job)}>
                  <RefreshCw />
                  Regenerate with confirmation
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => patch(job, { archived: !job.archived })}
                >
                  <Archive />
                  {job.archived ? "Restore" : "Archive"}
                </Button>
              </div>
              <div className="mt-4 flex gap-2">
                <select
                  aria-label="Move job to project"
                  className="field"
                  value={move}
                  onChange={(e) => setMove(e.target.value)}
                >
                  <option value="">
                    Move to another project for this client…
                  </option>
                  {data.projects
                    .filter((p) => p.client_id === job.client_id && !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  disabled={!move}
                  onClick={() => patch(job, { project_id: move })}
                >
                  Move
                </Button>
              </div>
              {data.profile?.role === "admin" &&
                job.final_cost_micros === null &&
                [
                  "completed",
                  "failed",
                  "needs_review",
                  "submission_unknown",
                ].includes(job.status) && (
                  <div className="mt-6 border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold">
                      Administrator reconciliation
                    </h3>
                    <Note>
                      Only enter a confirmed provider charge from billing
                      evidence. An uncertain submission keeps its reservation
                      until verified. Attach an existing provider request ID to
                      recover polling without resubmitting.
                    </Note>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label="Confirmed cost (USD)">
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step="0.000001"
                          value={cost}
                          onChange={(e) => setCost(e.target.value)}
                        />
                      </Field>
                      <Field label="Recovered provider request ID (optional)">
                        <input
                          className="field"
                          value={recovered}
                          onChange={(e) => setRecovered(e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="mt-4">
                      <Field label="Evidence / invoice reference">
                        <textarea
                          className="field"
                          value={evidence}
                          onChange={(e) => setEvidence(e.target.value)}
                        />
                      </Field>
                    </div>
                    <Button
                      className="mt-4"
                      disabled={evidence.trim().length < 5 || cost === ""}
                      onClick={reconcile}
                    >
                      {recovered
                        ? "Attach existing request"
                        : "Record cost & release reservation"}
                    </Button>
                  </div>
                )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
