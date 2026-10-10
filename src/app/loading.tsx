export default function Loading() {
  return (
    <main
      className="mx-auto max-w-5xl space-y-5 p-10"
      aria-label="Loading workspace"
    >
      <div className="h-8 w-64 animate-pulse rounded bg-secondary" />
      <div className="h-60 animate-pulse rounded-2xl bg-card" />
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Loading your workspace…</p>
    </main>
  );
}
