-- USD accounting uses integer microdollars. All financial writes are service-only RPCs.
create extension if not exists pgcrypto;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', role text not null default 'creator' check (role in ('admin','creator')),
  active boolean not null default true, created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from profiles where id=auth.uid() and role='admin' and active)
$$;
create function public.is_staff() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from profiles where id=auth.uid() and active)
$$;
create table public.clients (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
  contact_email text, contact_phone text, industry text, logo_asset_id uuid, notes text,
  created_by uuid not null references profiles(id), created_at timestamptz not null default now()
);
create table public.brand_kits (
  id uuid primary key default gen_random_uuid(), client_id uuid not null unique references clients(id) on delete cascade,
  colors text[] not null default '{}', guidelines text not null default '', preferred_style text not null default '',
  product_reference_ids uuid[] not null default '{}', updated_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references clients(id), name text not null,
  description text not null default '', created_by uuid not null references profiles(id), archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references projects(id) on delete cascade, user_id uuid not null references profiles(id),
  primary key(project_id,user_id)
);
create function public.can_access_project(p_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select is_staff() and (is_admin() or exists(select 1 from projects where id=p_id and created_by=auth.uid()) or exists(select 1 from project_members where project_id=p_id and user_id=auth.uid()))
$$;
create table public.model_registry (
  id uuid primary key default gen_random_uuid(), name text not null, provider text not null default 'higgsfield' check(provider='higgsfield'),
  provider_model_id text not null unique, endpoint text not null,
  operation text not null check(operation in ('text-to-image','image-edit','image-to-video','text-to-video')),
  aspect_ratios text[] not null default '{}', resolutions text[] not null default '{}', durations integer[] not null default '{}',
  audio boolean not null default false, required_fields text[] not null default '{prompt}', optional_fields text[] not null default '{}',
  input_schema jsonb not null default '{}', field_map jsonb not null default '{}', defaults jsonb not null default '{}',
  pricing jsonb, verification_status text not null default 'unverified' check(verification_status in ('unverified','sdk-documented','verified')),
  available boolean not null default false, verification_source text, verified_at timestamptz,
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), name text not null,
  mode text not null, prompt text not null, negative_prompt text, created_at timestamptz not null default now()
);
create table public.generations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), client_id uuid not null references clients(id),
  project_id uuid not null references projects(id), model_id uuid not null references model_registry(id),
  type text not null, original_prompt text not null, final_prompt text not null, input_config jsonb not null,
  input_asset_ids uuid[] not null default '{}', provider_request_id text unique,
  idempotency_key uuid not null, status text not null default 'reserved'
    check(status in ('reserved','submitting','submission_unknown','queued','running','storing','completed','failed','needs_review')),
  estimated_micros bigint not null check(estimated_micros>=0), final_cost_micros bigint check(final_cost_micros>=0),
  billing_period date not null, pricing_snapshot jsonb not null, error_metadata jsonb,
  provider_response jsonb, attempts integer not null default 0, next_poll_at timestamptz not null default now(),
  lease_until timestamptz, archived boolean not null default false, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), completed_at timestamptz, unique(user_id,idempotency_key)
);
create index generations_project_created on generations(project_id,created_at desc);
create index generations_poll on generations(next_poll_at) where status in ('queued','running','storing');
create table public.generation_assets (
  id uuid primary key default gen_random_uuid(), generation_id uuid references generations(id),
  user_id uuid not null references profiles(id), client_id uuid references clients(id), project_id uuid references projects(id),
  storage_path text not null unique, kind text not null check(kind in ('image','video')), mime_type text not null,
  size_bytes bigint not null check(size_bytes>0), name text not null, source_url_hash text,
  favorite boolean not null default false, archived boolean not null default false, created_at timestamptz not null default now(),
  unique(generation_id,source_url_hash)
);
create table public.budget_settings (
  id uuid primary key default gen_random_uuid(), client_id uuid unique references clients(id),
  monthly_limit_micros bigint not null check(monthly_limit_micros>=0), hard_stop boolean not null default true,
  warning_thresholds integer[] not null default '{70,85,100}', updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
create unique index single_global_budget on budget_settings ((client_id is null)) where client_id is null;
create table public.budget_reservations (
  generation_id uuid primary key references generations(id), client_id uuid not null references clients(id),
  billing_period date not null, amount_micros bigint not null check(amount_micros>=0),
  released_at timestamptz, created_at timestamptz not null default now()
);
create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(), generation_id uuid not null unique references generations(id),
  client_id uuid not null references clients(id), project_id uuid not null references projects(id),
  billing_period date not null, amount_micros bigint not null check(amount_micros>=0),
  evidence text not null, recorded_by uuid references profiles(id), created_at timestamptz not null default now()
);
create function public.immutable_ledger() returns trigger language plpgsql as $$ begin raise exception 'Financial ledger is append-only'; end $$;
create trigger usage_immutable before update or delete on usage_ledger for each row execute function immutable_ledger();
create table public.app_settings (
  id boolean primary key default true check(id), usd_myr_rate numeric not null default 4.5 check(usd_myr_rate>0 and usd_myr_rate<100),
  default_image_model uuid references model_registry(id), default_video_model uuid references model_registry(id),
  upload_limit_mb integer not null default 20 check(upload_limit_mb between 1 and 50),
  max_concurrent_jobs integer not null default 4 check(max_concurrent_jobs between 1 and 20),
  brand_name text not null default 'Nexify Solution', updated_at timestamptz not null default now()
);
insert into app_settings(id) values(true);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id), action text not null,
  resource_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.storyboards (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id),
  user_id uuid not null references profiles(id), name text not null, scenes jsonb not null default '[]',
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);

