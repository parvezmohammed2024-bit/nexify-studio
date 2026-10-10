"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Aperture, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="grid-pattern relative hidden overflow-hidden border-r border-border p-16 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary p-3">
            <Aperture />
          </div>
          <span className="text-2xl font-bold tracking-tight">
            nexify<span className="text-primary">.</span>
          </span>
        </div>
        <div>
          <span className="kicker text-orange-400">
            Built for your next big idea
          </span>
          <h1 className="mt-6 max-w-lg text-6xl font-semibold leading-[1.12] tracking-tight">
            From a spark.
            <br />
            To something
            <br />
            <span className="text-orange-400">extraordinary.</span>
          </h1>
          <p className="mt-7 max-w-sm text-base leading-7 text-muted-foreground">
            Your team’s creative workspace for images, motion, and client-ready
            campaigns.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          NEXIFY SOLUTION · INTERNAL CREATIVE STUDIO
        </p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <span className="pill">
            <LockKeyhole size={12} />
            Staff access only
          </span>
          <h2 className="mt-7 text-3xl font-semibold tracking-tight">
            Welcome to the studio
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with your agency account to get creating.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="label">
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className="field"
                required
                placeholder="you@nexifysolution.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="field"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !configured}
            >
              {busy ? "Signing in…" : "Enter your workspace"}
              <ArrowRight />
            </Button>
          </form>
          {!configured && (
            <p className="mt-5 text-sm text-amber-200">
              Supabase is awaiting configuration. An administrator must connect
              the database and provision staff accounts.
            </p>
          )}
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Accounts are created by your administrator. Public signup is
            disabled.
          </p>
          <Link className="mt-8 inline-block text-sm text-orange-400" href="/">
            View configuration status →
          </Link>
        </div>
      </div>
    </main>
  );
}
