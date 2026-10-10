"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Star,
  Download,
  Clapperboard,
  ImagePlus,
  Upload,
  Search,
  Archive,
  Columns2,
} from "lucide-react";
import { useStudio, api } from "./studio-context";
import { Heading, Empty } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { Asset } from "@/lib/types";
export function AssetPreview({
  asset,
  className = "",
}: {
  asset: Asset;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ url: string }>(`/api/assets/${asset.id}`, undefined, "GET")
      .then((r) => {
        if (active) setUrl(r.url);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [asset.id]);
  if (error)
    return (
      <div
        className={`flex items-center justify-center bg-background p-6 text-center text-xs text-red-300 ${className}`}
      >
        {error}
      </div>
    );
  if (!url)
    return (
      <div
        className={`flex items-center justify-center bg-secondary/40 text-xs text-muted-foreground ${className}`}
      >
        Loading asset…
      </div>
    );
  return asset.kind === "video" ? (
    <video
      controls
      src={url}
      className={className}
      preload="metadata"
      aria-label={asset.name}
    />
  ) : (
    <Image
      src={url}
      alt={asset.name}
      width={1200}
      height={1200}
      unoptimized
      className={className}
    />
  );
}
export function AssetGrid({ assets }: { assets: Asset[] }) {
  const { refresh, notify, data } = useStudio();
  const [selected, setSelected] = useState<Asset | null>(null);
  const [move, setMove] = useState("");
  async function patch(asset: Asset, body: unknown) {
    try {
      await api(`/api/assets/${asset.id}`, body, "PATCH");
      await refresh();
      notify("Asset updated.");
      setSelected(null);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="overflow-hidden rounded-xl border border-border bg-background"
          >
            <button
              className="block w-full text-left"
              onClick={() => setSelected(asset)}
              aria-label={`Preview ${asset.name}`}
            >
              <AssetPreview
                asset={asset}
                className="aspect-square w-full object-cover"
              />
            </button>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{asset.name}</p>
                <button
                  aria-label={asset.favorite ? "Unfavourite" : "Favourite"}
                  onClick={() => patch(asset, { favorite: !asset.favorite })}
                  className={
                    asset.favorite
                      ? "text-orange-400"
                      : "text-slate-500 hover:text-orange-300"
                  }
                >
                  <Star
                    size={14}
                    fill={asset.favorite ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {data.projects.find((p) => p.id === asset.project_id)?.name ||
                  "Personal reference"}{" "}
                · {asset.kind}
              </p>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {selected && (
            <>
              <DialogTitle className="pr-8 text-lg font-semibold">
                {selected.name}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Private asset · {(selected.size_bytes / 1024 / 1024).toFixed(2)}{" "}
                MB · Access links expire after five minutes.
              </DialogDescription>
              <AssetPreview
                asset={selected}
                className="mt-5 max-h-[50vh] w-full rounded-xl bg-background object-contain"
              />
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={`/api/assets/${selected.id}?download=1`}>
                    <Download />
                    Download
                  </a>
                </Button>
                {selected.kind === "image" && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/video-studio?source=${selected.id}`}>
                      <Clapperboard />
                      Animate image
                    </Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch(selected, { favorite: !selected.favorite })
                  }
                >
                  <Star /> {selected.favorite ? "Unfavourite" : "Favourite"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch(selected, { archived: !selected.archived })
                  }
                >
                  <Archive />
                  {selected.archived ? "Restore" : "Archive"}
                </Button>
              </div>
              <div className="mt-5 flex gap-2">
                <select
                  value={move}
                  onChange={(e) => setMove(e.target.value)}
                  className="field"
                  aria-label="Move asset to project"
                >
                  <option value="">Move to a project…</option>
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
                  disabled={!move}
                  onClick={() => patch(selected, { project_id: move })}
                >
                  Move
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Library() {
  const { data, refresh, notify } = useStudio();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [favorite, setFavorite] = useState(false);
  const [archive, setArchive] = useState(false);
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const assets = data.assets.filter(
    (a) =>
      a.archived === archive &&
      (!favorite || a.favorite) &&
      (kind === "all" || a.kind === kind) &&
      (!project || a.project_id === project) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (project) form.append("project_id", project);
      await api("/api/upload", form);
      await refresh();
      notify("Reference image uploaded to your private library.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Creative assets"
        title="Your creative library"
        description="Every visual. Every version. A home for your best work."
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={data.assets.filter((a) => a.kind === "image").length < 2}
            onClick={() => setCompare(true)}
          >
            <Columns2 />
            Compare
          </Button>
          <Button asChild disabled={!data.configured || busy}>
            <label className="cursor-pointer">
              <Upload />
              {busy ? "Uploading…" : "Upload reference"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={!data.configured || busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        </div>
      </Heading>
      <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-40 flex-1">
          <Search
            size={15}
            className="absolute left-3 top-3.5 text-muted-foreground"
          />
          <input
            className="field pl-9"
            aria-label="Search assets"
            placeholder="Find an asset…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="field w-auto"
          aria-label="Asset type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All assets</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select
          className="field w-auto max-w-48"
          aria-label="Filter project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button
          variant={favorite ? "default" : "outline"}
          onClick={() => setFavorite(!favorite)}
        >
          <Star />
          Favourites
        </Button>
        <Button
          variant={archive ? "default" : "ghost"}
          onClick={() => setArchive(!archive)}
        >
          <Archive />
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {assets.length} assets in this view · latest 100 retained records
      </p>
      {assets.length ? (
        <AssetGrid assets={assets} />
      ) : (
        <section className="panel">
          <Empty
            title="Room for your next great visual"
            description="Upload an approved reference or generate an image. Original files stay in private storage."
            href="/image-studio"
            action="Create an image"
            icon={<ImagePlus size={26} />}
          />
        </section>
      )}
      <Dialog open={compare} onOpenChange={setCompare}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="text-lg font-semibold">
            Compare images
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            View two assets side by side.
          </DialogDescription>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              { value: left, set: setLeft },
              { value: right, set: setRight },
            ].map((v, i) => (
              <div key={i}>
                <select
                  aria-label={`Comparison image ${i + 1}`}
                  className="field mb-4"
                  value={v.value}
                  onChange={(e) => v.set(e.target.value)}
                >
                  <option value="">Select an image</option>
                  {data.assets
                    .filter((a) => a.kind === "image" && !a.archived)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
                {data.assets.find((a) => a.id === v.value) && (
                  <AssetPreview
                    asset={data.assets.find((a) => a.id === v.value)!}
                    className="aspect-square w-full rounded-xl object-contain"
                  />
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
