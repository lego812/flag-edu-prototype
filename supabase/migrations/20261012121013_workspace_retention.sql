-- Service-only, resumable purge. Browser users cannot enumerate or purge records.
alter table public.organizations add column purge_started_at timestamptz;
create index organizations_retention_idx on public.organizations(deleted_at,id) where deleted_at is not null;

create function public.protect_workspace_purge()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.purge_started_at is not null and (
  new.deleted_at is distinct from old.deleted_at or new.purge_started_at is distinct from old.purge_started_at
 ) then raise exception 'Workspace purge already started' using errcode='PT409'; end if;
 return new;
end $$;
revoke all on function public.protect_workspace_purge() from public,anon,authenticated;
create trigger organizations_protect_purge before update on public.organizations
for each row execute function public.protect_workspace_purge();

create function public.list_workspaces_due_for_purge()
returns table(id uuid) language sql stable security definer set search_path='' as $$
 select id from public.organizations where deleted_at<=now()-interval '30 days'
 order by deleted_at,id limit 10
$$;
revoke all on function public.list_workspaces_due_for_purge() from public,anon,authenticated;
grant execute on function public.list_workspaces_due_for_purge() to service_role;

create function public.begin_workspace_purge(p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 update public.organizations set purge_started_at=coalesce(purge_started_at,now())
 where id=p_workspace_id and deleted_at<=now()-interval '30 days';
 return found;
end $$;
revoke all on function public.begin_workspace_purge(uuid) from public,anon,authenticated;
grant execute on function public.begin_workspace_purge(uuid) to service_role;

create function public.list_workspace_purge_objects(p_workspace_id uuid)
returns table(bucket_id text,name text) language sql stable security definer set search_path='' as $$
 select s.bucket_id,s.name from storage.objects s
 where s.bucket_id in ('report-images','report-exports')
 and s.name like p_workspace_id::text||'/%'
 and exists(select 1 from public.organizations o where o.id=p_workspace_id
  and o.deleted_at<=now()-interval '30 days' and o.purge_started_at is not null)
 order by s.bucket_id,s.name limit 100
$$;
revoke all on function public.list_workspace_purge_objects(uuid) from public,anon,authenticated;
grant execute on function public.list_workspace_purge_objects(uuid) to service_role;

create function public.finish_workspace_purge(p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 perform 1 from public.organizations where id=p_workspace_id
  and deleted_at<=now()-interval '30 days' and purge_started_at is not null for update;
 if not found then return false; end if;
 -- Never delete Storage metadata with SQL: files must be removed through Storage API first.
 if exists(select 1 from storage.objects where name like p_workspace_id::text||'/%') then
  raise exception 'Workspace files still exist' using errcode='PT409'; end if;
 if exists(select 1 from public.profiles where organization_id=p_workspace_id) then
  raise exception 'Workspace still selected; repair selection before purge' using errcode='PT409'; end if;
 delete from public.export_jobs where organization_id=p_workspace_id;
 -- Deleting the parent first allows attachment and published-template cascades
 -- without weakening normal application triggers or disabling any trigger.
 delete from public.reports where organization_id=p_workspace_id;
 delete from public.class_sessions where organization_id=p_workspace_id;
 delete from public.courses where organization_id=p_workspace_id;
 delete from public.template_versions where organization_id=p_workspace_id;
 delete from public.organizations where id=p_workspace_id;
 return true;
end $$;
revoke all on function public.finish_workspace_purge(uuid) from public,anon,authenticated;
grant execute on function public.finish_workspace_purge(uuid) to service_role;
