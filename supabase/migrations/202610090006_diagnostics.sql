-- Full structured provider responses after redaction, separated from creator-visible job rows.
create table public.provider_diagnostics (
  id uuid primary key default gen_random_uuid(), generation_id uuid not null references generations(id),
  phase text not null check(phase in ('submission','poll')), payload jsonb not null,
  created_at timestamptz not null default now()
);
create index diagnostics_generation on provider_diagnostics(generation_id,created_at desc);
alter table provider_diagnostics enable row level security;
create policy diagnostics_admin on provider_diagnostics for select to authenticated using(is_admin());
grant select on provider_diagnostics to authenticated;
grant all on provider_diagnostics to service_role;