-- Active staff is granted explicitly by an admin, not by an auth signup trigger.
-- No signup endpoints or permissive self-creation policy exist.
alter table profiles enable row level security;
create policy profiles_read on profiles for select to authenticated using(is_staff());
create policy profiles_admin_update on profiles for update to authenticated using(is_admin()) with check(is_admin());
alter table clients enable row level security;
create policy clients_read on clients for select to authenticated using(is_staff());
create policy clients_insert on clients for insert to authenticated with check(is_staff() and created_by=auth.uid());
create policy clients_update on clients for update to authenticated using(is_admin() or (is_staff() and created_by=auth.uid()));
alter table brand_kits enable row level security;
create policy brands_read on brand_kits for select to authenticated using(is_staff());
create policy brands_write on brand_kits for all to authenticated using(is_admin() or exists(select 1 from clients where id=client_id and created_by=auth.uid())) with check(is_admin() or exists(select 1 from clients where id=client_id and created_by=auth.uid()));
alter table projects enable row level security;
create policy projects_read on projects for select to authenticated using(can_access_project(id));
create policy projects_insert on projects for insert to authenticated with check(is_staff() and created_by=auth.uid());
create policy projects_update on projects for update to authenticated using(is_admin() or (is_staff() and created_by=auth.uid()));
alter table project_members enable row level security;
create policy members_read on project_members for select to authenticated using(can_access_project(project_id));
create policy members_admin on project_members for all to authenticated using(is_admin()) with check(is_admin());
alter table model_registry enable row level security;
create policy models_read on model_registry for select to authenticated using(is_staff());
create policy models_admin on model_registry for all to authenticated using(is_admin()) with check(is_admin());
alter table prompt_templates enable row level security;
create policy templates_owned on prompt_templates for all to authenticated using(is_staff() and user_id=auth.uid()) with check(is_staff() and user_id=auth.uid());
alter table generations enable row level security;
create policy generations_read on generations for select to authenticated using(can_access_project(project_id));
alter table generation_assets enable row level security;
create policy assets_read on generation_assets for select to authenticated using(is_staff() and (user_id=auth.uid() or can_access_project(project_id)));
-- Asset mutations go through server handlers and service key with explicit authorization.
alter table budget_settings enable row level security;
create policy budgets_read on budget_settings for select to authenticated using(is_staff());
alter table budget_reservations enable row level security;
create policy reservations_read on budget_reservations for select to authenticated using(is_staff());
alter table usage_ledger enable row level security;
create policy ledger_read on usage_ledger for select to authenticated using(is_staff());
alter table app_settings enable row level security;
create policy settings_read on app_settings for select to authenticated using(is_staff());
create policy settings_admin on app_settings for update to authenticated using(is_admin()) with check(is_admin());
alter table audit_logs enable row level security;
create policy audit_admin on audit_logs for select to authenticated using(is_admin());
alter table storyboards enable row level security;
create policy storyboards_read on storyboards for select to authenticated using(can_access_project(project_id));
create policy storyboards_write on storyboards for all to authenticated using(is_staff() and user_id=auth.uid() and can_access_project(project_id)) with check(is_staff() and user_id=auth.uid() and can_access_project(project_id));

