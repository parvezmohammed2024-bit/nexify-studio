import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <p className="kicker text-orange-400">404</p>
      <h1 className="mt-4 text-2xl font-semibold">
        That workspace doesn’t exist.
      </h1>
      <Link href="/" className="mt-6 text-sm text-orange-400">
        Back to Dashboard →
      </Link>
    </main>
  );
}
