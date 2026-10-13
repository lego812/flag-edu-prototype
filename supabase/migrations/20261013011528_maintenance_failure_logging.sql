create table private.maintenance_failures (
 id bigint generated always as identity primary key,
 run_id uuid not null,
 occurred_at timestamptz not null default now(),
 stage text not null,
 workspace_id uuid,
 error_code varchar(40) not null
);
alter table private.maintenance_failures enable row level security;
revoke all on private.maintenance_failures from public,anon,authenticated;
create index maintenance_failures_time_idx on private.maintenance_failures(occurred_at);
create function public.record_maintenance_failure(p_run_id uuid,p_stage text,p_workspace_id uuid,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_run_id is null or p_stage not in ('exports_cleanup','sessions_sync','retention_list','retention_begin','retention_files_list','retention_files_remove','retention_finish','retention_task') or p_stage is null
 or p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,40}$' then raise exception 'Invalid failure record' using errcode='22023'; end if;
 insert into private.maintenance_failures(run_id,stage,workspace_id,error_code) values(p_run_id,p_stage,p_workspace_id,p_error_code);
end $$;
revoke all on function public.record_maintenance_failure(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_maintenance_failure(uuid,text,uuid,text) to service_role;

alter table public.organizations add column purge_last_attempt_at timestamptz;
create index organizations_purge_retry_idx on public.organizations(purge_last_attempt_at nulls first,deleted_at,id) where deleted_at is not null;
create or replace function public.list_workspaces_due_for_purge()
returns table(id uuid) language sql stable security definer set search_path='' as $$
 select id from public.organizations where deleted_at<=now()-interval '30 days'
 order by purge_last_attempt_at nulls first,deleted_at,id limit 10
$$;
revoke all on function public.list_workspaces_due_for_purge() from public,anon,authenticated;
grant execute on function public.list_workspaces_due_for_purge() to service_role;
create or replace function public.begin_workspace_purge(p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 update public.organizations set purge_started_at=coalesce(purge_started_at,now()),purge_last_attempt_at=clock_timestamp()
 where id=p_workspace_id and deleted_at<=now()-interval '30 days';
 return found;
end $$;
revoke all on function public.begin_workspace_purge(uuid) from public,anon,authenticated;
grant execute on function public.begin_workspace_purge(uuid) to service_role;
