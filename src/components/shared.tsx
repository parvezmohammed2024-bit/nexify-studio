"use client";
import { Inbox, ArrowUpRight, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/types";
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="kicker mb-3 text-orange-400">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-[32px]">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
export function Empty({
  title,
  description,
  href,
  action,
  icon,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 rounded-2xl border border-border bg-background p-4 text-slate-400">
        {icon || <Inbox size={24} />}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
        {description}
      </p>
      {href && (
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link href={href}>
            {action || "Get started"}
            <ArrowUpRight />
          </Link>
        </Button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && (
        <span className="mt-2 block text-[11px] leading-5 text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Note({
  children,
  tone = "orange",
}: {
  children: React.ReactNode;
  tone?: "orange" | "red" | "slate";
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 text-xs leading-5 ${tone === "red" ? "border-red-500/25 bg-red-500/5 text-red-200" : tone === "orange" ? "border-orange-500/20 bg-orange-500/5 text-orange-200" : "border-border bg-background text-muted-foreground"}`}
    >
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
export function Status({ status }: { status: JobStatus }) {
  const active = [
    "queued",
    "running",
    "storing",
    "submitting",
    "reserved",
  ].includes(status);
  return (
    <span
      className={`pill ${status === "completed" ? "border-emerald-500/20 text-emerald-300" : status === "failed" ? "border-red-500/20 text-red-300" : active ? "border-orange-500/20 text-orange-300" : "text-amber-200"}`}
    >
      {active ? (
        <Loader2 size={10} className="animate-spin" />
      ) : (
        <span
          className={`h-1.5 w-1.5 rounded-full ${status === "completed" ? "bg-emerald-400" : status === "failed" ? "bg-red-400" : "bg-amber-300"}`}
        />
      )}{" "}
      {status.replaceAll("_", " ")}
    </span>
  );
}
export function SectionTitle({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      {children}
    </div>
  );
}
