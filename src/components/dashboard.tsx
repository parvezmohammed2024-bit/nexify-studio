"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  ImagePlus,
  Clapperboard,
  Film,
  Sparkles,
  Wallet,
  Layers,
  CheckCircle2,
  Clock3,
  FolderOpen,
  Aperture,
} from "lucide-react";
import { useStudio } from "./studio-context";
import { Heading, Empty, SectionTitle } from "./shared";
import { Button } from "./ui/button";
import { usd } from "@/lib/utils";
import { AssetGrid } from "./library";
const actions = [
  {
    title: "Create an image",
    description: "Turn your vision into a visual.",
    href: "/image-studio",
    icon: ImagePlus,
    color: "text-orange-400 bg-orange-400/10",
  },
  {
    title: "Bring it to life",
    description: "Add motion to your images.",
    href: "/video-studio",
    icon: Clapperboard,
    color: "text-sky-400 bg-sky-400/10",
  },
  {
    title: "Build your B-roll",
    description: "Every story needs a great scene.",
    href: "/b-roll-studio",
    icon: Film,
    color: "text-violet-400 bg-violet-400/10",
  },
  {
    title: "Perfect your prompt",
    description: "Simple words. Stronger results.",
    href: "/prompt-engineer",
    icon: Sparkles,
    color: "text-emerald-400 bg-emerald-400/10",
  },
];
export function Dashboard() {
  const { data, report } = useStudio();
  const b = report.budgets.find((b) => b.client_id === null);
  const available = b
    ? Number(b.limit) - Number(b.spent) - Number(b.reserved)
    : 0;
  const stats = [
    {
      label: "Monthly spend",
      value: data.configured ? usd(Number(b?.spent || 0)) : "—",
      hint: b ? `${usd(Number(b.reserved))} reserved` : "Budget not configured",
      icon: Wallet,
    },
    {
      label: "Available budget",
      value: b ? usd(available) : "—",
      hint: b
        ? `of ${usd(Number(b.limit))} monthly budget`
        : "Set a budget to get started",
      icon: Layers,
    },
    {
      label: "Completed generations",
      value: data.configured ? String(report.counts.completed) : "—",
      hint: `${report.counts.total} total · ${report.counts.failed} failed`,
      icon: CheckCircle2,
    },
    {
      label: "In the making",
      value: data.configured ? String(report.counts.running) : "—",
      hint: report.counts.review
        ? `${report.counts.review} require review`
        : "Your active generation jobs",
      icon: Clock3,
    },
  ];
  return (
    <>
      <Heading
        eyebrow="Your creative workspace"
        title={`Let’s make something great${data.profile?.full_name ? ", " + data.profile.full_name.split(" ")[0] : ""}.`}
        description="A little imagination. A whole lot of possibility."
      />
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-border bg-[#132245]">
        <div className="relative z-10 max-w-[65%] p-7 md:p-9">
          <span className="pill border-orange-500/20 bg-orange-500/10 text-orange-300">
            <Sparkles size={11} />
            YOUR IDEAS, AMPLIFIED
          </span>
          <h2 className="mt-5 text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
            The next great campaign
            <br />
            starts with <span className="text-orange-400">one idea.</span>
          </h2>
          <p className="mt-4 max-w-sm text-xs leading-6 text-slate-300">
            Create striking visuals, craft cinematic motion, and keep every
            client’s story in one place.
          </p>
          <Button asChild className="mt-5">
            <Link href="/image-studio">
              Open Image Studio
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-[43%] items-center justify-center overflow-hidden"
        >
          <div className="absolute size-80 rounded-full bg-orange-500/10 blur-3xl" />
          <svg
            viewBox="0 0 400 300"
            className="relative h-full min-h-72 w-full opacity-90"
          >
            <defs>
              <linearGradient id="orb" x1="0" x2="1" y1="0" y2="1">
                <stop stopColor="#FF6B1A" />
                <stop offset="1" stopColor="#632600" />
              </linearGradient>
              <linearGradient id="tile" x1="0" x2="1">
                <stop stopColor="#273b62" />
                <stop offset="1" stopColor="#111e40" />
              </linearGradient>
            </defs>
            <g transform="translate(190 150) rotate(-24)">
              <ellipse
                rx="170"
                ry="82"
                fill="none"
                stroke="#586687"
                strokeWidth="1"
              />
              <ellipse
                rx="130"
                ry="63"
                fill="none"
                stroke="#586687"
                strokeWidth="1"
                strokeDasharray="4 10"
              />
              <circle r="70" fill="url(#orb)" />
              <circle cx="-18" cy="-23" r="46" fill="#FF934F" opacity=".25" />
              <path
                d="M0 -34L9 -10L34 0L9 10L0 34L-9 10L-34 0L-9 -10Z"
                fill="#fff3e4"
              />
              <circle cx="153" cy="37" r="5" fill="#FF9A60" />
              <rect
                x="-166"
                y="-56"
                width="55"
                height="68"
                rx="9"
                fill="url(#tile)"
                stroke="#647496"
              />
              <path
                d="M-157 -11L-142 -28L-131 -15L-120 -24"
                fill="none"
                stroke="#efb290"
                strokeWidth="2"
              />
              <circle cx="-149" cy="-40" r="5" fill="#FF8C4A" />
              <rect
                x="88"
                y="18"
                width="62"
                height="48"
                rx="9"
                fill="url(#tile)"
                stroke="#647496"
              />
              <path d="M113 30L129 42L113 54Z" fill="#ff9357" />
            </g>
          </svg>
        </div>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {s.label}
              </span>
              <s.icon size={16} className="text-slate-500" />
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">
              {s.value}
            </p>
            <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
              {s.hint}
            </p>
          </div>
        ))}
      </div>
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">What will you create today?</h2>
          <span className="kicker hidden sm:inline">FROM IDEA TO IMPACT</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((a) => (
            <Link
              href={a.href}
              key={a.href}
              className="panel group p-5 transition-colors hover:border-orange-500/50"
            >
              <div className="flex items-center justify-between">
                <div className={`rounded-xl p-2.5 ${a.color}`}>
                  <a.icon size={20} />
                </div>
                <ArrowUpRight
                  size={16}
                  className="text-slate-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-orange-400"
                />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{a.title}</h3>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {a.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
      <div className="mb-7 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="panel">
          <SectionTitle
            title="Recent projects"
            detail="The campaigns you’re bringing to life"
          >
            <Button asChild variant="ghost" size="sm">
              <Link href="/client-projects">
                View all
                <ArrowUpRight />
              </Link>
            </Button>
          </SectionTitle>
          {data.projects.filter((p) => !p.archived).slice(0, 4).length ? (
            <div className="divide-y divide-border">
              {data.projects
                .filter((p) => !p.archived)
                .slice(0, 4)
                .map((p) => (
                  <Link
                    key={p.id}
                    href={`/client-projects?project=${p.id}`}
                    className="flex items-center gap-3 p-5 hover:bg-secondary/30"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-orange-300">
                      <FolderOpen size={20} />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.clients.find((c) => c.id === p.client_id)?.name}
                      </p>
                    </div>
                    <ArrowUpRight
                      size={15}
                      className="ml-auto text-slate-500"
                    />
                  </Link>
                ))}
            </div>
          ) : (
            <Empty
              title="A blank canvas for your next campaign"
              description="Add a client and create a project to keep prompts, generations, and assets together."
              href="/client-projects"
              action="Create your first project"
              icon={<FolderOpen size={24} />}
            />
          )}
        </section>
        <section className="panel">
          <SectionTitle
            title="Monthly spending"
            detail="Confirmed usage by client"
          />
          <div className="p-5">
            {report.by_client.some((c) => Number(c.amount) > 0) ? (
              report.by_client
                .filter((c) => Number(c.amount) > 0)
                .slice(0, 5)
                .map((c) => (
                  <div key={c.id} className="mb-5">
                    <div className="flex justify-between text-xs">
                      <span>{c.name}</span>
                      <span>{usd(Number(c.amount))}</span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, (Number(c.amount) / Math.max(1, Number(b?.spent || 0))) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
            ) : (
              <Empty
                title="Every dollar, accounted for"
                description="Confirmed generation costs will appear here. Reservations are tracked separately."
                icon={<Wallet size={24} />}
              />
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <SectionTitle
          title="Fresh from the studio"
          detail="Your latest assets, ready for their next chapter"
        >
          <Button asChild variant="ghost" size="sm">
            <Link href="/creative-library">
              Open library
              <ArrowUpRight />
            </Link>
          </Button>
        </SectionTitle>
        {data.assets.filter((a) => !a.archived).length ? (
          <div className="p-5">
            <AssetGrid
              assets={data.assets.filter((a) => !a.archived).slice(0, 4)}
            />
          </div>
        ) : (
          <Empty
            title="Your best work belongs here"
            description="Upload a reference image or complete your first generation. Your creative library grows with every idea."
            href="/creative-library"
            action="Explore creative library"
            icon={<Aperture size={24} />}
          />
        )}
      </section>
      {report.by_model.length > 0 && (
        <section className="panel mt-7">
          <SectionTitle title="Most-used models" />
          <div className="flex flex-wrap gap-4 p-5">
            {report.by_model.map((m) => (
              <span key={m.name} className="pill">
                {m.name} · {m.count} jobs
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
