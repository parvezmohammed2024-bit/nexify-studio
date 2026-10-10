create function public.studio_report() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
select jsonb_build_object(
 'counts',(select jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),
 'failed',count(*) filter(where status='failed'),'running',count(*) filter(where status in ('reserved','submitting','queued','running','storing')),
 'review',count(*) filter(where status in ('needs_review','submission_unknown'))) from generations),
 'budgets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'client_id',b.client_id,'limit',b.monthly_limit_micros,
 'spent',(select coalesce(sum(amount_micros),0) from usage_ledger where billing_period=date_trunc('month',now() at time zone 'UTC')::date and (b.client_id is null or client_id=b.client_id)),
 'reserved',(select coalesce(sum(amount_micros),0) from budget_reservations where released_at is null and (b.client_id is null or client_id=b.client_id)))) from budget_settings b),'[]'::jsonb),
 'by_client',coalesce((select jsonb_agg(t) from (select c.id,c.name,coalesce(sum(l.amount_micros),0) as amount from clients c left join usage_ledger l on l.client_id=c.id and l.billing_period=date_trunc('month',now() at time zone 'UTC')::date group by c.id order by amount desc) t),'[]'::jsonb),
 'by_model',coalesce((select jsonb_agg(t) from (select m.name,count(g.id) as count from model_registry m join generations g on g.model_id=m.id group by m.id order by count desc limit 6) t),'[]'::jsonb)
)
$$;
revoke all on function studio_report() from public,anon;
grant execute on function studio_report() to authenticated;
-- Ensure non-RLS role access is scoped by explicit grants; financial tables stay read-only to staff.
grant usage on schema public to authenticated,service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant insert,update on clients,brand_kits,projects,project_members,prompt_templates,storyboards,model_registry to authenticated;
grant delete on prompt_templates,project_members to authenticated;
grant update on app_settings,profiles to authenticated;