create function public.reserve_generation(p_user uuid, p_key uuid, p_project uuid, p_model uuid, p_type text,
  p_original text, p_final text, p_input jsonb, p_assets uuid[], p_estimate bigint, p_pricing jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare g uuid; c uuid; b budget_settings%rowtype; used bigint; reserved bigint; period date; max_jobs integer;
begin
  if p_estimate<=0 then raise exception 'Price must be positive'; end if;
  if not exists(select 1 from profiles where id=p_user and active) then raise exception 'Inactive staff'; end if;
  select client_id into c from projects where id=p_project and not archived and
    (created_by=p_user or exists(select 1 from project_members where project_id=p_project and user_id=p_user)
    or exists(select 1 from profiles where id=p_user and role='admin'));
  if c is null then raise exception 'Project access denied'; end if;
  -- Global row is the common serialization point for reservations and reconciliation.
  perform 1 from budget_settings where client_id is null for update;
  if not found then raise exception 'Administrator must configure the global budget'; end if;
  select id into g from generations where user_id=p_user and idempotency_key=p_key;
  if g is not null then
    if not exists(select 1 from generations where id=g and project_id=p_project and model_id=p_model
      and type=p_type and original_prompt=p_original and final_prompt=p_final and input_config=p_input
      and input_asset_ids=p_assets and estimated_micros=p_estimate and pricing_snapshot=p_pricing) then
      raise exception 'Idempotency key cannot be reused with different inputs or pricing';
    end if;
    return g;
  end if;
  select max_concurrent_jobs into max_jobs from app_settings where id;
  if (select count(*) from generations where status in ('reserved','submitting','submission_unknown','queued','running','storing','needs_review'))>=max_jobs then
    raise exception 'Studio concurrency limit reached'; end if;
  if not exists(select 1 from model_registry where id=p_model and available and verification_status='verified') then raise exception 'Model is not verified and available'; end if;
  period := date_trunc('month',now() at time zone 'UTC')::date;
  for b in select * from budget_settings where client_id is null or client_id=c order by client_id nulls first for update loop
    select coalesce(sum(amount_micros),0) into used from usage_ledger where billing_period=period and (b.client_id is null or client_id=b.client_id);
    -- Carry outstanding reservations across month boundaries until confirmed reconciliation.
    select coalesce(sum(amount_micros),0) into reserved from budget_reservations where released_at is null and (b.client_id is null or client_id=b.client_id);
    if b.hard_stop and used+reserved+p_estimate>b.monthly_limit_micros then raise exception 'Monthly budget hard limit reached'; end if;
  end loop;
  insert into generations(user_id,client_id,project_id,model_id,type,original_prompt,final_prompt,input_config,input_asset_ids,
    idempotency_key,estimated_micros,billing_period,pricing_snapshot)
    values(p_user,c,p_project,p_model,p_type,p_original,p_final,p_input,p_assets,p_key,p_estimate,period,p_pricing) returning id into g;
  insert into budget_reservations(generation_id,client_id,billing_period,amount_micros) values(g,c,period,p_estimate);
  insert into audit_logs(user_id,action,resource_id,metadata) values(p_user,'generation.reserved',g,jsonb_build_object('micros',p_estimate));
  return g;
end $$;

create function public.reconcile_cost(p_generation uuid, p_cost bigint, p_evidence text, p_actor uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g generations%rowtype;
begin
  if p_cost<0 or length(p_evidence)<5 then raise exception 'Confirmed cost and evidence are required'; end if;
  perform 1 from budget_settings where client_id is null for update;
  select * into g from generations where id=p_generation for update;
  if g.id is null then raise exception 'Generation not found'; end if;
  if exists(select 1 from usage_ledger where generation_id=g.id) then return; end if;
  if g.status not in ('completed','failed','needs_review','submission_unknown') then raise exception 'Outcome is not terminal or reviewed'; end if;
  if p_actor is not null and not exists(select 1 from profiles where id=p_actor and active and role='admin') then raise exception 'Admin required'; end if;
  insert into usage_ledger(generation_id,client_id,project_id,billing_period,amount_micros,evidence,recorded_by)
    values(g.id,g.client_id,g.project_id,g.billing_period,p_cost,p_evidence,p_actor);
  update budget_reservations set released_at=now() where generation_id=g.id and released_at is null;
  update generations set final_cost_micros=p_cost,updated_at=now() where id=g.id;
  insert into audit_logs(user_id,action,resource_id,metadata) values(p_actor,'cost.reconciled',g.id,jsonb_build_object('micros',p_cost,'evidence',p_evidence));
end $$;

create function public.claim_jobs(p_limit integer default 4) returns setof generations
language sql security definer set search_path=public,pg_temp as $$
  update generations set lease_until=now()+interval '90 seconds',attempts=attempts+1
  where id in (select id from generations where status in ('queued','running','storing') and next_poll_at<=now()
    and (lease_until is null or lease_until<now()) order by next_poll_at for update skip locked limit least(greatest(p_limit,1),4))
  returning *
$$;
create function public.set_budget(p_actor uuid,p_client uuid,p_limit bigint,p_hard_stop boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from profiles where id=p_actor and role='admin' and active) then raise exception 'Admin required'; end if;
  if p_limit<0 then raise exception 'Invalid budget'; end if;
  if p_client is null then
    insert into budget_settings(client_id,monthly_limit_micros,hard_stop,updated_by) values(null,p_limit,p_hard_stop,p_actor)
      on conflict ((client_id is null)) where client_id is null do update set monthly_limit_micros=excluded.monthly_limit_micros,hard_stop=excluded.hard_stop,updated_by=p_actor,updated_at=now();
  else
    insert into budget_settings(client_id,monthly_limit_micros,hard_stop,updated_by) values(p_client,p_limit,p_hard_stop,p_actor)
      on conflict (client_id) do update set monthly_limit_micros=excluded.monthly_limit_micros,hard_stop=excluded.hard_stop,updated_by=p_actor,updated_at=now();
  end if;
  insert into audit_logs(user_id,action,resource_id,metadata) values(p_actor,'budget.updated',p_client,jsonb_build_object('limit_micros',p_limit,'hard_stop',p_hard_stop));
end $$;
revoke all on function reserve_generation(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid[],bigint,jsonb) from public,anon,authenticated;
revoke all on function reconcile_cost(uuid,bigint,text,uuid) from public,anon,authenticated;
revoke all on function claim_jobs(integer) from public,anon,authenticated;
revoke all on function set_budget(uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function reserve_generation(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid[],bigint,jsonb) to service_role;
grant execute on function reconcile_cost(uuid,bigint,text,uuid) to service_role;
grant execute on function claim_jobs(integer) to service_role;
grant execute on function set_budget(uuid,uuid,bigint,boolean) to service_role;

-- Private storage; browser access is through permission-checked signed URLs only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('studio-assets','studio-assets',false,524288000,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do nothing;
