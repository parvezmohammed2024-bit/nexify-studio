"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Aperture,
  LayoutDashboard,
  ImagePlus,
  Clapperboard,
  Film,
  Sparkles,
  FolderOpen,
  Images,
  History,
  Wallet,
  Settings,
  ChevronDown,
  Plus,
  Menu,
  X,
  ArrowUpRight,
  LogOut,
  CircleHelp,
  Loader2,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio, api } from "@/components/studio-context";
export const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/image-studio", label: "Image Studio", icon: ImagePlus },
  { href: "/video-studio", label: "Video Studio", icon: Clapperboard },
  { href: "/b-roll-studio", label: "B-Roll Studio", icon: Film },
  { href: "/prompt-engineer", label: "Prompt Engineer", icon: Sparkles },
  { href: "/client-projects", label: "Client Projects", icon: FolderOpen },
  { href: "/creative-library", label: "Creative Library", icon: Images },
  { href: "/generation-history", label: "Generation History", icon: History },
  { href: "/budget", label: "Budget & Spending", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { data, report, notify, currentProject } = useStudio();
  const params = useSearchParams();
  const selectedProject = data.projects.find(
    (p) => p.id === (params.get("project") || currentProject),
  );
  const active = navigation.find((n) => n.href === path);
  const running = report.counts.running;
  async function logout() {
    try {
      await api("/api/auth/logout", {});
      router.push("/login");
      router.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const sidebar = (
    <>
      <Link href="/" className="flex h-24 items-center gap-3 px-7">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-orange-900/20">
          <Aperture size={24} />
        </div>
        <div>
          <span className="text-[23px] font-bold tracking-tight">
            nexify<span className="text-primary">.</span>
          </span>
          <p className="mt-0.5 text-[9px] tracking-[.18em] text-muted-foreground">
            AI STUDIO
          </p>
        </div>
      </Link>
      <div className="px-5 pb-4 pt-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-[11px] font-semibold text-orange-300">
            NS
          </div>
          <div>
            <p className="text-xs font-semibold">Nexify Solution</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Creative workspace
            </p>
          </div>
          <ChevronDown size={14} className="ml-auto text-muted-foreground" />
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-4">
        <p className="kicker px-3 pb-3 pt-4">Workspace</p>
        {navigation.map((n, i) => (
          <div key={n.href}>
            {i === 5 && <p className="kicker px-3 pb-3 pt-7">Management</p>}
            <Link
              onClick={() => setOpen(false)}
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${path === n.href ? "bg-orange-500/10 text-orange-400" : "text-muted-foreground hover:bg-secondary/60 hover:text-white"}`}
            >
              <n.icon size={17} />
              {n.label}
              {path === n.href && (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              )}
              {n.label === "Prompt Engineer" && (
                <span className="ml-auto rounded bg-orange-400/10 px-1.5 py-0.5 text-[8px] font-bold text-orange-400">
                  AI
                </span>
              )}
            </Link>
          </div>
        ))}
      </nav>
      <div className="m-5 rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-xs font-medium">
          <CircleHelp size={15} className="text-orange-400" />
          Your creative command center
        </p>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Set up your providers and budget to start creating.
        </p>
        <Link
          href="/settings"
          className="mt-3 flex items-center gap-1 text-[11px] text-orange-400"
        >
          Studio settings
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="flex items-center gap-3 border-t border-border px-6 py-5">
        <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
          {data.profile?.full_name?.slice(0, 2).toUpperCase() || "NS"}
        </div>
        <div>
          <p className="text-xs font-semibold">
            {data.profile?.full_name || "Studio setup"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {data.profile?.role === "admin"
              ? "Administrator"
              : data.profile
                ? "Creator"
                : "Awaiting configuration"}
          </p>
        </div>
        {data.profile && (
          <button
            className="ml-auto text-muted-foreground hover:text-white"
            onClick={logout}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </>
  );
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] flex-col border-r border-border bg-[#09132d] lg:flex">
        {sidebar}
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <aside
            className="flex h-full w-[270px] flex-col overflow-y-auto bg-[#09132d]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute left-[235px] top-5"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:ml-[238px]">
        <header className="flex h-[76px] items-center justify-between gap-4 border-b border-border bg-[#0B1636]/90 px-5 md:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden text-muted-foreground sm:inline">
                Workspace
              </span>
              <span className="hidden text-slate-500 sm:inline">/</span>
              <span>{active?.label || "Studio"}</span>
              {selectedProject && (
                <span
                  className="ml-3 hidden max-w-48 truncate rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground md:inline"
                  title={selectedProject.name}
                >
                  Project: {selectedProject.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/generation-history"
              className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"
            >
              {running ? (
                <Loader2 size={13} className="animate-spin text-orange-400" />
              ) : (
                <Circle
                  size={8}
                  className={
                    data.configured
                      ? "fill-emerald-400 text-emerald-400"
                      : "fill-orange-400 text-orange-400"
                  }
                />
              )}{" "}
              {running
                ? `${running} active jobs`
                : data.configured
                  ? "Studio connected"
                  : "Setup required"}
            </Link>
            <Button asChild size="sm">
              <Link href="/image-studio">
                <Plus />
                Create new
              </Link>
            </Button>
            <Link
              href={data.profile ? "/settings" : "/login"}
              className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold"
              aria-label={data.profile ? "Account settings" : "Sign in"}
            >
              {data.profile?.full_name?.slice(0, 2).toUpperCase() || "NS"}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-5 md:p-8 md:pb-12 fade-in">
          {!data.configured && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
              <p className="text-xs leading-5 text-orange-200">
                Connect Supabase to activate your workspace. Generation remains
                off until providers and pricing are verified.
              </p>
              <Link
                href="/settings"
                className="shrink-0 text-xs font-medium text-orange-400"
              >
                Configure studio →
              </Link>
            </div>
          )}
          {children}
          <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t border-border/60 pt-5 text-[10px] text-muted-foreground">
            <span>
              NEXIFY SOLUTION <span className="mx-2 text-slate-600">/</span>{" "}
              MADE FOR WHAT’S NEXT
            </span>
            <span>Private workspace · USD accounting · MYR display</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
