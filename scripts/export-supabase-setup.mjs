// Export only repository migrations. Does not connect to or modify a database.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "supabase/migrations");
const files = (await readdir(directory))
  .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
  .sort();
if (!files.length) throw new Error("No Supabase migrations were found.");

const sections = await Promise.all(
  files.map(
    async (file) =>
      `-- Migration: ${file}\n${await readFile(path.join(directory, file), "utf8")}`,
  ),
);
const sql = `-- Nexify AI Studio: initial setup for a fresh Supabase project only.
-- Generated from the repository migrations; no credentials or customer records.
-- Run once in the Supabase SQL Editor, as the database administrator.
-- Existing studio tables cause the transaction to stop without replacing data.
-- This export does not record Supabase CLI migration history.
begin;
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = any(array[
      'profiles','clients','brand_kits','projects','project_members',
      'model_registry','prompt_templates','generations','generation_assets',
      'budget_settings','budget_reservations','usage_ledger','app_settings',
      'audit_logs','storyboards','provider_diagnostics'
    ])
  ) then
    raise exception 'Studio tables already exist. Apply pending versioned migrations; do not reset the database.';
  end if;
end $$;

${sections.join("\n\n")}

commit;
`;
const outputDirectory = path.join(root, ".nexify");
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
const output = path.join(outputDirectory, "supabase-setup.sql");
// Preserve any existing export; select a new name for a refreshed copy.
const target = path.join(outputDirectory, `supabase-setup-${Date.now()}.sql`);
let written = output;
try {
  await writeFile(output, sql, { mode: 0o600, flag: "wx" });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  await writeFile(target, sql, { mode: 0o600, flag: "wx" });
  written = target;
}
console.log(`Exported ${files.length} migrations to ${written}`);
console.log(
  "Review this file before running it once in the target project's SQL Editor.",
);
