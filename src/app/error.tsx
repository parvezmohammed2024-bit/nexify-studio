"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-semibold">The workspace couldn’t load.</h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
        Check Supabase configuration, apply the database migrations, and verify
        your staff profile. An administrator can inspect server diagnostics.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
      <Link className="mt-5 text-sm text-orange-400" href="/login">
        Return to sign in
      </Link>
    </main>
  );
}
