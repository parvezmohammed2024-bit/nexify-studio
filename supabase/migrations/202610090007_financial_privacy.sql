-- Only aggregates are shared for budget visibility. Financial evidence remains project-scoped.
drop policy ledger_read on usage_ledger;
create policy ledger_read on usage_ledger for select to authenticated using(can_access_project(project_id));
drop policy reservations_read on budget_reservations;
create policy reservations_read on budget_reservations for select to authenticated using(exists(select 1 from generations g where g.id=generation_id and can_access_project(g.project_id)));
create or replace function public.studio_report() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
 'counts',(select jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),
 'failed',count(*) filter(where status='failed'),'running',count(*) filter(where status in ('reserved','submitting','queued','running','storing')),
 'review',count(*) filter(where status in ('needs_review','submission_unknown'))) from generations where can_access_project(project_id)),
 'budgets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'client_id',b.client_id,'limit',b.monthly_limit_micros,
 'spent',(select coalesce(sum(amount_micros),0) from usage_ledger where billing_period=date_trunc('month',now() at time zone 'UTC')::date and (b.client_id is null or client_id=b.client_id)),
 'reserved',(select coalesce(sum(amount_micros),0) from budget_reservations where released_at is null and (b.client_id is null or client_id=b.client_id)))) from budget_settings b),'[]'::jsonb),
 'by_client',coalesce((select jsonb_agg(t) from (select c.id,c.name,coalesce(sum(l.amount_micros),0) as amount from clients c left join usage_ledger l on l.client_id=c.id and l.billing_period=date_trunc('month',now() at time zone 'UTC')::date group by c.id order by amount desc) t),'[]'::jsonb),
 'by_model',coalesce((select jsonb_agg(t) from (select m.name,count(g.id) as count from model_registry m join generations g on g.model_id=m.id where can_access_project(g.project_id) group by m.id order by count desc limit 6) t),'[]'::jsonb)
) where is_staff()
$$;
