-- Enforce the durable state machine in the database, including audited recovery paths.
create function public.valid_job_transition() returns trigger language plpgsql as $$
begin
  if old.status=new.status then return new; end if;
  if not (
    (old.status='reserved' and new.status in ('submitting','failed','needs_review')) or
    (old.status='submitting' and new.status in ('queued','running','storing','failed','submission_unknown','needs_review')) or
    (old.status='submission_unknown' and new.status in ('needs_review','queued','failed')) or
    (old.status='queued' and new.status in ('running','storing','failed','needs_review')) or
    (old.status='running' and new.status in ('storing','failed','needs_review')) or
    (old.status='storing' and new.status in ('completed','needs_review')) or
    (old.status='needs_review' and new.status in ('queued','failed'))
  ) then raise exception 'Invalid generation state transition: % to %',old.status,new.status; end if;
  return new;
end $$;
create trigger generation_state before update of status on generations for each row execute function valid_job_transition();

-- LLM limits serialize per staff profile, including simultaneous requests.
create function public.claim_prompt_request(p_user uuid,p_mode text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from profiles where id=p_user and active for update;
  if not found then raise exception 'Inactive staff'; end if;
  if (select count(*) from audit_logs where user_id=p_user and action='prompt.enhanced' and created_at>now()-interval '1 minute')>=5 then
    raise exception 'Prompt enhancement limit reached. Try again in a minute.';
  end if;
  insert into audit_logs(user_id,action,metadata) values(p_user,'prompt.enhanced',jsonb_build_object('mode',p_mode));
end $$;
revoke all on function claim_prompt_request(uuid,text) from public,anon,authenticated;
grant execute on function claim_prompt_request(uuid,text) to service_role;
