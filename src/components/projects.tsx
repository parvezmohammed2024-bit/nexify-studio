"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  FolderOpen,
  Building2,
  ArrowUpRight,
  Palette,
  Users,
  Pencil,
} from "lucide-react";
import { useStudio, api } from "./studio-context";
import { Heading, Empty, Field, Note, SectionTitle } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { Client } from "@/lib/types";
export function Projects() {
  const { data, refresh, notify } = useStudio();
  const params = useSearchParams();
  const [dialog, setDialog] = useState<"client" | "project" | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState("");
  const [membershipProject, setMembershipProject] = useState("");
  const selected = data.projects.find((p) => p.id === params.get("project"));
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    setBusy(true);
    try {
      if (dialog === "client") {
        const colors = String(values.colors || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        values.logo_asset_id = values.logo_asset_id || "";
        await api("/api/manage", {
          action: "client",
          values: {
            ...values,
            logo_asset_id: values.logo_asset_id || null,
            product_reference_ids: form.getAll("product_reference_ids"),
            colors,
            ...(editing ? { id: editing.id } : {}),
          },
        });
      } else await api("/api/manage", { action: "project", values });
      await refresh();
      setDialog(null);
      setEditing(null);
      notify(
        dialog === "client"
          ? "Client and brand kit saved."
          : "Project created.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function addMember() {
    try {
      await api("/api/manage", {
        action: "membership",
        values: { project_id: membershipProject, user_id: member },
      });
      notify("Staff member granted project access.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const projects = data.projects.filter(
    (p) => (!client || p.client_id === client) && !p.archived,
  );
  return (
    <>
      <Heading
        eyebrow="Client projects"
        title="Great work starts with a good brief."
        description="Organize client brands, campaigns, and the people bringing them to life."
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!data.configured}
            onClick={() => {
              setEditing(null);
              setDialog("client");
            }}
          >
            <Building2 />
            Add client
          </Button>
          <Button
            disabled={!data.configured || !data.clients.length}
            onClick={() => setDialog("project")}
          >
            <Plus />
            New project
          </Button>
        </div>
      </Heading>
      {selected && (
        <div className="mb-5">
          <Note tone="slate">
            Selected project: {selected.name}. Choose it in the studios to
            associate prompts, jobs, assets, and expenses.
          </Note>
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          variant={!client ? "default" : "outline"}
          size="sm"
          onClick={() => setClient("")}
        >
          All clients
        </Button>
        {data.clients.map((c) => (
          <Button
            variant={client === c.id ? "default" : "outline"}
            size="sm"
            key={c.id}
            onClick={() => setClient(c.id)}
          >
            {c.name}
          </Button>
        ))}
      </div>
      {projects.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const c = data.clients.find((c) => c.id === p.client_id);
            const count = data.generations.filter(
              (g) => g.project_id === p.id,
            ).length;
            return (
              <article key={p.id} className="panel p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-orange-400/10 text-orange-400">
                    <FolderOpen size={22} />
                  </span>
                  <span className="pill">ACTIVE PROJECT</span>
                </div>
                <p className="mt-6 text-[10px] uppercase tracking-widest text-orange-300">
                  {c?.name}
                </p>
                <h2 className="mt-2 text-lg font-semibold">{p.name}</h2>
                <p className="mt-3 min-h-10 text-xs leading-6 text-muted-foreground">
                  {p.description || "Ready for a new creative direction."}
                </p>
                <div className="mt-5 flex justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
                  <span>{count} jobs in recent history</span>
                  <span>
                    {new Date(p.created_at).toLocaleDateString("en-MY", {
                      timeZone: "Asia/Kuala_Lumpur",
                    })}
                  </span>
                </div>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href={`/image-studio?project=${p.id}`}>
                    Create for this project
                    <ArrowUpRight />
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Give your next campaign a home"
            description="Add a client, define their brand, and create a project. Everything you produce stays connected."
            icon={<FolderOpen size={28} />}
          />
        </section>
      )}
      <section className="panel mt-7">
        <SectionTitle
          title="Client brand kits"
          detail="The details that keep every campaign consistent"
        />
        {data.clients.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {data.clients.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-5">
                <div className="flex justify-between">
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                  <button
                    className="text-muted-foreground hover:text-orange-400"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => {
                      setEditing(c);
                      setDialog("client");
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.industry || "Industry not specified"}
                </p>
                <div className="mt-4 flex gap-2">
                  {c.brand_kits?.[0]?.colors.map((color) => (
                    <span
                      key={color}
                      title={color}
                      className="size-6 rounded-full border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-6 text-muted-foreground">
                  {c.brand_kits?.[0]?.guidelines ||
                    "Add brand guidelines to guide prompt enhancement."}
                </p>
                <p className="mt-2 text-xs text-orange-300">
                  {c.brand_kits?.[0]?.preferred_style}
                </p>
                <p className="mt-3 text-[10px] text-muted-foreground">
                  {c.brand_kits?.[0]?.product_reference_ids?.length || 0}{" "}
                  approved product references
                </p>
                <Link
                  href={`/budget?client=${c.id}`}
                  className="mt-3 block text-[11px] text-orange-400"
                >
                  Manage client budget →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Make it unmistakably their brand"
            description="Store approved colors, content styles, guidelines, and internal notes."
            icon={<Palette size={24} />}
          />
        )}
      </section>
      {data.profile?.role === "admin" && (
        <section className="panel mt-7 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Users size={16} />
            Project access
          </h2>
          <div className="flex flex-wrap gap-3">
            <select
              aria-label="Project for membership"
              className="field flex-1"
              value={membershipProject}
              onChange={(e) => setMembershipProject(e.target.value)}
            >
              <option value="">Select project</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Staff member"
              className="field flex-1"
              value={member}
              onChange={(e) => setMember(e.target.value)}
            >
              <option value="">Select active staff</option>
              {data.staff
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
            </select>
            <Button
              disabled={!member || !membershipProject}
              onClick={addMember}
            >
              Grant access
            </Button>
          </div>
        </section>
      )}
      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            {dialog === "client"
              ? editing
                ? "Edit client & brand kit"
                : "Add a client"
              : "Create a project"}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs text-muted-foreground">
            Internal agency records. Clients do not receive a public account.
          </DialogDescription>
          <form onSubmit={save} className="mt-6 space-y-4">
            {dialog === "client" ? (
              <>
                <Field label="Company name">
                  <input
                    className="field"
                    name="name"
                    required
                    defaultValue={editing?.name}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Industry">
                    <input
                      className="field"
                      name="industry"
                      defaultValue={editing?.industry || ""}
                    />
                  </Field>
                  <Field label="Contact email">
                    <input
                      className="field"
                      type="email"
                      name="contact_email"
                      defaultValue={editing?.contact_email || ""}
                    />
                  </Field>
                </div>
                <Field label="Contact phone">
                  <input
                    className="field"
                    name="contact_phone"
                    defaultValue={editing?.contact_phone || ""}
                  />
                </Field>
                <Field label="Logo asset">
                  <select
                    className="field"
                    name="logo_asset_id"
                    defaultValue={editing?.logo_asset_id || ""}
                  >
                    <option value="">No logo selected</option>
                    {data.assets
                      .filter((a) => a.kind === "image" && !a.archived)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="Approved product references"
                  hint="Choose uploaded library images. Use Ctrl / Command to select multiple."
                >
                  <select
                    className="field min-h-20"
                    multiple
                    name="product_reference_ids"
                    defaultValue={
                      editing?.brand_kits?.[0]?.product_reference_ids || []
                    }
                  >
                    {data.assets
                      .filter((a) => a.kind === "image" && !a.archived)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="Brand colors"
                  hint="Comma-separated six-digit hex values, such as #0B1636, #FF6B1A."
                >
                  <input
                    className="field"
                    name="colors"
                    defaultValue={
                      editing?.brand_kits?.[0]?.colors.join(", ") || ""
                    }
                  />
                </Field>
                <Field label="Preferred content style">
                  <input
                    className="field"
                    name="preferred_style"
                    defaultValue={
                      editing?.brand_kits?.[0]?.preferred_style || ""
                    }
                  />
                </Field>
                <Field label="Brand guidelines">
                  <textarea
                    className="field"
                    name="guidelines"
                    defaultValue={editing?.brand_kits?.[0]?.guidelines || ""}
                  />
                </Field>
                <Field label="Internal notes">
                  <textarea
                    className="field"
                    name="notes"
                    defaultValue={editing?.notes || ""}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Client">
                  <select
                    className="field"
                    name="client_id"
                    required
                    defaultValue={client}
                  >
                    <option value="">Choose a client</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Project name">
                  <input name="name" className="field" required />
                </Field>
                <Field label="Campaign brief">
                  <textarea name="description" className="field" />
                </Field>
              </>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
